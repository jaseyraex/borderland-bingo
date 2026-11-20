# Borderland Bingo Multiplayer — Step 1

This project contains the multiplayer backend and frontend connection work.

## Added
- Cloudflare Worker API routing
- Durable Objects room state
- Unique room creation
- Capacity enforcement (1–50, host included)
- Joining before game start only
- Player-specific cards and marks
- Token-authenticated WebSocket live state sync
- Server-authoritative number calls
- Server-side Bingo claim validation
- Winner order and winner announcement
- Host pause/resume/continue/reset/new-round controls
- Frontend connection helper and integration in `App.jsx`

## Deployment requirements
This is designed for Cloudflare Workers with Durable Objects and static assets. The included `wrangler.toml` points static assets at `dist/`. Build the Vite frontend before deploying.

The project build was not verified in this environment because Vite dependencies were not installed (the dependency install timed out). Review/deploy only after local or Cloudflare build succeeds.
