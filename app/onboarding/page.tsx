"use client";

import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const HEAR_OPTIONS = [
  { value: "social_media", label: "Social media" },
  { value: "friend",       label: "Friend / word of mouth" },
  { value: "forum",        label: "Aviation forum" },
  { value: "google",       label: "Google / search" },
  { value: "other",        label: "Other" },
];

const ROLE_OPTIONS = [
  { value: "airline_pilot",  label: "Airline pilot",           icon: "✈️" },
  { value: "student_pilot",  label: "Student pilot",           icon: "📚" },
  { value: "simulator",      label: "Simulator enthusiast",    icon: "🕹️" },
  { value: "not_pilot",      label: "Not a pilot (yet)",       icon: "👀" },
];

const LICENSE_OPTIONS = [
  { value: "atpl", label: "ATPL" },
  { value: "cpl",  label: "CPL" },
  { value: "ppl",  label: "PPL" },
  { value: "none", label: "No license" },
];

export default function OnboardingPage() {
  const { user, isLoaded } = useUser();
  const router = useRouter();

  const [hear, setHear]       = useState("");
  const [role, setRole]       = useState("");
  const [license, setLicense] = useState("");
  const [submitting, setSubmitting] = useState(false);

  /* skip if already done */
  useEffect(() => {
    if (!isLoaded || !user) return;
    if ((user.privateMetadata as Record<string, unknown>)?.survey) {
      router.replace("/dashboard");
    }
  }, [isLoaded, user, router]);

  async function handleSubmit() {
    if (!hear || !role) return;
    setSubmitting(true);
    try {
      await fetch("/api/survey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hear, role, license }),
      });
    } finally {
      router.replace("/dashboard");
    }
  }

  if (!isLoaded) return null;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-16"
      style={{ background: "#0D1117" }}>
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-10">
          <p className="text-xs font-mono mb-2" style={{ color: "#00B4D8" }}>QUICK SURVEY · 30 seconds</p>
          <h1 className="text-2xl font-bold mb-2">Welcome to CockpitCue ✈️</h1>
          <p className="text-sm" style={{ color: "#8B949E" }}>
            Help us understand who flies with us — 3 quick questions.
          </p>
        </div>

        <div className="flex flex-col gap-6">

          {/* Q1 */}
          <div className="p-6 rounded-2xl" style={{ background: "#161B22", border: "1px solid #30363D" }}>
            <p className="text-sm font-semibold mb-4">
              1. How did you hear about CockpitCue?
              <span className="ml-1" style={{ color: "#E63946" }}>*</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {HEAR_OPTIONS.map(o => (
                <button key={o.value} onClick={() => setHear(o.value)}
                  className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
                  style={{
                    background: hear === o.value ? "rgba(0,180,216,0.15)" : "rgba(255,255,255,0.03)",
                    border: `1px solid ${hear === o.value ? "#00B4D8" : "#30363D"}`,
                    color: hear === o.value ? "#00B4D8" : "#8B949E",
                  }}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* Q2 */}
          <div className="p-6 rounded-2xl" style={{ background: "#161B22", border: "1px solid #30363D" }}>
            <p className="text-sm font-semibold mb-4">
              2. Who are you?
              <span className="ml-1" style={{ color: "#E63946" }}>*</span>
            </p>
            <div className="grid grid-cols-2 gap-2">
              {ROLE_OPTIONS.map(o => (
                <button key={o.value} onClick={() => setRole(o.value)}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all"
                  style={{
                    background: role === o.value ? "rgba(0,180,216,0.12)" : "rgba(255,255,255,0.03)",
                    border: `1px solid ${role === o.value ? "#00B4D8" : "#30363D"}`,
                  }}>
                  <span>{o.icon}</span>
                  <span className="text-sm font-medium" style={{ color: role === o.value ? "#00B4D8" : "#E6EDF3" }}>
                    {o.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Q3 — optional */}
          <div className="p-6 rounded-2xl" style={{ background: "#161B22", border: "1px solid #30363D" }}>
            <p className="text-sm font-semibold mb-1">3. What license do you hold?</p>
            <p className="text-xs mb-4" style={{ color: "#8B949E" }}>Optional</p>
            <div className="flex flex-wrap gap-2">
              {LICENSE_OPTIONS.map(o => (
                <button key={o.value} onClick={() => setLicense(license === o.value ? "" : o.value)}
                  className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
                  style={{
                    background: license === o.value ? "rgba(46,204,113,0.12)" : "rgba(255,255,255,0.03)",
                    border: `1px solid ${license === o.value ? "#2ECC71" : "#30363D"}`,
                    color: license === o.value ? "#2ECC71" : "#8B949E",
                  }}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <button onClick={handleSubmit}
            disabled={!hear || !role || submitting}
            className="w-full py-3 rounded-xl text-sm font-bold transition-all hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed"
            style={{ background: "#00B4D8", color: "#0D1117" }}>
            {submitting ? "Saving…" : "Go to dashboard →"}
          </button>

          <button onClick={() => router.replace("/dashboard")}
            className="text-center text-xs transition-colors hover:text-white"
            style={{ color: "#484F58" }}>
            Skip survey
          </button>
        </div>
      </div>
    </div>
  );
}
