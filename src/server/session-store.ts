import { clearTimers, createSession } from "./game";
import type { GameSession } from "./game";

export class SessionStore {
  private readonly sessionsById = new Map<string, GameSession>();
  private readonly sessionsByCode = new Map<string, GameSession>();

  create(hostName: string): GameSession {
    const session = createSession(hostName);
    this.add(session);
    return session;
  }

  add(session: GameSession): void {
    this.sessionsById.set(session.sessionId, session);
    this.sessionsByCode.set(session.roomCode, session);
  }

  getByIdOrCode(input: string | undefined): GameSession | null {
    if (!input) {
      return null;
    }

    if (this.sessionsById.has(input)) {
      return this.sessionsById.get(input) ?? null;
    }

    return this.sessionsByCode.get(input.toUpperCase()) ?? null;
  }

  values(): IterableIterator<GameSession> {
    return this.sessionsById.values();
  }

  size(): number {
    return this.sessionsById.size;
  }

  clear(): void {
    for (const session of this.sessionsById.values()) {
      clearTimers(session);
    }
    this.sessionsById.clear();
    this.sessionsByCode.clear();
  }
}
