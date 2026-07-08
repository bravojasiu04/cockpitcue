import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

// In-memory room store (session-only, resets on cold start)
// Structure: roomCode -> { hostId, guestId | null, flowId, flowData }
const rooms = new Map<string, {
  hostId: string;
  guestId: string | null;
  flowId: string | null;
}>();

function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let code = generateRoomCode();
  while (rooms.has(code)) code = generateRoomCode();

  rooms.set(code, { hostId: userId, guestId: null, flowId: null });
  return NextResponse.json({ roomCode: code });
}

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const code = req.nextUrl.searchParams.get("code")?.toUpperCase();
  if (!code) return NextResponse.json({ error: "Missing code" }, { status: 400 });

  const room = rooms.get(code);
  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });

  // Allow host or at most 1 guest
  const isHost = room.hostId === userId;
  const isGuest = room.guestId === userId;

  if (!isHost && !isGuest) {
    if (room.guestId !== null) {
      return NextResponse.json({ error: "Room is full" }, { status: 409 });
    }
    // Join as guest
    room.guestId = userId;
  }

  return NextResponse.json({
    roomCode: code,
    role: isHost ? "host" : "guest",
    hostId: room.hostId,
    guestId: room.guestId,
  });
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const code = req.nextUrl.searchParams.get("code")?.toUpperCase();
  if (!code) return NextResponse.json({ error: "Missing code" }, { status: 400 });

  const room = rooms.get(code);
  if (room?.hostId === userId) rooms.delete(code);

  return NextResponse.json({ ok: true });
}
