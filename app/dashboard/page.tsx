"use client";

import { useEffect, useState } from "react";
import { getFlows } from "@/app/lib/storage";
import { getQuizHistory, type QuizHistoryEntry } from "@/app/lib/quizHistory";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";

function LineChart({ entries }: { entries: QuizHistoryEntry[] }) {
  const slice = entries.slice(0, 25).reverse();

  const W = 560;
  const H = 140;
  const PAD_L = 28;
  const PAD_R = 12;
  const PAD_T = 12;
  const PAD_B = 20;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  if (slice.length === 0) {
    return (
      <div className="flex items-center justify-center" style={{ height: H }}>
        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>No attempts yet — complete a quiz to see your progress</p>
      </div>
    );
  }

  const pts = slice.map((e, i) => ({
    x: PAD_L + (slice.length === 1 ? plotW / 2 : (i / (slice.length - 1)) * plotW),
    y: PAD_T + plotH - (e.score / 100) * plotH,
    score: e.score,
    date: new Date(e.date).toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit" }),
  }));

  const polyline = pts.map(p => `${p.x},${p.y}`).join(" ");

  // Smooth fill area path
  const areaPath = pts.length > 0
    ? `M${pts[0].x},${PAD_T + plotH} ` +
      pts.map(p => `L${p.x},${p.y}`).join(" ") +
      ` L${pts[pts.length - 1].x},${PAD_T + plotH} Z`
    : "";

  return (
    <div className="overflow-x-auto">
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
        style={{ display: "block", minWidth: 280, height: H }}>
        <defs>
          <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00B4D8" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#00B4D8" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {[0, 25, 50, 75, 100].map(v => {
          const y = PAD_T + plotH - (v / 100) * plotH;
          return (
            <g key={v}>
              <line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y}
                stroke="#30363D" strokeWidth={v === 0 ? 1 : 0.5}
                strokeDasharray={v === 0 ? "none" : "4 4"} />
              <text x={PAD_L - 4} y={y + 3.5} textAnchor="end" fontSize="8"
                fill="#6B7A8D" fontFamily="monospace">{v}</text>
            </g>
          );
        })}

        {/* Fill area */}
        <path d={areaPath} fill="url(#lineGrad)" />

        {/* Line */}
        <polyline points={polyline} fill="none" stroke="#00B4D8" strokeWidth="1.5"
          strokeLinejoin="round" strokeLinecap="round" />

        {/* Dots + score labels */}
        {pts.map((p, i) => {
          const e = slice[i];
          const color = e.score >= 80 ? "#2ECC71" : e.score >= 50 ? "#F77F00" : "#E63946";
          const showLabel = slice.length <= 10 || i % Math.ceil(slice.length / 8) === 0 || i === slice.length - 1;
          return (
            <g key={e.id}>
              <circle cx={p.x} cy={p.y} r="3.5" fill={color} stroke="#0D1117" strokeWidth="1.5" />
              {showLabel && (
                <text x={p.x} y={PAD_T + plotH + PAD_B - 4} textAnchor="middle"
                  fontSize="7.5" fill="#6B7A8D" fontFamily="monospace">
                  {p.date}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function OverviewPage() {
  const { user } = useUser();
  const [flowsCount, setFlowsCount] = useState<number | null>(null);
  const [history, setHistory] = useState<QuizHistoryEntry[]>([]);
  const [chartMode, setChartMode] = useState<"practice" | "exam">("practice");

  useEffect(() => {
    setFlowsCount(getFlows().length);
    setHistory(getQuizHistory());
  }, []);

  const filtered = history.filter(e => e.mode === chartMode);
  const totalQuizzes = history.length;
  const avgScore = history.length > 0
    ? Math.round(history.reduce((s, e) => s + e.score, 0) / history.length)
    : null;
  const avgColor = avgScore === null ? "var(--text-primary)" : avgScore >= 80 ? "#2ECC71" : avgScore >= 50 ? "#F77F00" : "#E63946";

  const firstName = user?.firstName ?? "Pilot";

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="mb-8">
          <p className="text-xs font-mono mb-1" style={{ color: "#00B4D8" }}>OVERVIEW</p>
          <h1 className="text-2xl font-bold">Welcome back, {firstName} ✈️</h1>
        </div>

        {/* Combined stats + chart tile */}
        <div className="rounded-2xl p-6 mb-6" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>

          {/* Stat row */}
          <div className="flex items-start gap-8 mb-6">
            <div className="flex-1">
              <p className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>Flows created</p>
              <p className="text-2xl font-bold">
                {flowsCount === null ? <span style={{ opacity: 0.3 }}>—</span> : flowsCount}
              </p>
            </div>
            <div style={{ width: 1, alignSelf: "stretch", background: "var(--border)" }} />
            <div className="flex-1">
              <p className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>Quizzes done</p>
              <p className="text-2xl font-bold">{totalQuizzes}</p>
            </div>
            <div style={{ width: 1, alignSelf: "stretch", background: "var(--border)" }} />
            <div className="flex-1">
              <p className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>Avg score</p>
              <p className="text-2xl font-bold" style={{ color: avgColor }}>
                {avgScore === null ? <span style={{ opacity: 0.3, color: "var(--text-primary)" }}>—</span> : `${avgScore}%`}
              </p>
            </div>

            {/* Mode toggle — pushed right */}
            <div className="ml-auto shrink-0 flex rounded-lg overflow-hidden self-start"
              style={{ border: "1px solid var(--border)" }}>
              {(["practice", "exam"] as const).map(m => (
                <button key={m} onClick={() => setChartMode(m)}
                  className="px-3 py-1.5 text-xs font-medium transition-all capitalize"
                  style={{
                    background: chartMode === m ? (m === "exam" ? "#E6394618" : "#00B4D818") : "transparent",
                    color: chartMode === m ? (m === "exam" ? "#E63946" : "#00B4D8") : "var(--text-secondary)",
                  }}>
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Chart */}
          <div>
            <p className="text-xs mb-3" style={{ color: "var(--text-secondary)" }}>
              Last {Math.min(filtered.length, 25)} attempts · score %
            </p>
            <LineChart entries={filtered} />
          </div>
        </div>

        {/* Quick links */}
        <div className="grid grid-cols-2 gap-4">
          {[
            { href: "/dashboard/quizzes", label: "Start Quiz", desc: "Practice or Exam mode", color: "#00B4D8", icon: "🎯" },
            { href: "/dashboard/history",  label: "History",    desc: "Last 50 quiz sessions", color: "#F77F00", icon: "📋" },
          ].map(item => (
            <Link key={item.href} href={item.href}
              className="flex items-center gap-4 px-5 py-4 rounded-2xl transition-all hover:opacity-80"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <span className="text-2xl">{item.icon}</span>
              <div>
                <p className="text-sm font-bold" style={{ color: item.color }}>{item.label}</p>
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{item.desc}</p>
              </div>
            </Link>
          ))}
        </div>

      </div>
    </div>
  );
}
