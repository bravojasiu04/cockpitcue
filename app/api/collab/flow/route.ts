import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { kset, kget, kmget } from "@/app/lib/redis";

// Images are stored separately (key per flow index) so each Redis value stays
// well under the 1 MB Upstash free-tier limit even for multi-flow quiz configs.

type FlowMeta = Record<string, unknown>;
type QuizMeta = { aircraftId: string; difficulty: string; voiceEnabled: boolean; flows: FlowMeta[] };

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { roomCode, flow, quizConfig } = await req.json();
  if (!roomCode) return NextResponse.json({ error: "Missing roomCode" }, { status: 400 });

  const code = (roomCode as string).toUpperCase();

  try {
    if (flow) {
      const { imageDataUrl, ...flowMeta } = flow as { imageDataUrl?: string } & FlowMeta;
      await kset(`collab:${code}:meta`, { type: "flow", flow: flowMeta });
      if (imageDataUrl) await kset(`collab:${code}:img:0`, imageDataUrl);
    } else if (quizConfig) {
      const cfg = quizConfig as { flows: Array<{ imageDataUrl?: string } & FlowMeta> } & Record<string, unknown>;
      const flowsNoImg = cfg.flows.map(({ imageDataUrl: _img, ...rest }) => rest);
      await kset(`collab:${code}:meta`, { type: "quiz", config: { ...cfg, flows: flowsNoImg } });
      await Promise.all(
        cfg.flows.map((f, i) =>
          f.imageDataUrl ? kset(`collab:${code}:img:${i}`, f.imageDataUrl) : Promise.resolve()
        )
      );
    } else {
      return NextResponse.json({ error: "Missing flow or quizConfig" }, { status: 400 });
    }
  } catch (err) {
    console.error("[collab/flow POST]", err);
    return NextResponse.json({ error: "Failed to save session data" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const code = req.nextUrl.searchParams.get("code")?.toUpperCase();
  if (!code) return NextResponse.json({ error: "Missing code" }, { status: 400 });

  const meta = await kget<{ type: "flow" | "quiz"; flow?: FlowMeta; config?: QuizMeta }>(
    `collab:${code}:meta`
  );
  if (!meta) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (meta.type === "flow") {
    const img = await kget<string>(`collab:${code}:img:0`);
    return NextResponse.json({ flow: { ...meta.flow, imageDataUrl: img ?? null } });
  }

  if (meta.type === "quiz") {
    const cfg = meta.config!;
    const imgKeys = cfg.flows.map((_, i) => `collab:${code}:img:${i}`);
    const imgs = await kmget(imgKeys);
    const flows = cfg.flows.map((f, i) => ({ ...f, imageDataUrl: (imgs[i] as string) ?? null }));
    return NextResponse.json({ quizConfig: { ...cfg, flows } });
  }

  return NextResponse.json({ error: "Unknown type" }, { status: 500 });
}
