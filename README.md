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
