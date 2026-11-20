# Borderland Bingo Multiplayer V6

## Kick-player fix
- Host KICK actions are validated server-side.
- Removed player sessions are disconnected and removed from room state.
- Host receives success/failure feedback instead of silent failure.
- KICK buttons stop click propagation.

## Deploy
Deploy the frontend and Worker backend from this same package/repository version together. If only the frontend is deployed, the kick action may not be handled by the currently deployed Worker.

Build verification was not completed in this environment because `npm install` timed out.
