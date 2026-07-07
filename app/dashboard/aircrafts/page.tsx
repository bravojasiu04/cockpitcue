"use client";

import { useEffect, useRef, useState } from "react";
import { getAircrafts, saveAircraft, deleteAircraft, type Aircraft } from "@/app/lib/storage";
import { usePlan } from "@/app/lib/usePlan";
import Link from "next/link";

type ToggleOption<T extends string> = { value: T; label: string; icon: string };

function ToggleGroup<T extends string>({
  value, onChange, options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: ToggleOption<T>[];
}) {
  return (
    <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid #30363D" }}>
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-all"
          style={{
            background: value === opt.value ? "rgba(0,180,216,0.15)" : "#0D1117",
            color: value === opt.value ? "#00B4D8" : "var(--text-secondary)",
            borderRight: opt.value !== options[options.length - 1].value ? "1px solid #30363D" : undefined,
          }}>
          <span>{opt.icon}</span>
          {opt.label}
        </button>
      ))}
    </div>
  );
}

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

export default function AircraftsPage() {
  const [aircrafts, setAircrafts] = useState<Aircraft[]>([]);
  const [name, setName] = useState("");
  const [registration, setRegistration] = useState("");
  const [cockpitType, setCockpitType] = useState<"single" | "multi">("single");
  const [engineType, setEngineType] = useState<"single" | "multi">("single");
  const [newImage, setNewImage] = useState<string | undefined>();
  const [error, setError] = useState("");
  const addImgRef = useRef<HTMLInputElement>(null);

  const { isPremium } = usePlan();
  const aircraftLocked = !isPremium && aircrafts.length >= 1;

  useEffect(() => { setAircrafts(getAircrafts()); }, []);

  async function handleNewImage(file: File | undefined) {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = async e => {
      const compressed = await compressImage(e.target!.result as string);
      setNewImage(compressed);
    };
    reader.readAsDataURL(file);
  }

  function handleAdd() {
    if (!name.trim()) { setError("Aircraft name is required."); return; }
    const ac: Aircraft = {
      id: crypto.randomUUID(),
      name: name.trim(),
      registration: registration.trim(),
      cockpitType,
      engineType,
      imageDataUrl: newImage,
    };
    saveAircraft(ac);
    setAircrafts(getAircrafts());
    setName(""); setRegistration(""); setCockpitType("single"); setEngineType("single");
    setNewImage(undefined); setError("");
  }

  function handleDelete(id: string) {
    deleteAircraft(id);
    setAircrafts(getAircrafts());
  }

  function handleShare(ac: Aircraft) {
    const { imageDataUrl: _img, ...acData } = ac;
    const payload = { type: "aircraft", version: 1, aircraft: acData };
    const url = `${window.location.origin}/import?d=${btoa(JSON.stringify(payload))}`;
    navigator.clipboard.writeText(url).then(() => alert("Share link copied to clipboard!"));
  }

  async function handleUpdateImage(ac: Aircraft, file: File | undefined) {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = async e => {
      const compressed = await compressImage(e.target!.result as string);
      saveAircraft({ ...ac, imageDataUrl: compressed });
      setAircrafts(getAircrafts());
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="max-w-4xl mx-auto px-6 md:px-10 py-16">
      <div className="mb-10">
        <p className="text-sm font-mono mb-2" style={{ color: "#00B4D8" }}>AIRCRAFTS</p>
        <h1 className="text-3xl font-bold mb-2">Your aircraft</h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Add the aircraft you fly and upload a cockpit image — it will be automatically loaded in the Flow Creator.
        </p>
      </div>

      {/* Add form */}
      <div className="p-6 rounded-2xl mb-8"
        style={{
          background: "var(--bg-card)",
          border: aircraftLocked ? "1px solid rgba(247,127,0,0.3)" : "1px solid var(--border)",
        }}>
        {aircraftLocked ? (
          <div className="text-center py-4">
            <div className="text-3xl mb-3">🔒</div>
            <p className="text-sm font-semibold mb-1">Aircraft limit reached</p>
            <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
              Free plan allows 1 aircraft. Upgrade to Premium for unlimited aircraft.
            </p>
            <Link href="/dashboard/subscription"
              className="inline-block px-5 py-2 rounded-lg text-sm font-medium transition-all hover:opacity-90"
              style={{ background: "#F77F00", color: "#0D1117" }}>
              Upgrade to Premium
            </Link>
          </div>
        ) : (
        <>
        <p className="text-sm font-semibold mb-4">Add new aircraft</p>

        <div className="flex flex-col md:flex-row gap-3 mb-4">
          <div className="flex-1">
            <label className="block text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
              Aircraft type / name <span style={{ color: "#E63946" }}>*</span>
            </label>
            <input
              value={name}
              onChange={e => { setName(e.target.value); setError(""); }}
              placeholder="e.g. Tecnam P2008JC"
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ background: "#0D1117", border: `1px solid ${error ? "#E63946" : "#30363D"}`, color: "var(--text-primary)", outline: "none" }}
            />
            {error && <p className="text-xs mt-1" style={{ color: "#E63946" }}>{error}</p>}
          </div>
          <div className="w-full md:w-40">
            <label className="block text-xs mb-1" style={{ color: "var(--text-secondary)" }}>ICAO code</label>
            <input
              value={registration}
              onChange={e => setRegistration(e.target.value)}
              placeholder="e.g. P208"
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ background: "#0D1117", border: "1px solid #30363D", color: "var(--text-primary)", outline: "none" }}
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="flex-1">
            <label className="block text-xs mb-1.5" style={{ color: "var(--text-secondary)" }}>Cockpit</label>
            <ToggleGroup
              value={cockpitType} onChange={setCockpitType}
              options={[
                { value: "single", label: "Single Pilot", icon: "🧑‍✈️" },
                { value: "multi",  label: "Multi Pilot",  icon: "👨‍✈️👩‍✈️" },
              ]}
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs mb-1.5" style={{ color: "var(--text-secondary)" }}>Engine</label>
            <ToggleGroup
              value={engineType} onChange={setEngineType}
              options={[
                { value: "single", label: "Single Engine", icon: "🔧" },
                { value: "multi",  label: "Multi Engine",  icon: "⚙️" },
              ]}
            />
          </div>
        </div>

        {/* Cockpit image upload */}
        <div className="mb-5">
          <label className="block text-xs mb-1.5" style={{ color: "var(--text-secondary)" }}>
            Cockpit image <span style={{ color: "var(--text-secondary)", fontWeight: 400 }}>(optional — used in Flow Creator)</span>
          </label>
          <input ref={addImgRef} type="file" accept="image/*" className="hidden"
            onChange={e => handleNewImage(e.target.files?.[0])} />
          {newImage ? (
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={newImage} alt="preview" className="w-24 h-16 rounded-lg object-cover"
                style={{ border: "1px solid var(--border)" }} />
              <button onClick={() => setNewImage(undefined)}
                className="text-xs px-3 py-1.5 rounded-lg transition-opacity hover:opacity-70"
                style={{ background: "rgba(230,57,70,0.1)", color: "#E63946", border: "1px solid rgba(230,57,70,0.2)" }}>
                Remove
              </button>
            </div>
          ) : (
            <button onClick={() => addImgRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm transition-all hover:opacity-80"
              style={{ background: "#0D1117", border: "1px dashed #30363D", color: "var(--text-secondary)" }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
              Upload cockpit image
            </button>
          )}
        </div>

        <button onClick={handleAdd}
          className="px-5 py-2 rounded-lg text-sm font-medium transition-all hover:opacity-90"
          style={{ background: "#00B4D8", color: "#0D1117" }}>
          + Add aircraft
        </button>
        </>
        )}
      </div>

      {/* Aircraft list */}
      {aircrafts.length === 0 ? (
        <div className="p-8 rounded-2xl text-center"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>No aircraft added yet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {aircrafts.map(ac => (
            <AircraftCard key={ac.id} ac={ac} onDelete={handleDelete} onUpdateImage={handleUpdateImage} onShare={handleShare} />
          ))}
        </div>
      )}
    </div>
  );
}

function AircraftCard({
  ac, onDelete, onUpdateImage, onShare,
}: {
  ac: Aircraft;
  onDelete: (id: string) => void;
  onUpdateImage: (ac: Aircraft, file: File | undefined) => void;
  onShare: (ac: Aircraft) => void;
}) {
  const imgRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex items-center gap-4 px-5 py-4 rounded-xl"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>

      {/* Cockpit image thumbnail / upload trigger */}
      <button
        onClick={() => imgRef.current?.click()}
        title={ac.imageDataUrl ? "Change cockpit image" : "Upload cockpit image"}
        className="relative shrink-0 w-20 h-14 rounded-lg overflow-hidden transition-all group"
        style={{
          background: "#0D1117",
          border: `1px solid ${ac.imageDataUrl ? "var(--border)" : "#30363D"}`,
        }}>
        <input ref={imgRef} type="file" accept="image/*" className="hidden"
          onChange={e => onUpdateImage(ac, e.target.files?.[0])} />
        {ac.imageDataUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={ac.imageDataUrl} alt="cockpit" className="w-full h-full object-cover" />
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ background: "rgba(0,0,0,0.55)" }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M2 11L6 7l3 3 2-2 3 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="5" cy="5" r="1.5" fill="white"/>
              </svg>
            </div>
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-1">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M9 4v10M4 9h10" stroke="#30363D" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
            <span className="text-xs" style={{ color: "#3D444D" }}>Add image</span>
          </div>
        )}
      </button>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{ac.name}</p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {ac.registration && (
            <span className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>{ac.registration}</span>
          )}
          {ac.registration && <span style={{ color: "#30363D" }}>·</span>}
          <span className="text-xs px-2 py-0.5 rounded-md"
            style={{ background: "rgba(0,180,216,0.08)", color: "#00B4D8", border: "1px solid #00B4D820" }}>
            {ac.cockpitType === "single" ? "Single Pilot" : "Multi Pilot"}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-md"
            style={{ background: "rgba(247,127,0,0.08)", color: "#F77F00", border: "1px solid rgba(247,127,0,0.2)" }}>
            {ac.engineType === "single" ? "Single Engine" : "Multi Engine"}
          </span>
        </div>
      </div>

      <button onClick={() => onShare(ac)}
        className="text-xs px-3 py-1.5 rounded-lg transition-all hover:opacity-80 shrink-0"
        style={{ background: "rgba(46,204,113,0.08)", color: "#2ECC71", border: "1px solid rgba(46,204,113,0.2)" }}>
        Share
      </button>
      <button onClick={() => onDelete(ac.id)}
        className="text-xs px-3 py-1.5 rounded-lg transition-all hover:opacity-80 shrink-0"
        style={{ background: "rgba(230,57,70,0.1)", color: "#E63946", border: "1px solid rgba(230,57,70,0.2)" }}>
        Remove
      </button>
    </div>
  );
}
