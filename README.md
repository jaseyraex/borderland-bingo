# Borderland Bingo – UI & Gameplay Prototype Update

## What's updated
- Fixed the logo asset location for Vite by placing it in `public/borderland-bingo-logo.png`.
- Home screen uses the provided logo artwork and a single Player Name field.
- Room name is entered on the Create Game screen.
- Bingo board is more compact.
- Light mode is the default; optional dark mode toggle is available.
- Caller interval is chosen before starting and can be changed live.
- Three-second countdown before automatic calling begins.
- Automatic calls, manual call button, pause/resume, call history, reset calls, and end round/new round controls.
- Prototype join screen explains that joining is closed once a game starts.

## Important
This remains a **frontend-only prototype**. Create/join rooms, host controls, calls, and claims are not yet synchronized between browsers. Multiplayer will require the Google Apps Script/Sheets backend planned for the next phase.

## Cloudflare Pages / Workers build settings
- Build command: `npm run build` (or `bun run build` if Cloudflare's environment uses Bun)
- Output directory: `dist`
- Vite 6 is used in this project.

The logo is in the `public` folder. When uploading to GitHub through the web UI, create the folder by adding a file with the path `public/borderland-bingo-logo.png` (or upload the extracted `public` folder if folder upload is supported).
