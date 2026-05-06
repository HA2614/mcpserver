import { randomUUID } from "node:crypto";
import { summarizeCodebaseWithCodex } from "./codexCodebaseSummary.js";
import { saveCodebaseSummary } from "./analysisStore.js";

const jobs = new Map();

function nowIso() {
  return new Date().toISOString();
}

export function startCodebaseSummaryJob(targetPath) {
  const jobId = randomUUID();
  const job = {
    jobId,
    status: "queued",
    progress: 0,
    stage: "queued",
    message: "Queued",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    result: null,
    error: null,
    logs: []
  };
  jobs.set(jobId, job);

  void runJob(jobId, targetPath);
  return job;
}

async function runJob(jobId, targetPath) {
  const job = jobs.get(jobId);
  if (!job) return;
  job.status = "running";
  job.progress = 1;
  job.stage = "start";
  job.message = "Starting analysis";
  job.updatedAt = nowIso();

  try {
    const result = await summarizeCodebaseWithCodex(targetPath, {
      onProgress: (update) => {
        const j = jobs.get(jobId);
        if (!j) return;
        j.progress = Math.max(0, Math.min(100, Number(update.progress || 0)));
        j.stage = update.stage || j.stage;
        j.message = update.message || j.message;
        j.updatedAt = nowIso();
      },
      onLog: (entry) => {
        const j = jobs.get(jobId);
        if (!j) return;
        j.logs.push(entry);
        if (j.logs.length > 300) {
          j.logs = j.logs.slice(-300);
        }
        j.updatedAt = nowIso();
      }
    });

    const saved = await saveCodebaseSummary(result);

    job.status = "done";
    job.progress = 100;
    job.stage = "done";
    job.message = "Analysis complete";
    job.result = {
      ...result,
      summaryId: saved.id,
      analysisRun: saved.analysisRun,
      improvementChecks: saved.improvementChecks || [],
      styleProfile: saved.styleProfile?.profile_json || {},
      promptProfile: saved.promptProfile?.profile_json || {},
      learningEvents: saved.learningEvents || []
    };
    job.updatedAt = nowIso();
  } catch (error) {
    job.status = "failed";
    job.stage = "failed";
    job.message = error.message || "Analysis failed";
    job.error = { message: error.message || "Unknown error" };
    job.updatedAt = nowIso();
  }
}

export function getCodebaseSummaryJob(jobId) {
  return jobs.get(jobId) || null;
}
