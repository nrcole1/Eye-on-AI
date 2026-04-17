// /api/contact.js
// Handles contact form submissions from the IT services page.
// By default, logs to Vercel and optionally pings a webhook (Discord/Slack/etc).
// You can also wire this into Resend/SendGrid to get a real email in your inbox.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON' }); }
  }

  const name = (body?.name || '').trim();
  const email = (body?.email || '').trim().toLowerCase();
  const company = (body?.company || '').trim();
  const message = (body?.message || '').trim();

  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Please fill in name, email, and message.' });
  }
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!emailOk) return res.status(400).json({ error: 'Please enter a valid email.' });

  try {
    console.log('NEW_CONTACT:', { name, email, company, message: message.slice(0, 200), at: new Date().toISOString() });

    // === OPTIONAL: ping a Discord/Slack webhook ===
    if (process.env.NOTIFY_WEBHOOK) {
      await fetch(process.env.NOTIFY_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: `📨 **New IT services inquiry**\n**From:** ${name} (${email})\n**Company:** ${company || 'n/a'}\n**Message:**\n${message}`,
          text: `New IT services inquiry from ${name} (${email}) — ${message}`
        })
      }).catch(err => console.error('Webhook failed:', err.message));
    }

    // === OPTIONAL: send yourself the email via Resend ===
    // Set RESEND_API_KEY and CONTACT_TO_EMAIL in Vercel env vars to enable.
    if (process.env.RESEND_API_KEY && process.env.CONTACT_TO_EMAIL) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'Signal/AI <onboarding@resend.dev>', // change to your verified domain
          to: process.env.CONTACT_TO_EMAIL,
          reply_to: email,
          subject: `New IT inquiry from ${name}`,
          text: `Name: ${name}\nEmail: ${email}\nCompany: ${company || 'n/a'}\n\n${message}`
        })
      }).catch(err => console.error('Resend failed:', err.message));
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Contact error:', err.message);
    return res.status(500).json({ error: 'Something went wrong. Try again in a moment.' });
  }
}
