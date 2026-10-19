# 🐄🔨 Cowbuilders HQ

> [!WARNING]
> # ⚠️ FULLY VIBE CODED ⚠️
> Every line in this repo was written by an AI (Claude) while the humans were out eating.
> Nobody did a serious code review. It works on our machine, it has some tests, and it schedules League games.
> **Use at your own risk, expect bugs, and please don't put it on the open internet without a password in front of it.**

The clan page of the **Cowbuilders**, a League of Legends clan. Everyone enters the hours they can play,
along with their preferred roles, and the site shows when there are enough people for Flex, ARAM, Clash and so on.

## Features

- **Weekly calendar** in your local time zone. Night hours (00:00–02:00) count towards the evening before, so "Friday night" stays in the Friday column.
- **Up to 5 cowbuilders per hour slot**, each with their **preferred roles in order** (Top, Jungle, Mid, Bot, Support, Fill), the modes they're up for, and a note.
- **Paint mode 🖌**: press and drag across the calendar to add (or remove) many hours at once. **Copy my last week** repeats last week's hours.
- **"What can we play?"** for every slot, using the actual queue rules:
  - Ranked Flex: 1, 2, 3 or 5 players (four can't queue!)
  - Clash: exactly 5 with every lane covered
  - ARAM / Normal Draft: any size, "full" with 5
  - Arena: duos (2 or 4)
  - Ranked Solo/Duo: exactly 2
  Only players who said they're up for a mode count towards it.
- **Suggested lineup**: a small solver puts players on lanes, respecting preference order and using Fill players to plug gaps.
- **Lock in sessions** (🔒 "Clash Saturday 20:00"), download them as `.ics`, and **copy a Discord message** with a link straight to that slot (`/schedule?slot=…`).
- **Clan hall**: rotating splash-art hero, a gallery of champion paintings (Moo Cow Alistar is our patron saint, Ornn our master builder), the hottest upcoming slots, activity feed, hall of fame and the clan code.
- **Roster** with member cards: signature champion splash, rank, roles, battle cry and hours played.
- Live-ish: the page refreshes every 20 s while visible.

No accounts: you pick who you are, and that choice is remembered in your browser. Anyone with access can edit anything. Put HTTP basic auth in front of it (see below).

## Run it

### Docker (what you deploy)

```sh
docker compose up -d --build        # → http://localhost:8080
HOST_PORT=8091 docker compose up -d # different host port
```

One container: Node 24 serves the built React app **and** the JSON API. Data lives in SQLite at `/data/cowbuilders.sqlite` (named volume `cowbuilders-data`). Back that file up if you care about it.

### Ubuntu server

Every push to `main` builds `ghcr.io/jkamue/league` (tags `latest`, `v0.0.<run>`, `sha-…`) via GitHub Actions. A compose file for the server:

```yaml
services:
  cowbuilders:
    image: ghcr.io/jkamue/league:latest
    restart: unless-stopped
    ports:
      - "127.0.0.1:8080:3000"   # only reachable through your reverse proxy
    volumes:
      - cowbuilders-data:/data
    labels:
      - com.centurylinklabs.watchtower.scope=league

  # Optional: pull new images automatically
  watchtower-league:
    image: containrrr/watchtower
    restart: unless-stopped
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    command: --scope league --interval 300 --cleanup

volumes:
  cowbuilders-data:
```

Then put a reverse proxy with TLS and basic auth in front (nginx, Caddy, Traefik…). If the GHCR package is private, `docker login ghcr.io` on the server first.

> If you use a bind mount (`./data:/data`) instead of a named volume, run `sudo chown 1000:1000 ./data` first: the container runs as the unprivileged `node` user.

More details in [DEPLOYMENT.md](DEPLOYMENT.md).

### Local development

Requires Node.js 22.13+ (for the built-in `node:sqlite`; the Docker image uses Node 24).

```sh
npm install
npm run api   # API on :3000 (SQLite in ./data)
npm run dev   # Vite on :5173, proxies /api to :3000
npm test      # API + lineup/queue-rule tests
```

## API

| Method | Path | |
|---|---|---|
| GET | `/api/health` | liveness |
| GET/POST | `/api/players` | list / create (`name`, `roles`, `modes`, `champion`, `rank`, `motto`) |
| PATCH/DELETE | `/api/players/:id` | edit / remove (removes their signups too) |
| GET | `/api/schedule?from=&to=` | signups and sessions in a range (ms timestamps, max 120 days) |
| PUT | `/api/signups` | `{ playerId, slots[], roles?, modes?, note? }` join or update, max 5 per slot |
| DELETE | `/api/signups` | `{ playerId, slots[] }` leave |
| POST | `/api/sessions` | `{ slot, mode, title?, createdBy? }` lock in a session |
| DELETE | `/api/sessions/:id` | cancel |
| GET | `/api/activity` | latest 25 signups/sessions |

## Legal

Cowbuilders HQ isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.

Champion art is loaded at runtime from Riot's Data Dragon CDN and role icons from CommunityDragon. No Riot assets are stored in this repository. Fonts (Cinzel, Barlow) are bundled via Fontsource, so there are no Google Fonts requests.
