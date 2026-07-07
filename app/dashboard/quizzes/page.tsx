"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getAircrafts, getFlows, type Aircraft, type SavedFlow } from "@/app/lib/storage";
import { saveQuizEntry } from "@/app/lib/quizHistory";

type QuizConfig = {
  mode: "practice" | "exam";
  aircraftId: string;
  difficulty: "easy" | "medium" | "hard";
  includeEmergency: boolean;
  shuffleFlows: boolean;
  excludedFlowIds: string[];
  stepTimeLimit: number | null;
};

type StepResult = { correct: boolean };
type FlowResult = { flow: SavedFlow; steps: StepResult[]; timeMs: number };

/* ─── tolerance by difficulty (% of image) ─── */
const TOLERANCE: Record<QuizConfig["difficulty"], number> = {
  easy:   12,
  medium:  8,
  hard:    5,
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

/* ════════════════════════════════════════════════
   FLOW QUIZ PLAYER
   ════════════════════════════════════════════════ */
function FlowQuizPlayer({
  flow,
  aircraft,
  difficulty,
  stepTimeLimit,
  examMode,
  examTimeLeft,
  onDone,
}: {
  flow: SavedFlow;
  aircraft: Aircraft | undefined;
  difficulty: QuizConfig["difficulty"];
  stepTimeLimit: number | null;
  examMode: boolean;
  examTimeLeft: number | null;
  onDone: (result: FlowResult) => void;
}) {
  const [introPhase, setIntroPhase] = useState(true);
  const [countdown, setCountdown] = useState(3);
  const [stepIdx, setStepIdx] = useState(0);
  const [feedback, setFeedback] = useState<{
    correct: boolean;
    clickX: number; clickY: number;
    correctX: number; correctY: number;
  } | null>(null);
  const [stepResults, setStepResults] = useState<StepResult[]>([]);
  const [arrows, setArrows] = useState<{ id: string; x1: number; y1: number; x2: number; y2: number; color: string }[]>([]);
  const [persistedMarkers, setPersistedMarkers] = useState<{ id: string; stepId: string; x: number; y: number; fading: boolean }[]>([]);
  const arrowCounterRef = useRef(0);
  const [startTime] = useState(() => Date.now());

  /* ─── step timer ─── */
  const [timeLeft, setTimeLeft] = useState<number | null>(stepTimeLimit);
  const stepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [timerResetKey, setTimerResetKey] = useState(0);

  const [canvasW, setCanvasW] = useState(800);
  const [canvasH, setCanvasH] = useState(500);
  const [naturalAspect, setNaturalAspect] = useState(16 / 9);
  const canvasRef = useRef<HTMLDivElement>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isMultiPilot = aircraft?.cockpitType === "multi";
  const total = flow.steps.length;
  const step = flow.steps[stepIdx];
  const tol = TOLERANCE[difficulty];

  /* measure canvas */
  useEffect(() => {
    if (!canvasRef.current) return;
    const { width, height } = canvasRef.current.getBoundingClientRect();
    if (width > 0) { setCanvasW(width); setCanvasH(height); }
  });

  /* countdown on intro */
  useEffect(() => {
    if (!introPhase) return;
    if (countdown <= 0) { setIntroPhase(false); return; }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [introPhase, countdown]);

  /* keyboard: Space/Enter to skip intro */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (introPhase && (e.key === " " || e.key === "Enter")) { e.preventDefault(); setIntroPhase(false); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [introPhase]);

  /* step countdown timer — resets on each new step, fires timeout on expiry */
  useEffect(() => {
    if (introPhase || !stepTimeLimit) return;
    setTimeLeft(stepTimeLimit);
    if (stepTimerRef.current) clearInterval(stepTimerRef.current);
    stepTimerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(stepTimerRef.current!);
          stepTimerRef.current = null;
          /* trigger timeout-click: simulate miss at off-screen position */
          simulateTimeout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (stepTimerRef.current) clearInterval(stepTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIdx, introPhase, timerResetKey]);

  function simulateTimeout() {
    /* treat as wrong click at position (-999, -999) — far from any step */
    handleStepResult(false, -999, -999);
  }

  function handleCanvasClick(e: React.MouseEvent<HTMLDivElement>) {
    if (introPhase || !step) return;

    /* cancel previous feedback timer so it doesn't clear the new feedback */
    if (feedbackTimerRef.current) {
      clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = null;
    }

    const rect = canvasRef.current!.getBoundingClientRect();
    const ib = getImgBounds(rect.width, rect.height, naturalAspect);
    const clickX = ((e.clientX - rect.left - ib.left) / ib.width) * 100;
    const clickY = ((e.clientY - rect.top - ib.top) / ib.height) * 100;

    const dx = clickX - step.x;
    const dy = clickY - step.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const correct = dist <= tol;

    /* stop step timer on click */
    if (stepTimerRef.current) { clearInterval(stepTimerRef.current); stepTimerRef.current = null; }

    handleStepResult(correct, clickX, clickY);
  }

  function handleStepResult(correct: boolean, clickX: number, clickY: number) {
    if (!step) return;
    if (feedbackTimerRef.current) { clearTimeout(feedbackTimerRef.current); feedbackTimerRef.current = null; }
    if (stepTimerRef.current) { clearInterval(stepTimerRef.current); stepTimerRef.current = null; }

    const showClick = clickX >= 0 && clickY >= 0;
    setFeedback({ correct, clickX, clickY, correctX: step.x, correctY: step.y });

    /* record result only on first attempt for this step */
    const firstAttempt = stepResults.length === stepIdx;
    const newResults = firstAttempt ? [...stepResults, { correct }] : stepResults;
    if (firstAttempt) setStepResults(newResults);

    /* arrow from previous same-role step to this click (every attempt) */
    const prevStep = stepIdx > 0
      ? (isMultiPilot
          ? flow.steps.slice(0, stepIdx).reverse().find(s => s.role === step.role)
          : flow.steps[stepIdx - 1])
      : null;

    if (prevStep) {
      setArrows(prev => [...prev, {
        id: `arrow-${arrowCounterRef.current++}`,
        x1: prevStep.x, y1: prevStep.y,
        x2: (correct && showClick) ? step.x : showClick ? clickX : step.x,
        y2: (correct && showClick) ? step.y : showClick ? clickY : step.y,
        color: correct ? "#2ECC71" : "#E63946",
      }]);
      if (correct) {
        /* fade previous persisted marker only when actually advancing */
        setPersistedMarkers(prev => prev.map(m =>
          m.stepId === prevStep.id ? { ...m, fading: true } : m
        ));
        setTimeout(() => {
          setPersistedMarkers(prev => prev.filter(m => m.stepId !== prevStep.id));
        }, 2800);
      }
    }

    if (correct) {
      /* add persisted marker and advance */
      setPersistedMarkers(prev => [...prev, {
        id: `pm-${step.id}-${Date.now()}`,
        stepId: step.id,
        x: step.x,
        y: step.y,
        fading: false,
      }]);

      const isLast = stepIdx + 1 >= total;
      if (!isLast) setStepIdx(i => i + 1);

      feedbackTimerRef.current = setTimeout(() => {
        setFeedback(null);
        if (isLast) onDone({ flow, steps: newResults, timeMs: Date.now() - startTime });
      }, 1000);
    } else {
      /* wrong — clear feedback after delay and let user retry same step */
      feedbackTimerRef.current = setTimeout(() => {
        setFeedback(null);
        /* restart timer for retry */
        if (stepTimeLimit) setTimerResetKey(k => k + 1);
      }, 1800);
    }
  }

  const ib = getImgBounds(canvasW, canvasH, naturalAspect);
  const roleColor = (isMultiPilot && step?.role === "PF") ? "#00B4D8" : "#F77F00";

  /* ── INTRO ── */
  if (introPhase) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center"
        style={{ background: "rgba(13,17,23,0.97)" }}>
        <div className="text-center max-w-md px-8">
          <p className="text-xs font-mono mb-3" style={{ color: "#00B4D8" }}>NEXT FLOW</p>
          <h2 className="text-4xl font-bold mb-2">{flow.name}</h2>
          {flow.emergency && <p className="text-sm mb-3" style={{ color: "#E63946" }}>🚨 Emergency flow</p>}
          <p className="text-sm mb-8" style={{ color: "var(--text-secondary)" }}>
            {total} step{total !== 1 ? "s" : ""} · {aircraft?.name ?? "Unknown aircraft"}
          </p>
          <p className="text-xs mb-6" style={{ color: "var(--text-secondary)" }}>
            You will see only the cockpit image. Click where each step marker should be.
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

  /* ── PRACTICE PLAYER ── */
  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "#0D1117" }}>

      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-3 shrink-0"
        style={{ borderBottom: "1px solid var(--border)", background: "rgba(22,27,34,0.95)" }}>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-mono mb-0.5" style={{ color: examMode ? "#E63946" : "#00B4D8" }}>
            {examMode ? "EXAM" : "PRACTICE"}
          </p>
          <p className="font-semibold text-sm truncate">{flow.name}</p>
        </div>
        {/* Step pills */}
        <div className="flex items-center gap-1">
          {flow.steps.map((_, i) => {
            const res = stepResults[i];
            return (
              <div key={i} className="rounded-full transition-all"
                style={{
                  width: i === stepIdx ? 20 : 8, height: 8,
                  background: res ? (res.correct ? "#2ECC71" : "#E63946") : i === stepIdx ? "#00B4D8" : "#30363D",
                }} />
            );
          })}
        </div>
        {/* Exam countdown */}
        {examMode && examTimeLeft !== null && (() => {
          const mins = Math.floor(examTimeLeft / 60);
          const secs = examTimeLeft % 60;
          const urgent = examTimeLeft <= 30;
          return (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg shrink-0"
              style={{ background: urgent ? "rgba(230,57,70,0.12)" : "rgba(255,255,255,0.05)", border: `1px solid ${urgent ? "#E6394640" : "#30363D"}` }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <circle cx="6" cy="6" r="5" stroke={urgent ? "#E63946" : "#6B7A8D"} strokeWidth="1.5"/>
                <path d="M6 3.5V6l1.5 1.5" stroke={urgent ? "#E63946" : "#6B7A8D"} strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
              <span className="text-sm font-mono font-semibold" style={{ color: urgent ? "#E63946" : "var(--text-primary)" }}>
                {mins}:{secs.toString().padStart(2, "0")}
              </span>
            </div>
          );
        })()}
        <span className="text-sm font-mono shrink-0" style={{ color: "var(--text-secondary)" }}>
          {stepIdx + 1} / {total}
        </span>
      </div>

      {/* Canvas — clickable */}
      <div ref={canvasRef}
        className="flex-1 relative overflow-hidden"
        style={{ cursor: feedback ? "default" : "crosshair" }}
        onClick={handleCanvasClick}>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={flow.imageDataUrl} alt="Cockpit"
          className="w-full h-full object-contain pointer-events-none select-none" draggable={false}
          onLoad={e => setNaturalAspect(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)} />

        {/* Arrows — appear on click, green=correct, red=wrong */}
        {arrows.length > 0 && (
          <svg className="absolute pointer-events-none"
            style={{ left: ib.left, top: ib.top, width: ib.width, height: ib.height, zIndex: 4 }}
            viewBox="0 0 100 100" preserveAspectRatio="none">
            <defs>
              <marker id="quiz-arrow-green" markerWidth="3.5" markerHeight="3" refX="3" refY="1.5" orient="auto">
                <polygon points="0 0, 3.5 1.5, 0 3" fill="#2ECC71" />
              </marker>
              <marker id="quiz-arrow-red" markerWidth="3.5" markerHeight="3" refX="3" refY="1.5" orient="auto">
                <polygon points="0 0, 3.5 1.5, 0 3" fill="#E63946" />
              </marker>
            </defs>
            {arrows.map(arrow => {
              const dx = arrow.x2 - arrow.x1, dy = arrow.y2 - arrow.y1;
              const len = Math.sqrt(dx * dx + dy * dy);
              if (len < 1) return null;
              const nx = dx / len, ny = dy / len;
              /* gap only at the "from" end (circle edge); "to" end goes to exact click/position */
              const gap = 13 / Math.sqrt((nx * ib.width / 100) ** 2 + (ny * ib.height / 100) ** 2);
              const x1 = arrow.x1 + nx * gap, y1 = arrow.y1 + ny * gap;
              const x2 = arrow.x2, y2 = arrow.y2;
              const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
              const cx = mx - ny * 5, cy = my + nx * 5;
              const markerId = arrow.color === "#2ECC71" ? "quiz-arrow-green" : "quiz-arrow-red";
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

        {/* Persisted markers — remain after click, fade when next step clicked */}
        {persistedMarkers.map(pm => {
          const px = ib.left + pm.x / 100 * ib.width;
          const py = ib.top + pm.y / 100 * ib.height;
          return (
            <div key={pm.id} className="absolute pointer-events-none"
              style={{
                left: px, top: py, width: 0, height: 0, overflow: "visible", zIndex: 5,
                opacity: pm.fading ? 0 : 1,
                transition: "opacity 2.8s cubic-bezier(0.4,0,0.2,1)",
              }}>
              <div style={{
                position: "absolute",
                width: 22, height: 22,
                transform: "translate(-50%,-50%)",
                background: "rgba(46,204,113,0.12)",
                border: "2px solid #2ECC71",
                borderRadius: "50%",
                boxShadow: "0 0 8px #2ECC7155",
              }} />
            </div>
          );
        })}

        {/* Feedback markers */}
        {feedback && (() => {
          const cx = ib.left + feedback.correctX / 100 * ib.width;
          const cy = ib.top + feedback.correctY / 100 * ib.height;
          const ux = ib.left + feedback.clickX / 100 * ib.width;
          const uy = ib.top + feedback.clickY / 100 * ib.height;

          return (
            <>
              {/* Line from click to correct (if wrong) — hidden in Hard mode */}
              {!feedback.correct && difficulty !== "hard" && (
                <svg className="absolute inset-0 pointer-events-none" style={{ width: "100%", height: "100%", zIndex: 6 }}>
                  <line x1={ux} y1={uy} x2={cx} y2={cy}
                    stroke="#E63946" strokeWidth="1.5" strokeDasharray="5 4" opacity="0.5"/>
                </svg>
              )}

              {/* Correct position — green; hidden in Hard mode when wrong */}
              {(feedback.correct || difficulty !== "hard") && (
                <div className="absolute pointer-events-none" style={{ left: cx, top: cy, width: 0, height: 0, overflow: "visible", zIndex: 8 }}>
                  <div className="absolute flex items-center justify-center rounded-full"
                    style={{
                      width: 32, height: 32,
                      transform: "translate(-50%,-50%)",
                      background: "rgba(46,204,113,0.2)",
                      border: "2.5px solid #2ECC71",
                      boxShadow: "0 0 20px #2ECC7199",
                      animation: "scale-in 0.2s ease",
                    }}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M2 7l4 4 6-6" stroke="#2ECC71" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                </div>
              )}

              {/* User click — red (if wrong) */}
              {!feedback.correct && (
                <div className="absolute pointer-events-none" style={{ left: ux, top: uy, width: 0, height: 0, overflow: "visible", zIndex: 7 }}>
                  <div className="absolute flex items-center justify-center rounded-full"
                    style={{
                      width: 28, height: 28,
                      transform: "translate(-50%,-50%)",
                      background: "rgba(230,57,70,0.2)",
                      border: "2px solid #E63946",
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

        {/* Tolerance circle (hint) — subtle, always at correct position when in "waiting" state */}
        {!feedback && difficulty === "easy" && (
          <div className="absolute pointer-events-none"
            style={{
              left: ib.left + step.x / 100 * ib.width,
              top: ib.top + step.y / 100 * ib.height,
              width: 0, height: 0, overflow: "visible", zIndex: 3,
            }}>
            <div style={{
              position: "absolute",
              width: tol / 100 * ib.width * 2,
              height: tol / 100 * ib.height * 2,
              transform: "translate(-50%,-50%)",
              border: "1px dashed #00B4D830",
              borderRadius: "50%",
            }} />
          </div>
        )}

        {/* Step countdown timer ring */}
        {stepTimeLimit && timeLeft !== null && !feedback && (() => {
          const radius = 28;
          const circ = 2 * Math.PI * radius;
          const progress = timeLeft / stepTimeLimit;
          const color = timeLeft <= 3 ? "#E63946" : timeLeft <= Math.ceil(stepTimeLimit * 0.4) ? "#F77F00" : "#00B4D8";
          return (
            <div className="absolute pointer-events-none"
              style={{ top: 16, right: 16, zIndex: 10 }}>
              <svg width={80} height={80} viewBox="0 0 80 80">
                <circle cx="40" cy="40" r={radius} fill="rgba(13,17,23,0.75)"
                  stroke="#30363D" strokeWidth="4"/>
                <circle cx="40" cy="40" r={radius} fill="none"
                  stroke={color} strokeWidth="4"
                  strokeDasharray={circ}
                  strokeDashoffset={circ * (1 - progress)}
                  strokeLinecap="round"
                  style={{ transform: "rotate(-90deg)", transformOrigin: "center", transition: "stroke-dashoffset 0.9s linear, stroke 0.3s" }}
                />
                <text x="40" y="40" textAnchor="middle" dominantBaseline="central"
                  fontSize="20" fontWeight="700" fontFamily="monospace" fill={color}>
                  {timeLeft}
                </text>
              </svg>
            </div>
          );
        })()}
      </div>

      {/* Footer — step prompt */}
      <div className="shrink-0 flex items-center gap-4 px-6"
        style={{ borderTop: "1px solid var(--border)", background: "rgba(22,27,34,0.95)", height: 80 }}>

        {feedback ? (
          /* Feedback message */
          <div className="flex items-center gap-3 flex-1">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl shrink-0"
              style={{
                background: feedback.correct ? "rgba(46,204,113,0.15)" : "rgba(230,57,70,0.15)",
                border: `1px solid ${feedback.correct ? "#2ECC7140" : "#E6394640"}`,
              }}>
              {feedback.correct
                ? <svg width="16" height="16" viewBox="0 0 14 14" fill="none"><path d="M2 7l4 4 6-6" stroke="#2ECC71" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                : <svg width="16" height="16" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2L2 10" stroke="#E63946" strokeWidth="2" strokeLinecap="round"/></svg>
              }
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: feedback.correct ? "#2ECC71" : "#E63946" }}>
                {feedback.correct ? "Correct!" : "Wrong position"}
              </p>
              {!feedback.correct && difficulty !== "hard" && (
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Green marker shows the correct position</p>
              )}
              {!feedback.correct && difficulty === "hard" && (
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>No hints in Hard mode</p>
              )}
            </div>
          </div>
        ) : (
          /* Step prompt */
          <div className="flex items-center gap-4 flex-1">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl shrink-0"
              style={{ background: `${roleColor}15`, border: `1px solid ${roleColor}40` }}>
              <span className="font-mono font-bold text-sm" style={{ color: roleColor }}>{stepIdx + 1}</span>
            </div>
            <div className="min-w-0">
              <p className="text-xs mb-0.5" style={{ color: "var(--text-secondary)" }}>
                {isMultiPilot && step.role ? `${step.role} · ` : ""}Click where this step is:
              </p>
              <p className="font-semibold text-base truncate" style={{ color: roleColor }}>
                {step?.label || "—"}
                {step?.action && <span className="font-bold ml-2">{step.action}</span>}
              </p>
            </div>
          </div>
        )}

        {/* Score so far */}
        <div className="text-right shrink-0">
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Score</p>
          <p className="text-sm font-semibold">
            <span style={{ color: "#2ECC71" }}>{stepResults.filter(r => r.correct).length}</span>
            <span style={{ color: "var(--text-secondary)" }}> / {stepResults.length}</span>
          </p>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════
   QUIZ SUMMARY
   ════════════════════════════════════════════════ */
function QuizSummary({ results, examMode, onRestart }: { results: FlowResult[]; examMode: boolean; onRestart: () => void }) {
  const totalSteps = results.reduce((s, r) => s + r.steps.length, 0);
  const correctSteps = results.reduce((s, r) => s + r.steps.filter(x => x.correct).length, 0);
  const wrongSteps = totalSteps - correctSteps;
  const totalMs = results.reduce((s, r) => s + r.timeMs, 0);
  const pct = totalSteps > 0 ? Math.round(correctSteps / totalSteps * 100) : 0;
  const wrongPct = totalSteps > 0 ? Math.round(wrongSteps / totalSteps * 100) : 0;

  const fmt = (ms: number) => ms < 60000
    ? `${(ms / 1000).toFixed(1)}s`
    : `${Math.floor(ms / 60000)}m ${((ms % 60000) / 1000).toFixed(0)}s`;

  const scoreColor = pct >= 80 ? "#2ECC71" : pct >= 50 ? "#F77F00" : "#E63946";
  const emoji = pct >= 80 ? "🏆" : pct >= 50 ? "✈️" : "📚";

  // For exam mode: group by flow id to show per-flow averages
  const flowMap = new Map<string, { name: string; emergency: boolean; runs: StepResult[][] }>();
  if (examMode) {
    for (const r of results) {
      const entry = flowMap.get(r.flow.id) ?? { name: r.flow.name, emergency: r.flow.emergency ?? false, runs: [] as StepResult[][] };
      entry.runs.push(r.steps);
      flowMap.set(r.flow.id, entry);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-y-auto"
      style={{ background: "rgba(13,17,23,0.97)" }}>
      <div className="w-full max-w-md px-8 py-10 text-center">
        <div className="text-5xl mb-4">{emoji}</div>
        <p className="text-xs font-mono mb-2" style={{ color: examMode ? "#E63946" : "#00B4D8" }}>
          {examMode ? "EXAM COMPLETE" : "QUIZ COMPLETE"}
        </p>
        <h2 className="text-3xl font-bold mb-1">
          <span style={{ color: scoreColor }}>{pct}%</span>
        </h2>

        {examMode ? (
          <div className="flex justify-center gap-6 mb-2">
            <div>
              <p className="text-xl font-bold" style={{ color: "#2ECC71" }}>{pct}%</p>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>avg correct</p>
            </div>
            <div style={{ width: 1, background: "var(--border)" }} />
            <div>
              <p className="text-xl font-bold" style={{ color: "#E63946" }}>{wrongPct}%</p>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>avg wrong</p>
            </div>
          </div>
        ) : (
          <p className="text-sm mb-1" style={{ color: "var(--text-secondary)" }}>
            {correctSteps} correct out of {totalSteps} steps
          </p>
        )}

        <p className="text-xs mb-2" style={{ color: "var(--text-secondary)" }}>
          {totalSteps} steps · {results.length} flow runs
          {!examMode && <> · Total time: <span style={{ color: "var(--text-primary)" }}>{fmt(totalMs)}</span></>}
        </p>
        <p className="text-xs mb-8" style={{ color: "var(--text-secondary)" }}>
          {correctSteps} correct · {wrongSteps} wrong
        </p>

        <div className="flex flex-col gap-2 mb-8 text-left">
          {examMode
            ? Array.from(flowMap.entries()).map(([id, { name, emergency, runs }]) => {
                const totalR = runs.reduce((s, r) => s + r.length, 0);
                const correctR = runs.reduce((s, r) => s + r.filter(x => x.correct).length, 0);
                const avgPct = totalR > 0 ? Math.round(correctR / totalR * 100) : 0;
                const col = avgPct >= 80 ? "#2ECC71" : avgPct >= 50 ? "#F77F00" : "#E63946";
                return (
                  <div key={id} className="flex items-center gap-3 px-4 py-3 rounded-xl"
                    style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                    <span className="flex-1 text-sm font-medium truncate">{name}</span>
                    {emergency && <span style={{ fontSize: 13 }}>🚨</span>}
                    <span className="text-xs shrink-0" style={{ color: "var(--text-secondary)" }}>×{runs.length}</span>
                    <span className="text-sm font-semibold shrink-0" style={{ color: col }}>{avgPct}%</span>
                  </div>
                );
              })
            : results.map((r, i) => {
                const c = r.steps.filter(x => x.correct).length;
                const t = r.steps.length;
                const p = t > 0 ? Math.round(c / t * 100) : 0;
                const col = p >= 80 ? "#2ECC71" : p >= 50 ? "#F77F00" : "#E63946";
                return (
                  <div key={`${r.flow.id}-${i}`} className="flex items-center gap-3 px-4 py-3 rounded-xl"
                    style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                    <span className="font-mono text-xs shrink-0" style={{ color: "var(--text-secondary)" }}>{i + 1}.</span>
                    <span className="flex-1 text-sm font-medium truncate">{r.flow.name}</span>
                    {r.flow.emergency && <span style={{ fontSize: 13 }}>🚨</span>}
                    <span className="text-sm font-semibold shrink-0" style={{ color: col }}>{c}/{t}</span>
                    <span className="text-xs font-mono shrink-0" style={{ color: "var(--text-secondary)" }}>{fmt(r.timeMs)}</span>
                  </div>
                );
              })
          }
        </div>

        <div className="flex gap-3 justify-center">
          <button onClick={onRestart}
            className="px-6 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-80"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
            Back to config
          </button>
          <button onClick={onRestart}
            className="px-6 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
            style={{ background: examMode ? "#E63946" : "#00B4D8", color: "#0D1117" }}>
            {examMode ? "Retry exam →" : "Practice again →"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════
   QUIZZES PAGE
   ════════════════════════════════════════════════ */
export default function QuizzesPage() {
  const searchParams = useSearchParams();
  const [aircrafts, setAircrafts] = useState<Aircraft[]>([]);
  const [flows, setFlows] = useState<SavedFlow[]>([]);
  const [config, setConfig] = useState<QuizConfig>({
    mode: "practice",
    aircraftId: "",
    difficulty: "medium",
    includeEmergency: true,
    shuffleFlows: true,
    excludedFlowIds: [],
    stepTimeLimit: null,
  });

  const [quizFlows, setQuizFlows] = useState<SavedFlow[]>([]);
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizLoopCount, setQuizLoopCount] = useState(0);
  const [results, setResults] = useState<FlowResult[]>([]);
  const resultsRef = useRef<FlowResult[]>([]);
  const [phase, setPhase] = useState<"config" | "running" | "summary">("config");
  const [showDiffTooltip, setShowDiffTooltip] = useState(false);
  const [examSecondsLeft, setExamSecondsLeft] = useState<number | null>(null);
  const examTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const acs = getAircrafts();
    const fls = getFlows();
    setAircrafts(acs);
    setFlows(fls);
    const urlAircraft = searchParams.get("aircraft");
    const preferred = urlAircraft && acs.some(a => a.id === urlAircraft)
      ? urlAircraft
      : acs[0]?.id ?? "";
    if (preferred) setConfig(c => ({ ...c, aircraftId: preferred }));
  }, [searchParams]);

  const aircraftFlows = flows.filter(f => f.aircraftId === config.aircraftId);
  const availableFlows = config.includeEmergency ? aircraftFlows : aircraftFlows.filter(f => !f.emergency);
  const activeFlows = availableFlows.filter(f => !config.excludedFlowIds.includes(f.id));

  function finishQuiz(finalResults: FlowResult[]) {
    const totalSteps = finalResults.reduce((s, r) => s + r.steps.length, 0);
    const correctSteps = finalResults.reduce((s, r) => s + r.steps.filter(x => x.correct).length, 0);
    const timeMs = finalResults.reduce((s, r) => s + r.timeMs, 0);
    saveQuizEntry({
      date: Date.now(),
      mode: config.mode,
      score: totalSteps > 0 ? Math.round(correctSteps / totalSteps * 100) : 0,
      totalSteps,
      correctSteps,
      timeMs,
      flowNames: [...new Set(finalResults.map(r => r.flow.name))],
    });
    setPhase("summary");
  }

  function startQuiz() {
    const isExam = config.mode === "exam";
    const ordered = (isExam || config.shuffleFlows)
      ? [...activeFlows].sort(() => Math.random() - 0.5)
      : [...activeFlows];
    setQuizFlows(ordered);
    setQuizIndex(0);
    setQuizLoopCount(0);
    setResults([]);
    resultsRef.current = [];
    setPhase("running");

    if (isExam) {
      setExamSecondsLeft(180);
      if (examTimerRef.current) clearInterval(examTimerRef.current);
      examTimerRef.current = setInterval(() => {
        setExamSecondsLeft(prev => {
          if (prev === null || prev <= 1) {
            clearInterval(examTimerRef.current!);
            examTimerRef.current = null;
            finishQuiz(resultsRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      setExamSecondsLeft(null);
      if (examTimerRef.current) { clearInterval(examTimerRef.current); examTimerRef.current = null; }
    }
  }

  function handleFlowDone(result: FlowResult) {
    const newResults = [...results, result];
    setResults(newResults);
    resultsRef.current = newResults;
    if (quizIndex + 1 < quizFlows.length) {
      setQuizIndex(i => i + 1);
    } else if (config.mode === "exam") {
      // Exam: loop flows — reshuffle and restart; timer ending will trigger summary
      setQuizFlows([...activeFlows].sort(() => Math.random() - 0.5));
      setQuizIndex(0);
      setQuizLoopCount(c => c + 1);
    } else {
      finishQuiz(newResults);
    }
  }

  const aircraft = aircrafts.find(a => a.id === config.aircraftId);

  if (phase === "running" && quizFlows.length > 0) {
    return (
      <FlowQuizPlayer
        key={`${quizFlows[quizIndex].id}-${quizIndex}-${quizLoopCount}`}
        flow={quizFlows[quizIndex]}
        aircraft={aircraft}
        difficulty={config.mode === "exam" ? "hard" : config.difficulty}
        stepTimeLimit={config.mode === "exam" ? 2 : config.stepTimeLimit}
        examMode={config.mode === "exam"}
        examTimeLeft={examSecondsLeft}
        onDone={handleFlowDone}
      />
    );
  }

  if (phase === "summary") {
    return <QuizSummary results={results} examMode={config.mode === "exam"} onRestart={() => setPhase("config")} />;
  }

  function toggleExclude(flowId: string) {
    setConfig(c => ({
      ...c,
      excludedFlowIds: c.excludedFlowIds.includes(flowId)
        ? c.excludedFlowIds.filter(id => id !== flowId)
        : [...c.excludedFlowIds, flowId],
    }));
  }

  const difficultyOptions: { value: QuizConfig["difficulty"]; label: string; desc: string; features: string[] }[] = [
    { value: "easy",   label: "Easy",   desc: "Large target area",    features: ["Hints on wrong answer", "No time limit"] },
    { value: "medium", label: "Medium", desc: "Standard target area", features: ["Hints on wrong answer", "Time limit available"] },
    { value: "hard",   label: "Hard",   desc: "Small target area",    features: ["No hints", "Time limit available"] },
  ];
  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="max-w-2xl mx-auto">

        <div className="mb-6">
          <p className="text-xs font-mono mb-1" style={{ color: "#00B4D8" }}>QUIZZES</p>
          <h1 className="text-2xl font-bold mb-4">Session Setup</h1>

          {/* Mode selector */}
          <div className="flex gap-3">
            {([
              { value: "practice" as const, label: "Practice", icon: "🎯", desc: "Custom difficulty · Hints · Retry on mistake" },
              { value: "exam"     as const, label: "Exam",     icon: "📋", desc: "3 min · 2s per step · No hints · Random order" },
            ]).map(opt => {
              const active = config.mode === opt.value;
              const color = opt.value === "exam" ? "#E63946" : "#00B4D8";
              return (
                <button key={opt.value}
                  onClick={() => setConfig(c => ({ ...c, mode: opt.value }))}
                  className="flex-1 flex items-start gap-3 px-5 py-4 rounded-xl text-left transition-all"
                  style={{
                    background: active ? `${color}12` : "rgba(255,255,255,0.02)",
                    border: `2px solid ${active ? color : "var(--border)"}`,
                  }}>
                  <span className="text-2xl shrink-0 mt-0.5">{opt.icon}</span>
                  <div>
                    <p className="text-sm font-bold mb-0.5" style={{ color: active ? color : "var(--text-primary)" }}>{opt.label}</p>
                    <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{opt.desc}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {aircrafts.length === 0 ? (
          <div className="rounded-xl p-8 text-center" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>No aircraft found.</p>
            <a href="/dashboard/aircrafts"
              className="inline-block px-5 py-2 rounded-lg text-sm font-medium hover:opacity-80"
              style={{ background: "#00B4D8", color: "#0D1117" }}>
              Go to Aircrafts
            </a>
          </div>
        ) : (
          <div className="flex flex-col gap-5">

            {/* 1. Aircraft — always visible */}
            <section className="rounded-xl p-6" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <div className="flex items-center gap-2 mb-4">
                <span className="flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold shrink-0"
                  style={{ background: "#00B4D820", color: "#00B4D8", border: "1px solid #00B4D840" }}>1</span>
                <h2 className="text-sm font-semibold">Select Aircraft</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {aircrafts.map(ac => {
                  const active = config.aircraftId === ac.id;
                  const flowCount = flows.filter(f => f.aircraftId === ac.id).length;
                  return (
                    <button key={ac.id}
                      onClick={() => setConfig(c => ({ ...c, aircraftId: ac.id, excludedFlowIds: [] }))}
                      className="flex flex-col items-start px-4 py-3 rounded-xl text-left transition-all"
                      style={{
                        background: active ? "rgba(0,180,216,0.1)" : "rgba(255,255,255,0.03)",
                        border: `1px solid ${active ? "#00B4D8" : "var(--border)"}`,
                        minWidth: 140,
                      }}>
                      <span className="text-sm font-semibold" style={{ color: active ? "#00B4D8" : "var(--text-primary)" }}>{ac.name}</span>
                      <span className="text-xs mt-0.5" style={{ color: active ? "#00B4D880" : "var(--text-secondary)" }}>
                        {ac.registration} · {flowCount} flow{flowCount !== 1 ? "s" : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            {config.mode === "practice" && (<>

            {/* 2. Difficulty */}
            <section className="rounded-xl p-6" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <div className="flex items-center gap-2 mb-4">
                <span className="flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold shrink-0"
                  style={{ background: "#00B4D820", color: "#00B4D8", border: "1px solid #00B4D840" }}>2</span>
                <h2 className="text-sm font-semibold">Difficulty Level</h2>
                {/* Info icon with tooltip */}
                <div className="relative ml-1"
                  onMouseEnter={() => setShowDiffTooltip(true)}
                  onMouseLeave={() => setShowDiffTooltip(false)}>
                  <button className="flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold transition-all"
                    style={{ background: showDiffTooltip ? "#30363D" : "transparent", border: "1px solid #30363D", color: "var(--text-secondary)" }}>
                    i
                  </button>
                  {showDiffTooltip && (
                    <div className="absolute left-0 top-7 z-20 rounded-xl p-4 w-72"
                      style={{ background: "#0D1117", border: "1px solid var(--border)", boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>
                      <div className="flex flex-col gap-3">
                        {difficultyOptions.map(opt => {
                          const color = opt.value === "easy" ? "#2ECC71" : opt.value === "medium" ? "#00B4D8" : "#E63946";
                          return (
                            <div key={opt.value}>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-bold" style={{ color }}>{opt.label}</span>
                                <span className="text-xs" style={{ color: "var(--text-secondary)" }}>— {opt.desc}</span>
                              </div>
                              <div className="flex flex-col gap-0.5 pl-2">
                                {opt.features.map(f => (
                                  <span key={f} className="text-xs" style={{ color: "var(--text-secondary)" }}>· {f}</span>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-2 mb-5">
                {difficultyOptions.map(opt => {
                  const active = config.difficulty === opt.value;
                  const color = opt.value === "easy" ? "#2ECC71" : opt.value === "medium" ? "#00B4D8" : "#E63946";
                  return (
                    <button key={opt.value}
                      onClick={() => setConfig(c => ({ ...c, difficulty: opt.value }))}
                      className="flex-1 flex items-center justify-center px-4 py-3 rounded-xl transition-all"
                      style={{
                        background: active ? `${color}15` : "rgba(255,255,255,0.03)",
                        border: `1px solid ${active ? color : "var(--border)"}`,
                      }}>
                      <span className="text-sm font-semibold" style={{ color: active ? color : "var(--text-primary)" }}>{opt.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Time limit slider — hidden on Easy */}
              {(() => {
                const val = config.stepTimeLimit;
                const sliderVal = val ?? 0;
                const timerColor = sliderVal === 0 ? "#6B7A8D" : sliderVal <= 3 ? "#E63946" : sliderVal <= 5 ? "#F77F00" : "#00B4D8";
                const visible = config.difficulty !== "easy";
                return (
                  <div style={{
                    maxHeight: visible ? 80 : 0,
                    opacity: visible ? 1 : 0,
                    overflow: "hidden",
                    transition: "max-height 0.35s cubic-bezier(0.4,0,0.2,1), opacity 0.25s ease",
                    pointerEvents: visible ? "auto" : "none",
                  }}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs" style={{ color: "var(--text-secondary)" }}>Time limit per step</span>
                      <span className="text-xs font-semibold font-mono" style={{ color: timerColor }}>
                        {sliderVal === 0 ? "No limit" : `${sliderVal}s`}
                      </span>
                    </div>
                    <input
                      type="range" min={0} max={8} step={1}
                      value={sliderVal}
                      onChange={e => {
                        const v = Number(e.target.value);
                        setConfig(c => ({ ...c, stepTimeLimit: v === 0 ? null : v }));
                      }}
                      className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                      style={{
                        background: `linear-gradient(to right, ${timerColor} 0%, ${timerColor} ${(sliderVal / 8) * 100}%, #30363D ${(sliderVal / 8) * 100}%, #30363D 100%)`,
                        accentColor: timerColor,
                      }}
                    />
                    <div className="flex justify-between mt-1.5">
                      {[0, 1, 2, 3, 4, 5, 6, 7, 8].map(t => (
                        <span key={t} className="text-xs" style={{ color: "#3D444D" }}>
                          {t === 0 ? "∞" : `${t}s`}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </section>

            {/* 3. Emergency + Shuffle — side by side */}
            <div className="flex gap-4">
              <section className="flex-1 rounded-xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold shrink-0"
                    style={{ background: "#00B4D820", color: "#00B4D8", border: "1px solid #00B4D840" }}>3</span>
                  <h2 className="text-sm font-semibold">Emergency Flows</h2>
                </div>
                <div className="flex gap-2">
                  {([{ value: true, label: "Include", color: "#E63946" }, { value: false, label: "Exclude", color: "#2ECC71" }] as const).map(opt => {
                    const active = config.includeEmergency === opt.value;
                    return (
                      <button key={String(opt.value)}
                        onClick={() => setConfig(c => ({ ...c, includeEmergency: opt.value, excludedFlowIds: [] }))}
                        className="flex-1 px-3 py-2 rounded-lg text-sm font-semibold transition-all"
                        style={{
                          background: active ? `${opt.color}15` : "rgba(255,255,255,0.03)",
                          border: `1px solid ${active ? opt.color : "var(--border)"}`,
                          color: active ? opt.color : "var(--text-secondary)",
                        }}>
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="flex-1 rounded-xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold shrink-0"
                    style={{ background: "#00B4D820", color: "#00B4D8", border: "1px solid #00B4D840" }}>4</span>
                  <h2 className="text-sm font-semibold">Flow Order</h2>
                </div>
                <div className="flex gap-2">
                  {([{ value: true, label: "Random", color: "#F77F00" }, { value: false, label: "Fixed", color: "#6B7A8D" }] as const).map(opt => {
                    const active = config.shuffleFlows === opt.value;
                    return (
                      <button key={String(opt.value)}
                        onClick={() => setConfig(c => ({ ...c, shuffleFlows: opt.value }))}
                        className="flex-1 px-3 py-2 rounded-lg text-sm font-semibold transition-all"
                        style={{
                          background: active ? `${opt.color}15` : "rgba(255,255,255,0.03)",
                          border: `1px solid ${active ? opt.color : "var(--border)"}`,
                          color: active ? opt.color : "var(--text-secondary)",
                        }}>
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </section>
            </div>

            {/* 5. Exclude flows */}
            <section className="rounded-xl p-6" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <div className="flex items-center gap-2 mb-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold shrink-0"
                  style={{ background: "#00B4D820", color: "#00B4D8", border: "1px solid #00B4D840" }}>5</span>
                <h2 className="text-sm font-semibold">Exclude Flows</h2>
                <span className="ml-auto text-xs" style={{ color: "var(--text-secondary)" }}>
                  {config.excludedFlowIds.length > 0 && `${config.excludedFlowIds.length} excluded`}
                </span>
              </div>
              {availableFlows.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>No flows available.</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {availableFlows.map(flow => {
                    const excluded = config.excludedFlowIds.includes(flow.id);
                    return (
                      <button key={flow.id}
                        onClick={() => toggleExclude(flow.id)}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all"
                        style={{
                          background: excluded ? "rgba(230,57,70,0.06)" : "rgba(255,255,255,0.02)",
                          border: `1px solid ${excluded ? "#E6394640" : "var(--border)"}`,
                        }}>
                        <span className="flex items-center justify-center w-4 h-4 rounded shrink-0"
                          style={{ background: excluded ? "transparent" : "#00B4D8", border: `1.5px solid ${excluded ? "#E63946" : "#00B4D8"}` }}>
                          {!excluded && <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M1.5 5l3 3 4-4.5" stroke="#0D1117" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                          {excluded && <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M2 2l6 6M8 2L2 8" stroke="#E63946" strokeWidth="1.8" strokeLinecap="round"/></svg>}
                        </span>
                        <span className="flex-1 text-sm font-medium truncate" style={{ color: excluded ? "var(--text-secondary)" : "var(--text-primary)" }}>
                          {flow.name}
                        </span>
                        {flow.emergency && <span style={{ fontSize: 13 }}>🚨</span>}
                        <span className="text-xs shrink-0" style={{ color: "var(--text-secondary)" }}>
                          {flow.steps.length} step{flow.steps.length !== 1 ? "s" : ""}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            </>)}

            {/* Start */}
            <div className="flex items-center justify-between pt-2 pb-6">
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                {activeFlows.length === 0
                  ? "No flows selected."
                  : config.mode === "exam"
                    ? `${activeFlows.length} flow${activeFlows.length !== 1 ? "s" : ""} · 3 min · 2s per step`
                    : `${activeFlows.length} flow${activeFlows.length !== 1 ? "s" : ""} · ${activeFlows.reduce((s, f) => s + f.steps.length, 0)} steps total`}
              </p>
              <button onClick={startQuiz} disabled={activeFlows.length === 0}
                className="px-6 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed"
                style={{ background: config.mode === "exam" ? "#E63946" : "#00B4D8", color: "#0D1117" }}>
                {config.mode === "exam" ? "Start Exam →" : "Start Practice →"}
              </button>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
