import dotenv from "dotenv";

dotenv.config();

function parseCsv(value, fallback) {
  if (!value) return fallback;
  const list = String(value)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return list.length ? list : fallback;
}

export const config = {
  port: Number(process.env.PORT || 4000),
  nodeEnv: process.env.NODE_ENV || "development",
  databaseUrl: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/mcp_pm",
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
  aiProvider: process.env.AI_PROVIDER || "codex_cli",
  aiFallbackProviders: parseCsv(process.env.AI_FALLBACK_PROVIDERS, ["codex_cli", "openai", "anthropic"]),
  aiRetryCount: Number(process.env.AI_RETRY_COUNT || 2),
  aiRetryDelayMs: Number(process.env.AI_RETRY_DELAY_MS || 600),
  openAiApiKey: process.env.OPENAI_API_KEY || "",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
  openAiModel: process.env.OPENAI_MODEL || "gpt-4.1-mini",
  codeAiModel: process.env.CODE_AI_MODEL || "gpt-5.5",
  anthropicModel: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-latest",
  codexModel: process.env.CODEX_MODEL || "",
  codexSummaryModel: process.env.CODEX_SUMMARY_MODEL || "gpt-5.3-codex",
  codexTimeoutMs: Number(process.env.CODEX_TIMEOUT_MS || 90000),
  codexBin: process.env.CODEX_BIN || "codex",
  fsBasePath: process.env.FS_BASE_PATH || process.cwd(),
  staticFrontendDir: process.env.STATIC_FRONTEND_DIR || ""
};
