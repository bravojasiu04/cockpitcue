"use client";

import { useEffect, useState } from "react";
import { getFlows } from "@/app/lib/storage";

export default function DashboardCTA() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    setCount(getFlows().length);
  }, []);

  if (count === null || count > 0) return null;

  return (
    <div className="p-10 rounded-2xl text-center"
      style={{ background: "rgba(0,180,216,0.05)", border: "1px dashed #00B4D840" }}>
      <div className="text-4xl mb-4">🛩️</div>
      <h2 className="text-xl font-semibold mb-2">Create your first flow</h2>
      <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
        Upload your cockpit layout and start building memory items.
      </p>
      <a
        href="/dashboard/flows"
        className="inline-block px-6 py-3 rounded-xl font-medium text-sm transition-all hover:opacity-90"
        style={{ background: "#00B4D8", color: "#0D1117" }}>
        + New Flow
      </a>
    </div>
  );
}
