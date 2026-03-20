export interface PlayerSnapshot {
  id: string;
  displayName: string;
  connected: boolean;
  score: number;
  lastSeenAt: number;
}

export interface QuestionOption {
  id: string;
  label: string;
}

export interface QuestionSnapshot {
  id: string;
  questionId: string;
  type: "mcq" | "text";
  inputType: "mcq" | "text";
  prompt: string;
  text: string;
  options: QuestionOption[] | null;
}

export interface SessionSnapshot {
  sessionId: string;
  roomCode: string;
  hostId: string;
  hostName: string;
  state: "lobby" | "running" | "scoring" | "finished";
  phase: "lobby" | "running" | "scoring" | "finished";
  questionIndex: number;
  questionStartedAt: number | null;
  questionEndsAt: number | null;
  currentQuestion: QuestionSnapshot | null;
  timer: {
    questionId: string | null;
    startedAt: number | null;
    endsAt: number | null;
    remainingMs: number | null;
  };
  players: PlayerSnapshot[];
  leaderboard: Array<{
    id: string;
    displayName: string;
    score: number;
  }>;
  endedAt: number | null;
  questionCount: number;
  maxPlayers: number;
  serverTime: number;
}

export interface SocketAck<T extends object = Record<string, unknown>> {
  ok: boolean;
  error?: string;
  message?: string;
}

export type HostSocket = {
  emit: (event: string, payload?: unknown, ack?: (response: unknown) => void) => void;
  on: (event: string, handler: (payload: unknown) => void) => void;
};
