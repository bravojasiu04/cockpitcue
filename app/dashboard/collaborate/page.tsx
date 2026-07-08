"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { usePlan } from "@/app/lib/usePlan";

export default function CollaboratePage() {
  const { isPremium } = usePlan();
  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");
  const [mode, setMode] = useState<"quiz" | "flow">("quiz");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!isPremium) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <div className="text-5xl mb-4">🔒</div>
        <h1 className="text-2xl font-bold mb-2">Collaboration is Premium</h1>
        <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
          Train together with another pilot in real-time.
        </p>
        <a href="/dashboard/subscription"
          className="px-6 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
          style={{ background: "#00B4D8", color: "#0D1117" }}>
          Upgrade to Premium →
        </a>
      </div>
    );
  }

  async function createRoom() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/collab/room", { method: "POST" });
      const { roomCode } = await res.json();
      router.push(`/dashboard/collaborate/${mode}/${roomCode}`);
    } catch {
      setError("Failed to create room. Try again.");
      setLoading(false);
    }
  }

  async function joinRoom() {
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 6) { setError("Enter a valid 6-character room code."); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/collab/room?code=${code}`);
      if (!res.ok) {
        const { error: e } = await res.json();
        setError(e === "Room is full" ? "Room is full (max 2 pilots)." : "Room not found.");
        setLoading(false);
        return;
      }
      const { role } = await res.json();
      // Detect mode from URL segment — for join we go to quiz by default
      // but the host will have set up mode; guest follows the host's mode
      router.push(`/dashboard/collaborate/${mode}/${code}?role=${role}`);
    } catch {
      setError("Connection error. Try again.");
      setLoading(false);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="max-w-lg mx-auto">
        <p className="text-xs font-mono mb-1" style={{ color: "#00B4D8" }}>COLLABORATE</p>
        <h1 className="text-2xl font-bold mb-2">Train Together</h1>
        <p className="text-sm mb-8" style={{ color: "var(--text-secondary)" }}>
          Start a session and invite another pilot, or join an existing room.
        </p>

        {/* Mode selector */}
        <div className="flex gap-3 mb-8">
          {([
            { value: "quiz"  as const, icon: "🎯", label: "Co-op Quiz",      desc: "PF/PM roles — each pilot clicks their own steps" },
            { value: "flow"  as const, icon: "🗂️", label: "Flow Review",      desc: "Review a flow together in real-time" },
          ]).map(opt => {
            const active = mode === opt.value;
            return (
              <button key={opt.value} onClick={() => setMode(opt.value)}
                className="flex-1 flex items-start gap-3 px-4 py-4 rounded-xl text-left transition-all"
                style={{
                  background: active ? "rgba(0,180,216,0.1)" : "rgba(255,255,255,0.02)",
                  border: `2px solid ${active ? "#00B4D8" : "var(--border)"}`,
                }}>
                <span className="text-2xl shrink-0 mt-0.5">{opt.icon}</span>
                <div>
                  <p className="text-sm font-bold mb-0.5" style={{ color: active ? "#00B4D8" : "var(--text-primary)" }}>{opt.label}</p>
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{opt.desc}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Create room */}
        <div className="rounded-xl p-6 mb-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <h2 className="text-sm font-semibold mb-1">Create a Room</h2>
          <p className="text-xs mb-4" style={{ color: "var(--text-secondary)" }}>
            You'll be the host. Share the room code with your copilot.
          </p>
          <button onClick={createRoom} disabled={loading}
            className="w-full py-3 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50"
            style={{ background: "#00B4D8", color: "#0D1117" }}>
            {loading ? "Creating…" : "Create Room →"}
          </button>
        </div>

        {/* Join room */}
        <div className="rounded-xl p-6" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <h2 className="text-sm font-semibold mb-1">Join a Room</h2>
          <p className="text-xs mb-4" style={{ color: "var(--text-secondary)" }}>
            Enter the 6-character code shared by the host.
          </p>
          <div className="flex gap-3">
            <input
              value={joinCode}
              onChange={e => { setJoinCode(e.target.value.toUpperCase()); setError(""); }}
              onKeyDown={e => e.key === "Enter" && joinRoom()}
              placeholder="ABC123"
              maxLength={6}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-mono uppercase tracking-widest outline-none"
              style={{
                background: "#0D1117",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
              }}
            />
            <button onClick={joinRoom} disabled={loading || joinCode.length !== 6}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-40"
              style={{ background: "rgba(0,180,216,0.15)", color: "#00B4D8", border: "1px solid #00B4D840" }}>
              Join →
            </button>
          </div>
          {error && <p className="text-xs mt-3" style={{ color: "#E63946" }}>{error}</p>}
        </div>
      </div>
    </div>
  );
}
