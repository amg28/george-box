import type { QuestionDefinition } from "./types";

export const MAX_PLAYERS = 10;
export const QUESTION_DURATION_MS = 15_000;
export const TICK_INTERVAL_MS = 1_000;
export const TIMER_PADDING_MS = 500;

export const DEFAULT_QUESTIONS: QuestionDefinition[] = [
  {
    id: "q1",
    type: "mcq",
    prompt: "Which planet is known as the Red Planet?",
    options: [
      { id: "a", label: "Earth" },
      { id: "b", label: "Mars" },
      { id: "c", label: "Jupiter" },
      { id: "d", label: "Venus" }
    ],
    answer: "b"
  },
  {
    id: "q2",
    type: "text",
    prompt: "Type the word \"socket\" lowercase.",
    answer: "socket"
  },
  {
    id: "q3",
    type: "mcq",
    prompt: "What is 2 + 2?",
    options: [
      { id: "a", label: "3" },
      { id: "b", label: "4" },
      { id: "c", label: "5" },
      { id: "d", label: "22" }
    ],
    answer: "b"
  }
];
