import type { Express } from "express";
import { serializeSession } from "../game";
import type { SessionStore } from "../session-store";

export function registerRoutes(app: Express, store: SessionStore): void {
  app.get("/health", (_req, res) => {
    res.json({ ok: true, sessions: store.size() });
  });

  app.post("/api/rooms", (req, res) => {
    const hostName = String(req.body?.hostName || "Host").trim() || "Host";
    const session = store.create(hostName);

    res.status(201).json({
      ok: true,
      sessionId: session.sessionId,
      roomCode: session.roomCode,
      hostId: session.hostId,
      hostName: session.hostName,
      joinUrl: `/player.html?room=${session.roomCode}`,
      snapshot: serializeSession(session)
    });
  });

  app.get("/api/rooms/:roomCode", (req, res) => {
    const session = store.getByIdOrCode(req.params.roomCode);
    if (!session) {
      res.status(404).json({ ok: false, error: "room_not_found" });
      return;
    }

    res.json({ ok: true, snapshot: serializeSession(session) });
  });

  app.post("/api/debug/reset", (_req, res) => {
    store.clear();
    res.json({ ok: true });
  });
}
