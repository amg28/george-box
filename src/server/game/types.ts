export type QuestionType = "mcq" | "text";
export type SessionPhase = "lobby" | "running" | "scoring" | "finished";

export interface QuestionOption {
  id: string;
  label: string;
}

export interface QuestionDefinition {
  id: string;
  type: QuestionType;
  prompt: string;
  options?: QuestionOption[];
  answer: string;
}

export interface SubmittedAnswer {
  value: string;
  submittedAt: number;
}

export interface PlayerState {
  id: string;
  displayName: string;
  connected: boolean;
  score: number;
  submittedQuestionIds: Set<string>;
  lastAnswers: Map<string, SubmittedAnswer>;
  lastSeenAt: number;
}

export interface QuestionSnapshot {
  id: string;
  questionId: string;
  type: QuestionType;
  inputType: QuestionType;
  prompt: string;
  text: string;
  options: QuestionOption[] | null;
}

export interface PlayerSnapshot {
  id: string;
  displayName: string;
  connected: boolean;
  score: number;
  lastSeenAt: number;
}

export interface LeaderboardEntry {
  id: string;
  displayName: string;
  score: number;
}

export interface SessionSnapshot {
  sessionId: string;
  roomCode: string;
  hostId: string;
  hostName: string;
  state: SessionPhase;
  phase: SessionPhase;
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
  leaderboard: LeaderboardEntry[];
  endedAt: number | null;
  questionCount: number;
  maxPlayers: number;
  serverTime: number;
}

export interface QuestionFinishedEvent {
  ok: true;
  reason: "host" | "timeout";
  questionId: string;
  leaderboard: LeaderboardEntry[];
  scoredPlayers: Array<{
    playerId: string;
    displayName: string;
    correct: boolean;
    points: number;
    answer: string;
  }>;
  finished: boolean;
}

export interface GameSession {
  sessionId: string;
  roomCode: string;
  hostId: string;
  hostName: string;
  state: SessionPhase;
  questionIndex: number;
  questionStartedAt: number | null;
  questionEndsAt: number | null;
  currentQuestion: QuestionDefinition | null;
  questions: QuestionDefinition[];
  players: Map<string, PlayerState>;
  playerOrder: string[];
  scores: Map<string, number>;
  activeSocketIds: Map<string, string>;
  timer: ReturnType<typeof setTimeout> | null;
  tickTimer: ReturnType<typeof setInterval> | null;
  endedAt: number | null;
  createdAt: number;
  onTick?: (session: GameSession, remainingMs: number) => void;
  onQuestionFinished?: (session: GameSession, result: QuestionFinishedEvent) => void;
}

export interface JoinPlayerInput {
  displayName?: string;
  playerId?: string;
  socketId: string;
}

export interface ReconnectPlayerInput {
  playerId: string;
  socketId: string;
}

export interface SubmitAnswerInput {
  playerId: string;
  answer: string;
  questionId: string;
}
