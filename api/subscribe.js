// /api/subscribe.js
// Stores newsletter signups. Swap the storage block for ConvertKit/Mailchimp/Beehiiv later.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON' }); }
  }

  const email = (body?.email || '').trim().toLowerCase();
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!emailOk) return res.status(400).json({ error: 'Please enter a valid email.' });

  try {
    // === SIMPLE MODE: log to Vercel logs + email yourself ===
    // You can view signups in the Vercel dashboard logs.
    // For a production pipe, swap this block for a provider API (see below).
    console.log('NEW_SUBSCRIBER:', email, 'at', new Date().toISOString());

    // === OPTIONAL: forward signup to yourself via a notification service ===
    // If you set NOTIFY_WEBHOOK in Vercel env (Discord, Slack, Make.com, etc.),
    // it'll ping you on every new subscribe.
    if (process.env.NOTIFY_WEBHOOK) {
      await fetch(process.env.NOTIFY_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: `📬 New Signal/AI subscriber: ${email}`,
          text: `New Signal/AI subscriber: ${email}`
        })
      }).catch(err => console.error('Webhook failed:', err.message));
    }

    // === WHEN YOU HOOK UP A PROVIDER, replace above with one of these: ===
    //
    // --- BEEHIIV ---
     await fetch(`https://api.beehiiv.com/v2/publications/${process.env.BEEHIIV_PUB_ID}/subscriptions`, {
       method: 'POST',
       headers: {
         'Authorization': `Bearer ${process.env.BEEHIIV_API_KEY}`,
         'Content-Type': 'application/json'
       },
       body: JSON.stringify({ email, reactivate_existing: true, send_welcome_email: true })
     });
    //
    // --- CONVERTKIT ---
    // await fetch(`https://api.convertkit.com/v3/forms/${process.env.CK_FORM_ID}/subscribe`, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ api_key: process.env.CK_API_KEY, email })
    // });
    //
    // --- MAILCHIMP ---
    // const dc = process.env.MC_SERVER; // e.g. 'us21'
    // await fetch(`https://${dc}.api.mailchimp.com/3.0/lists/${process.env.MC_LIST_ID}/members`, {
    //   method: 'POST',
    //   headers: {
    //     'Authorization': `Basic ${Buffer.from('anystring:' + process.env.MC_API_KEY).toString('base64')}`,
    //     'Content-Type': 'application/json'
    //   },
    //   body: JSON.stringify({ email_address: email, status: 'subscribed' })
    // });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Subscribe error:', err.message);
    return res.status(500).json({ error: 'Something went wrong. Try again in a moment.' });
  }
}
