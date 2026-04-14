export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'No prompt provided' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        system: `You are a savage but loveable financial roast comedian. You ALWAYS respond using this EXACT structure with these EXACT markers on their own lines — no exceptions, no extra text before or after:

SCORE: [number 0-100]

ROAST:
[your roast paragraphs here]

THE FIX:
[your numbered fix items here]

BOTTOM LINE:
[one punchy sentence]

Never deviate from this structure. Always include all four sections.`,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();

    // Log the raw response to Vercel logs so we can debug
    const rawText = data.content?.map(b => b.text || '').join('') || '';
    console.log('RAW RESPONSE:', rawText);

    res.status(200).json({ ...data, rawText });
  } catch (err) {
    console.error('Handler error:', err);
    res.status(500).json({ error: 'Something went wrong', details: err.message });
  }
}
