import type { QuestionDefinition } from "./types";

export function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

export function isCorrectAnswer(question: QuestionDefinition, submittedAnswer: string): boolean {
  if (question.type === "text") {
    return normalizeText(submittedAnswer) === normalizeText(question.answer);
  }
  return submittedAnswer === question.answer;
}

export function calculatePoints(
  isCorrect: boolean,
  questionEndsAt: number,
  submittedAt: number
): number {
  if (!isCorrect) {
    return 0;
  }

  const responseWindowMs = Math.max(0, questionEndsAt - submittedAt);
  const speedBonus = Math.max(0, Math.ceil(responseWindowMs / 1_000));
  return 100 + speedBonus;
}
