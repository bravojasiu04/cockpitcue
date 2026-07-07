"use client";

export type QuizHistoryEntry = {
  id: string;
  date: number;
  mode: "practice" | "exam";
  score: number;
  totalSteps: number;
  correctSteps: number;
  timeMs: number;
  flowNames: string[];
};

const KEY = "cockpitcue:quiz_history";
const MAX = 50;

export function getQuizHistory(): QuizHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; }
}

export function saveQuizEntry(entry: Omit<QuizHistoryEntry, "id">): void {
  const list = getQuizHistory();
  list.unshift({ ...entry, id: crypto.randomUUID() });
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
}
