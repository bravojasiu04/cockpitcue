import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { hear, role, license } = await req.json();
  if (!hear || !role) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  const client = await clerkClient();
  await client.users.updateUserMetadata(userId, {
    privateMetadata: {
      survey: {
        hear,
        role,
        license: license || null,
        submittedAt: new Date().toISOString(),
      },
    },
  });

  return NextResponse.json({ success: true });
}
