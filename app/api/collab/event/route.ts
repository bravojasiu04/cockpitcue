import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { pusherServer } from "@/app/lib/pusher-server";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { roomCode, eventName, data, socketId } = await req.json();
  if (!roomCode || !eventName) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const channel = `presence-collab-${roomCode}`;
  // Use socketId as senderId (unique per tab, not per user) so that two tabs
  // sharing the same Clerk account can still distinguish each other's events.
  // Also exclude the sender's socket so they don't receive their own broadcast.
  await pusherServer.trigger(
    channel,
    eventName,
    { ...data, senderId: socketId || userId },
    socketId ? { socket_id: socketId } : undefined
  );

  return NextResponse.json({ ok: true });
}
