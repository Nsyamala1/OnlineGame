# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
npm install

# Run frontend dev server (port 3000)
npm start

# Run backend Socket.io server (port 3001) — required for multiplayer
npm run server

# Build for production (outputs to dist/)
npm run build

# Preview production build
npm run preview
```

The full game requires both servers running simultaneously. There are no tests or linting configured.

## Architecture

This is a multiplayer party game with a **split-screen architecture**: one browser window acts as the TV/display, and each player uses their own device as a controller.

**Stack:**
- **Frontend:** Phaser 3 game engine, built with Vite
- **Backend:** Express + Socket.io (`server.js`) on port 3001
- **Communication:** Socket.io for real-time bidirectional sync

**Two client roles:**
- **Display Screen** (`joinAsDisplay`) — shows all players in the game world (TV/laptop browser)
- **Player Controller** — individual device with touch controls; sends `move` events to server

**Game modes and their scene pairs:**

| Mode | Display Scene | Controller Scene |
|------|--------------|-----------------|
| Sprint (default) | `RaceScene` | `PlayerScene` |
| Cycling | `RaceScene` | `CyclingPlayerScene` |
| Swimming | `RaceScene` | `SwimmingPlayerScene` |
| Tug of War | `TugOfWarScene` | `TugOfWarPlayerScene` |

**Game flow:** `LandingScene` → `WaitingScene` → race scenes → `FinishScene`

**`server.js` is the single source of truth for game state.** It owns player positions, race status (`waiting`/`countdown`/`racing`/`finished`), and enforces anti-cheat (80ms move cooldown, 20 events/sec per socket). The server broadcasts state to all clients; clients only render.

**`PlayerCharacter.js`** is a shared class used by both display and player scenes. It generates procedural graphics (no image assets) and drives all character animations (idle bob, running with arm/leg swing, victory).

**`BootScene.js`** generates all procedural textures at startup (dust, confetti, terrain) — there are no external image assets.

**Key server constants** (in `server.js` `GAME_CONFIG`):
- `FINISH_LINE: 2000` — race distance in game units
- `MOVE_AMOUNT: 25` — units per valid `move` event
- `MAX_PLAYERS: 4`
- AI bots auto-spawn when joining in `"ai"` mode

## Socket Events

**Client → Server:** `setGameType`, `joinAsDisplay`, `setName`, `toggleReady`, `move`, `requestRestart`

**Server → Client:** `gameState` (full state broadcast), `playerJoined`, `playerLeft`, `gameStarted`, `raceFinished`, `countdown`
