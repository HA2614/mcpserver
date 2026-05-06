import OpenAI from "openai";
import path from "node:path";
import { query } from "./db.js";
import { config } from "./config.js";
import { ExternalServiceError, NotFoundError, ValidationError } from "./errors.js";
import { getLearningProfile } from "./analysisStore.js";
import { fsWriteFile, resolveSafePath } from "./structure.js";

const openai = config.openAiApiKey ? new OpenAI({ apiKey: config.openAiApiKey }) : null;
const eventClients = new Map();

function nowLog(message, data = {}) {
  return { ts: new Date().toISOString(), message, data };
}

function emit(jobId, event) {
  const clients = eventClients.get(String(jobId)) || new Set();
  for (const res of clients) {
    res.write(`event: code-job\n`);
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }
}

function parseJsonPayload(text) {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new ExternalServiceError("AI code worker returned invalid JSON", null, "CODE_JOB_INVALID_JSON");
  }
}

async function appendLog(jobId, message, data = {}) {
  const entry = nowLog(message, data);
  const row = await query(
    `UPDATE code_jobs
     SET logs = logs || $2::jsonb, updated_at=NOW()
     WHERE id=$1
     RETURNING *`,
    [jobId, JSON.stringify([entry])]
  );
  emit(jobId, { type: "log", job: row.rows[0], entry });
  return row.rows[0];
}

async function setStatus(jobId, status, patch = {}) {
  const row = await query(
    `UPDATE code_jobs
     SET status=$2,
         improved_prompt=COALESCE($3, improved_prompt),
         changed_files=COALESCE($4, changed_files),
         diff_summary=COALESCE($5, diff_summary),
         risk_notes=COALESCE($6, risk_notes),
         test_commands=COALESCE($7, test_commands),
         final_status=COALESCE($8, final_status),
         updated_at=NOW()
     WHERE id=$1
     RETURNING *`,
    [
      jobId,
      status,
      patch.improvedPrompt ?? null,
      patch.changedFiles ? JSON.stringify(patch.changedFiles) : null,
      patch.diffSummary ?? null,
      patch.riskNotes ? JSON.stringify(patch.riskNotes) : null,
      patch.testCommands ? JSON.stringify(patch.testCommands) : null,
      patch.finalStatus ?? null
    ]
  );
  emit(jobId, { type: "status", job: row.rows[0] });
  return row.rows[0];
}

function buildCodePrompt({ userPrompt, rootPath, learningProfile }) {
  return [
    "You are an AI code worker. Return ONLY valid JSON.",
    "Create reviewable code changes, but do not claim you executed tests.",
    "",
    "JSON schema:",
    "{",
    '  "improvedPrompt": "string",',
    '  "changedFiles": [{"path":"relative/path","action":"upsert","content":"full file content","diffSummary":"string"}],',
    '  "diffSummary": "string",',
    '  "riskNotes": ["string"],',
    '  "testCommands": ["string"],',
    '  "finalStatus": "awaiting_review"',
    "}",
    "",
    `Root path: ${rootPath}`,
    `User prompt: ${userPrompt}`,
    "",
    "Learning profile JSON:",
    JSON.stringify(learningProfile || {}, null, 2),
    "",
    "Rules:",
    "- Keep changedFiles small and scoped.",
    "- Use project style from the learning profile.",
    "- Only include files you want to create or replace.",
    "- Paths must be relative to the root path."
  ].join("\n");
}

export async function startCodeJob({ rootPath, userPrompt }) {
  const safeRoot = resolveSafePath(rootPath);
  if (!userPrompt?.trim()) throw new ValidationError("Prompt is required");
  const created = await query(
    `INSERT INTO code_jobs (root_path, user_prompt, model, status)
     VALUES ($1,$2,$3,'queued')
     RETURNING *`,
    [safeRoot, userPrompt, config.codeAiModel]
  );
  const job = created.rows[0];
  void runCodeJob(job.id).catch((error) => appendLog(job.id, "Job failed", { error: error.message }).then(() => setStatus(job.id, "failed", { finalStatus: "failed" })));
  return job;
}

export async function runCodeJob(jobId) {
  let job = await getCodeJob(jobId);
  await setStatus(jobId, "planning");
  await appendLog(jobId, "Loading learning profile");
  const learningProfile = await getLearningProfile(job.root_path).catch(() => ({}));
  const improvedPrompt = buildCodePrompt({ userPrompt: job.user_prompt, rootPath: job.root_path, learningProfile });
  await setStatus(jobId, "running", { improvedPrompt });
  await appendLog(jobId, "Calling code model", { model: config.codeAiModel });

  if (!openai) throw new ExternalServiceError("OPENAI_API_KEY is missing", null, "OPENAI_NOT_CONFIGURED");
  const completion = await openai.chat.completions.create({
    model: config.codeAiModel,
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: "Return strict JSON for reviewable code changes." },
      { role: "user", content: improvedPrompt }
    ]
  });
  const payload = parseJsonPayload(completion.choices[0]?.message?.content || "{}");
  job = await setStatus(jobId, "awaiting_review", {
    improvedPrompt: payload.improvedPrompt || improvedPrompt,
    changedFiles: payload.changedFiles || [],
    diffSummary: payload.diffSummary || "",
    riskNotes: payload.riskNotes || [],
    testCommands: payload.testCommands || [],
    finalStatus: payload.finalStatus || "awaiting_review"
  });
  await appendLog(jobId, "Code proposal ready", { changedFiles: (payload.changedFiles || []).length });
  return job;
}

export async function getCodeJob(jobId) {
  const row = await query("SELECT * FROM code_jobs WHERE id=$1 LIMIT 1", [jobId]);
  if (!row.rowCount) throw new NotFoundError("Code job not found");
  return row.rows[0];
}

export async function listCodeJobs(limit = 20, offset = 0) {
  const rows = await query("SELECT * FROM code_jobs ORDER BY created_at DESC LIMIT $1 OFFSET $2", [limit, offset]);
  return rows.rows;
}

export async function applyCodeJob(jobId) {
  const job = await getCodeJob(jobId);
  if (job.status !== "awaiting_review") throw new ValidationError("Code job is not awaiting review");
  const changedFiles = Array.isArray(job.changed_files) ? job.changed_files : [];
  for (const file of changedFiles) {
    if (file.action && file.action !== "upsert") continue;
    const target = path.resolve(job.root_path, file.path || "");
    resolveSafePath(target);
    await fsWriteFile({ targetPath: target, content: file.content || "", conflictPolicy: "overwrite" });
  }
  await appendLog(jobId, "Applied code proposal", { changedFiles: changedFiles.length });
  return setStatus(jobId, "applied", { finalStatus: "applied" });
}

export async function rejectCodeJob(jobId) {
  await appendLog(jobId, "Rejected code proposal");
  return setStatus(jobId, "rejected", { finalStatus: "rejected" });
}

export function registerCodeJobEvents(req, res) {
  const jobId = String(req.params.id || "");
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
  if (!eventClients.has(jobId)) eventClients.set(jobId, new Set());
  eventClients.get(jobId).add(res);
  res.write(`event: code-job\n`);
  res.write(`data: ${JSON.stringify({ type: "connected", jobId })}\n\n`);
  const ping = setInterval(() => res.write(": ping\n\n"), 15000);
  req.on("close", () => {
    clearInterval(ping);
    eventClients.get(jobId)?.delete(res);
  });
}
