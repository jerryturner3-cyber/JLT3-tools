import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';

const ALLOWED_ORIGINS = [
  'https://jerryleonturner3.com',
  'https://www.jerryleonturner3.com',
  'https://jlt-3-tools.vercel.app'
];

type Rec = { count: number; start: number };
const hits: Record<string, Rec> = {};
const WINDOW_MS = 60 * 60 * 1000;
const MAX_HITS = 10;

function setCors(res: VercelResponse, origin?: string) {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[2];
  res.setHeader('Access-Control-Allow-Origin', allowed);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res, req.headers.origin as string | undefined);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });

  // Quick env check
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'Server misconfigured: OPENAI_API_KEY is missing.' });
  }

  // Rate limit
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
    || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const rec = hits[ip] || { count: 0, start: now };
  if (now - rec.start > WINDOW_MS) { rec.count = 0; rec.start = now; }
  rec.count += 1; hits[ip] = rec;
  if (rec.count > MAX_HITS) return res.status(429).json({ error: 'Too many requests' });

  // Parse body (works if body is object or raw string)
  let text = '';
  if (typeof req.body === 'string') text = req.body.trim();
  else if (req.body && typeof req.body === 'object') text = String(req.body.text || req.body.bullet || '').trim();

  if (!text) return res.status(400).json({ error: 'Missing "text" in JSON body.' });
  if (text.split(/\s+/).filter(Boolean).length < 8) {
    return res.status(400).json({ error: 'Please provide at least 8 words.' });
  }

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const sys = 'You are an expert resume writer. Rewrite resume bullets with strong action verbs, measurable impact, and clarity. Return 3 concise one-sentence options; avoid fluff.';
    const user = `Rewrite this resume bullet and give me 3 distinct one-sentence options:\n"${text}"`;

    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: user }
      ],
      temperature: 0.7,
      max_tokens: 300
    });

    const raw = resp.choices?.[0]?.message?.content || '';
    const options = raw.split(/\n+/)
      .map(s => s.replace(/^\d+[\).]\s*|- \s*/, '').trim())
      .filter(Boolean)
      .slice(0, 3);

    return res.status(200).json({ options });
  } catch (err: any) {
    // Log server-side and return a helpful payload for debugging
    console.error('OpenAI error:', err?.response?.status, err?.response?.data || err?.message || err);
    return res.status(500).json({
      error: 'OpenAI request failed',
      detail: err?.response?.data || err?.message || 'Unknown error'
    });
  }
}

