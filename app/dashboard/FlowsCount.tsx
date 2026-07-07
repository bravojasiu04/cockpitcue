"use client";

import { useEffect, useState } from "react";
import { getFlows } from "@/app/lib/storage";

export default function FlowsCount() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    setCount(getFlows().length);
  }, []);

  return (
    <div className="p-6 rounded-2xl"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <p className="text-xs mb-3" style={{ color: "var(--text-secondary)" }}>My Flows</p>
      <p className="text-4xl font-bold mb-1">
        {count === null ? <span style={{ opacity: 0.3 }}>—</span> : count}
      </p>
      <p className="text-xs" style={{ color: "var(--text-secondary)" }}>flows created</p>
    </div>
  );
}
