"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { saveFlow, saveAircraft, getFlows, getAircrafts, type SavedFlow, type Aircraft } from "@/app/lib/storage";
import Link from "next/link";

type SharePayload =
  | { type: "flow"; version: 1; flow: Omit<SavedFlow, "imageDataUrl">; aircraftName: string }
  | { type: "aircraft"; version: 1; aircraft: Omit<Aircraft, "imageDataUrl"> };

function decode(raw: string): SharePayload | null {
  try {
    return JSON.parse(atob(raw)) as SharePayload;
  } catch {
    return null;
  }
}

export default function ImportPage() {
  const searchParams = useSearchParams();
  const [payload, setPayload] = useState<SharePayload | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [imported, setImported] = useState(false);
  const [duplicate, setDuplicate] = useState(false);

  useEffect(() => {
    const d = searchParams.get("d");
    if (!d) { setInvalid(true); return; }
    const p = decode(d);
    if (!p) { setInvalid(true); return; }
    setPayload(p);

    // check duplicate
    if (p.type === "flow") {
      setDuplicate(getFlows().some(f => f.id === p.flow.id));
    } else {
      setDuplicate(getAircrafts().some(a => a.id === p.aircraft.id));
    }
  }, [searchParams]);

  function handleImport() {
    if (!payload) return;
    if (payload.type === "flow") {
      saveFlow({ ...payload.flow, imageDataUrl: "" });
    } else {
      saveAircraft({ ...payload.aircraft });
    }
    setImported(true);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-16"
      style={{ backgroundColor: "var(--bg-primary)", color: "var(--text-primary)" }}>
      <div className="max-w-lg w-full">

        {invalid && (
          <div className="text-center">
            <div className="text-5xl mb-4">🔗</div>
            <h1 className="text-2xl font-bold mb-2">Invalid link</h1>
            <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
              This share link is broken or has expired.
            </p>
            <Link href="/" className="text-sm" style={{ color: "#00B4D8" }}>← Back to CockpitCue</Link>
          </div>
        )}

        {imported && (
          <div className="text-center">
            <div className="text-5xl mb-4">✅</div>
            <h1 className="text-2xl font-bold mb-2">Imported!</h1>
            <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
              {payload?.type === "flow"
                ? "The flow has been added to your library."
                : "The aircraft has been added to your hangar."}
            </p>
            <Link href={payload?.type === "flow" ? "/dashboard/flows" : "/dashboard/aircrafts"}
              className="inline-block px-6 py-3 rounded-xl font-medium text-sm transition-all hover:opacity-90"
              style={{ background: "#00B4D8", color: "#0D1117" }}>
              Go to {payload?.type === "flow" ? "My Flows" : "Aircrafts"} →
            </Link>
          </div>
        )}

        {payload && !imported && (
          <div className="rounded-2xl overflow-hidden"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>

            {/* Header */}
            <div className="px-6 py-5" style={{ borderBottom: "1px solid var(--border)" }}>
              <p className="text-xs font-mono mb-1" style={{ color: "#00B4D8" }}>
                {payload.type === "flow" ? "SHARED FLOW" : "SHARED AIRCRAFT"}
              </p>
              <h1 className="text-xl font-bold">
                {payload.type === "flow" ? payload.flow.name : payload.aircraft.name}
              </h1>
              {payload.type === "flow" && payload.flow.emergency && (
                <span className="inline-flex items-center gap-1 mt-1 text-xs px-2 py-0.5 rounded"
                  style={{ background: "rgba(230,57,70,0.12)", color: "#E63946", border: "1px solid rgba(230,57,70,0.2)" }}>
                  🚨 Emergency flow
                </span>
              )}
            </div>

            {/* Details */}
            <div className="px-6 py-5">
              {payload.type === "flow" && (
                <>
                  <div className="flex items-center gap-6 mb-5 text-sm" style={{ color: "var(--text-secondary)" }}>
                    <span>✈️ {payload.aircraftName || "Unknown aircraft"}</span>
                    <span>🔢 {payload.flow.steps.length} steps</span>
                  </div>

                  <div className="rounded-xl overflow-hidden mb-5"
                    style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)" }}>
                    {payload.flow.steps.slice(0, 8).map((step, i) => (
                      <div key={step.id}
                        className="flex items-center gap-3 px-4 py-2.5"
                        style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                          style={{ background: step.role === "PF" ? "#00B4D8" : "#F77F00", color: "#0D1117" }}>
                          {i + 1}
                        </div>
                        {step.role && (
                          <span className="text-xs font-bold px-1.5 py-0.5 rounded shrink-0"
                            style={{
                              background: step.role === "PF" ? "rgba(0,180,216,0.12)" : "rgba(247,127,0,0.12)",
                              color: step.role === "PF" ? "#00B4D8" : "#F77F00",
                            }}>
                            {step.role}
                          </span>
                        )}
                        <span className="text-sm">{step.label || "Unnamed"}</span>
                        {step.action && (
                          <span className="text-xs px-2 py-0.5 rounded font-mono ml-auto"
                            style={{ background: "rgba(0,180,216,0.1)", color: "#00B4D8" }}>
                            {step.action}
                          </span>
                        )}
                      </div>
                    ))}
                    {payload.flow.steps.length > 8 && (
                      <div className="px-4 py-2 text-xs" style={{ color: "var(--text-secondary)", borderTop: "1px solid var(--border)" }}>
                        + {payload.flow.steps.length - 8} more steps
                      </div>
                    )}
                  </div>

                  <p className="text-xs mb-5" style={{ color: "var(--text-secondary)" }}>
                    ⚠️ Cockpit image is not included — you&apos;ll need to upload your own in the Flow Creator.
                  </p>
                </>
              )}

              {payload.type === "aircraft" && (
                <div className="flex flex-col gap-3 mb-5">
                  {[
                    { label: "Cockpit", value: payload.aircraft.cockpitType === "multi" ? "Multi Pilot" : "Single Pilot" },
                    { label: "Engine",  value: payload.aircraft.engineType  === "multi" ? "Multi Engine" : "Single Engine" },
                    ...(payload.aircraft.registration ? [{ label: "Registration", value: payload.aircraft.registration }] : []),
                  ].map(row => (
                    <div key={row.label} className="flex items-center justify-between text-sm">
                      <span style={{ color: "var(--text-secondary)" }}>{row.label}</span>
                      <span className="font-medium">{row.value}</span>
                    </div>
                  ))}
                </div>
              )}

              {duplicate ? (
                <div className="rounded-xl px-4 py-3 text-sm mb-4"
                  style={{ background: "rgba(247,127,0,0.08)", border: "1px solid rgba(247,127,0,0.2)", color: "#F77F00" }}>
                  You already have this {payload.type} in your library.
                </div>
              ) : null}

              <button
                onClick={handleImport}
                className="w-full py-3 rounded-xl font-bold text-sm transition-all hover:opacity-90"
                style={{ background: "#00B4D8", color: "#0D1117" }}>
                {duplicate ? "Import anyway (create copy)" : `Import ${payload.type} →`}
              </button>

              <p className="text-center text-xs mt-3" style={{ color: "var(--text-secondary)" }}>
                Don&apos;t have an account?{" "}
                <Link href="/sign-up" style={{ color: "#00B4D8" }}>Sign up free</Link>
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
