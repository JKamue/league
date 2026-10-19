# AGENTS.md

This repo is public. Never commit secrets, personal data, real databases (`/data/`) or server-specific config.

Every push to `main` builds and publishes the image; with Watchtower on the server it goes live automatically. Read `DEPLOYMENT.md` before touching `Dockerfile`, `docker-compose.yml`, `.github/workflows/`, `server.mjs` storage/schema, env vars or ports.

Rules for every change:
- `npm test` and `npm run build` must pass, and `docker compose up -d --build` must start a healthy container (check `/api/health` and the UI).
- The production SQLite database persists across releases. Schema changes need an idempotent migration.
- New env vars, volumes or ports are not deployed by the pipeline: give them safe defaults and tell the user.
