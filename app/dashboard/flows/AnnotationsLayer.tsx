"use client";

import type { FlowAnnotation } from "@/app/lib/storage";

type ImgBounds = { left: number; top: number; width: number; height: number };

export default function AnnotationsLayer({
  annotations,
  ib,
  pendingText,
  onPendingTextCommit,
  onPendingTextCancel,
}: {
  annotations: FlowAnnotation[];
  ib: ImgBounds;
  pendingText?: { x: number; y: number } | null;
  onPendingTextCommit?: (text: string) => void;
  onPendingTextCancel?: () => void;
}) {
  const draws = annotations.filter(a => a.type === "draw") as Extract<FlowAnnotation, { type: "draw" }>[];
  const texts = annotations.filter(a => a.type === "text") as Extract<FlowAnnotation, { type: "text" }>[];

  return (
    <>
      {/* Draw layer — SVG over image area */}
      <svg className="absolute pointer-events-none"
        style={{ left: ib.left, top: ib.top, width: ib.width, height: ib.height, zIndex: 6 }}
        viewBox="0 0 100 100" preserveAspectRatio="none">
        {draws.map(d => (
          <polyline key={d.id}
            points={d.points.map(([x, y]) => `${x},${y}`).join(" ")}
            fill="none" stroke={d.color} strokeWidth={d.width}
            strokeLinecap="round" strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>

      {/* Text layer — absolutely positioned divs */}
      {texts.map(t => {
        const px = ib.left + t.x / 100 * ib.width;
        const py = ib.top + t.y / 100 * ib.height;
        return (
          <div key={t.id} className="absolute pointer-events-none select-none"
            style={{
              left: px, top: py,
              transform: "translate(0, -50%)",
              zIndex: 7,
              color: t.color,
              fontSize: 13,
              fontWeight: 600,
              fontFamily: "monospace",
              textShadow: "0 1px 3px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.7)",
              whiteSpace: "nowrap",
              padding: "1px 4px",
              background: "rgba(13,17,23,0.55)",
              borderRadius: 4,
              backdropFilter: "blur(2px)",
            }}>
            {t.text}
          </div>
        );
      })}

      {/* Pending text input */}
      {pendingText && onPendingTextCommit && onPendingTextCancel && (
        <div className="absolute" style={{
          left: ib.left + pendingText.x / 100 * ib.width,
          top: ib.top + pendingText.y / 100 * ib.height,
          transform: "translate(0, -50%)",
          zIndex: 20,
        }}>
          <input
            autoFocus
            type="text"
            placeholder="Type annotation…"
            className="text-xs font-mono font-semibold outline-none rounded px-2 py-0.5"
            style={{
              background: "rgba(13,17,23,0.9)",
              border: "1px solid #00B4D8",
              color: "#E8EDF2",
              minWidth: 140,
              boxShadow: "0 0 0 2px #00B4D830",
            }}
            onKeyDown={e => {
              if (e.key === "Enter") {
                const v = (e.target as HTMLInputElement).value.trim();
                if (v) onPendingTextCommit(v);
                else onPendingTextCancel();
              }
              if (e.key === "Escape") onPendingTextCancel();
            }}
            onBlur={e => {
              const v = e.target.value.trim();
              if (v) onPendingTextCommit(v);
              else onPendingTextCancel();
            }}
          />
        </div>
      )}
    </>
  );
}
