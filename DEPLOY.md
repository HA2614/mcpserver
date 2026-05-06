# Deploy

This stack is designed to run from Docker Compose with the app, Postgres, and Redis.

## First Run

```bash
cp .env.example .env
docker compose up --build
```

Open:

```text
http://localhost:4000
```

## Services

- `app`: Node backend serving the built frontend from `frontend/dist`.
- `postgres`: `pgvector/pgvector:pg16`, source of truth for projects, plans, analyses, learning state, and code jobs.
- `redis`: cache and lightweight coordination helper. The app continues when Redis is temporarily unavailable.

## Required Runtime Secrets

Set these in `.env` or your host/deployment secret manager:

```text
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
```

Do not commit `.env`.

## Useful Commands

```bash
docker compose up --build
docker compose logs -f app
docker compose down
docker compose down -v
```

## Public Repo Checklist

- Rotate any API key that was ever placed in `.env.example`.
- Confirm `.env` is untracked.
- Confirm `frontend/dist`, `node_modules`, logs, and caches are untracked.
- Run `npm run build`.
