import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { pusherServer } from "@/app/lib/pusher-server";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.text();
  const params = new URLSearchParams(body);
  const socketId = params.get("socket_id") ?? "";
  const channel = params.get("channel_name") ?? "";

  // Only allow presence channels prefixed with presence-collab-
  if (!channel.startsWith("presence-collab-")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Use socketId as user_id so each browser tab is a unique presence-channel
  // member even when two tabs share the same Clerk account (e.g. during testing).
  const userData = { user_id: socketId, user_info: { userId } };
  const authResponse = pusherServer.authorizeChannel(socketId, channel, userData);
  return NextResponse.json(authResponse);
}
