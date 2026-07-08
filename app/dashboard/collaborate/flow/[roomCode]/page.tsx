"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { getPusherClient } from "@/app/lib/pusher-client";
import { getFlows, type SavedFlow } from "@/app/lib/storage";
import { usePlan } from "@/app/lib/usePlan";
import { useUser } from "@clerk/nextjs";

export default function CollabFlowPage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { isPremium } = usePlan();
  const { user } = useUser();

  const [isHost, setIsHost] = useState(false);
  const [partnerConnected, setPartnerConnected] = useState(false);
  const [partnerDisconnected, setPartnerDisconnected] = useState(false);
  const [phase, setPhase] = useState<"lobby" | "select" | "viewing">("lobby");

  const [flows, setFlows] = useState<SavedFlow[]>([]);
  const [selectedFlow, setSelectedFlow] = useState<SavedFlow | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [naturalAspect, setNaturalAspect] = useState(16 / 9);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasW, setCanvasW] = useState(800);
  const [canvasH, setCanvasH] = useState(500);
  const mySocketIdRef = useRef<string>("");

  useEffect(() => {
    if (!isPremium || !user) return;

    const role = searchParams.get("role");
    const host = role !== "guest";
    setIsHost(host);

    setFlows(getFlows());

    const pusher = getPusherClient();
    const captureSid = () => { mySocketIdRef.current = pusher.connection.socket_id ?? ""; };
    if (pusher.connection.socket_id) captureSid();
    pusher.connection.bind("connected", captureSid);
    const channel = pusher.subscribe(`presence-collab-${roomCode}`);

    channel.bind("pusher:subscription_succeeded", (members: any) => {
      if (members.count >= 2) { setPartnerConnected(true); setPhase(host ? "select" : "viewing"); }
    });

    channel.bind("pusher:member_added", () => {
      setPartnerConnected(true);
      setPartnerDisconnected(false);
      if (host && phase === "lobby") setPhase("select");
    });

    channel.bind("pusher:member_removed", () => {
      setPartnerDisconnected(true);
    });

    channel.bind("collab:flow-selected", async (data: { senderId: string; flowId: string }) => {
      if (data.senderId !== mySocketIdRef.current) {
        const res = await fetch(`/api/collab/flow?code=${roomCode}`);
        if (res.ok) {
          const { flow } = await res.json();
          setSelectedFlow(flow);
          setStepIdx(0);
          setPhase("viewing");
        }
      }
    });

    channel.bind("collab:step-change", (data: { senderId: string; stepIdx: number }) => {
      if (data.senderId !== mySocketIdRef.current) setStepIdx(data.stepIdx);
    });

    return () => {
      channel.unbind_all();
      pusher.unsubscribe(`presence-collab-${roomCode}`);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode, isPremium, user]);

  useEffect(() => {
    if (partnerConnected && phase === "lobby") setPhase(isHost ? "select" : "viewing");
  }, [partnerConnected, phase, isHost]);

  useEffect(() => {
    if (!canvasRef.current) return;
    const { width, height } = canvasRef.current.getBoundingClientRect();
    if (width > 0) { setCanvasW(width); setCanvasH(height); }
  });

  async function broadcast(eventName: string, data: object) {
    const socketId = getPusherClient().connection.socket_id ?? "";
    await fetch("/api/collab/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomCode, eventName, data, socketId }),
    });
  }

  async function selectFlow(flow: SavedFlow) {
    await fetch("/api/collab/flow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomCode, flow }),
    });
    setSelectedFlow(flow);
    setStepIdx(0);
    setPhase("viewing");
    broadcast("collab:flow-selected", { flowId: flow.id });
  }

  function changeStep(idx: number) {
    setStepIdx(idx);
    broadcast("collab:step-change", { stepIdx: idx });
  }

  if (!isPremium) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-center">
        <div>
          <p className="text-lg font-bold mb-2">Premium required</p>
          <a href="/dashboard/subscription" style={{ color: "#00B4D8" }}>Upgrade →</a>
        </div>
      </div>
    );
  }

  /* ── LOBBY ── */
  if (phase === "lobby") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <div className="text-4xl mb-4 animate-pulse">🔗</div>
        <h1 className="text-2xl font-bold mb-2">Waiting for copilot…</h1>
        <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
          Share this room code with your partner:
        </p>
        <div className="px-8 py-4 rounded-2xl font-mono text-3xl font-bold tracking-widest"
          style={{ background: "rgba(0,180,216,0.1)", border: "2px solid #00B4D840", color: "#00B4D8" }}>
          {roomCode}
        </div>
      </div>
    );
  }

  /* ── SELECT (host) ── */
  if (phase === "select") {
    return (
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-lg mx-auto">
          <p className="text-xs font-mono mb-1" style={{ color: "#00B4D8" }}>ROOM · {roomCode}</p>
          <h1 className="text-2xl font-bold mb-2">Select a Flow to Review</h1>
          <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
            Your copilot will see the same flow in real-time.
          </p>
          {flows.length === 0 ? (
            <p style={{ color: "var(--text-secondary)" }}>No flows found.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {flows.map(flow => (
                <button key={flow.id} onClick={() => selectFlow(flow)}
                  className="flex items-center gap-4 px-4 py-4 rounded-xl text-left transition-all hover:opacity-90"
                  style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{flow.name}</p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                      {flow.steps.length} step{flow.steps.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                  {flow.emergency && <span>🚨</span>}
                  <span style={{ color: "#00B4D8" }}>→</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ── VIEWING ── */
  if (phase === "viewing" && selectedFlow) {
    const steps = selectedFlow.steps;
    const step = steps[stepIdx];

    function getImgBounds(cW: number, cH: number, aspect: number) {
      const ca = cW / cH;
      if (aspect > ca) {
        const h = cW / aspect;
        return { left: 0, top: (cH - h) / 2, width: cW, height: h };
      } else {
        const w = cH * aspect;
        return { left: (cW - w) / 2, top: 0, width: w, height: cH };
      }
    }

    const ib = getImgBounds(canvasW, canvasH, naturalAspect);
    const roleColor = step?.role === "PF" ? "#00B4D8" : step?.role === "PM" ? "#F77F00" : "#00B4D8";

    return (
      <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "#0D1117" }}>
        {/* Header */}
        <div className="flex items-center gap-4 px-6 py-3 shrink-0"
          style={{ borderBottom: "1px solid var(--border)", background: "rgba(22,27,34,0.95)" }}>
          <div className="flex-1">
            <p className="text-xs font-mono mb-0.5" style={{ color: "#00B4D8" }}>REVIEW · {roomCode}</p>
            <p className="font-semibold text-sm truncate">{selectedFlow.name}</p>
          </div>
          {/* Step dots */}
          <div className="flex items-center gap-1">
            {steps.map((_, i) => (
              <div key={i} className="rounded-full transition-all"
                style={{
                  width: i === stepIdx ? 20 : 8, height: 8,
                  background: i < stepIdx ? "#00B4D840" : i === stepIdx ? "#00B4D8" : "#30363D",
                  cursor: isHost ? "pointer" : "default",
                }}
                onClick={() => isHost && changeStep(i)}
              />
            ))}
          </div>
          <span className="text-sm font-mono shrink-0" style={{ color: "var(--text-secondary)" }}>
            {stepIdx + 1} / {steps.length}
          </span>
          {!isHost && <span className="text-xs px-2 py-1 rounded" style={{ background: "rgba(247,127,0,0.1)", color: "#F77F00", border: "1px solid rgba(247,127,0,0.3)" }}>Synced</span>}
          {partnerDisconnected && (
            <div className="px-3 py-1 rounded-lg text-xs font-semibold"
              style={{ background: "rgba(230,57,70,0.15)", color: "#E63946", border: "1px solid #E6394640" }}>
              Copilot disconnected
            </div>
          )}
        </div>

        {/* Canvas */}
        <div ref={canvasRef} className="flex-1 relative overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={selectedFlow.imageDataUrl} alt="Cockpit"
            className="w-full h-full object-contain pointer-events-none select-none" draggable={false}
            onLoad={e => setNaturalAspect(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)} />

          {/* All previous steps (faint) */}
          {steps.slice(0, stepIdx).map(s => {
            const px = ib.left + s.x / 100 * ib.width;
            const py = ib.top + s.y / 100 * ib.height;
            return (
              <div key={s.id} className="absolute pointer-events-none"
                style={{ left: px, top: py, width: 0, height: 0, overflow: "visible", zIndex: 3 }}>
                <div style={{
                  position: "absolute", width: 18, height: 18,
                  transform: "translate(-50%,-50%)",
                  background: "rgba(0,180,216,0.06)",
                  border: "1.5px solid rgba(0,180,216,0.25)",
                  borderRadius: "50%",
                }} />
              </div>
            );
          })}

          {/* Current step */}
          {step && (
            <div className="absolute pointer-events-none"
              style={{
                left: ib.left + step.x / 100 * ib.width,
                top: ib.top + step.y / 100 * ib.height,
                width: 0, height: 0, overflow: "visible", zIndex: 6,
              }}>
              <div style={{
                position: "absolute", width: 32, height: 32,
                transform: "translate(-50%,-50%)",
                background: `${roleColor}20`,
                border: `2.5px solid ${roleColor}`,
                borderRadius: "50%",
                boxShadow: `0 0 16px ${roleColor}55`,
                animation: "scale-in 0.2s ease",
              }}>
                <span style={{
                  position: "absolute", inset: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 700, color: roleColor,
                }}>{stepIdx + 1}</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 flex items-center gap-4 px-6"
          style={{ borderTop: "1px solid var(--border)", background: "rgba(22,27,34,0.95)", height: 80 }}>
          <button
            onClick={() => isHost && stepIdx > 0 && changeStep(stepIdx - 1)}
            disabled={!isHost || stepIdx === 0}
            className="px-4 py-2 rounded-xl text-sm font-semibold transition-all hover:opacity-80 disabled:opacity-30"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
            ← Prev
          </button>

          <div className="flex-1 min-w-0 text-center">
            {step && (
              <>
                <p className="text-xs mb-0.5" style={{ color: "var(--text-secondary)" }}>
                  {step.role ? `${step.role} · ` : ""}Step {stepIdx + 1}
                </p>
                <p className="font-semibold text-sm" style={{ color: roleColor }}>
                  {step.label}
                  {step.action && <span className="ml-2 font-bold">{step.action}</span>}
                </p>
              </>
            )}
          </div>

          <button
            onClick={() => isHost && stepIdx < steps.length - 1 && changeStep(stepIdx + 1)}
            disabled={!isHost || stepIdx >= steps.length - 1}
            className="px-4 py-2 rounded-xl text-sm font-semibold transition-all hover:opacity-80 disabled:opacity-30"
            style={{ background: "#00B4D8", color: "#0D1117" }}>
            Next →
          </button>
        </div>
      </div>
    );
  }

  if (!isHost) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p style={{ color: "var(--text-secondary)" }}>Waiting for host to select a flow…</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center">
      <p style={{ color: "var(--text-secondary)" }}>Loading…</p>
    </div>
  );
}
