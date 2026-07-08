import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { pusherServer } from "@/app/lib/pusher-server";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { roomCode, eventName, data } = await req.json();
  if (!roomCode || !eventName) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const channel = `presence-collab-${roomCode}`;
  await pusherServer.trigger(channel, eventName, { ...data, senderId: userId });

  return NextResponse.json({ ok: true });
}
