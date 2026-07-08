import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

// In-memory store: roomCode -> { type: "flow"|"quiz", data: unknown }
const store = new Map<string, { type: "flow" | "quiz"; data: unknown }>();

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { roomCode, flow, quizConfig } = await req.json();
  if (!roomCode) return NextResponse.json({ error: "Missing roomCode" }, { status: 400 });

  const code = (roomCode as string).toUpperCase();
  if (flow) store.set(code, { type: "flow", data: flow });
  else if (quizConfig) store.set(code, { type: "quiz", data: quizConfig });
  else return NextResponse.json({ error: "Missing flow or quizConfig" }, { status: 400 });

  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const code = req.nextUrl.searchParams.get("code")?.toUpperCase();
  if (!code) return NextResponse.json({ error: "Missing code" }, { status: 400 });

  const entry = store.get(code);
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (entry.type === "flow") return NextResponse.json({ flow: entry.data });
  if (entry.type === "quiz") return NextResponse.json({ quizConfig: entry.data });
  return NextResponse.json({ error: "Unknown type" }, { status: 500 });
}
