import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return NextResponse.json({ sent: false, reason: "not_configured" }, { status: 503 });

  try {
    const report = await request.json();
    const fields = [
      ["Person", report.name],
      ["Age / Gender", `${report.age || "-"} / ${report.gender || "-"}`],
      ["Location", `${report.location || "-"}, ${report.district || "-"}`],
      ["Province", report.province],
      ["Report date", report.date],
      ["Report ID", report.id],
      ["Reporter", report.reporter],
      ["Phone", report.phone],
      ["Email", report.email],
      ["Description", report.description],
    ]
      .filter(([, value]) => value && value !== "- / -")
      .map(([name, value]) => ({ name, value: String(value).slice(0, 1024), inline: name !== "Description" }));

    const photoUrl = typeof report.photo === "string" && report.photo.startsWith("http") ? report.photo : null;

    const discordResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "Nepal Reconnect Reports",
        embeds: [{
          author: { name: "Nepal Reconnect | Report Alert" },
          title: `${report.kind === "Missing" ? "MISSING PERSON" : "FOUND PERSON"}`,
          description: `**${report.name}**\n${report.status || "Active"} report • ID: \`${report.id}\``,
          color: report.kind === "Missing" ? 0xc62828 : 0x1976d2,
          fields,
          ...(photoUrl ? { image: { url: photoUrl } } : {}),
          footer: { text: "Nepal Reconnect • Please handle contact details responsibly" },
          timestamp: new Date().toISOString(),
        }],
      }),
    });

    if (!discordResponse.ok) {
      return NextResponse.json({ sent: false, reason: "discord_error" }, { status: 502 });
    }
    return NextResponse.json({ sent: true });
  } catch {
    return NextResponse.json({ sent: false, reason: "invalid_request" }, { status: 400 });
  }
}
