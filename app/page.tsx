"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { SignInButton, SignUpButton, Show, UserButton } from "@clerk/nextjs";

/* ─── icons ─── */
function IconTimer() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" /><polyline points="12 6 12 12 16 14" />
    </svg>
  );
}
function IconUpload() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}
function IconClick() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 9l-3 9 4-2 2 4 3-9" /><path d="M12 3v2M21 12h-2M18.36 5.64l-1.41 1.41" />
    </svg>
  );
}
function IconShare() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}
function IconCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/* ─── cockpit demo ─── */
const DEMO_STEPS = [
  { x: 11.6, y: 53.8, label: "Fuel Pump",      action: "OFF" },
  { x: 87.0, y: 14.4, label: "Flaps",          action: "UP" },
  { x: 82.2, y: 57.0, label: "Landing Lights", action: "OFF" },
  { x: 77.4, y: 19.8, label: "Parameters",     action: "CHECKED" },
];

function CockpitDemo() {
  const [active, setActive]     = useState(-1);
  const [done, setDone]         = useState<number[]>([]);
  const [quizMode, setQuizMode] = useState(false);
  const [timer, setTimer]       = useState(15);
  const [quizDone, setQuizDone] = useState(false);

  useEffect(() => {
    if (quizMode) return;
    const id = setInterval(() => {
      setActive(prev => {
        const next = prev + 1;
        if (next >= DEMO_STEPS.length) {
          setTimeout(() => {
            setActive(-1);
            setDone([]);
            setTimeout(() => setQuizMode(true), 800);
          }, 1400);
          return prev;
        }
        setDone(d => [...d, next]);
        return next;
      });
    }, 900);
    return () => clearInterval(id);
  }, [quizMode]);

  useEffect(() => {
    if (!quizMode || quizDone) return;
    if (timer <= 0) { setQuizDone(true); return; }
    const id = setInterval(() => setTimer(t => t - 1), 1000);
    return () => clearInterval(id);
  }, [quizMode, timer, quizDone]);

  const handleQuizClick = (i: number) => {
    if (!quizMode || quizDone) return;
    if (i === done.length) {
      const nd = [...done, i];
      setDone(nd);
      if (nd.length === DEMO_STEPS.length) setQuizDone(true);
    }
  };

  const reset = () => {
    setQuizMode(false); setActive(-1); setDone([]); setTimer(15); setQuizDone(false);
  };

  const timerPct   = (timer / 15) * 100;
  const timerColor = timer > 8 ? "#00B4D8" : timer > 4 ? "#F77F00" : "#E63946";
  const allCorrect = quizDone && done.length === DEMO_STEPS.length;

  return (
    <div className="relative w-full max-w-lg mx-auto select-none">
      <div className="flex items-center gap-2 mb-3">
        <span
          className="text-xs font-mono px-2 py-1 rounded"
          style={{
            background: quizMode ? "rgba(247,127,0,0.15)" : "rgba(0,180,216,0.15)",
            color: quizMode ? "#F77F00" : "#00B4D8",
            border: `1px solid ${quizMode ? "#F77F0040" : "#00B4D840"}`,
          }}
        >
          {quizMode ? "● QUIZ MODE" : "● EDITOR MODE"}
        </span>
        {quizMode && !quizDone && (
          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
            Click steps in order from memory
          </span>
        )}
      </div>

      {/* panel */}
      <div
        className="relative w-full rounded-xl overflow-hidden"
        style={{
          aspectRatio: "1600/1099",
          backgroundImage: "url('/p2008jc-cockpit.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          border: "1px solid var(--border)",
        }}
      >
        <div className="absolute inset-0" style={{ background: "rgba(13,17,23,0.15)" }} />

        {DEMO_STEPS.map((step, i) => {
          const isDone    = done.includes(i);
          const isCurrent = active === i && !quizMode;
          const isNext    = quizMode && !quizDone && done.length === i;
          return (
            <button
              key={i}
              onClick={() => handleQuizClick(i)}
              className="absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-300"
              style={{ left: `${step.x}%`, top: `${step.y}%`, cursor: quizMode ? "pointer" : "default" }}
            >
              <div
                className="relative flex items-center justify-center rounded-full transition-all duration-300"
                style={{
                  width: isCurrent || isNext ? 28 : 22,
                  height: isCurrent || isNext ? 28 : 22,
                  background: isDone
                    ? quizMode ? "rgba(46,204,113,0.2)" : "rgba(0,180,216,0.2)"
                    : "rgba(13,17,23,0.8)",
                  border: `2px solid ${isDone ? (quizMode ? "#2ECC71" : "#00B4D8") : isNext ? "#F77F00" : "#30363D"}`,
                  boxShadow: (isCurrent || isNext) && !isDone
                    ? `0 0 12px ${isNext ? "#F77F0080" : "#00B4D880"}`
                    : isDone ? `0 0 6px ${quizMode ? "#2ECC7140" : "#00B4D840"}` : "none",
                }}
              >
                <span className="font-mono font-bold" style={{ fontSize: 10, color: isDone ? (quizMode ? "#2ECC71" : "#00B4D8") : isNext ? "#F77F00" : "#6B7A8D" }}>
                  {isDone ? <IconCheck /> : i + 1}
                </span>
              </div>
              {(!quizMode || isDone) && (
                <div
                  className="absolute left-8 top-1/2 -translate-y-1/2 whitespace-nowrap pointer-events-none"
                  style={{ opacity: isDone || isCurrent ? 1 : 0, transition: "opacity 0.3s" }}
                >
                  <div className="text-xs px-2 py-1 rounded" style={{ background: "rgba(22,27,34,0.95)", border: "1px solid var(--border)" }}>
                    <span style={{ color: quizMode ? "#2ECC71" : "#00B4D8" }}>{step.label}</span>
                    <span style={{ color: "var(--text-secondary)" }}> — {step.action}</span>
                  </div>
                </div>
              )}
            </button>
          );
        })}

        {quizDone && (
          <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ background: "rgba(13,17,23,0.88)" }}>
            {allCorrect ? (
              <>
                <div className="text-4xl mb-2">✅</div>
                <p className="font-bold text-lg" style={{ color: "#2ECC71" }}>Flow Complete!</p>
                <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>Completed in {15 - timer}s</p>
              </>
            ) : (
              <>
                <div className="text-4xl mb-2">⏱️</div>
                <p className="font-bold text-lg" style={{ color: "#E63946" }}>Time&apos;s Up</p>
                <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>{done.length}/{DEMO_STEPS.length} steps</p>
              </>
            )}
            <button
              onClick={reset}
              className="mt-4 text-xs px-4 py-2 rounded-lg font-medium transition-opacity hover:opacity-80"
              style={{ background: "rgba(0,180,216,0.15)", color: "#00B4D8", border: "1px solid #00B4D840" }}
            >
              Replay Demo
            </button>
          </div>
        )}
      </div>

      {quizMode && !quizDone && (
        <>
          <div className="mt-3 w-full h-1 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
            <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${timerPct}%`, background: timerColor }} />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>After Take-Off Flow — P2008JC</span>
            <span className="font-mono text-xs" style={{ color: timerColor }}>{timer}s</span>
          </div>
        </>
      )}
    </div>
  );
}


/* ─── contact form ─── */
function ContactForm() {
  const [name, setName]       = useState("");
  const [email, setEmail]     = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus]   = useState<"idle" | "loading" | "success" | "error">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message }),
      });
      setStatus(res.ok ? "success" : "error");
    } catch {
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="text-center py-12 px-6 rounded-2xl"
        style={{ background: "rgba(46,204,113,0.06)", border: "1px solid rgba(46,204,113,0.2)" }}>
        <div className="text-4xl mb-3">✅</div>
        <p className="font-semibold mb-1">Message sent!</p>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>We&apos;ll get back to you within 24 hours.</p>
      </div>
    );
  }

  const inputStyle: React.CSSProperties = {
    background: "rgba(0,180,216,0.04)",
    border: "1px solid var(--border)",
    color: "var(--text-primary)",
    outline: "none",
    transition: "border-color 0.15s",
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex gap-4">
        <div className="flex-1 flex flex-col gap-1.5">
          <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Your name</label>
          <input
            required value={name} onChange={e => setName(e.target.value)}
            placeholder="John Smith"
            className="px-4 py-3 rounded-xl text-sm"
            style={inputStyle}
            onFocus={e => (e.target.style.borderColor = "#00B4D8")}
            onBlur={e => (e.target.style.borderColor = "var(--border)")}
          />
        </div>
        <div className="flex-1 flex flex-col gap-1.5">
          <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Email address</label>
          <input
            required type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="px-4 py-3 rounded-xl text-sm"
            style={inputStyle}
            onFocus={e => (e.target.style.borderColor = "#00B4D8")}
            onBlur={e => (e.target.style.borderColor = "var(--border)")}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Message</label>
        <textarea
          required value={message} onChange={e => setMessage(e.target.value)}
          placeholder="Hi, I have a question about…"
          rows={5}
          className="px-4 py-3 rounded-xl text-sm resize-none"
          style={inputStyle}
          onFocus={e => (e.target.style.borderColor = "#00B4D8")}
          onBlur={e => (e.target.style.borderColor = "var(--border)")}
        />
      </div>

      {status === "error" && (
        <p className="text-sm" style={{ color: "#E63946" }}>Something went wrong — please try again.</p>
      )}

      <button
        type="submit" disabled={status === "loading"}
        className="py-3.5 rounded-xl text-sm font-bold transition-all hover:opacity-90 disabled:opacity-60"
        style={{ background: "#00B4D8", color: "#0D1117" }}>
        {status === "loading" ? "Sending…" : "Send message →"}
      </button>
    </form>
  );
}

/* ─── demo video ─── */
function DemoVideo() {
  const ref = useRef<HTMLVideoElement>(null);
  const [ended, setEnded] = useState(false);

  function handleClick() {
    if (!ref.current) return;
    ref.current.currentTime = 0;
    ref.current.play();
    setEnded(false);
  }

  return (
    <div className="relative rounded-2xl overflow-hidden"
      style={{ border: "1px solid var(--border)", boxShadow: "0 8px 48px rgba(0,0,0,0.5)", cursor: ended ? "pointer" : "default" }}
      onClick={ended ? handleClick : undefined}>
      <video
        ref={ref}
        src="/demo.mp4"
        autoPlay
        muted
        playsInline
        className="w-full block"
        onEnded={() => setEnded(true)}
      />
      {ended && (
        <div className="absolute inset-0 flex items-center justify-center"
          style={{ background: "rgba(13,17,23,0.55)" }}>
          <div className="flex items-center gap-3 px-5 py-3 rounded-2xl text-sm font-semibold"
            style={{ background: "rgba(0,180,216,0.15)", border: "1px solid rgba(0,180,216,0.35)", color: "#00B4D8" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M5 3l14 9-14 9V3z"/>
            </svg>
            Play again
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── page ─── */
export default function Home() {
  const features = [
    { icon: <IconUpload />, title: "Upload Your Cockpit", desc: "Upload any cockpit image — scan from your POH, screenshot from your sim, or use one of our built-in templates." },
    { icon: <IconClick />,  title: "Build Your Flow",     desc: "Click each item on your cockpit image in sequence. Add labels and actions. Save your SOP exactly how your school or instructor taught you." },
    { icon: <IconTimer />,  title: "Drill Under Pressure", desc: "Quiz mode removes all labels and starts a timer. You must recall and click each step in sequence — exactly like in the cockpit." },
    { icon: <IconShare />,  title: "Share With Your Crew", desc: "Generate a link and share your flow with your co-pilot or instructor. No account needed to review it." },
  ];

  const testimonials = [
    { name: "James R.", role: "PPL Student · Cessna 172",    text: "I used to blank on my Before Takeoff flow when ATC was rushing me. After two weeks on CockpitCue, it's automatic. The timer is what makes it real." },
    { name: "Sofia L.", role: "CPL Trainee · DA42",          text: "My school has its own SOP. I uploaded my cockpit diagram and built every flow in 20 minutes. Now I drill them daily before my sim sessions." },
    { name: "Marcus T.", role: "ATPL Student · A320 Type Rating", text: "Nothing else on the market lets you build your own flows AND drill them under time pressure. This is what we've been missing." },
  ];

  const steps = [
    { num: "01", title: "Upload your cockpit layout",   desc: "Any image works — PNG, JPG, or PDF" },
    { num: "02", title: "Click to build your flow",     desc: "Each click adds a numbered step with label + action" },
    { num: "03", title: "Drill it under pressure",      desc: "Timer starts, labels disappear — perform from memory" },
  ];

  const plans = [
    {
      name: "Free", price: "$0", period: "forever",
      features: ["1 aircraft / cockpit", "1 flow", "Practice quizzes only", "Share via link"],
      cta: "Get Started Free", highlight: false,
      badge: null, originalPrice: null,
    },
    {
      name: "Pilot", price: "$4", period: "/ month",
      features: ["Unlimited aircraft", "Unlimited flows", "Practice + Exam mode", "Progress tracking", "Share via link"],
      cta: "Upgrade Now", highlight: true,
      badge: "BETA", originalPrice: "$10",
    },
  ];

  return (
    <main>
      {/* NAVBAR */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4"
        style={{ background: "rgba(13,17,23,0.85)", backdropFilter: "blur(12px)", borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center">
          <Image src="/logo.svg" alt="CockpitCue" width={110} height={32} style={{ objectFit: "contain" }} priority />
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm" style={{ color: "var(--text-secondary)" }}>
          <a href="#how-it-works" className="hover:text-white transition-colors">How it works</a>
          <a href="#features"     className="hover:text-white transition-colors">Features</a>
          <a href="#pricing"      className="hover:text-white transition-colors">Pricing</a>
          <a href="#contact"      className="hover:text-white transition-colors">Contact</a>
        </div>
        <div className="flex items-center gap-3">
          <Show when="signed-out">
            <SignInButton mode="modal" forceRedirectUrl="https://cockpitcue.com/dashboard">
              <button className="text-sm font-medium px-4 py-2 rounded-lg transition-all hover:opacity-80"
                style={{ color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
                Sign In
              </button>
            </SignInButton>
            <SignUpButton mode="modal" forceRedirectUrl="https://cockpitcue.com/dashboard">
              <button className="text-sm font-medium px-4 py-2 rounded-lg transition-all hover:opacity-90"
                style={{ background: "#00B4D8", color: "#0D1117" }}>
                Get Started
              </button>
            </SignUpButton>
          </Show>
          <Show when="signed-in">
            <a href="/dashboard"
              className="text-sm font-medium px-4 py-2 rounded-lg transition-all hover:opacity-90"
              style={{ background: "#00B4D8", color: "#0D1117" }}>
              Dashboard
            </a>
            <UserButton appearance={{
              variables: {
                colorBackground: "#161B22",
                colorPrimary: "#00B4D8",
                colorNeutral: "#E6EDF3",
                borderRadius: "0.75rem",
              },
              elements: {
                userButtonPopoverCard: { border: "1px solid #30363D", boxShadow: "0 8px 32px rgba(0,0,0,0.6)" },
                userButtonPopoverMainIdentifier: { color: "#E6EDF3", fontWeight: "600" },
                userPreviewMainIdentifier: { color: "#E6EDF3", fontWeight: "600" },
                userPreviewSecondaryIdentifier: { color: "#8B949E" },
                userButtonPopoverActionButton: { color: "#E6EDF3" },
                userButtonPopoverActionButton__manageAccount: { color: "#E6EDF3" },
                userButtonPopoverActionButton__signOut: { color: "#E6EDF3" },
                userButtonPopoverActionButtonText: { color: "#E6EDF3" },
                userButtonPopoverFooter: { display: "none" },
              }
            }} />
          </Show>
        </div>
      </nav>

      {/* HERO */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-6 pt-24 pb-16 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: "linear-gradient(rgba(0,180,216,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(0,180,216,0.04) 1px,transparent 1px)",
          backgroundSize: "40px 40px",
        }} />
        <div className="absolute inset-0 pointer-events-none" style={{
          background: "radial-gradient(ellipse 70% 50% at 50% 40%,rgba(0,180,216,0.06) 0%,transparent 70%)",
        }} />

        <div className="animate-fade-in-up mb-6 inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium"
          style={{ background: "rgba(0,180,216,0.1)", border: "1px solid #00B4D830", color: "#00B4D8" }}>
          <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
          Now in beta — free to get started
        </div>

        <h1 className="animate-fade-in-up delay-100 text-center font-bold leading-tight mb-6"
          style={{ fontSize: "clamp(2rem,5vw,3.5rem)", maxWidth: 800 }}>
          In the air, there is no room{" "}
          <span style={{ color: "#00B4D8" }}>for learning</span> — only the presentation of{" "}
          <span style={{ color: "#00B4D8" }}>skills already acquired.</span>
        </h1>

        <p className="animate-fade-in-up delay-200 text-center text-lg mb-10"
          style={{ color: "var(--text-secondary)", maxWidth: 600 }}>
          CockpitCue is the modern platform for pilots at every level to build the muscle memory
          that makes cockpit flows automatic — saving real money on airtime and building real safety in operations.
        </p>

        <div className="animate-fade-in-up delay-300 flex flex-col sm:flex-row items-center gap-4 mb-16">
          <Show when="signed-out">
            <SignUpButton mode="modal" forceRedirectUrl="https://cockpitcue.com/dashboard">
              <button className="px-7 py-3.5 rounded-xl text-sm font-bold transition-all hover:opacity-90 active:scale-95"
                style={{ background: "#00B4D8", color: "#0D1117" }}>
                Start for free — no credit card
              </button>
            </SignUpButton>
            <SignInButton mode="modal" forceRedirectUrl="https://cockpitcue.com/dashboard">
              <button className="px-6 py-3.5 rounded-xl text-sm font-medium transition-all hover:opacity-80"
                style={{ color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
                Sign in
              </button>
            </SignInButton>
          </Show>
          <Show when="signed-in">
            <a href="/dashboard"
              className="px-7 py-3.5 rounded-xl text-sm font-bold transition-all hover:opacity-90"
              style={{ background: "#00B4D8", color: "#0D1117" }}>
              Go to Dashboard →
            </a>
          </Show>
        </div>

        <div className="w-full max-w-3xl">
          <DemoVideo />
          <p className="text-center text-xs mt-3" style={{ color: "var(--text-secondary)" }}>
            CockpitCue in action — build flows, practice, ace your checks
          </p>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="py-24 px-6" style={{ background: "var(--bg-secondary)", borderTop: "1px solid var(--border)" }}>
        <div className="max-w-5xl mx-auto">
          <p className="text-center text-xs font-mono mb-3 uppercase tracking-widest" style={{ color: "#00B4D8" }}>How it works</p>
          <h2 className="text-center text-3xl font-bold mb-16">From cockpit image to drill in minutes</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {steps.map(s => (
              <div key={s.num} className="flex flex-col items-start gap-4">
                <div className="text-4xl font-bold font-mono" style={{ color: "rgba(0,180,216,0.25)" }}>{s.num}</div>
                <div className="w-full h-px" style={{ background: "linear-gradient(90deg,#00B4D8 0%,transparent 100%)" }} />
                <h3 className="font-semibold text-lg">{s.title}</h3>
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <p className="text-center text-xs font-mono mb-3 uppercase tracking-widest" style={{ color: "#00B4D8" }}>Features</p>
          <h2 className="text-center text-3xl font-bold mb-4">Built by pilots, for pilots</h2>
          <p className="text-center mb-16 text-sm" style={{ color: "var(--text-secondary)" }}>
            Every feature exists because cockpit flows are not just a checklist — they are muscle memory under pressure.
          </p>
          <div className="grid md:grid-cols-2 gap-6">
            {features.map(f => (
              <div key={f.title} className="p-6 rounded-2xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4" style={{ background: "rgba(0,180,216,0.12)", color: "#00B4D8" }}>
                  {f.icon}
                </div>
                <h3 className="font-semibold mb-2">{f.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="py-24 px-6" style={{ background: "var(--bg-secondary)", borderTop: "1px solid var(--border)" }}>
        <div className="max-w-5xl mx-auto">
          <p className="text-center text-xs font-mono mb-3 uppercase tracking-widest" style={{ color: "#00B4D8" }}>Early feedback</p>
          <h2 className="text-center text-3xl font-bold mb-16">What pilots are saying</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map(t => (
              <div key={t.name} className="p-6 rounded-2xl flex flex-col gap-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>&ldquo;{t.text}&rdquo;</p>
                <div className="mt-auto">
                  <p className="font-medium text-sm">{t.name}</p>
                  <p className="text-xs mt-0.5" style={{ color: "#00B4D8" }}>{t.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="py-24 px-6">
        <div className="max-w-3xl mx-auto">
          <p className="text-center text-xs font-mono mb-3 uppercase tracking-widest" style={{ color: "#00B4D8" }}>Pricing</p>
          <h2 className="text-center text-3xl font-bold mb-4">Simple, honest pricing</h2>
          <p className="text-center mb-16 text-sm" style={{ color: "var(--text-secondary)" }}>Less than one hour of Hobbs time.</p>
          <div className="grid md:grid-cols-2 gap-6">
            {plans.map(p => (
              <div key={p.name} className="p-8 rounded-2xl flex flex-col gap-6 relative overflow-hidden"
                style={{
                  background: p.highlight ? "rgba(0,180,216,0.06)" : "var(--bg-card)",
                  border: `1px solid ${p.highlight ? "#00B4D8" : "var(--border)"}`,
                  boxShadow: p.highlight ? "0 0 40px rgba(0,180,216,0.08)" : "none",
                }}>
                {p.badge && (
                  <div className="absolute top-4 right-4 text-xs px-2 py-1 rounded-full font-bold"
                    style={{ background: "rgba(247,127,0,0.2)", color: "#F77F00", border: "1px solid rgba(247,127,0,0.4)" }}>
                    {p.badge}
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>{p.name}</p>
                  {p.originalPrice && (
                    <p className="text-xs line-through mb-0.5" style={{ color: "var(--text-secondary)" }}>
                      {p.originalPrice}/month
                    </p>
                  )}
                  <div className="flex items-end gap-1">
                    <span className="text-4xl font-bold" style={{ color: p.highlight ? "#F77F00" : undefined }}>{p.price}</span>
                    <span className="text-sm mb-1.5" style={{ color: "var(--text-secondary)" }}>{p.period}</span>
                  </div>
                  {p.highlight && (
                    <p className="text-xs mt-1" style={{ color: "#8B949E" }}>
                      billed <span style={{ color: "#E6EDF3", fontWeight: 600 }}>$48/year</span> · save 20% annually
                    </p>
                  )}
                </div>
                <ul className="flex flex-col gap-3 flex-1">
                  {p.features.map(f => (
                    <li key={f} className="flex items-center gap-2 text-sm">
                      <span style={{ color: "#00B4D8" }}><IconCheck /></span>{f}
                    </li>
                  ))}
                </ul>
                <Show when="signed-out">
                  <SignUpButton mode="modal" forceRedirectUrl="https://cockpitcue.com/dashboard">
                    <button className="w-full block text-center py-3 rounded-xl font-medium text-sm transition-all hover:opacity-90"
                      style={{
                        background: p.highlight ? "#00B4D8" : "rgba(0,180,216,0.1)",
                        color: p.highlight ? "#0D1117" : "#00B4D8",
                        border: p.highlight ? "none" : "1px solid #00B4D830",
                      }}>
                      {p.cta}
                    </button>
                  </SignUpButton>
                </Show>
                <Show when="signed-in">
                  <a href="/dashboard"
                    className="block text-center py-3 rounded-xl font-medium text-sm transition-all hover:opacity-90"
                    style={{
                      background: p.highlight ? "#00B4D8" : "rgba(0,180,216,0.1)",
                      color: p.highlight ? "#0D1117" : "#00B4D8",
                      border: p.highlight ? "none" : "1px solid #00B4D830",
                    }}>
                    Go to Dashboard
                  </a>
                </Show>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA — only for signed-out users */}
      <Show when="signed-out">
        <section className="py-24 px-6 relative overflow-hidden"
          style={{ background: "var(--bg-secondary)", borderTop: "1px solid var(--border)" }}>
          <div className="absolute inset-0 pointer-events-none"
            style={{ background: "radial-gradient(ellipse 60% 60% at 50% 50%,rgba(0,180,216,0.06) 0%,transparent 70%)" }} />
          <div className="max-w-2xl mx-auto text-center relative z-10">
            <p className="text-xs font-mono mb-3" style={{ color: "#00B4D8" }}>GET STARTED TODAY</p>
            <h2 className="text-3xl font-bold mb-4">Ready to make your flows automatic?</h2>
            <p className="mb-10 text-sm" style={{ color: "var(--text-secondary)" }}>
              Join pilots building safer habits before they ever leave the ground.
              Free plan available — no credit card required.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <SignUpButton mode="modal" forceRedirectUrl="https://cockpitcue.com/dashboard">
                <button className="px-8 py-4 rounded-xl text-sm font-bold transition-all hover:opacity-90 active:scale-95"
                  style={{ background: "#00B4D8", color: "#0D1117" }}>
                  Create free account →
                </button>
              </SignUpButton>
              <SignInButton mode="modal" forceRedirectUrl="https://cockpitcue.com/dashboard">
                <button className="px-6 py-4 rounded-xl text-sm font-medium transition-all hover:opacity-80"
                  style={{ color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
                  Already have an account? Sign in
                </button>
              </SignInButton>
            </div>
            <p className="text-xs mt-6" style={{ color: "var(--text-secondary)" }}>
              Free forever · No credit card · Upgrade anytime
            </p>
          </div>
        </section>
      </Show>

      {/* CONTACT */}
      <section id="contact" className="py-24 px-6" style={{ borderTop: "1px solid var(--border)" }}>
        <div className="max-w-xl mx-auto">
          <p className="text-xs font-mono mb-2 text-center" style={{ color: "#00B4D8" }}>CONTACT US</p>
          <h2 className="text-3xl font-bold text-center mb-2">Got a question?</h2>
          <p className="text-sm text-center mb-10" style={{ color: "var(--text-secondary)" }}>
            We read every message and reply within 24 hours.
          </p>
          <ContactForm />
        </div>
      </section>

      {/* FOOTER */}
      <footer className="py-8 px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs"
        style={{ borderTop: "1px solid var(--border)", color: "var(--text-secondary)" }}>
        <div className="flex items-center">
          <Image src="/logo.svg" alt="CockpitCue" width={100} height={28} style={{ objectFit: "contain" }} />
        </div>
        <p>© 2026 CockpitCue. Built for pilots, by pilots.</p>
        <div className="flex gap-4">
          <a href="#" className="hover:text-white transition-colors">Privacy</a>
          <a href="#" className="hover:text-white transition-colors">Terms</a>
        </div>
      </footer>
    </main>
  );
}
