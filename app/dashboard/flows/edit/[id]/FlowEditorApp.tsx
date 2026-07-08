"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { getFlows, getAircrafts, saveFlow, type FlowStep, type SavedFlow, type Aircraft, type FlowAnnotation } from "@/app/lib/storage";
import FlowPlayer from "@/app/dashboard/flows/FlowPlayer";
import AnnotationsLayer from "@/app/dashboard/flows/AnnotationsLayer";
import { getPusherClient } from "@/app/lib/pusher-client";

export default function FlowEditorApp({ id }: { id: string }) {
  const [flow, setFlow] = useState<SavedFlow | null>(null);
  const [aircraft, setAircraft] = useState<Aircraft | undefined>(undefined);
  const [steps, setSteps] = useState<FlowStep[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [tool, setTool] = useState<"add" | "move" | "text" | "draw">("add");
  const [history, setHistory] = useState<FlowStep[][]>([]);
  const [annotations, setAnnotations] = useState<FlowAnnotation[]>([]);
  const [activeColor, setActiveColor] = useState("#F77F00");
  const [activeWidth, setActiveWidth] = useState(2);
  const [pendingText, setPendingText] = useState<{ x: number; y: number } | null>(null);
  const [liveDrawPoints, setLiveDrawPoints] = useState<[number, number][]>([]);
  const isDrawingRef = useRef(false);
  const currentDrawRef = useRef<[number, number][]>([]);
  const [isMultiPilot, setIsMultiPilot] = useState(false);
  const [sequenceOrder, setSequenceOrder] = useState<string[]>([]);
  const [dragOverItemId, setDragOverItemId] = useState<string | null>(null);
  const [canvasW, setCanvasW] = useState(800);
  const [canvasH, setCanvasH] = useState(500);
  const [naturalAspect, setNaturalAspect] = useState(16 / 9);
  const imgRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<string | null>(null);
  const didDragRef = useRef(false);
  const draggingItemRef = useRef<string | null>(null);

  /* ─── Collab state ─── */
  const [collabRoom, setCollabRoom] = useState<string | null>(null);
  const [showCollabPopover, setShowCollabPopover] = useState(false);
  const [collabCopied, setCollabCopied] = useState(false);
  const broadcastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSelfUpdate = useRef(false);

  useEffect(() => {
    const found = getFlows().find(f => f.id === id);
    if (!found) { setNotFound(true); return; }
    setFlow(found);
    setSteps(found.steps);
    const anns = found.annotations ?? [];
    setAnnotations(anns);
    setSequenceOrder(
      found.sequenceOrder ?? [
        ...found.steps.map(s => s.id),
        ...anns.map(a => a.id),
      ]
    );
    const ac = getAircrafts().find(a => a.id === found.aircraftId);
    setAircraft(ac);
    setIsMultiPilot(ac?.cockpitType === "multi");
  }, [id]);

  useEffect(() => {
    if (!imgRef.current) return;
    const { width, height } = imgRef.current.getBoundingClientRect();
    if (width > 0) { setCanvasW(width); setCanvasH(height); }
  });

  function pushHistory(snapshot: FlowStep[]) {
    setHistory(prev => [...prev, snapshot]);
  }

  function handleUndo() {
    setHistory(prev => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      const snapshot = next.pop()!;
      setSteps(snapshot);
      setSaved(false);
      broadcastState(snapshot, annotations, sequenceOrder, flow?.name ?? "");
      return next;
    });
  }

  function getImgBounds(containerW: number, containerH: number, aspect: number) {
    const ca = containerW / containerH;
    if (aspect > ca) {
      const h = containerW / aspect;
      return { left: 0, top: (containerH - h) / 2, width: containerW, height: h };
    } else {
      const w = containerH * aspect;
      return { left: (containerW - w) / 2, top: 0, width: w, height: containerH };
    }
  }

  function getCanvasPct(e: React.MouseEvent<HTMLDivElement>) {
    const rect = imgRef.current!.getBoundingClientRect();
    const ib = getImgBounds(rect.width, rect.height, naturalAspect);
    return {
      x: Math.min(100, Math.max(0, ((e.clientX - rect.left - ib.left) / ib.width) * 100)),
      y: Math.min(100, Math.max(0, ((e.clientY - rect.top - ib.top) / ib.height) * 100)),
    };
  }

  function handleImageClick(e: React.MouseEvent<HTMLDivElement>) {
    if (tool === "text") {
      const { x, y } = getCanvasPct(e);
      setPendingText({ x, y });
      return;
    }
    if (tool !== "add") return;
    if (didDragRef.current) { didDragRef.current = false; return; }
    if ((e.target as HTMLElement).closest("[data-marker]")) return;
    const { x, y } = getCanvasPct(e);
    const newId = crypto.randomUUID();
    pushHistory(steps);
    const nextSteps = [...steps, { id: newId, x, y, label: `Step ${steps.length + 1}`, action: "", role: isMultiPilot ? "PF" as const : undefined }];
    const nextOrder = [...sequenceOrder, newId];
    setSteps(nextSteps);
    setSequenceOrder(nextOrder);
    setSelected(newId);
    setSaved(false);
    broadcastState(nextSteps, annotations, nextOrder, flow?.name ?? "");
  }

  function handleMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if (tool !== "draw") return;
    const { x, y } = getCanvasPct(e);
    isDrawingRef.current = true;
    currentDrawRef.current = [[x, y]];
    setLiveDrawPoints([[x, y]]);
  }

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (tool === "move" && draggingRef.current) {
      didDragRef.current = true;
      const { x, y } = getCanvasPct(e);
      setSteps(prev => prev.map(s => s.id === draggingRef.current ? { ...s, x, y } : s));
      setSaved(false);
    }
    if (tool === "draw" && isDrawingRef.current) {
      const { x, y } = getCanvasPct(e);
      const next: [number, number][] = [...currentDrawRef.current, [x, y]];
      currentDrawRef.current = next;
      setLiveDrawPoints(next);
    }
  }

  function handleMouseUp() {
    const wasDragging = !!draggingRef.current;
    draggingRef.current = null;
    if (wasDragging) {
      broadcastState(steps, annotations, sequenceOrder, flow?.name ?? "");
    }
    if (tool === "draw" && isDrawingRef.current) {
      isDrawingRef.current = false;
      if (currentDrawRef.current.length > 1) {
        const annId = crypto.randomUUID();
        const nextAnnotations = [...annotations, {
          type: "draw" as const, id: annId,
          points: currentDrawRef.current, color: activeColor, width: activeWidth,
        }];
        const nextOrder = [...sequenceOrder, annId];
        setAnnotations(nextAnnotations);
        setSequenceOrder(nextOrder);
        setSaved(false);
        broadcastState(steps, nextAnnotations, nextOrder, flow?.name ?? "");
      }
      currentDrawRef.current = [];
      setLiveDrawPoints([]);
    }
  }

  function handleUndoAnnotation() {
    const annIds = new Set(annotations.map(a => a.id));
    let lastAnnId: string | undefined;
    for (let i = sequenceOrder.length - 1; i >= 0; i--) {
      if (annIds.has(sequenceOrder[i])) { lastAnnId = sequenceOrder[i]; break; }
    }
    if (lastAnnId) {
      const id = lastAnnId;
      const nextAnnotations = annotations.filter(a => a.id !== id);
      const nextOrder = sequenceOrder.filter(sid => sid !== id);
      setAnnotations(nextAnnotations);
      setSequenceOrder(nextOrder);
      setSaved(false);
      broadcastState(steps, nextAnnotations, nextOrder, flow?.name ?? "");
    }
  }

  function handleClearAnnotations() {
    const annIds = new Set(annotations.map(a => a.id));
    const nextOrder = sequenceOrder.filter(id => !annIds.has(id));
    setAnnotations([]);
    setSequenceOrder(nextOrder);
    setSaved(false);
    broadcastState(steps, [], nextOrder, flow?.name ?? "");
  }

  function updateStep(id: string, field: keyof FlowStep, value: string | boolean) {
    pushHistory(steps);
    const nextSteps = steps.map(s => s.id === id ? { ...s, [field]: value } : s);
    setSteps(nextSteps);
    setSaved(false);
    broadcastState(nextSteps, annotations, sequenceOrder, flow?.name ?? "");
  }

  function deleteStep(id: string) {
    pushHistory(steps);
    const nextSteps = steps.filter(s => s.id !== id);
    const nextOrder = sequenceOrder.filter(sid => sid !== id);
    setSteps(nextSteps);
    setSequenceOrder(nextOrder);
    if (selected === id) setSelected(null);
    setSaved(false);
    broadcastState(nextSteps, annotations, nextOrder, flow?.name ?? "");
  }

  function reorderSequence(dragId: string, overId: string) {
    if (dragId === overId) return;
    const newOrder = [...sequenceOrder];
    const from = newOrder.indexOf(dragId);
    const to = newOrder.indexOf(overId);
    if (from === -1 || to === -1) return;
    newOrder.splice(from, 1);
    newOrder.splice(to, 0, dragId);
    setSequenceOrder(newOrder);
    // if drag item is a step, also reorder steps[] to match new relative order
    if (steps.some(s => s.id === dragId)) {
      pushHistory(steps);
      const orderedStepIds = newOrder.filter(id => steps.some(s => s.id === id));
      setSteps(orderedStepIds.map(id => steps.find(s => s.id === id)!));
    }
    setSaved(false);
  }

  /* Subscribe to Pusher collab channel (host only) */
  useEffect(() => {
    if (!collabRoom) return;
    const pusher = getPusherClient();
    const channel = pusher.subscribe(`presence-collab-${collabRoom}`);
    channel.bind("collab:flow-update", (data: { steps: FlowStep[]; annotations: FlowAnnotation[]; sequenceOrder: string[]; flowName: string }) => {
      isSelfUpdate.current = true;
      setSteps(data.steps);
      setAnnotations(data.annotations);
      setSequenceOrder(data.sequenceOrder);
      setFlow(f => f ? { ...f, name: data.flowName } : f);
      setSaved(false);
      isSelfUpdate.current = false;
    });
    return () => {
      channel.unbind_all();
      pusher.unsubscribe(`presence-collab-${collabRoom}`);
    };
  }, [collabRoom]);

  const broadcastState = useCallback((
    nextSteps: FlowStep[],
    nextAnnotations: FlowAnnotation[],
    nextOrder: string[],
    name: string,
  ) => {
    if (!collabRoom || isSelfUpdate.current) return;
    if (broadcastTimerRef.current) clearTimeout(broadcastTimerRef.current);
    broadcastTimerRef.current = setTimeout(() => {
      fetch("/api/collab/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomCode: collabRoom,
          eventName: "collab:flow-update",
          data: { steps: nextSteps, annotations: nextAnnotations, sequenceOrder: nextOrder, flowName: name },
        }),
      });
    }, 400);
  }, [collabRoom]);

  async function startCollab() {
    if (!flow) return;
    const res = await fetch("/api/collab/room", { method: "POST" });
    const { roomCode } = await res.json();
    // Upload full flow to server so guest can load it
    await fetch("/api/collab/flow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roomCode,
        flow: {
          steps,
          annotations,
          sequenceOrder,
          imageDataUrl: flow.imageDataUrl,
          flowName: flow.name,
          aircraftId: flow.aircraftId,
          cockpitType: aircraft?.cockpitType,
        },
      }),
    });
    setCollabRoom(roomCode);
    setShowCollabPopover(true);
  }

  function handleSave() {
    if (!flow) return;
    saveFlow({ ...flow, steps, annotations, sequenceOrder });
    setSaved(true);
  }

  if (notFound) return (
    <div className="max-w-4xl mx-auto px-6 py-16 text-center">
      <p className="text-4xl mb-4">❓</p>
      <p className="font-semibold mb-2">Flow not found</p>
      <a href="/dashboard/flows" style={{ color: "#00B4D8" }} className="text-sm">← Back to My Flows</a>
    </div>
  );

  if (!flow) return (
    <div className="flex items-center justify-center" style={{ height: "calc(100vh - 57px)" }}>
      <p style={{ color: "var(--text-secondary)" }} className="text-sm">Loading…</p>
    </div>
  );

  const selectedStep = steps.find(s => s.id === selected);

  const liveFlow: SavedFlow = { ...flow, steps, annotations, sequenceOrder };

  return (
    <>
      {reviewing && (
        <FlowPlayer flow={liveFlow} aircraft={aircraft} onClose={() => setReviewing(false)} />
      )}
    <div className="flex" style={{ height: "calc(100vh - 57px)", overflow: "hidden" }}>
      {/* Image canvas */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="flex items-center gap-4 px-6 py-3 shrink-0"
          style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-secondary)" }}>
          <a href="/dashboard/flows" className="text-xs shrink-0 hover:opacity-70 transition-opacity"
            style={{ color: "var(--text-secondary)" }}>
            ← My Flows
          </a>
          <input
            value={flow.name}
            onChange={e => { setFlow(f => f ? { ...f, name: e.target.value } : f); setSaved(false); }}
            className="flex-1 bg-transparent text-sm font-semibold outline-none min-w-0"
            style={{ color: "var(--text-primary)" }}
            placeholder="Flow name…"
          />
          <span className="text-xs shrink-0" style={{ color: "var(--text-secondary)" }}>
            {steps.length} step{steps.length !== 1 ? "s" : ""}
          </span>
          <button onClick={() => setReviewing(true)}
            disabled={steps.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:opacity-80 shrink-0 disabled:opacity-30"
            style={{ background: "rgba(247,127,0,0.12)", border: "1px solid rgba(247,127,0,0.3)", color: "#F77F00" }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <polygon points="2,1 11,6 2,11" fill="currentColor"/>
            </svg>
            Review
          </button>
          <a href={`/dashboard/quizzes?aircraft=${flow.aircraftId}`}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:opacity-80 shrink-0"
            style={{ background: "rgba(0,180,216,0.12)", border: "1px solid rgba(0,180,216,0.3)", color: "#00B4D8" }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M4.5 4.5a1.5 1.5 0 113 0c0 1-1.5 1.5-1.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              <circle cx="6" cy="9.5" r="0.6" fill="currentColor"/>
            </svg>
            Quiz
          </a>
          {saved ? (
            <a href="/dashboard/flows"
              className="px-4 py-1.5 rounded-lg text-sm font-medium hover:opacity-90 shrink-0"
              style={{ background: "#2ECC71", color: "#0D1117" }}>
              ✓ Saved
            </a>
          ) : (
            <button onClick={handleSave}
              className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all hover:opacity-90 shrink-0"
              style={{ background: "#00B4D8", color: "#0D1117" }}>
              Save changes
            </button>
          )}
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 px-4 py-2 shrink-0"
          style={{ background: "var(--bg-secondary)", borderBottom: "1px solid var(--border)" }}>
          <span className="text-xs mr-1" style={{ color: "var(--text-secondary)" }}>Tool:</span>
          <button
            onClick={() => setTool("add")}
            title="Add step — click on the image to place a new marker"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{
              background: tool === "add" ? "rgba(0,180,216,0.15)" : "transparent",
              color: tool === "add" ? "#00B4D8" : "var(--text-secondary)",
              border: tool === "add" ? "1px solid #00B4D840" : "1px solid transparent",
            }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5"/>
              <line x1="7" y1="4" x2="7" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="4" y1="7" x2="10" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            Add step
          </button>
          <button
            onClick={() => setTool("move")}
            title="Move — drag markers to reposition them"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{
              background: tool === "move" ? "rgba(0,180,216,0.15)" : "transparent",
              color: tool === "move" ? "#00B4D8" : "var(--text-secondary)",
              border: tool === "move" ? "1px solid #00B4D840" : "1px solid transparent",
            }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1v12M1 7h12M7 1L5 3M7 1L9 3M7 13L5 11M7 13L9 11M1 7L3 5M1 7L3 9M13 7L11 5M13 7L11 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            Move
          </button>
          <div className="w-px h-4 shrink-0 mx-1" style={{ background: "var(--border)" }} />
          {/* Annotation tools */}
          <button
            onClick={() => setTool("text")}
            title="Text — click on the image to add a text annotation"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{
              background: tool === "text" ? "rgba(247,127,0,0.15)" : "transparent",
              color: tool === "text" ? "#F77F00" : "var(--text-secondary)",
              border: tool === "text" ? "1px solid rgba(247,127,0,0.3)" : "1px solid transparent",
            }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 3h10M7 3v8M5 11h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            Text
          </button>
          <button
            onClick={() => setTool("draw")}
            title="Draw — freehand drawing on the image"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{
              background: tool === "draw" ? "rgba(247,127,0,0.15)" : "transparent",
              color: tool === "draw" ? "#F77F00" : "var(--text-secondary)",
              border: tool === "draw" ? "1px solid rgba(247,127,0,0.3)" : "1px solid transparent",
            }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 11c1-2 2-4 4-5s3-0.5 3.5 0.5S9 9 8 10s-3 1.5-4 0.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              <circle cx="11.5" cy="2.5" r="1.5" fill="currentColor" opacity="0.6"/>
            </svg>
            Draw
          </button>
          {(tool === "text" || tool === "draw") && (
            <>
              <div className="w-px h-4 shrink-0" style={{ background: "var(--border)" }} />
              <input type="color" value={activeColor} onChange={e => setActiveColor(e.target.value)}
                title="Annotation color"
                className="w-7 h-7 rounded cursor-pointer shrink-0"
                style={{ padding: 2, background: "transparent", border: "1px solid var(--border)" }} />
              {tool === "draw" && (
                <select value={activeWidth} onChange={e => setActiveWidth(Number(e.target.value))}
                  title="Stroke width"
                  className="text-xs rounded px-2 py-1"
                  style={{ background: "var(--bg-primary)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
                  <option value={1}>Thin</option>
                  <option value={2}>Normal</option>
                  <option value={4}>Thick</option>
                </select>
              )}
              {annotations.length > 0 && (
                <button onClick={handleUndoAnnotation} className="text-xs px-2 py-1 rounded transition-opacity hover:opacity-70"
                  style={{ color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
                  Undo
                </button>
              )}
              {annotations.length > 0 && (
                <button onClick={handleClearAnnotations} className="text-xs px-2 py-1 rounded transition-opacity hover:opacity-70"
                  style={{ color: "#F85149", border: "1px solid rgba(248,81,73,0.3)" }}>
                  Clear all
                </button>
              )}
            </>
          )}
          <div className="w-px h-4 shrink-0 mx-1" style={{ background: "var(--border)" }} />
          <button
            onClick={handleUndo}
            disabled={history.length === 0}
            title="Undo last action"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{
              background: "transparent",
              color: history.length === 0 ? "#3D444D" : "var(--text-secondary)",
              border: "1px solid transparent",
              cursor: history.length === 0 ? "default" : "pointer",
            }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 4h5a4 4 0 010 8H4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 4L4.5 1.5M2 4L4.5 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Undo
          </button>
          {/* Collaborate button + popover */}
          <div className="relative ml-auto">
            <button
              onClick={() => collabRoom ? setShowCollabPopover(v => !v) : startCollab()}
              title="Collaborate — co-edit this flow with another user"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{
                background: collabRoom ? "rgba(0,180,216,0.12)" : "transparent",
                color: collabRoom ? "#00B4D8" : "var(--text-secondary)",
                border: collabRoom ? "1px solid #00B4D830" : "1px solid transparent",
              }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="5" cy="4" r="2.5" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M1 12c0-2 1.8-3.5 4-3.5s4 1.5 4 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                <path d="M10 8c1.2.3 2.5 1.4 2.5 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
              {collabRoom ? "Collab: ON" : "Collaborate"}
            </button>
            {showCollabPopover && collabRoom && (
              <div className="absolute top-9 right-0 z-30 rounded-xl p-4 w-64"
                style={{ background: "#0D1117", border: "1px solid var(--border)", boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>
                <p className="text-xs font-semibold mb-1" style={{ color: "var(--text-primary)" }}>Room code</p>
                <p className="text-xs mb-3" style={{ color: "var(--text-secondary)" }}>
                  Partner joins via My Flows → join box
                </p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 flex items-center justify-center py-2 rounded-lg font-mono text-lg font-bold tracking-widest"
                    style={{ background: "rgba(0,180,216,0.08)", border: "1px solid #00B4D820", color: "#00B4D8" }}>
                    {collabRoom}
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(collabRoom!);
                      setCollabCopied(true);
                      setTimeout(() => setCollabCopied(false), 1800);
                    }}
                    className="px-3 py-2 rounded-lg text-xs font-medium transition-all"
                    style={{ background: collabCopied ? "rgba(46,204,113,0.15)" : "rgba(0,180,216,0.1)", color: collabCopied ? "#2ECC71" : "#00B4D8", border: `1px solid ${collabCopied ? "#2ECC7130" : "#00B4D830"}` }}>
                    {collabCopied ? "✓" : "Copy"}
                  </button>
                </div>
              </div>
            )}
          </div>

          <span className="ml-1 text-xs" style={{ color: "var(--text-secondary)" }}>
            {tool === "add" ? "Click on the image to place a step marker" : tool === "move" ? "Drag a marker to reposition it" : tool === "text" ? "Click on the image to add text" : "Click and drag to draw"}
          </span>
        </div>

        {/* Image */}
        <div ref={imgRef} onClick={handleImageClick}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          className="relative flex-1 overflow-hidden"
          style={{
            cursor: tool === "move" ? (draggingRef.current ? "grabbing" : "grab") : tool === "draw" ? "crosshair" : tool === "text" ? "text" : "crosshair",
            background: "#0D1117",
            userSelect: "none",
          }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={flow.imageDataUrl} alt="Cockpit"
            className="w-full h-full object-contain pointer-events-none select-none" draggable={false}
            onLoad={e => setNaturalAspect(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)} />

          {(() => {
            const ib = getImgBounds(canvasW, canvasH, naturalAspect);
            return (<>
          {/* Step connector arrows */}
          {steps.length > 1 && (
            <svg className="absolute pointer-events-none"
              style={{ left: ib.left, top: ib.top, width: ib.width, height: ib.height, zIndex: 4 }}
              viewBox="0 0 100 100" preserveAspectRatio="none">
              <defs>
                <marker id="step-arrow" markerWidth="3.5" markerHeight="3" refX="3" refY="1.5" orient="auto">
                  <polygon points="0 0, 3.5 1.5, 0 3" fill="#5A6478" />
                </marker>
              </defs>
              {steps.slice(1).map((step, i) => {
                const origIdx = i + 1;
                const prev = isMultiPilot
                  ? steps.slice(0, origIdx).reverse().find(s => s.role === step.role)
                  : steps[i];
                if (!prev) return null;
                const dx = step.x - prev.x, dy = step.y - prev.y;
                const len = Math.sqrt(dx * dx + dy * dy);
                if (len < 1) return null;
                const nx = dx / len, ny = dy / len;
                const gap = 13 / Math.sqrt((nx * ib.width / 100) ** 2 + (ny * ib.height / 100) ** 2);
                const x1 = prev.x + nx * gap, y1 = prev.y + ny * gap;
                const x2 = step.x - nx * gap, y2 = step.y - ny * gap;
                const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
                const cx = mx - ny * 5, cy = my + nx * 5;
                const d = `M ${x1},${y1} Q ${cx},${cy} ${x2},${y2}`;
                return (
                  <path key={`${prev.id}-${step.id}`}
                    d={d} fill="none" stroke="#5A6478" strokeWidth="0.35"
                    pathLength="1" strokeDasharray="1" strokeDashoffset="1"
                    markerEnd="url(#step-arrow)"
                    style={{ animation: "draw-step-line 0.5s cubic-bezier(0.4,0,0.2,1) forwards" }}
                  />
                );
              })}
            </svg>
          )}

          <AnnotationsLayer
            annotations={annotations}
            ib={ib}
            pendingText={pendingText}
            onPendingTextCommit={text => {
              if (pendingText) {
                const annId = crypto.randomUUID();
                const nextAnnotations = [...annotations, { type: "text" as const, id: annId, x: pendingText.x, y: pendingText.y, text, color: activeColor }];
                const nextOrder = [...sequenceOrder, annId];
                setAnnotations(nextAnnotations);
                setSequenceOrder(nextOrder);
                setSaved(false);
                broadcastState(steps, nextAnnotations, nextOrder, flow?.name ?? "");
              }
              setPendingText(null);
            }}
            onPendingTextCancel={() => setPendingText(null)}
          />
          {liveDrawPoints.length > 1 && (
            <svg className="absolute pointer-events-none"
              style={{ left: ib.left, top: ib.top, width: ib.width, height: ib.height, zIndex: 6 }}
              viewBox="0 0 100 100" preserveAspectRatio="none">
              <polyline
                points={liveDrawPoints.map(([x, y]) => `${x},${y}`).join(" ")}
                fill="none" stroke={activeColor} strokeWidth={activeWidth}
                strokeLinecap="round" strokeLinejoin="round"
                vectorEffect="non-scaling-stroke" opacity={0.7}
              />
            </svg>
          )}
          {steps.map((step, i) => {
            const roleColor = (isMultiPilot && step.role === "PF") ? "#00B4D8" : "#F77F00";
            const isSelected = selected === step.id;
            const glowColor = isSelected ? roleColor + "AA" : roleColor + "55";
            return (
            <div key={step.id} data-marker="1"
              onMouseDown={(e) => {
                if (tool !== "move") return;
                e.stopPropagation();
                pushHistory(steps);
                draggingRef.current = step.id;
                didDragRef.current = false;
                setSelected(step.id);
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (tool === "add") setSelected(step.id);
              }}
              className="absolute"
              style={{
                left: `${ib.left + step.x / 100 * ib.width}px`,
                top: `${ib.top + step.y / 100 * ib.height}px`,
                width: 0, height: 0, overflow: "visible",
                cursor: tool === "move" ? "grab" : "pointer",
              }}>
              <div className="absolute flex items-center justify-center rounded-full shrink-0 transition-all duration-300"
                style={{
                  width: isSelected ? 28 : 24,
                  height: isSelected ? 28 : 24,
                  transform: "translate(-50%,-50%)",
                  background: "rgba(13,17,23,0.85)",
                  border: `2px solid ${roleColor}`,
                  boxShadow: `0 0 ${isSelected ? 14 : 8}px ${glowColor}`,
                }}>
                <span className="font-mono font-bold select-none"
                  style={{ fontSize: 10, color: roleColor }}>
                  {i + 1}
                </span>
              </div>
              {step.label && (
                <div className="absolute flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap"
                  style={{ left: 16, top: "50%", transform: "translateY(-50%)", background: "rgba(13,17,23,0.9)", border: "1px solid #30363D" }}>
                  {step.callout && (
                    <svg width="11" height="11" viewBox="0 0 14 14" fill="none" style={{ color: "#F77F00", flexShrink: 0 }}>
                      <path d="M2 5h2l4-3v10L4 9H2a1 1 0 01-1-1V6a1 1 0 011-1z" fill="currentColor"/>
                      <path d="M11 5c.6.5 1 1.4 1 2s-.4 1.5-1 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                    </svg>
                  )}
                  {isMultiPilot && step.role && (
                    <span className="font-bold" style={{ color: roleColor }}>{step.role}</span>
                  )}
                  <span style={{ color: roleColor }}>{step.label}</span>
                  {step.action && <span style={{ color: "#8B949E" }}> — {step.action}</span>}
                </div>
              )}
            </div>
            );
          })}
          </>); })()}
        </div>
      </div>

      {/* Right panel */}
      <div className="w-72 shrink-0 flex flex-col"
        style={{ borderLeft: "1px solid var(--border)", background: "var(--bg-secondary)" }}>
        <div className="px-4 py-3 shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
          <p className="text-xs font-mono" style={{ color: "#00B4D8" }}>STEPS</p>
        </div>

        {selectedStep ? (
          <div className="px-4 py-4 shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
            <p className="text-xs mb-3 font-medium" style={{ color: "var(--text-secondary)" }}>
              Step {steps.indexOf(selectedStep) + 1}
            </p>
            <label className="block text-xs mb-1" style={{ color: "var(--text-secondary)" }}>Label</label>
            <input value={selectedStep.label}
              onChange={e => updateStep(selectedStep.id, "label", e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm mb-3"
              style={{ background: "#0D1117", border: "1px solid #30363D", color: "var(--text-primary)", outline: "none" }}
              placeholder="e.g. Fuel Pump" />
            <label className="block text-xs mb-1" style={{ color: "var(--text-secondary)" }}>Action</label>
            <input value={selectedStep.action}
              onChange={e => updateStep(selectedStep.id, "action", e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm mb-3"
              style={{ background: "#0D1117", border: "1px solid #30363D", color: "var(--text-primary)", outline: "none" }}
              placeholder="e.g. OFF" />
            {isMultiPilot && (
              <div className="mb-3">
                <label className="block text-xs mb-1.5" style={{ color: "var(--text-secondary)" }}>Role</label>
                <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid #30363D" }}>
                  {(["PF", "PM"] as const).map(r => (
                    <button key={r} type="button"
                      onClick={() => updateStep(selectedStep.id, "role", r)}
                      className="flex-1 py-1.5 text-xs font-bold transition-all"
                      style={{
                        background: selectedStep.role === r ? (r === "PF" ? "rgba(0,180,216,0.2)" : "rgba(247,127,0,0.2)") : "#0D1117",
                        color: selectedStep.role === r ? (r === "PF" ? "#00B4D8" : "#F77F00") : "var(--text-secondary)",
                        borderRight: r === "PF" ? "1px solid #30363D" : undefined,
                      }}>
                      {r}
                      <span className="font-normal text-xs ml-1" style={{ opacity: 0.7 }}>
                        {r === "PF" ? "Flying" : "Monitoring"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <button
              onClick={() => updateStep(selectedStep.id, "callout", !selectedStep.callout)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg mb-3 transition-all"
              style={{
                background: selectedStep.callout ? "rgba(247,127,0,0.1)" : "#0D1117",
                border: `1px solid ${selectedStep.callout ? "rgba(247,127,0,0.4)" : "#30363D"}`,
              }}>
              <span className="flex items-center gap-2 text-xs font-medium"
                style={{ color: selectedStep.callout ? "#F77F00" : "var(--text-secondary)" }}>
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                  <path d="M2 5h2l4-3v10L4 9H2a1 1 0 01-1-1V6a1 1 0 011-1z" fill="currentColor"/>
                  <path d="M11 5c.6.5 1 1.4 1 2s-.4 1.5-1 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                </svg>
                Callout required
              </span>
              <div className="relative w-8 h-4 rounded-full shrink-0 transition-colors"
                style={{ background: selectedStep.callout ? "#F77F00" : "#30363D" }}>
                <div className="absolute top-0.5 w-3 h-3 rounded-full transition-all"
                  style={{
                    background: "#E6EDF3",
                    left: selectedStep.callout ? "calc(100% - 14px)" : "2px",
                  }} />
              </div>
            </button>
          </div>
        ) : (
          <div className="px-4 py-4 shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
              Click a marker or the image to select or add a step.
            </p>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-1.5">
          {sequenceOrder.length === 0 ? (
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>No steps yet.</p>
          ) : sequenceOrder.map(itemId => {
            const stepIdx = steps.findIndex(s => s.id === itemId);
            const step = stepIdx !== -1 ? steps[stepIdx] : null;
            const ann = !step ? annotations.find(a => a.id === itemId) ?? null : null;
            if (!step && !ann) return null;
            const isAnn = ann !== null;
            const isActive = !isAnn && selected === itemId;
            return (
              <div key={itemId}
                draggable
                onDragStart={() => { draggingItemRef.current = itemId; }}
                onDragOver={e => { e.preventDefault(); setDragOverItemId(itemId); }}
                onDrop={e => { e.preventDefault(); if (draggingItemRef.current) reorderSequence(draggingItemRef.current, itemId); setDragOverItemId(null); }}
                onDragEnd={() => { draggingItemRef.current = null; setDragOverItemId(null); }}
                onClick={() => !isAnn && setSelected(itemId)}
                className="group flex items-center gap-2 px-3 py-2 rounded-lg transition-colors"
                style={{
                  background: isActive ? "rgba(0,180,216,0.1)" : isAnn ? "rgba(247,127,0,0.04)" : "var(--bg-card)",
                  cursor: isAnn ? "default" : "pointer",
                  borderLeft: `1px solid ${isActive ? "#00B4D840" : isAnn ? "rgba(247,127,0,0.2)" : "#30363D"}`,
                  borderRight: `1px solid ${isActive ? "#00B4D840" : isAnn ? "rgba(247,127,0,0.2)" : "#30363D"}`,
                  borderBottom: `1px solid ${isActive ? "#00B4D840" : isAnn ? "rgba(247,127,0,0.2)" : "#30363D"}`,
                  borderTop: dragOverItemId === itemId ? "2px solid #00B4D8" : `1px solid ${isActive ? "#00B4D840" : isAnn ? "rgba(247,127,0,0.2)" : "#30363D"}`,
                  borderRadius: "0.5rem",
                  opacity: draggingItemRef.current === itemId ? 0.4 : 1,
                }}>
                {/* drag handle */}
                <svg width="10" height="14" viewBox="0 0 10 14" fill="none" className="shrink-0" style={{ color: "#3D444D", cursor: "grab" }}>
                  <circle cx="3" cy="2.5" r="1.2" fill="currentColor"/><circle cx="7" cy="2.5" r="1.2" fill="currentColor"/>
                  <circle cx="3" cy="7" r="1.2" fill="currentColor"/><circle cx="7" cy="7" r="1.2" fill="currentColor"/>
                  <circle cx="3" cy="11.5" r="1.2" fill="currentColor"/><circle cx="7" cy="11.5" r="1.2" fill="currentColor"/>
                </svg>

                {step ? (
                  <>
                    <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                      style={{ background: "#F77F00", color: "#0D1117" }}>
                      {stepIdx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{step.label || "Unnamed"}</p>
                      {step.action && <p className="text-xs truncate" style={{ color: "#00B4D8" }}>{step.action}</p>}
                    </div>
                    {step.role && isMultiPilot && (
                      <span className="text-xs font-bold shrink-0" style={{ color: step.role === "PF" ? "#00B4D8" : "#F77F00" }}>{step.role}</span>
                    )}
                    {step.callout && (
                      <svg width="12" height="12" viewBox="0 0 14 14" fill="none" style={{ color: "#F77F00", flexShrink: 0 }}>
                        <path d="M2 5h2l4-3v10L4 9H2a1 1 0 01-1-1V6a1 1 0 011-1z" fill="currentColor"/>
                        <path d="M11 5c.6.5 1 1.4 1 2s-.4 1.5-1 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                      </svg>
                    )}
                    <button
                      onClick={e => { e.stopPropagation(); deleteStep(itemId); }}
                      className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity ml-1"
                      style={{ color: "#E63946" }}>
                      <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                        <path d="M2 4h10M5 4V3a1 1 0 011-1h2a1 1 0 011 1v1M11 4l-.7 7.1A1 1 0 019.3 12H4.7a1 1 0 01-1-.9L3 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  </>
                ) : (
                  <>
                    <div className="w-5 h-5 rounded flex items-center justify-center shrink-0 text-xs font-bold"
                      style={{ background: "rgba(247,127,0,0.15)", color: "#F77F00" }}>
                      {ann!.type === "text" ? "T" : "✏"}
                    </div>
                    <div className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ background: ann!.color, boxShadow: `0 0 4px ${ann!.color}88` }} />
                    <div className="flex-1 min-w-0">
                      {ann!.type === "text" ? (
                        <p className="text-xs truncate" style={{ color: "var(--text-primary)" }}>{ann!.text}</p>
                      ) : (
                        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Draw stroke</p>
                      )}
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); const id = itemId; const na = annotations.filter(a => a.id !== id); const no = sequenceOrder.filter(s => s !== id); setAnnotations(na); setSequenceOrder(no); setSaved(false); broadcastState(steps, na, no, flow?.name ?? ""); }}
                      className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ color: "#E63946" }}>
                      <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                        <path d="M2 4h10M5 4V3a1 1 0 011-1h2a1 1 0 011 1v1M11 4l-.7 7.1A1 1 0 019.3 12H4.7a1 1 0 01-1-.9L3 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
    </>
  );
}
