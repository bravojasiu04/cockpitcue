import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { kset, kget, kdel } from "@/app/lib/redis";

type Room = { hostId: string; guestId: string | null; flowId: string | null };

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Try up to 5 codes to avoid (very unlikely) collisions
  let code = generateRoomCode();
  for (let i = 0; i < 5; i++) {
    if (!(await kget(`collab:room:${code}`))) break;
    code = generateRoomCode();
  }

  await kset(`collab:room:${code}`, { hostId: userId, guestId: null, flowId: null });
  return NextResponse.json({ roomCode: code });
}

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const code = req.nextUrl.searchParams.get("code")?.toUpperCase();
  if (!code) return NextResponse.json({ error: "Missing code" }, { status: 400 });

  const room = await kget<Room>(`collab:room:${code}`);
  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });

  const isHost = room.hostId === userId;
  const isGuest = room.guestId === userId;

  if (!isHost && !isGuest) {
    if (room.guestId !== null) return NextResponse.json({ error: "Room is full" }, { status: 409 });
    room.guestId = userId;
    await kset(`collab:room:${code}`, room);
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

  const room = await kget<Room>(`collab:room:${code}`);
  if (room?.hostId === userId) await kdel(`collab:room:${code}`);

  return NextResponse.json({ ok: true });
}
