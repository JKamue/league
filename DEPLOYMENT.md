# Deployment

## How a change reaches production

1. Push to `main`.
2. `.github/workflows/docker.yml` runs `npm test` and `npm run build`, then builds the `Dockerfile` and pushes `ghcr.io/jkamue/league` with tags `v0.0.<run number>`, `latest` and `sha-<commit>`. Pull requests only run the tests.
3. On the server, Watchtower (scope `league`) pulls the new `latest` and recreates the container.

## Runtime layout

```
internet → host reverse proxy (TLS + basic auth)
         → cowbuilders:3000   (Node 24: static React build + /api/*, SQLite at /data/cowbuilders.sqlite)
```

- One image, one service, one volume. The container runs as user `node` (uid 1000) and has a Docker `HEALTHCHECK` on `/api/health`.
- Env vars (all have defaults): `PORT=3000`, `DATA_DIR=/data`, `STATIC_DIR=/app/dist`.
- The repo's `docker-compose.yml` is for local testing and is a starting point for the server (`HOST_PORT` selects the host port, default 8080).

## Watch out for

- **The API has no authentication.** Anyone who reaches the site can edit everything. Keep basic auth on the proxy.
- **Database**: `/data` is the only copy of players, signups and sessions. Schema changes must migrate existing databases (`PRAGMA user_version` is set to 1; bump it and `ALTER TABLE` in `server.mjs`). `CREATE TABLE IF NOT EXISTS` does not alter existing tables.
- **Backup**: `docker run --rm -v league_cowbuilders-data:/data -v "$PWD":/backup alpine cp /data/cowbuilders.sqlite /backup/` (stop the container first or copy the `-wal` file too).
- **Rollback**: pin `ghcr.io/jkamue/league:v0.0.<n>` in the server compose file and `docker compose up -d`; switch back to `:latest` afterwards.
- **Time slots** are stored as UTC millisecond timestamps of the slot start; the browser renders them in local time.
