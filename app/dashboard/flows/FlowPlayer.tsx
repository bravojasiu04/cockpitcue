"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Aircraft, SavedFlow } from "@/app/lib/storage";
import AnnotationsLayer from "./AnnotationsLayer";

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

export default function FlowPlayer({
  flow,
  aircraft,
  onClose,
}: {
  flow: SavedFlow;
  aircraft: Aircraft | undefined;
  onClose: () => void;
}) {
  const [current, setCurrent] = useState(0);
  const [autoplay, setAutoplay] = useState(true);
  const [canvasW, setCanvasW] = useState(800);
  const [canvasH, setCanvasH] = useState(500);
  const [naturalAspect, setNaturalAspect] = useState(16 / 9);
  const canvasRef = useRef<HTMLDivElement>(null);

  const isMultiPilot = aircraft?.cockpitType === "multi";
  const step = flow.steps[current];
  const total = flow.steps.length;

  const prev = useCallback(() => { setAutoplay(false); setCurrent(c => Math.max(0, c - 1)); }, []);
  const next = useCallback(() => { setAutoplay(false); setCurrent(c => Math.min(total - 1, c + 1)); }, [total]);

  useEffect(() => {
    if (!canvasRef.current) return;
    const { width, height } = canvasRef.current.getBoundingClientRect();
    if (width > 0) { setCanvasW(width); setCanvasH(height); }
  });

  useEffect(() => {
    if (!autoplay) return;
    if (current >= total - 1) { setAutoplay(false); return; }
    const t = setTimeout(() => setCurrent(c => c + 1), 2000);
    return () => clearTimeout(t);
  }, [autoplay, current, total]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); next(); }
      if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, onClose]);

  if (total === 0) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.92)" }}>
      <div className="text-center">
        <p className="text-lg font-semibold mb-4">No steps in this flow.</p>
        <button onClick={onClose} className="px-5 py-2 rounded-xl text-sm" style={{ background: "#00B4D8", color: "#0D1117" }}>Close</button>
      </div>
    </div>
  );

  const roleColor = (isMultiPilot && step?.role === "PF") ? "#00B4D8" : "#F77F00";
  const ib = getImgBounds(canvasW, canvasH, naturalAspect);

  const allAnnotations = flow.annotations ?? [];
  const sequenceOrder = flow.sequenceOrder ?? [
    ...flow.steps.map(s => s.id),
    ...allAnnotations.map(a => a.id),
  ];
  const currentStepId = flow.steps[current]?.id;
  const currentStepPos = sequenceOrder.indexOf(currentStepId ?? "");
  const visibleAnnotations = allAnnotations.filter(a => {
    const pos = sequenceOrder.indexOf(a.id);
    return pos !== -1 && pos <= currentStepPos;
  });

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "#0D1117" }}>
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 shrink-0"
        style={{ borderBottom: "1px solid var(--border)", background: "rgba(22,27,34,0.95)" }}>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-mono mb-0.5" style={{ color: "#00B4D8" }}>REVIEW FLOW</p>
          <p className="font-semibold text-sm truncate">{flow.name}</p>
        </div>
        <div className="flex items-center gap-1">
          {flow.steps.map((_, i) => (
            <button key={i} onClick={() => setCurrent(i)}
              className="rounded-full transition-all"
              style={{
                width: i === current ? 20 : 8, height: 8,
                background: i < current ? "#2ECC71" : i === current ? "#00B4D8" : "#30363D",
              }} />
          ))}
        </div>
        <button
          onClick={() => setAutoplay(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:opacity-80 shrink-0"
          style={{
            background: autoplay ? "rgba(46,204,113,0.12)" : "rgba(255,255,255,0.05)",
            border: `1px solid ${autoplay ? "rgba(46,204,113,0.35)" : "var(--border)"}`,
            color: autoplay ? "#2ECC71" : "var(--text-secondary)",
          }}>
          {autoplay
            ? <><svg width="11" height="11" viewBox="0 0 11 11" fill="currentColor"><rect x="1" y="1" width="3" height="9" rx="1"/><rect x="7" y="1" width="3" height="9" rx="1"/></svg> Pause</>
            : <><svg width="11" height="11" viewBox="0 0 11 11" fill="currentColor"><path d="M1 1l9 4.5L1 10V1z"/></svg> Auto</>
          }
        </button>
        <span className="text-sm font-mono shrink-0" style={{ color: "var(--text-secondary)" }}>
          {current + 1} / {total}
        </span>
        <button onClick={onClose} className="shrink-0 p-1.5 rounded-lg hover:opacity-70 transition-opacity"
          style={{ color: "var(--text-secondary)" }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {/* Canvas */}
      <div ref={canvasRef} className="flex-1 relative overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={flow.imageDataUrl} alt="Cockpit"
          className="w-full h-full object-contain pointer-events-none select-none" draggable={false}
          onLoad={e => setNaturalAspect(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)} />

        {flow.steps.length > 1 && (
          <svg className="absolute pointer-events-none"
            style={{ left: ib.left, top: ib.top, width: ib.width, height: ib.height, zIndex: 4 }}
            viewBox="0 0 100 100" preserveAspectRatio="none">
            <defs>
              <marker id="fp-arrow" markerWidth="3.5" markerHeight="3" refX="3" refY="1.5" orient="auto">
                <polygon points="0 0, 3.5 1.5, 0 3" fill="#5A6478" />
              </marker>
            </defs>
            {flow.steps.slice(1).map((s, i) => {
              if (current <= i) return null;
              const origIdx = i + 1;
              const prevS = isMultiPilot
                ? flow.steps.slice(0, origIdx).reverse().find(p => p.role === s.role)
                : flow.steps[i];
              if (!prevS) return null;
              const dx = s.x - prevS.x, dy = s.y - prevS.y;
              const len = Math.sqrt(dx * dx + dy * dy);
              if (len < 1) return null;
              const nx = dx / len, ny = dy / len;
              const gap = 13 / Math.sqrt((nx * ib.width / 100) ** 2 + (ny * ib.height / 100) ** 2);
              const x1 = prevS.x + nx * gap, y1 = prevS.y + ny * gap;
              const x2 = s.x - nx * gap, y2 = s.y - ny * gap;
              const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
              const cx = mx - ny * 5, cy = my + nx * 5;
              return (
                <path key={`${prevS.id}-${s.id}`}
                  d={`M ${x1},${y1} Q ${cx},${cy} ${x2},${y2}`}
                  fill="none" stroke="#5A6478" strokeWidth="0.35"
                  pathLength="1" strokeDasharray="1" strokeDashoffset="1"
                  markerEnd="url(#fp-arrow)"
                  style={{ animation: "draw-step-line 0.5s cubic-bezier(0.4,0,0.2,1) forwards" }}
                />
              );
            })}
          </svg>
        )}

        {visibleAnnotations.length > 0 && (
          <AnnotationsLayer annotations={visibleAnnotations} ib={ib} />
        )}

        {flow.steps.map((s, i) => {
          const isCurrent = i === current;
          const isDone = i < current;
          const rc = (isMultiPilot && s.role === "PF") ? "#00B4D8" : "#F77F00";
          return (
            <div key={s.id} className="absolute transition-all duration-300"
              style={{
                left: `${ib.left + s.x / 100 * ib.width}px`,
                top: `${ib.top + s.y / 100 * ib.height}px`,
                width: 0, height: 0, overflow: "visible",
                opacity: isCurrent ? 1 : isDone ? 0.45 : 0.2,
                zIndex: isCurrent ? 10 : 5,
              }}>
              <div className="absolute flex items-center justify-center rounded-full shrink-0 transition-all duration-300"
                style={{
                  width: isCurrent ? 36 : 24, height: isCurrent ? 36 : 24,
                  transform: "translate(-50%,-50%)",
                  background: isDone ? "rgba(46,204,113,0.15)" : "rgba(13,17,23,0.85)",
                  border: `2px solid ${isDone ? "#2ECC71" : rc}`,
                  boxShadow: isCurrent ? `0 0 24px ${rc}99` : "none",
                }}>
                {isDone
                  ? <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M2 7l4 4 6-6" stroke="#2ECC71" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  : <span className="font-mono font-bold select-none" style={{ fontSize: isCurrent ? 13 : 10, color: rc }}>{i + 1}</span>
                }
              </div>
              {isCurrent && s.label && (
                <div className="absolute flex items-center gap-1.5 px-3 py-1 rounded-lg text-sm font-medium whitespace-nowrap"
                  style={{ left: 22, top: "50%", transform: "translateY(-50%)", background: "rgba(13,17,23,0.95)", border: `1px solid ${rc}40` }}>
                  {s.callout && (
                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ color: "#F77F00", flexShrink: 0 }}>
                      <path d="M2 5h2l4-3v10L4 9H2a1 1 0 01-1-1V6a1 1 0 011-1z" fill="currentColor"/>
                      <path d="M11 5c.6.5 1 1.4 1 2s-.4 1.5-1 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                    </svg>
                  )}
                  {isMultiPilot && s.role && (
                    <span className="font-bold text-xs" style={{ color: rc }}>{s.role}</span>
                  )}
                  <span style={{ color: rc }}>{s.label}</span>
                  {s.action && <span style={{ color: "#8B949E" }}> — {s.action}</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="shrink-0 px-6 flex items-center gap-6"
        style={{ borderTop: "1px solid var(--border)", background: "rgba(22,27,34,0.95)", height: 88 }}>
        <button onClick={prev} disabled={current === 0}
          className="flex items-center justify-center w-10 h-10 rounded-xl transition-all hover:opacity-80 shrink-0"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)", opacity: current === 0 ? 0.3 : 1 }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl shrink-0"
              style={{ background: `${roleColor}18`, border: `1px solid ${roleColor}40` }}>
              <span className="font-mono font-bold" style={{ color: roleColor }}>{current + 1}</span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {isMultiPilot && step?.role && (
                  <span className="text-xs font-bold px-2 py-0.5 rounded"
                    style={{ background: `${roleColor}18`, color: roleColor, border: `1px solid ${roleColor}40` }}>
                    {step.role}
                  </span>
                )}
                <p className="font-semibold text-base">{step?.label || "—"}</p>
                {step?.callout && (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ color: "#F77F00" }}>
                    <path d="M2 5h2l4-3v10L4 9H2a1 1 0 01-1-1V6a1 1 0 011-1z" fill="currentColor"/>
                    <path d="M11 5c.6.5 1 1.4 1 2s-.4 1.5-1 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                  </svg>
                )}
              </div>
              {step?.action && (
                <p className="text-lg font-bold mt-0.5" style={{ color: roleColor }}>{step.action}</p>
              )}
            </div>
          </div>
        </div>
        {current < total - 1 ? (
          <button onClick={next}
            className="flex items-center justify-center w-10 h-10 rounded-xl transition-all hover:opacity-80 shrink-0"
            style={{ background: "#00B4D8", border: "1px solid #00B4D8" }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M6 3l5 5-5 5" stroke="#0D1117" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        ) : (
          <button onClick={onClose}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all hover:opacity-90 shrink-0"
            style={{ background: "#2ECC71", color: "#0D1117" }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 7l4 4 6-6" stroke="#0D1117" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Done
          </button>
        )}
      </div>
    </div>
  );
}
