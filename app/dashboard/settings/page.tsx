"use client";

import { UserProfile } from "@clerk/nextjs";

export default function SettingsPage() {
  return (
    <div className="max-w-4xl mx-auto px-6 md:px-10 py-16">
      <div className="mb-10">
        <p className="text-sm font-mono mb-2" style={{ color: "#00B4D8" }}>SETTINGS</p>
        <h1 className="text-3xl font-bold mb-2">Account settings</h1>
      </div>
      <UserProfile routing="hash" />
    </div>
  );
}
