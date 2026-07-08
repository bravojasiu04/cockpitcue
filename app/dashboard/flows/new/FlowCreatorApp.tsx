"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { getAircrafts, saveAircraft, saveFlow, type Aircraft, type FlowAnnotation, type FlowStep, type SavedFlow } from "@/app/lib/storage";
import FlowPlayer from "@/app/dashboard/flows/FlowPlayer";
import AnnotationsLayer from "@/app/dashboard/flows/AnnotationsLayer";
import { getPusherClient } from "@/app/lib/pusher-client";

/* ─── Image bounds helper (accounts for object-contain letterboxing) ─── */
function getImgBounds(containerW: number, containerH: number, naturalAspect: number) {
  const containerAspect = containerW / containerH;
  if (naturalAspect > containerAspect) {
    const h = containerW / naturalAspect;
    return { left: 0, top: (containerH - h) / 2, width: containerW, height: h };
  } else {
    const w = containerH * naturalAspect;
    return { left: (containerW - w) / 2, top: 0, width: w, height: containerH };
  }
}

/* ─── Image compressor ─── */
function compressImage(dataUrl: string, maxPx = 1400, quality = 0.75): Promise<string> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.src = dataUrl;
  });
}

/* ─── PDF renderer ─── */
async function pdfToDataUrl(file: File): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: canvas.getContext("2d")!, canvas, viewport }).promise;
  return canvas.toDataURL("image/png");
}

/* ─── UploadPhase ─── */
function UploadPhase({ onReady }: { onReady: (dataUrl: string, name: string) => void }) {
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (file.type === "application/pdf") {
      setLoading(true);
      try {
        const raw = await pdfToDataUrl(file);
        const compressed = await compressImage(raw);
        onReady(compressed, file.name.replace(/\.pdf$/i, ""));
      } catch { alert("Could not render the PDF."); setLoading(false); }
      return;
    }
    if (file.type.startsWith("image/")) {
      setLoading(true);
      const reader = new FileReader();
      reader.onload = async (e) => {
        const compressed = await compressImage(e.target!.result as string);
        onReady(compressed, file.name.replace(/\.[^.]+$/, ""));
      };
      reader.readAsDataURL(file);
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-6 md:px-10 py-16">
      <div className="mb-8">
        <p className="text-sm font-mono mb-2" style={{ color: "#00B4D8" }}>FLOWS CREATOR</p>
        <h1 className="text-3xl font-bold mb-2">Build your flow</h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Start by uploading a photo of your cockpit panel. You&apos;ll be able to place
          memory-item steps directly on it in the next step.
        </p>
      </div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => { e.preventDefault(); setDragActive(false); handleFile(e.dataTransfer.files?.[0]); }}
        onClick={() => !loading && inputRef.current?.click()}
        className="rounded-2xl p-12 text-center transition-colors"
        style={{
          border: `2px dashed ${dragActive ? "#00B4D8" : "#30363D"}`,
          background: dragActive ? "rgba(0,180,216,0.06)" : "var(--bg-card)",
          cursor: loading ? "wait" : "pointer",
        }}
      >
        <input ref={inputRef} type="file" accept="image/*,application/pdf"
          className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
        {loading ? (
          <><div className="text-4xl mb-4 animate-pulse">⏳</div>
          <p className="font-medium">Rendering PDF…</p>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>Converting first page to image</p>
          <p className="text-xs mt-2" style={{ color: "#3D444D" }}>This may take a moment</p></>
        ) : (
          <><div className="text-4xl mb-4">📤</div>
          <p className="font-medium mb-1">Drop your cockpit image here</p>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>or click to browse — PNG, JPG or PDF</p></>
        )}
      </div>
    </div>
  );
}

/* ─── SaveModal ─── */
function SaveModal({
  flowName, aircrafts, initialAircraftId, onSave, onClose,
}: {
  flowName: string;
  aircrafts: Aircraft[];
  initialAircraftId?: string;
  onSave: (name: string, aircraftId: string, emergency: boolean) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(flowName);
  const [aircraftId, setAircraftId] = useState(initialAircraftId || aircrafts[0]?.id || "");
  const [emergency, setEmergency] = useState(false);
  const [error, setError] = useState("");

  function handleSave() {
    if (!name.trim()) { setError("Flow name is required."); return; }
    if (!aircraftId) { setError("Please select an aircraft."); return; }
    onSave(name.trim(), aircraftId, emergency);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.7)" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl p-6"
        style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
        onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-1">Save flow</h2>
        <p className="text-sm mb-5" style={{ color: "var(--text-secondary)" }}>
          Choose the aircraft this flow belongs to before saving.
        </p>

        <label className="block text-xs mb-1" style={{ color: "var(--text-secondary)" }}>Flow name</label>
        <input value={name} onChange={e => { setName(e.target.value); setError(""); }}
          className="w-full px-3 py-2 rounded-lg text-sm mb-4"
          style={{ background: "#0D1117", border: "1px solid #30363D", color: "var(--text-primary)", outline: "none" }} />

        <label className="block text-xs mb-1" style={{ color: "var(--text-secondary)" }}>Aircraft</label>
        {aircrafts.length === 0 ? (
          <p className="text-sm mb-4 p-3 rounded-lg" style={{ background: "#0D1117", border: "1px solid #30363D", color: "#E63946" }}>
            No aircraft added yet.{" "}
            <a href="/dashboard/aircrafts" style={{ color: "#00B4D8" }}>Add one first →</a>
          </p>
        ) : (
          <select value={aircraftId} onChange={e => { setAircraftId(e.target.value); setError(""); }}
            className="w-full px-3 py-2 rounded-lg text-sm mb-4"
            style={{ background: "#0D1117", border: "1px solid #30363D", color: "var(--text-primary)", outline: "none" }}>
            {aircrafts.map(ac => (
              <option key={ac.id} value={ac.id}>
                {ac.name}{ac.registration ? ` (${ac.registration})` : ""}
              </option>
            ))}
          </select>
        )}

        {/* Emergency toggle */}
        <button
          type="button"
          onClick={() => setEmergency(v => !v)}
          className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg mb-4 transition-all"
          style={{
            background: emergency ? "rgba(230,57,70,0.1)" : "#0D1117",
            border: `1px solid ${emergency ? "rgba(230,57,70,0.5)" : "#30363D"}`,
          }}>
          <span className="flex items-center gap-2 text-sm font-medium"
            style={{ color: emergency ? "#E63946" : "var(--text-secondary)" }}>
            <span>🚨</span>
            Emergency flow
          </span>
          <div className="relative w-8 h-4 rounded-full shrink-0 transition-colors"
            style={{ background: emergency ? "#E63946" : "#30363D" }}>
            <div className="absolute top-0.5 w-3 h-3 rounded-full transition-all"
              style={{ background: "#E6EDF3", left: emergency ? "calc(100% - 14px)" : "2px" }} />
          </div>
        </button>

        {error && <p className="text-xs mb-3" style={{ color: "#E63946" }}>{error}</p>}

        <div className="flex gap-3 justify-end">
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm"
            style={{ background: "transparent", border: "1px solid #30363D", color: "var(--text-secondary)" }}>
            Cancel
          </button>
          <button onClick={handleSave}
            className="px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90"
            style={{ background: "#00B4D8", color: "#0D1117" }}>
            Save flow
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── AircraftPickerPhase ─── */
function AircraftPickerPhase({
  onPicked,
}: {
  onPicked: (aircraftId: string, imageDataUrl: string | undefined) => void;
}) {
  const [aircrafts, setAircrafts] = useState<Aircraft[]>([]);
  const [selected, setSelected] = useState<string>("");

  useEffect(() => {
    const list = getAircrafts();
    setAircrafts(list);
    if (list.length > 0) setSelected(list[0].id);
  }, []);

  const ac = aircrafts.find(a => a.id === selected);

  return (
    <div className="max-w-xl mx-auto px-6 md:px-10 py-16">
      <div className="mb-8">
        <p className="text-sm font-mono mb-2" style={{ color: "#00B4D8" }}>FLOWS CREATOR</p>
        <h1 className="text-3xl font-bold mb-2">Select aircraft</h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Choose the aircraft you want to build a flow for. If it has a cockpit image saved, it will load automatically.
        </p>
      </div>

      {aircrafts.length === 0 ? (
        <div className="p-8 rounded-2xl text-center" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>No aircraft found. Add one first.</p>
          <a href="/dashboard/aircrafts"
            className="inline-block px-5 py-2 rounded-lg text-sm font-medium hover:opacity-80 transition-opacity"
            style={{ background: "#00B4D8", color: "#0D1117" }}>
            Go to Aircrafts →
          </a>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2 mb-6">
            {aircrafts.map(a => {
              const isActive = selected === a.id;
              return (
                <button key={a.id}
                  onClick={() => setSelected(a.id)}
                  className="flex items-center gap-4 px-4 py-3 rounded-xl text-left transition-all"
                  style={{
                    background: isActive ? "rgba(0,180,216,0.08)" : "var(--bg-card)",
                    border: `1px solid ${isActive ? "#00B4D8" : "var(--border)"}`,
                  }}>
                  {/* Thumbnail */}
                  <div className="w-16 h-11 rounded-lg overflow-hidden shrink-0"
                    style={{ background: "#0D1117", border: "1px solid #30363D" }}>
                    {a.imageDataUrl
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={a.imageDataUrl} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-lg">✈️</div>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold" style={{ color: isActive ? "#00B4D8" : "var(--text-primary)" }}>
                      {a.name}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                      {a.registration && `${a.registration} · `}
                      {a.cockpitType === "multi" ? "Multi Pilot" : "Single Pilot"}
                      {a.imageDataUrl ? " · cockpit image saved" : " · no image yet"}
                    </p>
                  </div>
                  {isActive && (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <circle cx="8" cy="8" r="7" stroke="#00B4D8" strokeWidth="1.5"/>
                      <path d="M5 8l2.5 2.5L11 5.5" stroke="#00B4D8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => ac && onPicked(ac.id, ac.imageDataUrl)}
            disabled={!selected}
            className="w-full py-3 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-30"
            style={{ background: "#00B4D8", color: "#0D1117" }}>
            {ac?.imageDataUrl ? "Open Flow Creator →" : "Continue — upload cockpit image →"}
          </button>
        </>
      )}
    </div>
  );
}

/* ─── CreatorPhase ─── */
function CreatorPhase({ imageDataUrl, initialName, initialAircraftId, initialCollabRoom, collabRole, initialCockpitType }: {
  imageDataUrl: string;
  initialName: string;
  initialAircraftId?: string;
  initialCollabRoom?: string;
  collabRole?: "host" | "guest";
  initialCockpitType?: "single" | "multi";
}) {
  const [flowName, setFlowName] = useState(initialName);
  const [steps, setSteps] = useState<FlowStep[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [aircrafts, setAircrafts] = useState<Aircraft[]>([]);
  const [saved, setSaved] = useState(false);
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
  const [selectedAircraftId, setSelectedAircraftId] = useState<string>(initialAircraftId ?? "");
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
  const [collabRoom, setCollabRoom] = useState<string | null>(initialCollabRoom ?? null);
  const [showCollabPopover, setShowCollabPopover] = useState(false);
  const [collabCopied, setCollabCopied] = useState(false);
  const [hostDisconnected, setHostDisconnected] = useState(false);
  const broadcastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSelfUpdate = useRef(false);

  /* Subscribe to Pusher collab channel */
  useEffect(() => {
    if (!collabRoom) return;
    const pusher = getPusherClient();
    const channel = pusher.subscribe(`presence-collab-${collabRoom}`);
    channel.bind("pusher:member_removed", () => {
      if (collabRole === "guest") setHostDisconnected(true);
    });
    channel.bind("collab:flow-update", (data: {
      senderId: string;
      steps: FlowStep[];
      annotations: FlowAnnotation[];
      sequenceOrder: string[];
      flowName: string;
    }) => {
      isSelfUpdate.current = true;
      setSteps(data.steps);
      setAnnotations(data.annotations);
      setSequenceOrder(data.sequenceOrder);
      setFlowName(data.flowName);
      setTimeout(() => { isSelfUpdate.current = false; }, 0);
    });
    return () => {
      channel.unbind_all();
      pusher.unsubscribe(`presence-collab-${collabRoom}`);
    };
  }, [collabRoom]);

  /* Broadcast flow state when anything changes (debounced 400ms) */
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
          socketId: getPusherClient().connection.socket_id ?? "",
        }),
      });
    }, 400);
  }, [collabRoom]);

  async function startCollab() {
    // Upload current image + flow state then create room
    const res = await fetch("/api/collab/room", { method: "POST" });
    const { roomCode } = await res.json();
    await fetch("/api/collab/flow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roomCode,
        flow: { steps, annotations, sequenceOrder, imageDataUrl, flowName, aircraftId: selectedAircraftId, cockpitType: selectedAircraft?.cockpitType ?? "single" },
      }),
    });
    setCollabRoom(roomCode);
    setShowCollabPopover(true);
  }

  useEffect(() => {
    const list = getAircrafts();
    setAircrafts(list);
    if (!initialAircraftId && list.length > 0) setSelectedAircraftId(list[0].id);
  }, [initialAircraftId]);

  useEffect(() => {
    if (!imgRef.current) return;
    const { width, height } = imgRef.current.getBoundingClientRect();
    if (width > 0) { setCanvasW(width); setCanvasH(height); }
  });

  const selectedAircraft = aircrafts.find(a => a.id === selectedAircraftId);
  const isMultiPilot = (selectedAircraft?.cockpitType ?? initialCockpitType ?? "single") === "multi";

  function pushHistory(snapshot: FlowStep[]) {
    setHistory(prev => [...prev, snapshot]);
  }

  function handleUndo() {
    setHistory(prev => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      const snapshot = next.pop()!;
      setSteps(snapshot);
      broadcastState(snapshot, annotations, sequenceOrder, flowName);
      return next;
    });
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
    const id = crypto.randomUUID();
    pushHistory(steps);
    const newStep: FlowStep = { id, x, y, label: `Step ${steps.length + 1}`, action: "", role: isMultiPilot ? "PF" : undefined };
    const nextSteps = [...steps, newStep];
    const nextOrder = [...sequenceOrder, id];
    setSteps(nextSteps);
    setSequenceOrder(nextOrder);
    setSelected(id);
    broadcastState(nextSteps, annotations, nextOrder, flowName);
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
    }
    if (tool === "draw" && isDrawingRef.current) {
      const { x, y } = getCanvasPct(e);
      const next: [number, number][] = [...currentDrawRef.current, [x, y]];
      currentDrawRef.current = next;
      setLiveDrawPoints(next);
    }
  }

  function handleMouseUp() {
    const wasDragging = draggingRef.current;
    draggingRef.current = null;
    if (wasDragging) {
      broadcastState(steps, annotations, sequenceOrder, flowName);
    }
    if (tool === "draw" && isDrawingRef.current) {
      isDrawingRef.current = false;
      if (currentDrawRef.current.length > 1) {
        const annId = crypto.randomUUID();
        const newAnn: FlowAnnotation = { type: "draw", id: annId, points: currentDrawRef.current, color: activeColor, width: activeWidth };
        const nextAnnotations = [...annotations, newAnn];
        const nextOrder = [...sequenceOrder, annId];
        setAnnotations(nextAnnotations);
        setSequenceOrder(nextOrder);
        broadcastState(steps, nextAnnotations, nextOrder, flowName);
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
      broadcastState(steps, nextAnnotations, nextOrder, flowName);
    }
  }

  function handleClearAnnotations() {
    const annIds = new Set(annotations.map(a => a.id));
    const nextOrder = sequenceOrder.filter(id => !annIds.has(id));
    setAnnotations([]);
    setSequenceOrder(nextOrder);
    broadcastState(steps, [], nextOrder, flowName);
  }

  function updateStep(id: string, field: keyof FlowStep, value: string | boolean) {
    pushHistory(steps);
    const nextSteps = steps.map(s => s.id === id ? { ...s, [field]: value } : s);
    setSteps(nextSteps);
    broadcastState(nextSteps, annotations, sequenceOrder, flowName);
  }

  function deleteStep(id: string) {
    pushHistory(steps);
    const nextSteps = steps.filter(s => s.id !== id);
    const nextOrder = sequenceOrder.filter(sid => sid !== id);
    setSteps(nextSteps);
    setSequenceOrder(nextOrder);
    if (selected === id) setSelected(null);
    broadcastState(nextSteps, annotations, nextOrder, flowName);
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
    if (steps.some(s => s.id === dragId)) {
      pushHistory(steps);
      const orderedStepIds = newOrder.filter(id => steps.some(s => s.id === id));
      setSteps(orderedStepIds.map(id => steps.find(s => s.id === id)!));
    }
  }

  async function handleSave(name: string, aircraftId: string, emergency: boolean) {
    const compressed = await compressImage(imageDataUrl);
    saveFlow({
      id: crypto.randomUUID(),
      name,
      aircraftId,
      steps,
      annotations,
      sequenceOrder,
      imageDataUrl: compressed,
      createdAt: new Date().toISOString(),
      emergency,
    });
    setFlowName(name);
    setShowModal(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  const selectedStep = steps.find(s => s.id === selected);

  const previewFlow: SavedFlow = {
    id: "preview",
    name: flowName || "Preview",
    aircraftId: selectedAircraftId,
    steps,
    annotations,
    sequenceOrder,
    imageDataUrl,
    createdAt: new Date().toISOString(),
  };

  return (
    <>
      {hostDisconnected && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.75)" }}>
          <div className="px-10 py-8 rounded-2xl text-center max-w-sm"
            style={{ background: "#161B22", border: "1px solid rgba(230,57,70,0.4)" }}>
            <p className="text-3xl mb-3">⚠️</p>
            <p className="text-lg font-bold mb-2">Host disconnected</p>
            <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
              The co-edit session has ended. Your changes were not saved.
            </p>
            <a href="/dashboard/flows"
              className="inline-block px-6 py-2.5 rounded-xl text-sm font-semibold"
              style={{ background: "#00B4D8", color: "#0D1117" }}>
              Back to My Flows
            </a>
          </div>
        </div>
      )}
      {showModal && (
        <SaveModal
          flowName={flowName}
          aircrafts={aircrafts}
          initialAircraftId={selectedAircraftId}
          onSave={handleSave}
          onClose={() => setShowModal(false)}
        />
      )}
      {reviewing && (
        <FlowPlayer flow={previewFlow} aircraft={selectedAircraft} onClose={() => setReviewing(false)} />
      )}

      <div className="flex" style={{ height: "calc(100vh - 57px)", overflow: "hidden" }}>
        {/* Image canvas */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top bar */}
          <div className="flex items-center gap-4 px-6 py-3 shrink-0"
            style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-secondary)" }}>
            <input value={flowName} onChange={e => setFlowName(e.target.value)}
              placeholder="Flow name…"
              className="flex-1 bg-transparent text-sm font-semibold outline-none"
              style={{ color: "var(--text-primary)" }} />
            {aircrafts.length > 0 && (
              <select
                value={selectedAircraftId}
                onChange={e => setSelectedAircraftId(e.target.value)}
                className="text-xs px-2 py-1.5 rounded-lg shrink-0"
                style={{ background: "#0D1117", border: "1px solid #30363D", color: "var(--text-secondary)", outline: "none", maxWidth: 160 }}>
                {aircrafts.map(ac => (
                  <option key={ac.id} value={ac.id}>
                    {ac.name}{ac.registration ? ` (${ac.registration})` : ""}
                  </option>
                ))}
              </select>
            )}
            {isMultiPilot && (
              <span className="text-xs px-2 py-1 rounded-md shrink-0"
                style={{ background: "rgba(0,180,216,0.1)", color: "#00B4D8", border: "1px solid #00B4D830" }}>
                Multi Pilot
              </span>
            )}
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
            {selectedAircraftId && (
              <a href={`/dashboard/quizzes?aircraft=${selectedAircraftId}`}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:opacity-80 shrink-0"
                style={{ background: "rgba(0,180,216,0.12)", border: "1px solid rgba(0,180,216,0.3)", color: "#00B4D8" }}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.4"/>
                  <path d="M4.5 4.5a1.5 1.5 0 113 0c0 1-1.5 1.5-1.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                  <circle cx="6" cy="9.5" r="0.6" fill="currentColor"/>
                </svg>
                Quiz
              </a>
            )}
            {saved ? (
              <span className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium"
                style={{ background: "rgba(46,204,113,0.15)", color: "#2ECC71", border: "1px solid rgba(46,204,113,0.3)" }}>
                ✓ Saved
              </span>
            ) : (
              <button onClick={() => setShowModal(true)}
                className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all hover:opacity-90"
                style={{ background: "#00B4D8", color: "#0D1117" }}>
                Save flow
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
            <div className="relative">
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
                  <circle cx="5" cy="4" r="2.2" stroke="currentColor" strokeWidth="1.4"/>
                  <circle cx="10" cy="4" r="2.2" stroke="currentColor" strokeWidth="1.4"/>
                  <path d="M1 11.5c0-2 1.8-3.5 4-3.5s4 1.5 4 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                  <path d="M10 8c1.2.3 2.5 1.4 2.5 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                </svg>
                {collabRoom ? "Collab: ON" : "Collaborate"}
              </button>

              {showCollabPopover && collabRoom && (
                <div className="absolute top-9 left-0 z-30 rounded-xl p-4 w-64"
                  style={{ background: "#0D1117", border: "1px solid var(--border)", boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>
                  <p className="text-xs font-semibold mb-1" style={{ color: "var(--text-primary)" }}>Room code</p>
                  <p className="text-xs mb-3" style={{ color: "var(--text-secondary)" }}>
                    Partner opens: <span className="font-mono" style={{ color: "#00B4D8" }}>/dashboard/flows/new?collab={collabRoom}</span>
                  </p>
                  <div className="flex items-center gap-2 mb-3">
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
                      className="px-2 py-2 rounded-lg text-xs font-semibold transition-all"
                      style={{ background: collabCopied ? "rgba(46,204,113,0.15)" : "rgba(255,255,255,0.05)", color: collabCopied ? "#2ECC71" : "var(--text-secondary)", border: "1px solid var(--border)" }}>
                      {collabCopied ? "✓" : "Copy"}
                    </button>
                  </div>
                  <button onClick={() => setShowCollabPopover(false)} className="text-xs w-full text-center" style={{ color: "var(--text-secondary)" }}>Close</button>
                </div>
              )}
            </div>

            <span className="ml-1 text-xs" style={{ color: "var(--text-secondary)" }}>
              {tool === "add" ? "Click on the image to place a step marker" : tool === "move" ? "Drag a marker to reposition it" : tool === "text" ? "Click on the image to add text" : "Click and drag to draw"}
            </span>
          </div>

          {/* Image */}
          <div ref={imgRef} onClick={hostDisconnected ? undefined : handleImageClick}
            onMouseDown={hostDisconnected ? undefined : handleMouseDown}
            onMouseMove={hostDisconnected ? undefined : handleMouseMove}
            onMouseUp={hostDisconnected ? undefined : handleMouseUp}
            onMouseLeave={hostDisconnected ? undefined : handleMouseUp}
            className="relative flex-1 overflow-hidden"
            style={{
              cursor: tool === "move" ? (draggingRef.current ? "grabbing" : "grab") : tool === "draw" ? "crosshair" : tool === "text" ? "text" : "crosshair",
              background: "#0D1117",
              userSelect: "none",
            }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageDataUrl} alt="Cockpit"
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
                  const anim = { animation: "draw-step-line 0.5s cubic-bezier(0.4,0,0.2,1) forwards" };
                  return (
                    <path key={`${prev.id}-${step.id}`}
                      d={d} fill="none" stroke="#5A6478" strokeWidth="0.35"
                      pathLength="1" strokeDasharray="1" strokeDashoffset="1"
                      markerEnd="url(#step-arrow)"
                      style={anim} />
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
                  const newAnn: FlowAnnotation = { type: "text", id: annId, x: pendingText.x, y: pendingText.y, text, color: activeColor };
                  const nextAnnotations = [...annotations, newAnn];
                  const nextOrder = [...sequenceOrder, annId];
                  setAnnotations(nextAnnotations);
                  setSequenceOrder(nextOrder);
                  broadcastState(steps, nextAnnotations, nextOrder, flowName);
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
                {/* Number circle — centered exactly on click point */}
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
                {/* Label — anchored to the right of the circle, not shifting it */}
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
                {/* toggle pill */}
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
                Click on the image to add a step, then select it to edit its label and action.
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
                        onClick={e => { e.stopPropagation(); const id = itemId; const na = annotations.filter(a => a.id !== id); const no = sequenceOrder.filter(s => s !== id); setAnnotations(na); setSequenceOrder(no); broadcastState(steps, na, no, flowName); }}
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

/* ─── Main ─── */
export default function FlowCreatorApp() {
  const searchParams = useSearchParams();
  const collabParam = searchParams.get("collab");

  const [phase, setPhase] = useState<"pick" | "upload" | "create" | "collab-loading">(
    collabParam ? "collab-loading" : "pick"
  );
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageName, setImageName] = useState("");
  const [aircraftId, setAircraftId] = useState<string>("");
  const [collabFlowData, setCollabFlowData] = useState<{ steps: FlowStep[]; annotations: FlowAnnotation[]; sequenceOrder: string[]; imageDataUrl: string; flowName: string; aircraftId: string; cockpitType?: "single" | "multi" } | null>(null);

  useEffect(() => {
    if (!collabParam) return;
    fetch(`/api/collab/flow?code=${collabParam}`)
      .then(r => r.json())
      .then(({ flow }) => {
        if (flow) {
          setCollabFlowData(flow);
          setPhase("create");
        }
      });
  }, [collabParam]);

  if (phase === "collab-loading") {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm animate-pulse" style={{ color: "var(--text-secondary)" }}>Joining collab session…</p>
      </div>
    );
  }

  if (phase === "create" && (imageDataUrl || collabFlowData)) {
    const img = collabFlowData?.imageDataUrl ?? imageDataUrl!;
    const name = collabFlowData?.flowName ?? imageName;
    const acId = collabFlowData?.aircraftId ?? aircraftId;
    return (
      <CreatorPhase
        imageDataUrl={img}
        initialName={name}
        initialAircraftId={acId}
        initialCollabRoom={collabParam ?? undefined}
        collabRole={collabParam ? "guest" : undefined}
        initialCockpitType={collabFlowData?.cockpitType}
      />
    );
  }

  if (phase === "upload") {
    return (
      <UploadPhase onReady={(url, name) => {
        setImageDataUrl(url);
        setImageName(name);
        setPhase("create");
        if (aircraftId) {
          const ac = getAircrafts().find(a => a.id === aircraftId);
          if (ac) saveAircraft({ ...ac, imageDataUrl: url });
        }
      }} />
    );
  }

  return (
    <AircraftPickerPhase
      onPicked={(acId, acImage) => {
        setAircraftId(acId);
        if (acImage) {
          setImageDataUrl(acImage);
          setImageName("");
          setPhase("create");
        } else {
          setPhase("upload");
        }
      }}
    />
  );
}
