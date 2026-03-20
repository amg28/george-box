# Quiz MVP (TypeScript)

Realtime quiz app for one host and up to 10 players.

## Stack

- Server: Node.js + Express + Socket.IO
- Frontend: static HTML/CSS + TypeScript browser bundles
- Language: TypeScript (strict mode)
- Tests: Vitest with coverage

## Project Structure

- `src/server/main.ts`: server bootstrap
- `src/server/game/*`: core game domain/engine/scoring
- `src/server/realtime/*`: socket event wiring + emitters
- `src/server/http/routes.ts`: REST endpoints
- `src/client/host/main.ts`: host UI logic
- `src/client/player/main.ts`: player UI logic
- `src/client/shared/*`: shared browser helpers/types
- `tests/game-engine.test.ts`: unit tests for core game mechanics
- `public/*.html`, `public/styles.css`: static UI shells/styles

## Commands

- `npm run dev`: build client bundles and run TS server with `tsx`
- `npm run typecheck`: strict TypeScript checks
- `npm run test`: run unit tests with coverage
- `npm run build`: typecheck + client/server builds
- `npm start`: run bundled server from `dist/server/main.js`

## Core Behavior

- Host creates room and shares `player.html?room=ROOMCODE`
- Players join with name + room code
- Server is authoritative for question flow, timers, submissions, and scoring
- One answer per player per question
- Auto reconnect support via stored `playerId`

## Notes

- Runtime bundles (`public/host.js`, `public/player.js`) are generated from TypeScript.
- This MVP stores live state in memory; persistence (Postgres/Redis) is a next step.
