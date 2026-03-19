# Quiz MVP

Minimal realtime quiz app for one host and up to 10 live players.

## What this MVP includes

- Host room creation and lobby display.
- Player join flow via room code and browser-based input.
- Multiple-choice and text questions.
- Server-authoritative timers and scoring.
- Live lobby, question, timer, and leaderboard updates over Socket.IO.
- Player reconnect using stored `playerId`.

## Quick Start

1. Install dependencies.
2. Start the backend server.
3. Open the host page in one browser.
4. Join from a phone or tablet using the room code or QR link.

Typical local flow:

```bash
npm install
npm run dev
```

If the project uses separate scripts later, keep the same flow:

- backend: start the API and Socket.IO server
- host: open the host page
- player: open the join page from a mobile browser

## Core Socket Events

Shared events:

- `session:update`
- `lobby:update`
- `question:start`
- `question:locked`
- `timer:tick`
- `leaderboard:update`
- `game:end`
- `error`

Host events:

- `host:createRoom`
- `host:startGame`
- `host:nextQuestion`

Player events:

- `player:join`
- `player:reconnect`
- `player:submitAnswer`

Backend responsibilities:

- Validate room state and player identity.
- Accept or reject joins and submissions.
- Keep the canonical timer and leaderboard.
- Broadcast all state changes to connected clients.

## Known Limitations

- No persistent quiz authoring UI yet.
- No authentication for hosts beyond the room flow.
- No Redis or multi-instance scaling yet.
- No audit history or analytics dashboard yet.
- Reconnect is best-effort and depends on stored player identity.

## Next Improvements

- Add PostgreSQL persistence for quizzes, sessions, and answers.
- Add Redis for room state and multi-instance broadcasts.
- Add better host controls for question editing and results review.
- Add stronger join tokens and rate limiting.
- Add end-to-end tests for join, submit, reconnect, and scoring.
