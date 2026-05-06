import express from "express";
import { z } from "zod";
import { query } from "./db.js";
import { redis } from "./cache.js";
import { generatePlan } from "./ai.js";
import {
  generateProjectStructure,
  fsBatch,
  fsCopy,
  fsCreateFile,
  fsDelete,
  fsList,
  fsMkdir,
  fsMove,
  fsReadFile,
  fsRename,
  fsStat,
  fsTree,
  fsWriteFile,
  listDirectories,
  readTextFile,
  writeTextFile
} from "./structure.js";
import { registerFsEventStream } from "./fsEvents.js";
import {
  applyCodeJob,
  getCodeJob,
  listCodeJobs,
  registerCodeJobEvents,
  rejectCodeJob,
  startCodeJob
} from "./codeJobs.js";
import { summarizeCodebaseWithCodex } from "./codexCodebaseSummary.js";
import { getCodebaseSummaryJob, startCodebaseSummaryJob } from "./analysisJobs.js";
import {
  getCodebaseSummaryById,
  getLearningProfile,
  listCodebaseSummaries,
  listImprovementSuggestions,
  saveCodebaseSummary
} from "./analysisStore.js";
import { fail, ok } from "./response.js";
import { NotFoundError, ValidationError } from "./errors.js";

const projectSchema = z.object({
  name: z.string().min(2),
  goals: z.string().min(5),
  techStack: z.string().optional().default(""),
  timeline: z.string().optional().default(""),
  budget: z.string().optional().default("")
});

const feedbackSchema = z.object({
  action: z.enum(["accept", "reject", "modify", "needs_review"]),
  comments: z.string().optional().default(""),
  modifiedPlan: z.any().optional()
});

const providerSchema = z.enum(["codex_cli", "openai", "anthropic"]).optional();
const structureSchema = z.object({
  targetPath: z.string().min(1),
  profile: z.enum(["web+api", "web", "api", "docs-only"]).optional().default("web+api"),
  dryRun: z.boolean().optional().default(false),
  overwriteStrategy: z.enum(["skip_existing", "overwrite_all", "prompt_conflicts"]).optional().default("skip_existing"),
  structurePrompt: z.string().optional().default("")
});
const pathSchema = z.object({
  targetPath: z.string().min(1)
});
const writeFileSchema = z.object({
  targetPath: z.string().min(1),
  content: z.string()
});
const fsListSchema = z.object({
  targetPath: z.string().min(1),
  includeHidden: z.boolean().optional().default(true)
});
const fsTreeSchema = z.object({
  targetPath: z.string().min(1),
  depth: z.number().int().min(1).max(5).optional().default(2)
});
const fsCreateFileSchema = z.object({
  targetPath: z.string().min(1),
  content: z.string().optional().default(""),
  conflictPolicy: z.enum(["fail", "overwrite", "skip"]).optional().default("fail")
});
const fsWriteSchema = z.object({
  targetPath: z.string().min(1),
  content: z.string(),
  conflictPolicy: z.enum(["fail", "overwrite", "skip"]).optional().default("overwrite")
});
const fsRenameSchema = z.object({
  sourcePath: z.string().min(1),
  newName: z.string().min(1),
  conflictPolicy: z.enum(["fail", "overwrite", "skip"]).optional().default("fail")
});
const fsMoveCopySchema = z.object({
  sourcePath: z.string().min(1),
  destinationPath: z.string().min(1),
  conflictPolicy: z.enum(["fail", "overwrite", "skip"]).optional().default("fail")
});
const fsBatchSchema = z.object({
  operations: z.array(z.any()).default([])
});
const summarizeSchema = z.object({
  targetPath: z.string().min(1)
});
const rootQuerySchema = z.object({
  rootPath: z.string().optional().default("")
});
const codeJobSchema = z.object({
  rootPath: z.string().min(1),
  userPrompt: z.string().min(1)
});

function parseIntParam(value, label) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new ValidationError(`${label} must be a positive integer`);
  return n;
}

function normalizeError(error) {
  if (error?.statusCode) return error;
  return {
    statusCode: 500,
    code: "INTERNAL_ERROR",
    message: error?.message || "Unknown error",
    details: null
  };
}

async function routeGuard(res, fn) {
  try {
    return await fn();
  } catch (error) {
    const e = normalizeError(error);
    return fail(res, e.message, e.statusCode, e.code, e.details);
  }
}

export const router = express.Router();

router.get("/health", (_req, res) => ok(res, { ok: true }));

router.post("/projects", async (req, res) =>
  routeGuard(res, async () => {
    const parsed = projectSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError("Invalid project payload", parsed.error.flatten());

    const { name, goals, techStack, timeline, budget } = parsed.data;
    const result = await query(
      `INSERT INTO projects (name, goals, tech_stack, timeline, budget)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING *`,
      [name, goals, techStack, timeline, budget]
    );
    return ok(res, result.rows[0], null, 201);
  })
);

router.get("/projects", async (_req, res) =>
  routeGuard(res, async () => {
    const result = await query("SELECT * FROM projects ORDER BY created_at DESC");
    return ok(res, result.rows);
  })
);

router.get("/projects/:id", async (req, res) =>
  routeGuard(res, async () => {
    const id = parseIntParam(req.params.id, "id");
    const cacheKey = `project:${id}`;
    const cached = await redis.get(cacheKey).catch(() => null);
    if (cached) return ok(res, JSON.parse(cached), { source: "cache" });

    const project = await query("SELECT * FROM projects WHERE id=$1", [id]);
    if (!project.rowCount) throw new NotFoundError("Project not found");

    const plans = await query(
      "SELECT * FROM project_plans WHERE project_id=$1 ORDER BY version DESC",
      [id]
    );
    const payload = { ...project.rows[0], plans: plans.rows };
    await redis.set(cacheKey, JSON.stringify(payload), "EX", 120).catch(() => null);
    return ok(res, payload, { source: "db" });
  })
);

router.put("/projects/:id", async (req, res) =>
  routeGuard(res, async () => {
    const id = parseIntParam(req.params.id, "id");
    const parsed = projectSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError("Invalid project payload", parsed.error.flatten());

    const { name, goals, techStack, timeline, budget } = parsed.data;
    const result = await query(
      `UPDATE projects
       SET name=$1, goals=$2, tech_stack=$3, timeline=$4, budget=$5, updated_at=NOW()
       WHERE id=$6
       RETURNING *`,
      [name, goals, techStack, timeline, budget, id]
    );
    if (!result.rowCount) throw new NotFoundError("Project not found");
    await redis.del(`project:${id}`).catch(() => null);
    return ok(res, result.rows[0]);
  })
);

router.delete("/projects/:id", async (req, res) =>
  routeGuard(res, async () => {
    const id = parseIntParam(req.params.id, "id");
    await query("DELETE FROM projects WHERE id=$1", [id]);
    await redis.del(`project:${id}`).catch(() => null);
    return ok(res, { deleted: true, id });
  })
);

router.post("/projects/:id/generate-plan", async (req, res) =>
  routeGuard(res, async () => {
    const id = parseIntParam(req.params.id, "id");
    const projectResult = await query("SELECT * FROM projects WHERE id=$1", [id]);
    if (!projectResult.rowCount) throw new NotFoundError("Project not found");
    const project = projectResult.rows[0];

    const latest = await query(
      "SELECT COALESCE(MAX(version), 0) AS version FROM project_plans WHERE project_id=$1",
      [id]
    );
    const nextVersion = Number(latest.rows[0].version) + 1;

    const provider = providerSchema.safeParse(req.body?.provider);
    const selectedProvider = provider.success ? provider.data : undefined;
    const planJson = await generatePlan(project, selectedProvider);
    const insert = await query(
      `INSERT INTO project_plans (project_id, version, plan_json, status, provider)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING *`,
      [id, nextVersion, planJson, "pending", selectedProvider || null]
    );
    await redis.del(`project:${id}`).catch(() => null);
    return ok(res, insert.rows[0], null, 201);
  })
);

router.get("/projects/:id/plans", async (req, res) =>
  routeGuard(res, async () => {
    const id = parseIntParam(req.params.id, "id");
    const limit = Number(req.query.limit || 20);
    const offset = Number(req.query.offset || 0);
    const status = String(req.query.status || "").trim();
    const provider = String(req.query.provider || "").trim();
    const createdAfter = String(req.query.createdAfter || "").trim();

    const clauses = ["project_id=$1"];
    const params = [id];
    if (status) {
      params.push(status);
      clauses.push(`status=$${params.length}`);
    }
    if (provider) {
      params.push(provider);
      clauses.push(`provider=$${params.length}`);
    }
    if (createdAfter) {
      params.push(createdAfter);
      clauses.push(`created_at >= $${params.length}`);
    }

    params.push(limit);
    params.push(offset);
    const sql = `SELECT * FROM project_plans WHERE ${clauses.join(" AND ")} ORDER BY version DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const rows = await query(sql, params);
    return ok(res, rows.rows, { limit, offset });
  })
);

router.get("/projects/:id/plans/compare", async (req, res) =>
  routeGuard(res, async () => {
    const id = parseIntParam(req.params.id, "id");
    const againstVersion = Number(req.query.againstVersion || 0);
    if (!againstVersion) throw new ValidationError("againstVersion query parameter is required");

    const latestResult = await query(
      "SELECT * FROM project_plans WHERE project_id=$1 ORDER BY version DESC LIMIT 1",
      [id]
    );
    if (!latestResult.rowCount) throw new NotFoundError("No plans found");

    const oldResult = await query(
      "SELECT * FROM project_plans WHERE project_id=$1 AND version=$2 LIMIT 1",
      [id, againstVersion]
    );
    if (!oldResult.rowCount) throw new NotFoundError("Compared version not found");

    const latest = latestResult.rows[0];
    const prior = oldResult.rows[0];

    const latestMilestones = latest.plan_json?.milestones || [];
    const priorMilestones = prior.plan_json?.milestones || [];
    const latestTasks = (latest.plan_json?.taskBreakdown || []).map((t) => t.task);
    const priorTasks = (prior.plan_json?.taskBreakdown || []).map((t) => t.task);

    const data = {
      latestVersion: latest.version,
      comparedVersion: prior.version,
      summaryChanged: latest.plan_json?.summary !== prior.plan_json?.summary,
      addedTasks: latestTasks.filter((t) => !priorTasks.includes(t)),
      removedTasks: priorTasks.filter((t) => !latestTasks.includes(t)),
      milestoneCountDelta: latestMilestones.length - priorMilestones.length,
      latestSummary: latest.plan_json?.summary || "",
      comparedSummary: prior.plan_json?.summary || ""
    };

    return ok(res, data);
  })
);

router.post("/plans/:planId/promote-baseline", async (req, res) =>
  routeGuard(res, async () => {
    const planId = parseIntParam(req.params.planId, "planId");
    const planResult = await query("SELECT * FROM project_plans WHERE id=$1", [planId]);
    if (!planResult.rowCount) throw new NotFoundError("Plan not found");
    const plan = planResult.rows[0];

    await query("UPDATE project_plans SET is_baseline=FALSE WHERE project_id=$1", [plan.project_id]);
    const updated = await query(
      "UPDATE project_plans SET is_baseline=TRUE, updated_at=NOW() WHERE id=$1 RETURNING *",
      [planId]
    );
    await redis.del(`project:${plan.project_id}`).catch(() => null);
    return ok(res, updated.rows[0]);
  })
);

router.post("/plans/:planId/feedback", async (req, res) =>
  routeGuard(res, async () => {
    const planId = parseIntParam(req.params.planId, "planId");
    const parsed = feedbackSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError("Invalid feedback payload", parsed.error.flatten());

    const { action, comments, modifiedPlan } = parsed.data;
    const planResult = await query("SELECT * FROM project_plans WHERE id=$1", [planId]);
    if (!planResult.rowCount) throw new NotFoundError("Plan not found");
    const currentPlan = planResult.rows[0];

    let updatedPlan = currentPlan.plan_json;
    let status = currentPlan.status;

    if (action === "accept") {
      status = "accepted";
    } else if (action === "reject") {
      status = "rejected";
    } else if (action === "needs_review") {
      status = "needs_review";
    } else if (action === "modify") {
      updatedPlan = modifiedPlan || currentPlan.plan_json;
      status = "modified";
    }

    const updated = await query(
      `UPDATE project_plans
       SET status=$1, plan_json=$2, updated_at=NOW()
       WHERE id=$3
       RETURNING *`,
      [status, updatedPlan, planId]
    );

    await query(
      `INSERT INTO plan_feedback (plan_id, action, comments, modified_plan_json)
       VALUES ($1,$2,$3,$4)`,
      [planId, action, comments, action === "modify" ? updatedPlan : null]
    );

    await redis.del(`project:${currentPlan.project_id}`).catch(() => null);
    return ok(res, updated.rows[0]);
  })
);

router.post("/projects/:id/generate-structure", async (req, res) =>
  routeGuard(res, async () => {
    const id = parseIntParam(req.params.id, "id");
    const parsed = structureSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError("Invalid structure options", parsed.error.flatten());

    const projectResult = await query("SELECT * FROM projects WHERE id=$1", [id]);
    if (!projectResult.rowCount) throw new NotFoundError("Project not found");
    const project = projectResult.rows[0];

    const planResult = await query(
      "SELECT * FROM project_plans WHERE project_id=$1 ORDER BY version DESC LIMIT 1",
      [id]
    );
    if (!planResult.rowCount) {
      throw new ValidationError("No generated plan found for this project");
    }

    const activePlan = planResult.rows[0];
    const result = await generateProjectStructure({
      targetPath: parsed.data.targetPath,
      project,
      plan: activePlan.plan_json,
      profile: parsed.data.profile,
      dryRun: parsed.data.dryRun,
      overwriteStrategy: parsed.data.overwriteStrategy,
      structurePrompt: parsed.data.structurePrompt,
      planVersion: activePlan.version
    });
    return ok(res, result);
  })
);

router.post("/fs/list-directories", async (req, res) =>
  routeGuard(res, async () => {
    const parsed = pathSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError("Invalid path payload", parsed.error.flatten());
    const data = await listDirectories(parsed.data.targetPath);
    return ok(res, data);
  })
);

router.get("/fs/events", (req, res) => registerFsEventStream(req, res));

router.post("/fs/list", async (req, res) =>
  routeGuard(res, async () => {
    const parsed = fsListSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError("Invalid fs list payload", parsed.error.flatten());
    return ok(res, await fsList(parsed.data));
  })
);

router.post("/fs/tree", async (req, res) =>
  routeGuard(res, async () => {
    const parsed = fsTreeSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError("Invalid fs tree payload", parsed.error.flatten());
    return ok(res, await fsTree(parsed.data));
  })
);

router.post("/fs/stat", async (req, res) =>
  routeGuard(res, async () => {
    const parsed = pathSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError("Invalid fs stat payload", parsed.error.flatten());
    return ok(res, await fsStat(parsed.data));
  })
);

router.post("/fs/mkdir", async (req, res) =>
  routeGuard(res, async () => {
    const parsed = pathSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError("Invalid fs mkdir payload", parsed.error.flatten());
    return ok(res, await fsMkdir(parsed.data));
  })
);

router.post("/fs/create-file", async (req, res) =>
  routeGuard(res, async () => {
    const parsed = fsCreateFileSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError("Invalid fs create-file payload", parsed.error.flatten());
    return ok(res, await fsCreateFile(parsed.data));
  })
);

router.post("/fs/rename", async (req, res) =>
  routeGuard(res, async () => {
    const parsed = fsRenameSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError("Invalid fs rename payload", parsed.error.flatten());
    return ok(res, await fsRename(parsed.data));
  })
);

router.post("/fs/move", async (req, res) =>
  routeGuard(res, async () => {
    const parsed = fsMoveCopySchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError("Invalid fs move payload", parsed.error.flatten());
    return ok(res, await fsMove(parsed.data));
  })
);

router.post("/fs/copy", async (req, res) =>
  routeGuard(res, async () => {
    const parsed = fsMoveCopySchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError("Invalid fs copy payload", parsed.error.flatten());
    return ok(res, await fsCopy(parsed.data));
  })
);

router.post("/fs/delete", async (req, res) =>
  routeGuard(res, async () => {
    const parsed = pathSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError("Invalid fs delete payload", parsed.error.flatten());
    return ok(res, await fsDelete(parsed.data));
  })
);

router.post("/fs/batch", async (req, res) =>
  routeGuard(res, async () => {
    const parsed = fsBatchSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError("Invalid fs batch payload", parsed.error.flatten());
    return ok(res, await fsBatch(parsed.data));
  })
);

router.post("/fs/read-file", async (req, res) =>
  routeGuard(res, async () => {
    const parsed = pathSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError("Invalid path payload", parsed.error.flatten());
    const data = await readTextFile(parsed.data.targetPath);
    return ok(res, data);
  })
);

router.post("/fs/write-file", async (req, res) =>
  routeGuard(res, async () => {
    const parsed = writeFileSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError("Invalid write payload", parsed.error.flatten());
    const data = await writeTextFile(parsed.data.targetPath, parsed.data.content);
    return ok(res, data);
  })
);

router.post("/analysis/summarize-codebase", async (req, res) =>
  routeGuard(res, async () => {
    const parsed = summarizeSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError("Invalid summarize payload", parsed.error.flatten());
    const data = await summarizeCodebaseWithCodex(parsed.data.targetPath);
    const saved = await saveCodebaseSummary(data);
    return ok(res, { ...data, summaryId: saved.id });
  })
);

router.post("/fs/read", async (req, res) =>
  routeGuard(res, async () => {
    const parsed = pathSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError("Invalid fs read payload", parsed.error.flatten());
    return ok(res, await fsReadFile(parsed.data));
  })
);

router.post("/fs/write", async (req, res) =>
  routeGuard(res, async () => {
    const parsed = fsWriteSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError("Invalid fs write payload", parsed.error.flatten());
    return ok(res, await fsWriteFile(parsed.data));
  })
);

router.post("/analysis/summarize-codebase/start", async (req, res) =>
  routeGuard(res, async () => {
    const parsed = summarizeSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError("Invalid summarize payload", parsed.error.flatten());
    const job = startCodebaseSummaryJob(parsed.data.targetPath);
    return ok(res, {
      jobId: job.jobId,
      status: job.status,
      progress: job.progress,
      stage: job.stage,
      message: job.message
    });
  })
);

router.get("/analysis/summarize-codebase/jobs/:jobId", async (req, res) =>
  routeGuard(res, async () => {
    const jobId = String(req.params.jobId || "").trim();
    if (!jobId) throw new ValidationError("jobId is required");
    const job = getCodebaseSummaryJob(jobId);
    if (!job) throw new NotFoundError("Analysis job not found");
    return ok(res, job);
  })
);

router.get("/analysis/summaries", async (req, res) =>
  routeGuard(res, async () => {
    const limit = Number(req.query.limit || 20);
    const offset = Number(req.query.offset || 0);
    const items = await listCodebaseSummaries(limit, offset);
    return ok(res, items, { limit, offset });
  })
);

router.get("/analysis/summaries/:id", async (req, res) =>
  routeGuard(res, async () => {
    const id = parseIntParam(req.params.id, "id");
    const item = await getCodebaseSummaryById(id);
    if (!item) throw new NotFoundError("Summary not found");
    return ok(res, item);
  })
);

router.post("/code-jobs", async (req, res) =>
  routeGuard(res, async () => {
    const parsed = codeJobSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError("Invalid code job payload", parsed.error.flatten());
    return ok(res, await startCodeJob(parsed.data), null, 201);
  })
);

router.get("/code-jobs", async (req, res) =>
  routeGuard(res, async () => {
    const limit = Number(req.query.limit || 20);
    const offset = Number(req.query.offset || 0);
    return ok(res, await listCodeJobs(limit, offset), { limit, offset });
  })
);

router.get("/code-jobs/:id", async (req, res) =>
  routeGuard(res, async () => {
    const id = parseIntParam(req.params.id, "id");
    return ok(res, await getCodeJob(id));
  })
);

router.get("/code-jobs/:id/events", (req, res) => registerCodeJobEvents(req, res));

router.post("/code-jobs/:id/apply", async (req, res) =>
  routeGuard(res, async () => {
    const id = parseIntParam(req.params.id, "id");
    return ok(res, await applyCodeJob(id));
  })
);

router.post("/code-jobs/:id/reject", async (req, res) =>
  routeGuard(res, async () => {
    const id = parseIntParam(req.params.id, "id");
    return ok(res, await rejectCodeJob(id));
  })
);

router.get("/analysis/learning-profile", async (req, res) =>
  routeGuard(res, async () => {
    const parsed = rootQuerySchema.safeParse(req.query);
    if (!parsed.success || !parsed.data.rootPath) throw new ValidationError("rootPath query parameter is required");
    return ok(res, await getLearningProfile(parsed.data.rootPath));
  })
);

router.get("/analysis/improvements", async (req, res) =>
  routeGuard(res, async () => {
    const rootPath = String(req.query.rootPath || "").trim();
    const limit = Number(req.query.limit || 100);
    const offset = Number(req.query.offset || 0);
    return ok(res, await listImprovementSuggestions(rootPath, limit, offset), { limit, offset });
  })
);

router.post("/analysis/check-improvements", async (req, res) =>
  routeGuard(res, async () => {
    const parsed = summarizeSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError("Invalid improvement check payload", parsed.error.flatten());
    const data = await summarizeCodebaseWithCodex(parsed.data.targetPath);
    const saved = await saveCodebaseSummary(data);
    return ok(res, { ...data, summaryId: saved.id, improvementChecks: saved.improvementChecks || [] });
  })
);
