"use client";

import { useClerk, useUser } from "@clerk/nextjs";
import { useEffect, useState } from "react";

type SubscriptionItem = {
  plan: { name: string; slug: string; isDefault: boolean; fee: { amount: number; currency: string } | null };
  status: string;
};

type Subscription = {
  subscriptionItems: SubscriptionItem[];
  nextPayment?: { date: Date; amount: { amount: number; currency: string } } | null;
  status: string;
} | null;

export default function SubscriptionPage() {
  const { user, isLoaded } = useUser();
  const clerk = useClerk();
  const [subscription, setSubscription] = useState<Subscription>(null);
  const [loadingSub, setLoadingSub] = useState(true);

  useEffect(() => {
    if (!isLoaded || !user) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (clerk as any).billing
      ?.getSubscription({})
      .then((sub: Subscription) => setSubscription(sub))
      .catch(() => setSubscription(null))
      .finally(() => setLoadingSub(false));
  }, [isLoaded, user, clerk]);

  const premiumItem = subscription?.subscriptionItems.find(
    item => !item.plan.isDefault && item.status === "active"
  );
  const isPremium = !!premiumItem;
  const nextPaymentDate = subscription?.nextPayment?.date;
  const nextPaymentAmount = subscription?.nextPayment?.amount;

  if (!isLoaded || loadingSub) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 rounded-full border-2 animate-spin"
          style={{ borderColor: "#00B4D8 transparent #00B4D8 #00B4D8" }} />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-12 px-4">
      <p className="text-xs font-mono mb-1" style={{ color: "#00B4D8" }}>ACCOUNT</p>
      <h1 className="text-2xl font-bold mb-8">My Subscription</h1>

      {/* Current plan card */}
      <div className="rounded-2xl p-6 mb-8"
        style={{
          background: "var(--bg-card)",
          border: `1px solid ${isPremium ? "rgba(0,180,216,0.4)" : "var(--border)"}`,
        }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Current plan</p>
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold">
                {isPremium ? (premiumItem.plan.name || "Premium") : "Free"}
              </span>
              <span className="px-2 py-0.5 rounded text-xs font-bold"
                style={{
                  background: isPremium ? "rgba(0,180,216,0.15)" : "rgba(139,148,158,0.15)",
                  color: isPremium ? "#00B4D8" : "#8B949E",
                  border: `1px solid ${isPremium ? "rgba(0,180,216,0.3)" : "rgba(139,148,158,0.3)"}`,
                }}>
                {isPremium ? "ACTIVE" : "FREE"}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-center w-12 h-12 rounded-xl shrink-0"
            style={{
              background: isPremium ? "rgba(0,180,216,0.1)" : "rgba(139,148,158,0.08)",
              border: `1px solid ${isPremium ? "rgba(0,180,216,0.2)" : "var(--border)"}`,
            }}>
            {isPremium
              ? <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z" fill="#00B4D8"/>
                </svg>
              : <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <rect x="3" y="11" width="18" height="11" rx="2" stroke="#8B949E" strokeWidth="1.8"/>
                  <path d="M7 11V7a5 5 0 0110 0v4" stroke="#8B949E" strokeWidth="1.8" strokeLinecap="round"/>
                </svg>
            }
          </div>
        </div>

        {isPremium && nextPaymentDate && (
          <div className="mt-5 pt-4 flex items-center justify-between" style={{ borderTop: "1px solid var(--border)" }}>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Next payment</p>
              <p className="font-semibold" style={{ color: "#00B4D8" }}>
                {nextPaymentDate.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
              </p>
            </div>
            {nextPaymentAmount && (
              <p className="text-lg font-bold" style={{ color: "#00B4D8" }}>
                {(nextPaymentAmount.amount / 100).toFixed(0)} {nextPaymentAmount.currency.toUpperCase()}
              </p>
            )}
          </div>
        )}

        {!isPremium && (
          <p className="mt-4 text-sm" style={{ color: "var(--text-secondary)" }}>
            Upgrade to Premium for unlimited flows, all aircraft types, and advanced quiz modes.
          </p>
        )}
      </div>

      {/* Upgrade UI (Free users) */}
      {!isPremium && (
        <div className="rounded-2xl p-6" style={{ background: "var(--bg-card)", border: "1px solid rgba(0,180,216,0.2)" }}>
          {/* Beta badge + pricing */}
          <div className="flex items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <span className="px-2 py-0.5 rounded text-xs font-bold shrink-0"
                style={{ background: "rgba(247,127,0,0.2)", color: "#F77F00", border: "1px solid rgba(247,127,0,0.4)" }}>
                BETA
              </span>
              <div>
                <p className="text-sm font-semibold">Limited-time beta price</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                  Lock in the beta rate — price goes up after launch.
                </p>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs line-through" style={{ color: "var(--text-secondary)" }}>€10/month</p>
              <p className="text-2xl font-bold" style={{ color: "#F77F00" }}>€5<span className="text-sm font-normal text-gray-400">/month</span></p>
            </div>
          </div>

          {/* Feature list */}
          <ul className="space-y-2.5 mb-6">
            {[
              "Unlimited flows",
              "All aircraft types",
              "Advanced quiz modes",
              "Annotations & drawing tools",
              "Priority support",
            ].map(f => (
              <li key={f} className="flex items-center gap-2.5 text-sm">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
                  <path d="M2 7l4 4 6-6" stroke="#00B4D8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {f}
              </li>
            ))}
          </ul>

          <button
            onClick={() => (clerk as any).__internal_openCheckout()}
            className="w-full py-3 rounded-xl font-bold text-sm transition-all hover:opacity-90"
            style={{ background: "#00B4D8", color: "#0D1117" }}>
            Upgrade to Premium — €5/month
          </button>
        </div>
      )}
    </div>
  );
}
