"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { getPusherClient } from "@/app/lib/pusher-client";
import { type SavedFlow, type Aircraft, getAircrafts } from "@/app/lib/storage";
import { usePlan } from "@/app/lib/usePlan";
import { useUser } from "@clerk/nextjs";

type Role = "PF" | "PM";
type RemoteStep = { stepId: string; correct: boolean; role: Role };

type QuizConfig = {
  flows: SavedFlow[];
  aircraftId: string;
  difficulty: "easy" | "medium" | "hard";
  voiceEnabled: boolean;
};

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

const TOLERANCE: Record<QuizConfig["difficulty"], number> = { easy: 12, medium: 8, hard: 5 };

export default function CoopQuizPage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { isPremium } = usePlan();
  const { user } = useUser();

  const [phase, setPhase] = useState<"loading" | "lobby" | "role-select" | "running" | "done">("loading");
  const [myRole, setMyRole] = useState<Role | null>(null);
  const [partnerRole, setPartnerRole] = useState<Role | null>(null);
  const [partnerConnected, setPartnerConnected] = useState(false);
  const [partnerDisconnected, setPartnerDisconnected] = useState(false);
  const [isHost, setIsHost] = useState(false);

  // Quiz config (loaded from server)
  const [quizConfig, setQuizConfig] = useState<QuizConfig | null>(null);
  const [aircraft, setAircraft] = useState<Aircraft | undefined>(undefined);

  // Multi-flow state
  const [flowIndex, setFlowIndex] = useState(0);

  // Per-flow state
  const [mySteps, setMySteps] = useState<RemoteStep[]>([]);
  const [remoteSteps, setRemoteSteps] = useState<RemoteStep[]>([]);
  const [feedback, setFeedback] = useState<{ stepId: string; correct: boolean; role: Role; clickX: number; clickY: number } | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Visual state (per-flow)
  const [introPhase, setIntroPhase] = useState(true);
  const [countdown, setCountdown] = useState(3);
  const [arrows, setArrows] = useState<{ id: string; x1: number; y1: number; x2: number; y2: number; color: string }[]>([]);
  const [persistedMarkers, setPersistedMarkers] = useState<{ id: string; stepId: string; x: number; y: number; fading: boolean }[]>([]);
  const arrowCounterRef = useRef(0);

  // All-flows results
  const [allResults, setAllResults] = useState<{ flowName: string; myCorrect: number; myTotal: number; partnerCorrect: number; partnerTotal: number }[]>([]);

  // Canvas
  const [naturalAspect, setNaturalAspect] = useState(16 / 9);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasW, setCanvasW] = useState(800);
  const [canvasH, setCanvasH] = useState(500);

  const channelRef = useRef<any>(null);
  const configLoadedRef = useRef(false);
  const initializedRef = useRef(false);
  const mySocketIdRef = useRef<string>("");

  // Ready-handshake state
  const [myReady, setMyReady] = useState(false);
  const [partnerReady, setPartnerReady] = useState(false);

  // Error state
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [restarting, setRestarting] = useState(false);

  const currentFlow = quizConfig?.flows[flowIndex] ?? null;

  /* ── Canvas size ── */
  useEffect(() => {
    if (!canvasRef.current) return;
    const { width, height } = canvasRef.current.getBoundingClientRect();
    if (width > 0) { setCanvasW(width); setCanvasH(height); }
  });

  /* ── Load quiz config + subscribe to Pusher ── */
  useEffect(() => {
    // Check initializedRef FIRST so Clerk token refresh (which creates a new
    // `user` reference and can briefly flip isPremium to false) never re-runs
    // initialization and resets the quiz phase back to "lobby".
    if (initializedRef.current) return;
    if (!isPremium || !user) return;
    initializedRef.current = true;

    const role = searchParams.get("role");
    const host = role !== "guest";
    setIsHost(host);

    fetch(`/api/collab/flow?code=${roomCode}`)
      .then(r => { if (!r.ok) throw new Error(r.status === 404 ? "Room not found or session expired." : "Failed to load session."); return r.json(); })
      .then(({ quizConfig: cfg }) => {
        if (!cfg) { setErrorMsg("No quiz data found for this room."); return; }
        setQuizConfig(cfg);
        const ac = getAircrafts().find(a => a.id === cfg.aircraftId);
        setAircraft(ac);
        setPhase("lobby");
        // Signal that we're fully loaded
        setMyReady(true);
        configLoadedRef.current = true;
        fetch("/api/collab/event", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomCode, eventName: "collab:ready", data: {}, socketId: mySocketIdRef.current }),
        });
      })
      .catch(err => setErrorMsg(err.message ?? "Could not load session."));

    const pusher = getPusherClient();
    const channel = pusher.subscribe(`presence-collab-${roomCode}`);
    channelRef.current = channel;

    // Capture own socket ID as soon as available so event handlers can filter
    // out self-echoes without relying on user.id (which breaks same-account tabs).
    const captureSid = () => { mySocketIdRef.current = pusher.connection.socket_id ?? ""; };
    if (pusher.connection.socket_id) captureSid();
    pusher.connection.bind("connected", () => {
      captureSid();
      // Re-announce readiness after reconnect (e.g. background window throttle)
      if (configLoadedRef.current) {
        fetch("/api/collab/event", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomCode, eventName: "collab:ready", data: {}, socketId: mySocketIdRef.current }),
        });
      }
    });

    channel.bind("pusher:subscription_succeeded", (members: any) => {
      if (members.count >= 2) {
        setPartnerConnected(true);
        // Re-announce readiness in case we already loaded before partner subscribed
        if (configLoadedRef.current) {
          fetch("/api/collab/event", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ roomCode, eventName: "collab:ready", data: {}, socketId: mySocketIdRef.current }),
          });
        }
      }
    });
    channel.bind("pusher:member_added", () => {
      setPartnerConnected(true);
      setPartnerDisconnected(false);
      // Re-announce readiness so the newly joined partner knows we're ready
      if (configLoadedRef.current) {
        fetch("/api/collab/event", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomCode, eventName: "collab:ready", data: {}, socketId: mySocketIdRef.current }),
        });
      }
    });
    channel.bind("pusher:member_removed", () => setPartnerDisconnected(true));

    channel.bind("collab:ready", (data: { senderId: string }) => {
      if (data.senderId !== mySocketIdRef.current) setPartnerReady(true);
    });

    channel.bind("collab:role-chosen", (data: { senderId: string; role: Role }) => {
      if (data.senderId !== mySocketIdRef.current) setPartnerRole(data.role);
    });

    channel.bind("collab:start", (data: { senderId: string }) => {
      if (data.senderId !== mySocketIdRef.current) { setPhase("running"); setIntroPhase(true); setCountdown(3); }
    });

    channel.bind("collab:step-result", (data: RemoteStep & { senderId: string }) => {
      if (data.senderId !== mySocketIdRef.current) {
        setRemoteSteps(prev => [...prev, { stepId: data.stepId, correct: data.correct, role: data.role }]);
        setFeedback({ stepId: data.stepId, correct: data.correct, role: data.role, clickX: -1, clickY: -1 });
        if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
        feedbackTimerRef.current = setTimeout(() => setFeedback(null), 1200);
      }
    });

    channel.bind("collab:next-flow", (data: { senderId: string; flowIndex: number }) => {
      if (data.senderId !== mySocketIdRef.current) {
        setFlowIndex(data.flowIndex);
        setMySteps([]);
        setRemoteSteps([]);
        setFeedback(null);
        setArrows([]);
        setPersistedMarkers([]);
        setIntroPhase(true);
        setCountdown(3);
        setPhase("running");
      }
    });

    channel.bind("collab:quiz-done", (data: { senderId: string; allResults: typeof allResults }) => {
      if (data.senderId !== mySocketIdRef.current) {
        // Merge partner's allResults in case we didn't compute ours yet
        if (data.allResults?.length) {
          setAllResults(prev => prev.length >= data.allResults.length ? prev : data.allResults);
        }
        setPhase("done");
      }
    });

    channel.bind("collab:restart", (data: { senderId: string }) => {
      if (data.senderId !== mySocketIdRef.current) {
        setFlowIndex(0);
        setMySteps([]); setRemoteSteps([]); setFeedback(null);
        setArrows([]); setPersistedMarkers([]);
        setAllResults([]);
        setMyRole(null); setPartnerRole(null);
        setIntroPhase(true); setCountdown(3);
        setPhase("role-select");
      }
    });

    return () => {
      channel.unbind_all();
      pusher.unsubscribe(`presence-collab-${roomCode}`);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode, isPremium, user]);

  // Periodically re-announce readiness while in lobby so that whichever user
  // joins second is guaranteed to receive the event (avoids lost-message races).
  useEffect(() => {
    if (!myReady) return;
    const iv = setInterval(() => {
      setPhase(prev => {
        if (prev !== "loading" && prev !== "lobby") { clearInterval(iv); return prev; }
        fetch("/api/collab/event", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roomCode, eventName: "collab:ready", data: {},
            socketId: mySocketIdRef.current,
          }),
        });
        return prev;
      });
    }, 1500);
    return () => clearInterval(iv);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myReady, roomCode]);

  // Advance to role-select when both pilots are present and both have loaded data.
  useEffect(() => {
    if (partnerConnected && myReady && partnerReady) {
      setPhase(prev => (prev === "loading" || prev === "lobby") ? "role-select" : prev);
    }
  }, [partnerConnected, myReady, partnerReady]);

  /* ── Countdown on intro ── */
  useEffect(() => {
    if (!introPhase || phase !== "running") return;
    if (countdown <= 0) { setIntroPhase(false); return; }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [introPhase, countdown, phase]);

  /* ── Keyboard: Space/Enter skip intro ── */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (introPhase && (e.key === " " || e.key === "Enter")) { e.preventDefault(); setIntroPhase(false); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [introPhase]);

  async function restartQuiz() {
    setRestarting(true);
    // Broadcast first so partner starts resetting before we enter role-select.
    // Without the delay, the initiator can choose a role and broadcast
    // collab:role-chosen before the partner receives collab:restart — the
    // restart then clears partnerRole and the partner gets stuck waiting.
    await broadcast("collab:restart", {});
    await new Promise(r => setTimeout(r, 700));
    setFlowIndex(0);
    setMySteps([]); setRemoteSteps([]); setFeedback(null);
    setArrows([]); setPersistedMarkers([]);
    setAllResults([]);
    setMyRole(null); setPartnerRole(null);
    setIntroPhase(true); setCountdown(3);
    setPhase("role-select");
    setRestarting(false);
  }

  async function broadcast(eventName: string, data: object) {
    const socketId = channelRef.current?.pusher?.connection?.socket_id ?? "";
    await fetch("/api/collab/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomCode, eventName, data, socketId }),
    });
  }

  function chooseRole(role: Role) {
    setMyRole(role);
    broadcast("collab:role-chosen", { role });
  }

  // When both roles chosen and I'm host → start
  useEffect(() => {
    if (myRole && partnerRole && isHost && phase === "role-select") {
      broadcast("collab:start", {});
      setPhase("running");
      setIntroPhase(true);
      setCountdown(3);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myRole, partnerRole, isHost, phase]);

  function handleCanvasClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!currentFlow || !myRole || feedback || introPhase) return;
    const partRole: Role = myRole === "PF" ? "PM" : "PF";
    const isMultiPilot = aircraft?.cockpitType === "multi" || currentFlow.steps.some(s => s.role);
    const tol = TOLERANCE[quizConfig?.difficulty ?? "medium"];

    const myRoleSteps = isMultiPilot
      ? currentFlow.steps.filter(s => s.role === myRole)
      : currentFlow.steps;
    const completedMySteps = mySteps.length;
    if (completedMySteps >= myRoleSteps.length) return;

    const rect = canvasRef.current!.getBoundingClientRect();
    const ib = getImgBounds(rect.width, rect.height, naturalAspect);
    const clickX = ((e.clientX - rect.left - ib.left) / ib.width) * 100;
    const clickY = ((e.clientY - rect.top - ib.top) / ib.height) * 100;

    const step = myRoleSteps[completedMySteps];
    const dx = clickX - step.x;
    const dy = clickY - step.y;
    const correct = Math.sqrt(dx * dx + dy * dy) <= tol;

    const result: RemoteStep = { stepId: step.id, correct, role: myRole };
    const nextMySteps = [...mySteps, result];
    setMySteps(nextMySteps);
    setFeedback({ stepId: step.id, correct, role: myRole, clickX, clickY });
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);

    // Arrows: from previous same-role step to this step
    const prevStep = completedMySteps > 0 ? myRoleSteps[completedMySteps - 1] : null;
    if (prevStep) {
      setArrows(prev => [...prev, {
        id: `arrow-${arrowCounterRef.current++}`,
        x1: prevStep.x, y1: prevStep.y,
        x2: correct ? step.x : clickX,
        y2: correct ? step.y : clickY,
        color: correct ? "#2ECC71" : "#E63946",
      }]);
      if (correct) {
        setPersistedMarkers(prev => prev.map(m =>
          m.stepId === prevStep.id ? { ...m, fading: true } : m
        ));
        setTimeout(() => setPersistedMarkers(prev => prev.filter(m => m.stepId !== prevStep.id)), 2800);
      }
    }

    if (correct) {
      // Add persisted marker
      setPersistedMarkers(prev => [...prev, { id: `pm-${step.id}-${Date.now()}`, stepId: step.id, x: step.x, y: step.y, fading: false }]);
      // Voice readout
      if (quizConfig?.voiceEnabled) {
        window.speechSynthesis.cancel();
        const text = step.action ? `${step.label}, ${step.action}` : step.label;
        const utt = new SpeechSynthesisUtterance(text);
        utt.lang = "en-US"; utt.rate = 1.2;
        window.speechSynthesis.speak(utt);
      }
      feedbackTimerRef.current = setTimeout(() => {
        setFeedback(null);
      }, 1000);
    } else {
      feedbackTimerRef.current = setTimeout(() => setFeedback(null), 1800);
    }

    broadcast("collab:step-result", result);
    checkFlowDone(nextMySteps, remoteSteps, currentFlow, myRole, partRole, isMultiPilot);
  }

  function checkFlowDone(mine: RemoteStep[], partner: RemoteStep[], flow: SavedFlow, myR: Role, partR: Role, multi: boolean) {
    if (!quizConfig) return;
    const myTotal = multi ? flow.steps.filter(s => s.role === myR).length : flow.steps.length;
    const partTotal = multi ? flow.steps.filter(s => s.role === partR).length : 0;
    if (mine.length >= myTotal && (partTotal === 0 || partner.length >= partTotal)) {
      const myCorrect = mine.filter(s => s.correct).length;
      const partCorrect = partner.filter(s => s.correct).length;
      setAllResults(prev => [...prev, { flowName: flow.name, myCorrect, myTotal, partnerCorrect: partCorrect, partnerTotal: partTotal }]);

      const nextIdx = flowIndex + 1;
      if (nextIdx < quizConfig.flows.length) {
        setTimeout(() => {
          setFlowIndex(nextIdx);
          setMySteps([]);
          setRemoteSteps([]);
          setFeedback(null);
          setArrows([]);
          setPersistedMarkers([]);
          setIntroPhase(true);
          setCountdown(3);
          setPhase("running");
          broadcast("collab:next-flow", { flowIndex: nextIdx });
        }, 1500);
      } else {
        const finalResults = [...allResults, { flowName: flow.name, myCorrect, myTotal, partnerCorrect: partCorrect, partnerTotal: partTotal }];
        setTimeout(() => {
          setPhase("done");
          broadcast("collab:quiz-done", { allResults: finalResults });
        }, 1500);
      }
    }
  }

  // Also check after remote steps arrive
  useEffect(() => {
    if (phase !== "running" || !currentFlow || !myRole) return;
    const partRole: Role = myRole === "PF" ? "PM" : "PF";
    const isMultiPilot = aircraft?.cockpitType === "multi" || currentFlow.steps.some(s => s.role);
    checkFlowDone(mySteps, remoteSteps, currentFlow, myRole, partRole, isMultiPilot);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteSteps]);

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

  /* ── ERROR ── */
  if (errorMsg) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <div className="text-4xl mb-4">❌</div>
        <h1 className="text-xl font-bold mb-2">Cannot join session</h1>
        <p className="text-sm mb-6 max-w-xs" style={{ color: "var(--text-secondary)" }}>{errorMsg}</p>
        <button onClick={() => router.push("/dashboard/quizzes")}
          className="px-6 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-80"
          style={{ background: "#00B4D8", color: "#0D1117" }}>
          Back to Quizzes
        </button>
      </div>
    );
  }

  /* ── LOADING ── */
  if (phase === "loading") {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm animate-pulse" style={{ color: "var(--text-secondary)" }}>Loading session…</p>
      </div>
    );
  }

  /* ── LOBBY ── */
  if (phase === "lobby") {
    const partnerStatus = partnerConnected
      ? (partnerReady ? null : "Copilot connected — waiting for them to finish loading…")
      : null;
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <div className="text-4xl mb-4 animate-pulse">🔗</div>
        <h1 className="text-2xl font-bold mb-2">
          {partnerConnected ? "Copilot connected" : "Waiting for copilot…"}
        </h1>
        <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
          {partnerStatus ?? (partnerConnected ? "Both pilots ready — starting role selection…" : "Share this room code with your partner:")}
        </p>
        <div className="px-8 py-4 rounded-2xl mb-4 font-mono text-3xl font-bold tracking-widest"
          style={{ background: "rgba(0,180,216,0.1)", border: "2px solid #00B4D840", color: "#00B4D8" }}>
          {roomCode}
        </div>
        {quizConfig && (
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            {quizConfig.flows.length} flow{quizConfig.flows.length !== 1 ? "s" : ""} · {quizConfig.difficulty} difficulty
          </p>
        )}
      </div>
    );
  }

  /* ── ROLE SELECT ── */
  if (phase === "role-select") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <p className="text-xs font-mono mb-2" style={{ color: "#00B4D8" }}>ROOM · {roomCode}</p>
        <h1 className="text-2xl font-bold mb-1">Choose your role</h1>
        {quizConfig && (
          <p className="text-xs mb-6" style={{ color: "var(--text-secondary)" }}>
            {quizConfig.flows.length} flow{quizConfig.flows.length !== 1 ? "s" : ""} · {quizConfig.difficulty} difficulty
          </p>
        )}
        <p className="text-sm mb-8" style={{ color: "var(--text-secondary)" }}>Each pilot handles their own role&apos;s steps.</p>
        <div className="flex gap-4">
          {(["PF", "PM"] as Role[]).map(role => {
            const taken = partnerRole === role;
            const chosen = myRole === role;
            const color = role === "PF" ? "#00B4D8" : "#F77F00";
            return (
              <button key={role}
                onClick={() => !taken && !myRole && chooseRole(role)}
                disabled={taken || !!myRole}
                className="flex flex-col items-center gap-2 px-10 py-8 rounded-2xl transition-all"
                style={{
                  background: chosen ? `${color}15` : taken ? "rgba(255,255,255,0.02)" : "var(--bg-card)",
                  border: `2px solid ${chosen ? color : taken ? "#30363D" : "var(--border)"}`,
                  opacity: taken ? 0.4 : 1,
                  cursor: taken || !!myRole ? "not-allowed" : "pointer",
                }}>
                <span className="text-3xl font-bold" style={{ color }}>{role}</span>
                <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  {role === "PF" ? "Pilot Flying" : "Pilot Monitoring"}
                </span>
                {taken && <span className="text-xs" style={{ color: "var(--text-secondary)" }}>Taken</span>}
              </button>
            );
          })}
        </div>
        {myRole && !partnerRole && (
          <p className="text-sm mt-6" style={{ color: "var(--text-secondary)" }}>Waiting for partner to choose a role…</p>
        )}
      </div>
    );
  }

  /* ── RUNNING ── */
  if (phase === "running" && currentFlow && myRole) {
    const partRole: Role = myRole === "PF" ? "PM" : "PF";
    const isMultiPilot = aircraft?.cockpitType === "multi" || currentFlow.steps.some(s => s.role);
    const myRoleSteps = isMultiPilot ? currentFlow.steps.filter(s => s.role === myRole) : currentFlow.steps;
    const partRoleSteps = isMultiPilot ? currentFlow.steps.filter(s => s.role === partRole) : [];
    const myDone = mySteps.length;
    const partDone = remoteSteps.length;
    const currentMyStep = myRoleSteps[myDone];
    const myColor = myRole === "PF" ? "#00B4D8" : "#F77F00";
    const partColor = partRole === "PF" ? "#00B4D8" : "#F77F00";
    const ib = getImgBounds(canvasW, canvasH, naturalAspect);
    const tol = TOLERANCE[quizConfig?.difficulty ?? "medium"];

    /* ── INTRO SCREEN ── */
    if (introPhase) {
      return (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center"
          style={{ background: "rgba(13,17,23,0.97)" }}>
          <div className="text-center max-w-md px-8">
            <p className="text-xs font-mono mb-3" style={{ color: "#00B4D8" }}>
              CO-OP · {flowIndex + 1}/{quizConfig?.flows.length}
            </p>
            <h2 className="text-4xl font-bold mb-2">{currentFlow.name}</h2>
            <p className="text-sm mb-8" style={{ color: "var(--text-secondary)" }}>
              {myRoleSteps.length} step{myRoleSteps.length !== 1 ? "s" : ""} for {myRole} · {aircraft?.name ?? "Unknown aircraft"}
            </p>

            {/* Countdown ring */}
            <div className="relative flex items-center justify-center w-20 h-20 mx-auto mb-8">
              <svg className="absolute inset-0" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="34" fill="none" stroke="#30363D" strokeWidth="4"/>
                <circle cx="40" cy="40" r="34" fill="none" stroke="#00B4D8" strokeWidth="4"
                  strokeDasharray={`${2 * Math.PI * 34}`}
                  strokeDashoffset={`${2 * Math.PI * 34 * (1 - countdown / 3)}`}
                  strokeLinecap="round"
                  style={{ transform: "rotate(-90deg)", transformOrigin: "center", transition: "stroke-dashoffset 0.9s linear" }}
                />
              </svg>
              <span className="text-2xl font-bold">{countdown}</span>
            </div>

            <button onClick={() => setIntroPhase(false)}
              className="px-8 py-3 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
              style={{ background: "#00B4D8", color: "#0D1117" }}>
              Start now →
            </button>
            <p className="text-xs mt-3" style={{ color: "var(--text-secondary)" }}>or press Space / Enter</p>
          </div>
        </div>
      );
    }

    /* ── QUIZ CANVAS ── */
    return (
      <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "#0D1117" }}>
        {/* Header */}
        <div className="flex items-center gap-4 px-6 py-3 shrink-0"
          style={{ borderBottom: "1px solid var(--border)", background: "rgba(22,27,34,0.95)" }}>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-mono mb-0.5" style={{ color: "#00B4D8" }}>
              CO-OP · {roomCode} · {flowIndex + 1}/{quizConfig?.flows.length}
            </p>
            <p className="font-semibold text-sm truncate">{currentFlow.name}</p>
          </div>

          {/* My step pills */}
          <div className="flex items-center gap-1">
            {myRoleSteps.map((_, i) => {
              const res = mySteps[i];
              return (
                <div key={i} className="rounded-full transition-all"
                  style={{
                    width: i === myDone ? 20 : 8, height: 8,
                    background: res ? (res.correct ? "#2ECC71" : "#E63946") : i === myDone ? myColor : "#30363D",
                  }} />
              );
            })}
          </div>

          {/* Partner step pills */}
          {partRoleSteps.length > 0 && <>
            <div style={{ width: 1, height: 20, background: "var(--border)" }} />
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold" style={{ color: partColor }}>{partRole}</span>
              <div className="flex gap-0.5">
                {partRoleSteps.map((_, i) => (
                  <div key={i} className="rounded-full" style={{
                    width: 8, height: 8,
                    background: i < partDone ? (remoteSteps[i]?.correct ? "#2ECC71" : "#E63946") : i === partDone ? partColor : "#30363D",
                  }} />
                ))}
              </div>
            </div>
          </>}

          <span className="text-sm font-mono shrink-0" style={{ color: "var(--text-secondary)" }}>
            {myDone + 1} / {myRoleSteps.length}
          </span>

          {partnerDisconnected && (
            <div className="px-3 py-1 rounded-lg text-xs font-semibold"
              style={{ background: "rgba(230,57,70,0.15)", color: "#E63946", border: "1px solid #E6394640" }}>
              Copilot disconnected
            </div>
          )}
        </div>

        {/* Canvas */}
        <div ref={canvasRef} className="flex-1 relative overflow-hidden"
          style={{ cursor: myDone >= myRoleSteps.length || feedback ? "default" : "crosshair" }}
          onClick={handleCanvasClick}>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={currentFlow.imageDataUrl} alt="Cockpit"
            className="w-full h-full object-contain pointer-events-none select-none" draggable={false}
            onLoad={e => setNaturalAspect(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)} />

          {/* Arrows */}
          {arrows.length > 0 && (
            <svg className="absolute pointer-events-none"
              style={{ left: ib.left, top: ib.top, width: ib.width, height: ib.height, zIndex: 4 }}
              viewBox="0 0 100 100" preserveAspectRatio="none">
              <defs>
                <marker id="coop-arrow-green" markerWidth="3.5" markerHeight="3" refX="3" refY="1.5" orient="auto">
                  <polygon points="0 0, 3.5 1.5, 0 3" fill="#2ECC71" />
                </marker>
                <marker id="coop-arrow-red" markerWidth="3.5" markerHeight="3" refX="3" refY="1.5" orient="auto">
                  <polygon points="0 0, 3.5 1.5, 0 3" fill="#E63946" />
                </marker>
              </defs>
              {arrows.map(arrow => {
                const dx = arrow.x2 - arrow.x1, dy = arrow.y2 - arrow.y1;
                const len = Math.sqrt(dx * dx + dy * dy);
                if (len < 1) return null;
                const nx = dx / len, ny = dy / len;
                const gap = 13 / Math.sqrt((nx * ib.width / 100) ** 2 + (ny * ib.height / 100) ** 2);
                const x1 = arrow.x1 + nx * gap, y1 = arrow.y1 + ny * gap;
                const x2 = arrow.x2, y2 = arrow.y2;
                const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
                const cx = mx - ny * 5, cy = my + nx * 5;
                const markerId = arrow.color === "#2ECC71" ? "coop-arrow-green" : "coop-arrow-red";
                return (
                  <path key={arrow.id}
                    d={`M ${x1},${y1} Q ${cx},${cy} ${x2},${y2}`}
                    fill="none" stroke={arrow.color} strokeWidth="0.4"
                    pathLength="1" strokeDasharray="1" strokeDashoffset="1"
                    markerEnd={`url(#${markerId})`}
                    style={{ animation: "draw-and-fade 2.8s cubic-bezier(0.4,0,0.2,1) forwards" }}
                  />
                );
              })}
            </svg>
          )}

          {/* Persisted markers (my correct steps) */}
          {persistedMarkers.map(pm => {
            const px = ib.left + pm.x / 100 * ib.width;
            const py = ib.top + pm.y / 100 * ib.height;
            return (
              <div key={pm.id} className="absolute pointer-events-none"
                style={{ left: px, top: py, width: 0, height: 0, overflow: "visible", zIndex: 5, opacity: pm.fading ? 0 : 1, transition: "opacity 2.8s cubic-bezier(0.4,0,0.2,1)" }}>
                <div style={{
                  position: "absolute", width: 22, height: 22,
                  transform: "translate(-50%,-50%)",
                  background: "rgba(46,204,113,0.12)", border: "2px solid #2ECC71",
                  borderRadius: "50%", boxShadow: "0 0 8px #2ECC7155",
                }} />
              </div>
            );
          })}

          {/* Partner completed steps (dots) */}
          {remoteSteps.map((s, i) => {
            const step = partRoleSteps[i];
            if (!step) return null;
            const px = ib.left + step.x / 100 * ib.width;
            const py = ib.top + step.y / 100 * ib.height;
            return (
              <div key={`p-${s.stepId}`} className="absolute pointer-events-none"
                style={{ left: px, top: py, width: 0, height: 0, overflow: "visible", zIndex: 5 }}>
                <div style={{
                  position: "absolute", width: 20, height: 20,
                  transform: "translate(-50%,-50%)",
                  background: s.correct ? `${partColor}15` : "rgba(230,57,70,0.1)",
                  border: `2px solid ${s.correct ? partColor : "#E63946"}`,
                  borderRadius: "50%",
                }} />
              </div>
            );
          })}

          {/* Current step target (dashed ring) */}
          {currentMyStep && !feedback && myDone < myRoleSteps.length && (
            <div className="absolute pointer-events-none"
              style={{ left: ib.left + currentMyStep.x / 100 * ib.width, top: ib.top + currentMyStep.y / 100 * ib.height, width: 0, height: 0, overflow: "visible", zIndex: 6 }}>
              <div style={{
                position: "absolute", width: 28, height: 28,
                transform: "translate(-50%,-50%)",
                border: `2px dashed ${myColor}`,
                borderRadius: "50%",
              }} />
            </div>
          )}

          {/* Partner current step (dashed ring in partner color) */}
          {(() => {
            const currentPartStep = partRoleSteps[partDone];
            if (!currentPartStep || partDone >= partRoleSteps.length) return null;
            const px = ib.left + currentPartStep.x / 100 * ib.width;
            const py = ib.top + currentPartStep.y / 100 * ib.height;
            return (
              <div className="absolute pointer-events-none"
                style={{ left: px, top: py, width: 0, height: 0, overflow: "visible", zIndex: 5 }}>
                <div style={{
                  position: "absolute", width: 24, height: 24,
                  transform: "translate(-50%,-50%)",
                  border: `2px dashed ${partColor}`,
                  borderRadius: "50%",
                  opacity: 0.7,
                }} />
                <div className="absolute" style={{
                  width: 5, height: 5,
                  transform: "translate(-50%,-50%)",
                  background: partColor,
                  borderRadius: "50%",
                  opacity: 0.7,
                }} />
              </div>
            );
          })()}

          {/* Easy difficulty tolerance hint */}
          {!feedback && quizConfig?.difficulty === "easy" && currentMyStep && (
            <div className="absolute pointer-events-none"
              style={{ left: ib.left + currentMyStep.x / 100 * ib.width, top: ib.top + currentMyStep.y / 100 * ib.height, width: 0, height: 0, overflow: "visible", zIndex: 3 }}>
              <div style={{
                position: "absolute",
                width: tol / 100 * ib.width * 2, height: tol / 100 * ib.height * 2,
                transform: "translate(-50%,-50%)",
                border: "1px dashed #00B4D830", borderRadius: "50%",
              }} />
            </div>
          )}

          {/* Feedback markers */}
          {feedback && (() => {
            // Find the step position
            const allMySteps = myRoleSteps;
            const partnerAllSteps = partRoleSteps;
            const isMyFeedback = feedback.role === myRole;
            const stepList = isMyFeedback ? allMySteps : partnerAllSteps;
            const stepIdx = isMyFeedback ? myDone - 1 : partDone - 1;
            const step = stepList[stepIdx < 0 ? stepList.length - 1 : stepIdx];
            if (!step) return null;

            const cx = ib.left + step.x / 100 * ib.width;
            const cy = ib.top + step.y / 100 * ib.height;

            if (!isMyFeedback) {
              // Partner feedback: simple glow on correct position
              return (
                <div className="absolute pointer-events-none" style={{ left: cx, top: cy, width: 0, height: 0, overflow: "visible", zIndex: 9 }}>
                  <div className="absolute flex items-center justify-center rounded-full"
                    style={{
                      width: 34, height: 34, transform: "translate(-50%,-50%)",
                      background: feedback.correct ? "rgba(46,204,113,0.2)" : "rgba(230,57,70,0.2)",
                      border: `2.5px solid ${feedback.correct ? "#2ECC71" : "#E63946"}`,
                      boxShadow: `0 0 18px ${feedback.correct ? "#2ECC7188" : "#E6394688"}`,
                    }}>
                    {feedback.correct
                      ? <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7l4 4 6-6" stroke="#2ECC71" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      : <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2L2 10" stroke="#E63946" strokeWidth="2" strokeLinecap="round"/></svg>}
                  </div>
                </div>
              );
            }

            // My feedback: full solo-quiz style (correct pos + optional wrong pos + dashed line)
            const ux = ib.left + feedback.clickX / 100 * ib.width;
            const uy = ib.top + feedback.clickY / 100 * ib.height;
            const showClick = feedback.clickX >= 0;

            return (
              <>
                {!feedback.correct && quizConfig?.difficulty !== "hard" && showClick && (
                  <svg className="absolute inset-0 pointer-events-none" style={{ width: "100%", height: "100%", zIndex: 6 }}>
                    <line x1={ux} y1={uy} x2={cx} y2={cy}
                      stroke="#E63946" strokeWidth="1.5" strokeDasharray="5 4" opacity="0.5"/>
                  </svg>
                )}
                {(feedback.correct || quizConfig?.difficulty !== "hard") && (
                  <div className="absolute pointer-events-none" style={{ left: cx, top: cy, width: 0, height: 0, overflow: "visible", zIndex: 8 }}>
                    <div className="absolute flex items-center justify-center rounded-full"
                      style={{
                        width: 32, height: 32, transform: "translate(-50%,-50%)",
                        background: "rgba(46,204,113,0.2)", border: "2.5px solid #2ECC71",
                        boxShadow: "0 0 20px #2ECC7199",
                      }}>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M2 7l4 4 6-6" stroke="#2ECC71" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  </div>
                )}
                {!feedback.correct && showClick && (
                  <div className="absolute pointer-events-none" style={{ left: ux, top: uy, width: 0, height: 0, overflow: "visible", zIndex: 7 }}>
                    <div className="absolute flex items-center justify-center rounded-full"
                      style={{
                        width: 28, height: 28, transform: "translate(-50%,-50%)",
                        background: "rgba(230,57,70,0.2)", border: "2px solid #E63946",
                        boxShadow: "0 0 14px #E6394699",
                      }}>
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M2 2l8 8M10 2L2 10" stroke="#E63946" strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>

        {/* Footer */}
        <div className="shrink-0 flex items-center gap-4 px-6"
          style={{ borderTop: "1px solid var(--border)", background: "rgba(22,27,34,0.95)", height: 80 }}>
          {myDone >= myRoleSteps.length ? (
            <p className="text-sm font-semibold" style={{ color: "#2ECC71" }}>
              Your role complete ✓ — waiting for {partRole}…
            </p>
          ) : (
            <div className="flex items-center gap-4 flex-1">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl shrink-0"
                style={{ background: `${myColor}15`, border: `1px solid ${myColor}40` }}>
                <span className="font-mono font-bold text-sm" style={{ color: myColor }}>{myDone + 1}</span>
              </div>
              <div>
                <p className="text-xs mb-0.5" style={{ color: "var(--text-secondary)" }}>
                  {myRole} · Your step:
                </p>
                <p className="font-semibold text-sm" style={{ color: myColor }}>
                  {currentMyStep?.label}
                  {currentMyStep?.action && <span className="ml-2 font-bold">{currentMyStep.action}</span>}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ── DONE ── */
  if (phase === "done" && myRole) {
    const partRole: Role = myRole === "PF" ? "PM" : "PF";
    const totalMy = allResults.reduce((s, r) => s + r.myTotal, 0);
    const correctMy = allResults.reduce((s, r) => s + r.myCorrect, 0);
    const totalPart = allResults.reduce((s, r) => s + r.partnerTotal, 0);
    const correctPart = allResults.reduce((s, r) => s + r.partnerCorrect, 0);
    const total = totalMy + totalPart;
    const correct = correctMy + correctPart;
    const pct = total > 0 ? Math.round(correct / total * 100) : 0;
    const scoreColor = pct >= 80 ? "#2ECC71" : pct >= 50 ? "#F77F00" : "#E63946";

    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <div className="text-5xl mb-4">{pct >= 80 ? "🏆" : "✈️"}</div>
        <p className="text-xs font-mono mb-2" style={{ color: "#00B4D8" }}>SESSION COMPLETE</p>
        <h2 className="text-3xl font-bold mb-1">
          <span style={{ color: scoreColor }}>{pct}%</span>
        </h2>
        <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
          {correct} / {total} steps correct · {allResults.length} flow{allResults.length !== 1 ? "s" : ""}
        </p>

        {/* Per-flow breakdown */}
        <div className="flex flex-col gap-2 mb-6 w-full max-w-sm text-left">
          {allResults.map((r, i) => {
            const p = (r.myTotal + r.partnerTotal) > 0
              ? Math.round((r.myCorrect + r.partnerCorrect) / (r.myTotal + r.partnerTotal) * 100) : 0;
            const col = p >= 80 ? "#2ECC71" : p >= 50 ? "#F77F00" : "#E63946";
            return (
              <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-xl"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                <span className="font-mono text-xs shrink-0" style={{ color: "var(--text-secondary)" }}>{i + 1}.</span>
                <span className="flex-1 text-sm font-medium truncate">{r.flowName}</span>
                <span className="text-sm font-semibold shrink-0" style={{ color: col }}>{p}%</span>
              </div>
            );
          })}
        </div>

        <div className="flex gap-6 mb-8">
          <div className="text-center">
            <p className="text-lg font-bold" style={{ color: myRole === "PF" ? "#00B4D8" : "#F77F00" }}>
              {correctMy}/{totalMy}
            </p>
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>You ({myRole})</p>
          </div>
          {totalPart > 0 && <>
            <div style={{ width: 1, background: "var(--border)" }} />
            <div className="text-center">
              <p className="text-lg font-bold" style={{ color: partRole === "PF" ? "#00B4D8" : "#F77F00" }}>
                {correctPart}/{totalPart}
              </p>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Copilot ({partRole})</p>
            </div>
          </>}
        </div>

        <div className="flex gap-3">
          <button onClick={restartQuiz} disabled={restarting}
            className="px-6 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: "rgba(0,180,216,0.12)", color: "#00B4D8", border: "1px solid #00B4D830" }}>
            {restarting ? "Preparing…" : "↺ Play again"}
          </button>
          <button onClick={() => router.push("/dashboard/quizzes")}
            className="px-6 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-80"
            style={{ background: "#00B4D8", color: "#0D1117" }}>
            Back to Quizzes
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center">
      <p style={{ color: "var(--text-secondary)" }}>Loading…</p>
    </div>
  );
}
