// Outgoing email through the Resend HTTP API. Nothing is sent, and nothing claims to be
// sent, unless both the API key and the sender address are configured.
const DEFAULT_URL = "https://api.resend.com/emails";

export function createMailer(env = process.env, send = fetch) {
  const key = env.RESEND_API_KEY?.trim();
  const from = env.EMAIL_FROM?.trim();
  const available = Boolean(key && from);
  return {
    available,
    async send({ to, subject, text }) {
      if (!available) throw new Error("Email delivery is not configured");
      const response = await send(env.EMAIL_API_URL?.trim() || DEFAULT_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [to], subject, text }),
        signal: AbortSignal.timeout(10_000),
      });
      // The provider's response body can echo the message, so only the status is logged.
      if (!response.ok) throw new Error(`Email provider rejected the message (HTTP ${response.status})`);
    },
  };
}
