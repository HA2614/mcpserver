# MCP Project Manager (Terminal + Web + Desktop)

This project supports three interfaces over one backend:
- Terminal Suite
- REST API + React UI
- MCP stdio server
- Optional Python desktop launcher (opens browser to local app)

## Quick start
1. Start infra:
   `docker compose up -d`
2. Apply schema:
   `psql postgresql://postgres:postgres@localhost:5432/mcp_pm -f backend/sql/schema.sql`
3. Build frontend for `http://localhost:4000/`:
   `npm run build`
4. Start API server:
   `npm run start`

If frontend build is missing, `/` returns a clear message with next steps.

## Separate run modes
- Terminal suite: `npm run terminal`
- MCP stdio server: `npm run mcp`
- Desktop launcher (attach mode): `npm run desktop`
- Desktop launcher (auto-start backend): `npm run desktop:start`

Backend workspace equivalents:
- `npm --workspace backend run terminal`
- `npm --workspace backend run mcp`
- `npm --workspace backend run desktop`
- `npm --workspace backend run desktop:start`

## API additions
- `GET /api/projects/:id/plans` (filters + pagination)
- `GET /api/projects/:id/plans/compare?againstVersion=N`
- `POST /api/plans/:planId/promote-baseline`
- `POST /api/analysis/summarize-codebase` (folder-wide summary, per-file descriptions, Mermaid pipeline)
- Feedback action includes `needs_review`
- Structure generation options: `profile`, `dryRun`, `overwriteStrategy`

## Filesystem safety
Filesystem endpoints are restricted to `FS_BASE_PATH` (default `C:\Users\Hayan\Downloads`).
