// Test double for the email provider: keeps what would have been sent.
export function testMailer() {
  const outbox = [];
  return {
    available: true,
    outbox,
    async send(message) { outbox.push(message); },
    code(email) {
      const message = outbox.findLast(entry => entry.to === email);
      return message?.text.match(/\b\d{6}\b/)?.[0];
    },
  };
}
