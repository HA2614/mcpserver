CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  goals TEXT NOT NULL,
  tech_stack TEXT,
  timeline TEXT,
  budget TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_plans (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  plan_json JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  provider TEXT,
  is_baseline BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS plan_feedback (
  id SERIAL PRIMARY KEY,
  plan_id INTEGER NOT NULL REFERENCES project_plans(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  comments TEXT,
  modified_plan_json JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE project_plans ADD COLUMN IF NOT EXISTS provider TEXT;
ALTER TABLE project_plans ADD COLUMN IF NOT EXISTS is_baseline BOOLEAN NOT NULL DEFAULT FALSE;

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

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS analysis_runs (
  id SERIAL PRIMARY KEY,
  summary_id INTEGER REFERENCES codebase_summaries(id) ON DELETE SET NULL,
  root_path TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'done',
  model TEXT,
  analysis_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  embedding vector(1536),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS improvement_suggestions (
  id SERIAL PRIMARY KEY,
  analysis_run_id INTEGER REFERENCES analysis_runs(id) ON DELETE CASCADE,
  root_path TEXT NOT NULL,
  file_path TEXT,
  function_name TEXT,
  issue TEXT,
  suggestion TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  follow_up_criteria TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS improvement_checks (
  id SERIAL PRIMARY KEY,
  suggestion_id INTEGER REFERENCES improvement_suggestions(id) ON DELETE CASCADE,
  analysis_run_id INTEGER REFERENCES analysis_runs(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  explanation TEXT NOT NULL,
  checked_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS code_style_profiles (
  id SERIAL PRIMARY KEY,
  root_path TEXT NOT NULL UNIQUE,
  profile_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS prompt_profiles (
  id SERIAL PRIMARY KEY,
  root_path TEXT NOT NULL UNIQUE,
  profile_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS learning_events (
  id SERIAL PRIMARY KEY,
  root_path TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS code_jobs (
  id SERIAL PRIMARY KEY,
  root_path TEXT NOT NULL,
  user_prompt TEXT NOT NULL,
  improved_prompt TEXT,
  model TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  logs JSONB NOT NULL DEFAULT '[]'::jsonb,
  changed_files JSONB NOT NULL DEFAULT '[]'::jsonb,
  diff_summary TEXT,
  risk_notes JSONB NOT NULL DEFAULT '[]'::jsonb,
  test_commands JSONB NOT NULL DEFAULT '[]'::jsonb,
  final_status TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE codebase_summaries ADD COLUMN IF NOT EXISTS analysis_json JSONB;
