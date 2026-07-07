import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  const { name, email, message } = await req.json();

  if (!name || !email || !message) {
    return NextResponse.json({ error: "All fields are required." }, { status: 400 });
  }

  try {
    await resend.emails.send({
      from: "CockpitCue Contact <onboarding@resend.dev>",
      to: "inkbytepages@gmail.com",
      replyTo: email,
      subject: `[CockpitCue] Message from ${name}`,
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
          <h2 style="color:#00B4D8;margin-bottom:4px">New message from CockpitCue</h2>
          <hr style="border:none;border-top:1px solid #30363D;margin:16px 0"/>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
          <p><strong>Message:</strong></p>
          <p style="background:#161B22;padding:16px;border-radius:8px;white-space:pre-wrap">${message}</p>
          <hr style="border:none;border-top:1px solid #30363D;margin:16px 0"/>
          <p style="color:#8B949E;font-size:12px">Sent via cockpitcue.com contact form</p>
        </div>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to send message." }, { status: 500 });
  }
}
