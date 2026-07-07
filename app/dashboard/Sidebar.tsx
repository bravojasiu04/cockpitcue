"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/dashboard",              label: "Overview",         icon: "🏠" },
  { href: "/dashboard/flows",        label: "My Flows",         icon: "🗂️" },
  { href: "/dashboard/aircrafts",    label: "Aircrafts",        icon: "✈️" },
  { href: "/dashboard/quizzes",      label: "Quizzes",          icon: "🎯" },
  { href: "/dashboard/history",      label: "History",          icon: "📋" },
  { href: "/dashboard/subscription", label: "My Subscription",  icon: "💳" },
  { href: "/dashboard/settings",     label: "Settings",         icon: "⚙️" },
];

const DISABLED_ITEMS = [
  { label: "Support",  icon: "🆘" },
  { label: "Feedback", icon: "💬" },
];

export default function DashboardSidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="hidden md:flex flex-col w-60 shrink-0 px-4 py-8 gap-1"
      style={{ borderRight: "1px solid var(--border)", background: "rgba(13,17,23,0.6)" }}
    >
      {NAV_ITEMS.map(item => {
        const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors"
            style={{
              background: active ? "rgba(0,180,216,0.1)" : "transparent",
              color: active ? "#00B4D8" : "var(--text-secondary)",
              border: active ? "1px solid #00B4D840" : "1px solid transparent",
            }}
          >
            <span aria-hidden>{item.icon}</span>
            {item.label}
          </Link>
        );
      })}

      <div className="my-2" style={{ borderTop: "1px solid var(--border)" }} />

      {DISABLED_ITEMS.map(item => (
        <div
          key={item.label}
          className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-sm font-medium cursor-not-allowed"
          style={{ color: "#3D444D", border: "1px solid transparent" }}
          title="Coming soon"
        >
          <div className="flex items-center gap-3">
            <span aria-hidden style={{ opacity: 0.4 }}>{item.icon}</span>
            {item.label}
          </div>
          <span className="text-xs px-1.5 py-0.5 rounded font-bold"
            style={{ background: "rgba(255,255,255,0.04)", color: "#3D444D", border: "1px solid #30363D" }}>
            soon
          </span>
        </div>
      ))}
    </aside>
  );
}
