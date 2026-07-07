"use client";

import { useEffect, useState } from "react";
import { getFlows, getAircrafts, deleteFlow, type SavedFlow, type Aircraft } from "@/app/lib/storage";
import Link from "next/link";
import FlowPlayer from "./FlowPlayer";

export default function FlowsPage() {
  const [flows, setFlows] = useState<SavedFlow[]>([]);
  const [aircrafts, setAircrafts] = useState<Aircraft[]>([]);
  const [openAircraft, setOpenAircraft] = useState<Record<string, boolean>>({});
  const [openFlow, setOpenFlow] = useState<Record<string, boolean>>({});
  const [playingFlow, setPlayingFlow] = useState<SavedFlow | null>(null);

  useEffect(() => {
    const ac = getAircrafts();
    const fl = getFlows().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    setAircrafts(ac);
    setFlows(fl);
    // auto-open first aircraft that has flows
    if (ac.length > 0) {
      const first = ac.find(a => fl.some(f => f.aircraftId === a.id));
      if (first) setOpenAircraft({ [first.id]: true });
    }
  }, []);

  function handleDelete(id: string) {
    deleteFlow(id);
    setFlows(getFlows().sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }

  function toggleAircraft(id: string) {
    setOpenAircraft(prev => ({ ...prev, [id]: !prev[id] }));
  }

  function toggleFlow(id: string) {
    setOpenFlow(prev => ({ ...prev, [id]: !prev[id] }));
  }

  const aircraftsWithFlows = aircrafts.filter(ac => flows.some(f => f.aircraftId === ac.id));
  const totalFlows = flows.length;

  return (
    <>
    {playingFlow && (
      <FlowPlayer
        flow={playingFlow}
        aircraft={aircrafts.find(a => a.id === playingFlow.aircraftId)}
        onClose={() => setPlayingFlow(null)}
      />
    )}
    <div className="max-w-4xl mx-auto px-6 md:px-10 py-16">
      <div className="mb-10">
        <p className="text-sm font-mono mb-2" style={{ color: "#00B4D8" }}>MY FLOWS</p>
        <h1 className="text-3xl font-bold mb-2">Your saved flows</h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {totalFlows === 0
            ? "Flows you've built, ready to practice or edit."
            : `${totalFlows} flow${totalFlows !== 1 ? "s" : ""} across ${aircraftsWithFlows.length} aircraft`}
        </p>
      </div>

      {aircraftsWithFlows.length === 0 ? (
        <div className="p-8 rounded-2xl mb-8 text-center"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            You haven&apos;t saved any flows yet.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3 mb-10">
          {aircraftsWithFlows.map(ac => {
            const acFlows = flows.filter(f => f.aircraftId === ac.id);
            const isOpen = !!openAircraft[ac.id];
            const isMultiPilot = ac.cockpitType === "multi";
            return (
              <div key={ac.id} className="rounded-2xl overflow-hidden"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>

                {/* Aircraft header row */}
                <button
                  onClick={() => toggleAircraft(ac.id)}
                  className="w-full flex items-center gap-4 px-5 py-4 transition-colors hover:bg-white/[0.02] text-left">
                  <div className="flex items-center justify-center w-9 h-9 rounded-xl shrink-0"
                    style={{ background: "rgba(0,180,216,0.1)", border: "1px solid #00B4D830" }}>
                    <span style={{ fontSize: 18 }}>✈️</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm">{ac.name}</p>
                      {ac.registration && (
                        <span className="text-xs font-mono px-1.5 py-0.5 rounded"
                          style={{ background: "rgba(255,255,255,0.05)", color: "var(--text-secondary)" }}>
                          {ac.registration}
                        </span>
                      )}
                      <span className="text-xs px-2 py-0.5 rounded-md"
                        style={{ background: "rgba(0,180,216,0.08)", color: "#00B4D8", border: "1px solid #00B4D820" }}>
                        {ac.cockpitType === "multi" ? "Multi Pilot" : "Single Pilot"}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-md"
                        style={{ background: "rgba(247,127,0,0.08)", color: "#F77F00", border: "1px solid rgba(247,127,0,0.2)" }}>
                        {ac.engineType === "multi" ? "Multi Engine" : "Single Engine"}
                      </span>
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                      {acFlows.length} flow{acFlows.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
                    className="shrink-0 transition-transform duration-200"
                    style={{ color: "var(--text-secondary)", transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}>
                    <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>

                {/* Flows list */}
                {isOpen && (
                  <div style={{ borderTop: "1px solid var(--border)" }}>
                    {acFlows.map((flow, fi) => (
                      <div key={flow.id}
                        style={{ borderTop: fi > 0 ? "1px solid var(--border)" : undefined }}>

                        {/* Flow row */}
                        <div className="flex items-center gap-3 px-5 py-3">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={flow.imageDataUrl} alt=""
                            className="w-14 h-10 rounded-lg object-cover shrink-0"
                            style={{ border: "1px solid var(--border)" }} />

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium text-sm truncate">{flow.name}</p>
                              {flow.emergency && (
                                <span title="Emergency flow" style={{ fontSize: 14, lineHeight: 1 }}>🚨</span>
                              )}
                            </div>
                            <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                              {flow.steps.length} step{flow.steps.length !== 1 ? "s" : ""} · {new Date(flow.createdAt).toLocaleDateString()}
                            </p>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {/* Play */}
                            <button
                              onClick={() => setPlayingFlow(flow)}
                              title="Review flow"
                              className="flex items-center justify-center w-8 h-8 rounded-lg transition-all hover:opacity-80"
                              style={{ background: "rgba(46,204,113,0.12)", border: "1px solid rgba(46,204,113,0.3)", color: "#2ECC71" }}>
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                                <path d="M2 1.5l9 4.5-9 4.5V1.5z"/>
                              </svg>
                            </button>
                            <button
                              onClick={() => toggleFlow(flow.id)}
                              className="text-xs px-3 py-1.5 rounded-lg transition-all hover:opacity-80"
                              style={{ background: "rgba(0,180,216,0.08)", color: "#00B4D8", border: "1px solid #00B4D820" }}>
                              {openFlow[flow.id] ? "▲ Steps" : "▼ Steps"}
                            </button>
                            <Link href={`/dashboard/flows/edit/${flow.id}`}
                              className="text-xs px-3 py-1.5 rounded-lg transition-all hover:opacity-80"
                              style={{ background: "rgba(230,230,230,0.06)", color: "var(--text-primary)", border: "1px solid var(--border)" }}>
                              Edit
                            </Link>
                            <button onClick={() => handleDelete(flow.id)}
                              className="text-xs px-3 py-1.5 rounded-lg transition-all hover:opacity-80"
                              style={{ background: "rgba(230,57,70,0.1)", color: "#E63946", border: "1px solid rgba(230,57,70,0.2)" }}>
                              Delete
                            </button>
                          </div>
                        </div>

                        {/* Steps accordion */}
                        {openFlow[flow.id] && (
                          <div className="px-5 pb-3" style={{ borderTop: "1px solid var(--border)" }}>
                            {flow.steps.length === 0 ? (
                              <p className="py-3 text-xs" style={{ color: "var(--text-secondary)" }}>No steps in this flow.</p>
                            ) : (
                              <div className="pt-3 flex flex-col gap-2">
                                {flow.steps.map((step, i) => (
                                  <div key={step.id} className="flex items-center gap-2">
                                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                                      style={{
                                        background: isMultiPilot && step.role === "PF" ? "#00B4D8" : "#F77F00",
                                        color: "#0D1117",
                                      }}>
                                      {i + 1}
                                    </div>
                                    {isMultiPilot && step.role && (
                                      <span className="text-xs font-bold px-1.5 py-0.5 rounded shrink-0"
                                        style={{
                                          background: step.role === "PF" ? "rgba(0,180,216,0.12)" : "rgba(247,127,0,0.12)",
                                          color: step.role === "PF" ? "#00B4D8" : "#F77F00",
                                          border: `1px solid ${step.role === "PF" ? "#00B4D830" : "rgba(247,127,0,0.3)"}`,
                                        }}>
                                        {step.role}
                                      </span>
                                    )}
                                    <span className="text-sm font-medium">{step.label || "Unnamed"}</span>
                                    {step.action && (
                                      <span className="text-xs px-2 py-0.5 rounded font-mono"
                                        style={{ background: "rgba(0,180,216,0.1)", color: "#00B4D8", border: "1px solid #00B4D820" }}>
                                        {step.action}
                                      </span>
                                    )}
                                    {step.callout && (
                                      <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ color: "#F77F00", flexShrink: 0 }}>
                                        <path d="M2 5h2l4-3v10L4 9H2a1 1 0 01-1-1V6a1 1 0 011-1z" fill="currentColor"/>
                                        <path d="M11 5c.6.5 1 1.4 1 2s-.4 1.5-1 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                                      </svg>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* CTA */}
      <div className="p-10 rounded-2xl text-center"
        style={{ background: "rgba(0,180,216,0.05)", border: "1px dashed #00B4D840" }}>
        <div className="text-4xl mb-4">🧭</div>
        <h2 className="text-xl font-semibold mb-2">Build a new flow</h2>
        <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
          Upload your cockpit layout and place memory-item steps directly on it.
        </p>
        <Link href="/dashboard/flows/new"
          className="inline-block px-6 py-3 rounded-xl font-medium text-sm transition-all hover:opacity-90"
          style={{ background: "#00B4D8", color: "#0D1117" }}>
          Open Flows Creator
        </Link>
      </div>
    </div>
    </>
  );
}
