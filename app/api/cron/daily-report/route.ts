import { clerkClient } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const HEAR_LABELS: Record<string, string> = {
  social_media: "Social media",
  friend:       "Friend / word of mouth",
  forum:        "Aviation forum",
  google:       "Google / search",
  other:        "Other",
};

const ROLE_LABELS: Record<string, string> = {
  airline_pilot: "Airline pilot",
  student_pilot: "Student pilot",
  simulator:     "Simulator enthusiast",
  not_pilot:     "Not a pilot (yet)",
};

const LICENSE_LABELS: Record<string, string> = {
  atpl: "ATPL",
  cpl:  "CPL",
  ppl:  "PPL",
  none: "No license",
};

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const client = await clerkClient();

  /* fetch users created in last 24h */
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const { data: users } = await client.users.getUserList({ limit: 100, orderBy: "-created_at" });
  const newUsers = users.filter(u => u.createdAt >= since);

  if (newUsers.length === 0) {
    return NextResponse.json({ message: "No new users today" });
  }

  const rows = newUsers.map(u => {
    const survey = (u.privateMetadata as Record<string, any>)?.survey;
    const email = u.emailAddresses[0]?.emailAddress ?? "—";
    const name = [u.firstName, u.lastName].filter(Boolean).join(" ") || "—";
    const registered = new Date(u.createdAt).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw" });

    if (!survey) {
      return `
        <tr style="border-bottom:1px solid #30363D">
          <td style="padding:10px 12px">${name}</td>
          <td style="padding:10px 12px;color:#8B949E">${email}</td>
          <td style="padding:10px 12px;color:#8B949E">${registered}</td>
          <td style="padding:10px 12px;color:#484F58;font-style:italic" colspan="3">Survey skipped</td>
        </tr>`;
    }

    return `
      <tr style="border-bottom:1px solid #30363D">
        <td style="padding:10px 12px">${name}</td>
        <td style="padding:10px 12px;color:#8B949E">${email}</td>
        <td style="padding:10px 12px;color:#8B949E">${registered}</td>
        <td style="padding:10px 12px">${HEAR_LABELS[survey.hear] ?? survey.hear}</td>
        <td style="padding:10px 12px">${ROLE_LABELS[survey.role] ?? survey.role}</td>
        <td style="padding:10px 12px">${survey.license ? LICENSE_LABELS[survey.license] ?? survey.license : "—"}</td>
      </tr>`;
  }).join("");

  const date = new Date().toLocaleDateString("pl-PL", { timeZone: "Europe/Warsaw" });

  const html = `
    <div style="font-family:sans-serif;max-width:800px;margin:0 auto;background:#0D1117;color:#E6EDF3;padding:24px;border-radius:12px">
      <h2 style="color:#00B4D8;margin-bottom:4px">CockpitCue — Daily Registration Report</h2>
      <p style="color:#8B949E;margin-bottom:24px">${date} · ${newUsers.length} new user${newUsers.length !== 1 ? "s" : ""}</p>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="border-bottom:2px solid #30363D;color:#8B949E;text-align:left">
            <th style="padding:8px 12px">Name</th>
            <th style="padding:8px 12px">Email</th>
            <th style="padding:8px 12px">Registered</th>
            <th style="padding:8px 12px">Heard via</th>
            <th style="padding:8px 12px">Role</th>
            <th style="padding:8px 12px">License</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  await resend.emails.send({
    from: "CockpitCue Reports <onboarding@resend.dev>",
    to: "inkbytepages@gmail.com",
    subject: `[CockpitCue] Daily report — ${newUsers.length} new user${newUsers.length !== 1 ? "s" : ""} · ${date}`,
    html,
  });

  return NextResponse.json({ sent: true, users: newUsers.length });
}
