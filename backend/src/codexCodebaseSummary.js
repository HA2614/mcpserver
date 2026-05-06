import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { config } from "./config.js";
import { resolveSafePath } from "./structure.js";
import { ExternalServiceError } from "./errors.js";

const COMMON_IGNORES = [
  "node_modules/",
  ".git/",
  "dist/",
  "build/",
  ".next/",
  ".cache/",
  "coverage/",
  "*.log",
  ".env",
  ".env.*",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "vendor/",
  "__pycache__/"
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractTitle(text, fallback) {
  const lines = String(text || "").split("\n").map((l) => l.trim()).filter(Boolean);
  const heading = lines.find((l) => l.startsWith("#"));
  if (heading) return heading.replace(/^#+\s*/, "").slice(0, 140);
  return (lines[0] || fallback).slice(0, 140);
}

function extractDescription(text, fallback) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return fallback;
  return clean.slice(0, 420);
}

async function readGitignoreHints(root) {
  const gitignorePath = path.join(root, ".gitignore");
  try {
    const raw = await readFile(gitignorePath, "utf8");
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .slice(0, 200);
  } catch {
    return [];
  }
}

function buildPrompt(ignorePatterns) {
  return [
    "Analyze the codebase in the current directory and return ONLY valid JSON (no markdown).",
    "Also suggest concrete function-level code improvements.",
    "",
    "JSON schema:",
    "{",
    '  "title": "string",',
    '  "projectDescription": "string",',
    '  "architectureOverview": ["string"],',
    '  "pipelineFlow": ["string"],',
    '  "files": [{"path":"string","role":"string","summary":"string"}],',
    '  "codeStyleObservations": ["string"],',
    '  "improvementSuggestions": [{"file":"string","function":"string","issue":"string","suggestion":"string","priority":"high|medium|low","followUpCriteria":"string"}]',
    "}",
    "",
    "Rules:",
    "- Mention only existing files.",
    "- Keep file summaries concise (1-2 lines).",
    "- improvementSuggestions must focus on concrete functions/methods.",
    "- codeStyleObservations should describe recurring code style, architecture, naming, state, and error-handling patterns.",
    "- followUpCriteria must make each improvement checkable during the next analysis.",
    "- Do not include dependency/generated files.",
    "- Ignore files matching patterns:",
    ...ignorePatterns.map((p) => `  - ${p}`)
  ].join("\n");
}

function extractJsonObject(text) {
  const raw = String(text || "").trim();
  try {
    return JSON.parse(raw);
  } catch {}
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const slice = raw.slice(start, end + 1);
    return JSON.parse(slice);
  }
  throw new ExternalServiceError("Codex output was not valid JSON", null, "CODEX_SUMMARY_INVALID_JSON");
}

function shouldKeepLogLine(line) {
  const text = String(line || "");
  if (!text.trim()) return false;
  const lower = text.toLowerCase();
  if (lower.includes("startup remote plugin sync failed")) return false;
  if (lower.includes("failed to warm featured plugin ids cache")) return false;
  if (lower.includes("cloudflare")) return false;
  if (lower.includes("<html>")) return false;
  if (lower.includes("</html>")) return false;
  if (lower.includes("tokens used")) return false;
  if (lower.includes("enable javascript and cookies to continue")) return false;
  if (text.length > 2600) return false;
  return true;
}

export async function summarizeCodebaseWithCodex(targetPath, options = {}) {
  const onProgress = options.onProgress || null;
  const onLog = options.onLog || null;
  const root = resolveSafePath(targetPath);

  const update = (progress, stage, message) => {
    if (onProgress) onProgress({ progress, stage, message });
  };
  const log = (source, line) => {
    if (!onLog) return;
    onLog({
      ts: new Date().toISOString(),
      source,
      line: String(line || "")
    });
  };

  update(5, "prepare", "Preparing Codex analysis");
  const gitignorePatterns = await readGitignoreHints(root);
  const prompt = buildPrompt([...COMMON_IGNORES, ...gitignorePatterns]);

  const tempDir = await mkdtemp(path.join(tmpdir(), "mcp-codebase-summary-"));
  const outputFile = path.join(tempDir, "summary.md");

  const args = [
    "--ask-for-approval",
    "never",
    "--sandbox",
    "read-only",
    "exec",
    "--ignore-user-config",
    "--skip-git-repo-check",
    "--output-last-message",
    outputFile
  ];
  if (config.codexSummaryModel) {
    args.push("--model", config.codexSummaryModel);
  }
  args.push(prompt);

  const codexBin = await resolveCodexBinary();
  update(15, "run", "Launching Codex CLI");

  let progressLoopActive = true;
  const progressLoop = (async () => {
    let p = 20;
    while (progressLoopActive) {
      update(p, "run", "Codex is analyzing codebase files");
      p = Math.min(90, p + 2);
      await sleep(700);
    }
  })();

  await new Promise((resolve, reject) => {
    const child = spawn(codexBin, args, {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stderr = "";
    let stdout = "";

    const flushLines = (source, chunk) => {
      const text = chunk.toString();
      const parts = text.split(/\r?\n/).filter((p) => p.trim().length > 0);
      for (const part of parts) {
        if (!shouldKeepLogLine(part)) continue;
        const compact = part.length > 260 ? `${part.slice(0, 257)}...` : part;
        log(source, compact);
      }
    };

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      flushLines("stdout", chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      flushLines("stderr", chunk);
    });

    child.on("error", (error) => reject(new ExternalServiceError(error.message, null, "CODEX_SUMMARY_PROCESS_ERROR")));
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new ExternalServiceError(
          `codex summary failed (code ${code})`,
          { stderr: stderr.trim(), stdout: stdout.trim() },
          "CODEX_SUMMARY_NON_ZERO"
        )
      );
    });
  }).finally(async () => {
    progressLoopActive = false;
    await progressLoop;
  });

  update(95, "finalize", "Reading Codex output");
  try {
    const fullReportRaw = await readFile(outputFile, "utf8");
    const analysisJson = extractJsonObject(fullReportRaw);
    const fullReport = JSON.stringify(analysisJson, null, 2);
    const title = extractTitle(analysisJson.title, `${path.basename(root)} Codebase Analysis`);
    const description = extractDescription(analysisJson.projectDescription, "Codebase analysis completed.");

    update(100, "done", "Analysis completed");
    return {
      root,
      title,
      description,
      model: config.codexSummaryModel,
      fullReport,
      analysisJson,
      ignorePatternsUsed: [...COMMON_IGNORES, ...gitignorePatterns]
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function resolveCodexBinary() {
  if (config.codexBin && fs.existsSync(config.codexBin)) {
    return config.codexBin;
  }
  if (config.codexBin && config.codexBin !== "codex") {
    return config.codexBin;
  }

  if (process.platform === "win32") {
    const userProfile = process.env.USERPROFILE || "";
    const extRoot = path.join(userProfile, ".vscode", "extensions");
    try {
      const entries = await readdir(extRoot, { withFileTypes: true });
      const candidates = entries
        .filter((d) => d.isDirectory() && d.name.startsWith("openai.chatgpt-"))
        .map((d) => path.join(extRoot, d.name, "bin", "windows-x86_64", "codex.exe"));
      const existing = candidates.find((p) => fs.existsSync(p));
      if (existing) return existing;
    } catch {
      // no-op
    }
  }

  return "codex";
}
