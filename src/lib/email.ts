import "server-only";

type Email = {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
  attachments?: { filename: string; content: Buffer }[];
};

/**
 * Sends through Resend when RESEND_API_KEY and EMAIL_FROM are set.
 * Otherwise prints the email to the server log, which is enough for local development.
 * Never throws: a failed email must not fail the booking that triggered it.
 */
export async function sendEmail(email: Email): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) {
    const files = email.attachments?.map((a) => `\n[email] attachment: ${a.filename} (${a.content.length} bytes)`).join("") ?? "";
    console.log(`\n[email] to: ${email.to}\n[email] subject: ${email.subject}${files}\n${email.text}\n`);
    return;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [email.to],
        subject: email.subject,
        text: email.text,
        ...(email.replyTo ? { reply_to: email.replyTo } : {}),
        ...(email.attachments?.length
          ? { attachments: email.attachments.map((a) => ({ filename: a.filename, content: a.content.toString("base64") })) }
          : {}),
      }),
    });
    if (!res.ok) console.error("[email] Resend error", res.status, await res.text());
  } catch (err) {
    console.error("[email] failed", err);
  }
}
