"use client";

export type Aircraft = {
  id: string;
  name: string;
  registration: string;
  cockpitType: "single" | "multi";
  engineType: "single" | "multi";
  imageDataUrl?: string;
};

export type FlowStep = {
  id: string;
  x: number;
  y: number;
  label: string;
  action: string;
  callout?: boolean;
  role?: "PF" | "PM";
};

export type FlowAnnotation =
  | { type: "text"; id: string; x: number; y: number; text: string; color: string }
  | { type: "draw"; id: string; points: [number, number][]; color: string; width: number };

export type SavedFlow = {
  id: string;
  name: string;
  aircraftId: string;
  steps: FlowStep[];
  imageDataUrl: string;
  createdAt: string;
  emergency?: boolean;
  annotations?: FlowAnnotation[];
  sequenceOrder?: string[];
};

/* ─── Aircraft ─── */
const AC_KEY = "cockpitcue:aircrafts";

export function getAircrafts(): Aircraft[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(AC_KEY) ?? "[]"); } catch { return []; }
}

export function saveAircraft(ac: Aircraft): void {
  const list = getAircrafts().filter(a => a.id !== ac.id);
  localStorage.setItem(AC_KEY, JSON.stringify([...list, ac]));
}

export function deleteAircraft(id: string): void {
  localStorage.setItem(AC_KEY, JSON.stringify(getAircrafts().filter(a => a.id !== id)));
}

/* ─── Flows ─── */
const FL_KEY = "cockpitcue:flows";

export function getFlows(): SavedFlow[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(FL_KEY) ?? "[]"); } catch { return []; }
}

export function saveFlow(flow: SavedFlow): void {
  const list = getFlows().filter(f => f.id !== flow.id);
  localStorage.setItem(FL_KEY, JSON.stringify([...list, flow]));
}

export function deleteFlow(id: string): void {
  localStorage.setItem(FL_KEY, JSON.stringify(getFlows().filter(f => f.id !== id)));
}
