import { query } from "./db.js";

let ensured = false;

function normalizeSuggestions(analysisJson = {}) {
  return Array.isArray(analysisJson.improvementSuggestions) ? analysisJson.improvementSuggestions : [];
}

function normalizeStyleProfile(analysisJson = {}) {
  return {
    observations: analysisJson.codeStyleObservations || [],
    architectureOverview: analysisJson.architectureOverview || [],
    updatedFromTitle: analysisJson.title || ""
  };
}

function normalizePromptProfile(analysisJson = {}) {
  return {
    preferredPatterns: analysisJson.codeStyleObservations || [],
    recurringImprovements: normalizeSuggestions(analysisJson).slice(0, 12)
  };
}

async function ensureSummariesTable() {
  if (ensured) return;
  await query(`
    CREATE TABLE IF NOT EXISTS codebase_summaries (
      id SERIAL PRIMARY KEY,
      root_path TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      full_report TEXT NOT NULL,
      analysis_json JSONB,
      model TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    ALTER TABLE codebase_summaries ADD COLUMN IF NOT EXISTS analysis_json JSONB;
  `);
  ensured = true;
}

export async function saveCodebaseSummary(result) {
  await ensureSummariesTable();
  const analysisJson = result.analysisJson || null;
  const inserted = await query(
    `INSERT INTO codebase_summaries (root_path, title, description, full_report, analysis_json, model)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id, root_path, title, description, full_report, analysis_json, model, created_at`,
    [result.root, result.title, result.description, result.fullReport, analysisJson, result.model || null]
  );
  const summary = inserted.rows[0];
  const learning = await saveAnalysisLearning({ ...result, summaryId: summary.id, analysisJson: analysisJson || {} });
  return { ...summary, ...learning };
}

export async function saveAnalysisLearning(result) {
  const analysisJson = result.analysisJson || {};
  const run = await query(
    `INSERT INTO analysis_runs (summary_id, root_path, title, status, model, analysis_json)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING *`,
    [result.summaryId || null, result.root, result.title, "done", result.model || null, analysisJson]
  );
  const analysisRun = run.rows[0];
  const prior = await listOpenImprovementSuggestions(result.root);
  const checks = await saveImprovementChecks(result.root, analysisRun.id, prior, normalizeSuggestions(analysisJson));
  const suggestions = await saveImprovementSuggestions(result.root, analysisRun.id, normalizeSuggestions(analysisJson));
  const styleProfile = await upsertStyleProfile(result.root, normalizeStyleProfile(analysisJson));
  const promptProfile = await upsertPromptProfile(result.root, normalizePromptProfile(analysisJson));
  const event = await saveLearningEvent(result.root, "analysis_completed", {
    analysisRunId: analysisRun.id,
    summaryId: result.summaryId || null,
    suggestionCount: suggestions.length,
    checkCount: checks.length
  });
  return { analysisRun, improvementChecks: checks, suggestions, styleProfile, promptProfile, learningEvents: [event] };
}

async function saveImprovementSuggestions(rootPath, analysisRunId, suggestions) {
  const inserted = [];
  for (const item of suggestions) {
    const row = await query(
      `INSERT INTO improvement_suggestions
       (analysis_run_id, root_path, file_path, function_name, issue, suggestion, priority, follow_up_criteria)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        analysisRunId,
        rootPath,
        item.file || "",
        item.function || "",
        item.issue || "",
        item.suggestion || "",
        item.priority || "medium",
        item.followUpCriteria || item.follow_up_criteria || ""
      ]
    );
    inserted.push(row.rows[0]);
  }
  return inserted;
}

async function saveImprovementChecks(rootPath, analysisRunId, priorSuggestions, currentSuggestions) {
  const checks = [];
  for (const prior of priorSuggestions) {
    const current = currentSuggestions.find((s) => {
      return (s.file || "") === (prior.file_path || "") && (s.function || "") === (prior.function_name || "");
    });
    let status = "implemented";
    let explanation = "The previous issue was not repeated in the latest analysis.";
    if (current && String(current.suggestion || "").toLowerCase() === String(prior.suggestion || "").toLowerCase()) {
      status = "not_implemented";
      explanation = "The same improvement is still suggested for this function.";
    } else if (current) {
      status = "partially_implemented";
      explanation = "The function still has related improvement feedback, but the suggestion changed.";
    } else if (!prior.file_path) {
      status = "obsolete";
      explanation = "The previous suggestion had no stable file reference.";
    }
    const row = await query(
      `INSERT INTO improvement_checks (suggestion_id, analysis_run_id, status, explanation)
       VALUES ($1,$2,$3,$4)
       RETURNING *`,
      [prior.id, analysisRunId, status, explanation]
    );
    await query(
      "UPDATE improvement_suggestions SET status=$1, updated_at=NOW() WHERE id=$2",
      [status === "implemented" ? "closed" : "open", prior.id]
    );
    checks.push(row.rows[0]);
  }
  if (checks.length) {
    await saveLearningEvent(rootPath, "improvements_checked", { analysisRunId, checkCount: checks.length });
  }
  return checks;
}

async function upsertStyleProfile(rootPath, profile) {
  const row = await query(
    `INSERT INTO code_style_profiles (root_path, profile_json, updated_at)
     VALUES ($1,$2,NOW())
     ON CONFLICT (root_path)
     DO UPDATE SET profile_json=$2, updated_at=NOW()
     RETURNING *`,
    [rootPath, profile]
  );
  return row.rows[0];
}

async function upsertPromptProfile(rootPath, profile) {
  const row = await query(
    `INSERT INTO prompt_profiles (root_path, profile_json, updated_at)
     VALUES ($1,$2,NOW())
     ON CONFLICT (root_path)
     DO UPDATE SET profile_json=$2, updated_at=NOW()
     RETURNING *`,
    [rootPath, profile]
  );
  return row.rows[0];
}

export async function saveLearningEvent(rootPath, eventType, payload = {}) {
  const row = await query(
    `INSERT INTO learning_events (root_path, event_type, payload)
     VALUES ($1,$2,$3)
     RETURNING *`,
    [rootPath, eventType, payload]
  );
  return row.rows[0];
}

export async function listOpenImprovementSuggestions(rootPath, limit = 100) {
  const rows = await query(
    `SELECT * FROM improvement_suggestions
     WHERE root_path=$1 AND status='open'
     ORDER BY created_at DESC
     LIMIT $2`,
    [rootPath, limit]
  );
  return rows.rows;
}

export async function listImprovementSuggestions(rootPath, limit = 100, offset = 0) {
  const params = [];
  let where = "";
  if (rootPath) {
    params.push(rootPath);
    where = "WHERE root_path=$1";
  }
  params.push(limit, offset);
  const rows = await query(
    `SELECT * FROM improvement_suggestions
     ${where}
     ORDER BY created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows.rows;
}

export async function getLearningProfile(rootPath) {
  const style = await query("SELECT * FROM code_style_profiles WHERE root_path=$1 LIMIT 1", [rootPath]);
  const prompt = await query("SELECT * FROM prompt_profiles WHERE root_path=$1 LIMIT 1", [rootPath]);
  const events = await query(
    `SELECT * FROM learning_events WHERE root_path=$1 ORDER BY created_at DESC LIMIT 20`,
    [rootPath]
  );
  const improvements = await listImprovementSuggestions(rootPath, 20, 0);
  return {
    rootPath,
    styleProfile: style.rows[0]?.profile_json || {},
    promptProfile: prompt.rows[0]?.profile_json || {},
    improvements,
    learningEvents: events.rows
  };
}

export async function listCodebaseSummaries(limit = 20, offset = 0) {
  await ensureSummariesTable();
  const rows = await query(
    `SELECT id, root_path, title, description, model, created_at
     FROM codebase_summaries
     ORDER BY created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return rows.rows;
}

export async function getCodebaseSummaryById(id) {
  await ensureSummariesTable();
  const row = await query(
    `SELECT id, root_path, title, description, full_report, analysis_json, model, created_at
     FROM codebase_summaries
     WHERE id=$1
     LIMIT 1`,
    [id]
  );
  return row.rows[0] || null;
}
