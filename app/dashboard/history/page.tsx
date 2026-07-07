"use client";

import { useEffect, useState } from "react";
import { getQuizHistory, type QuizHistoryEntry } from "@/app/lib/quizHistory";

function fmt(ms: number) {
  return ms < 60000
    ? `${(ms / 1000).toFixed(1)}s`
    : `${Math.floor(ms / 60000)}m ${((ms % 60000) / 1000).toFixed(0)}s`;
}

export default function HistoryPage() {
  const [history, setHistory] = useState<QuizHistoryEntry[]>([]);
  const [filter, setFilter] = useState<"all" | "practice" | "exam">("all");

  useEffect(() => {
    setHistory(getQuizHistory());
  }, []);

  const filtered = filter === "all" ? history : history.filter(e => e.mode === filter);

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="max-w-2xl mx-auto">

        <div className="mb-6">
          <p className="text-xs font-mono mb-1" style={{ color: "#00B4D8" }}>HISTORY</p>
          <h1 className="text-2xl font-bold mb-4">Quiz History</h1>

          <div className="flex rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", width: "fit-content" }}>
            {(["all", "practice", "exam"] as const).map(m => (
              <button key={m} onClick={() => setFilter(m)}
                className="px-4 py-2 text-xs font-medium transition-all capitalize"
                style={{
                  background: filter === m
                    ? m === "exam" ? "#E6394620" : m === "practice" ? "#00B4D820" : "rgba(255,255,255,0.06)"
                    : "transparent",
                  color: filter === m
                    ? m === "exam" ? "#E63946" : m === "practice" ? "#00B4D8" : "var(--text-primary)"
                    : "var(--text-secondary)",
                  borderRight: m !== "exam" ? "1px solid var(--border)" : "none",
                }}>
                {m}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="flex items-center justify-center py-20 rounded-2xl"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>No sessions recorded yet.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((entry, i) => {
              const scoreColor = entry.score >= 80 ? "#2ECC71" : entry.score >= 50 ? "#F77F00" : "#E63946";
              const isExam = entry.mode === "exam";
              const modeColor = isExam ? "#E63946" : "#00B4D8";
              const date = new Date(entry.date);
              const dateStr = date.toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric" });
              const timeStr = date.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });

              return (
                <div key={entry.id}
                  className="flex items-center gap-4 px-4 py-3.5 rounded-xl"
                  style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>

                  <span className="font-mono text-xs shrink-0 w-6 text-right" style={{ color: "var(--text-secondary)" }}>
                    {i + 1}.
                  </span>

                  <span className="px-2 py-0.5 rounded-md text-xs font-semibold shrink-0"
                    style={{ background: `${modeColor}18`, color: modeColor }}>
                    {isExam ? "EXAM" : "PRX"}
                  </span>

                  <div className="flex-1 min-w-0">
                    <p className="text-xs truncate" style={{ color: "var(--text-secondary)" }}>
                      {entry.flowNames.slice(0, 3).join(" · ")}{entry.flowNames.length > 3 ? ` +${entry.flowNames.length - 3}` : ""}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>
                      {entry.correctSteps}/{entry.totalSteps}
                    </span>
                    <span className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>
                      {fmt(entry.timeMs)}
                    </span>
                    <span className="text-sm font-bold w-12 text-right" style={{ color: scoreColor }}>
                      {entry.score}%
                    </span>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>{dateStr}</p>
                    <p className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>{timeStr}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
