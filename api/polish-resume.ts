// /api/polish-resume.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';

/* ---------- CORS (share with your other endpoints) ---------- */
const DEFAULT_ALLOWED = [
  'https://jerryleonturner3.com',
  'https://www.jerryleonturner3.com',
  'https://jlt-3-tools.vercel.app',
  'https://jacybersecurity.com',
  'https://www.jacybersecurity.com',
];
function getAllowedOrigins(): string[] {
  const csv = process.env.ALLOWED_ORIGINS?.trim();
  if (!csv) return DEFAULT_ALLOWED;
  return csv.split(/[, \s]+/).filter(Boolean);
}
function setCors(res: VercelResponse, origin?: string) {
  const allowedList = getAllowedOrigins();
  const allowed = origin && allowedList.includes(origin) ? origin : allowedList[0];
  res.setHeader('Access-Control-Allow-Origin', allowed);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');
}

/* ---------- Prompt builders ---------- */
function buildSystemPrompt(domain: 'general' | 'cyber') {
  if (domain === 'cyber') {
    return [
      'You improve resume bullets for cybersecurity roles.',
      'Guidelines:',
      '- Use strong action verbs: hardened, mitigated, secured, automated, audited, remediated.',
      '- Where plausible, add quantification (%, time, counts) and scope.',
      '- Prefer industry language + frameworks: NIST CSF/800-53, ISO 27001, SOC 2, CIS, MITRE ATT&CK.',
      '- Mention common platforms/tools when appropriate: SIEM, EDR, SOAR, Cloud (AWS/GCP/Azure), IAM, DLP, vuln mgmt, patching.',
      '- Keep one sentence per bullet. No emojis. No personal pronouns.',
      'Return exactly three variations, concise and achievement-focused.',
    ].join('\n');
  }
  // default: general
  return [
    'You improve resume bullets for general roles.',
    'Guidelines:',
    '- Use strong action verbs and measurable outcomes.',
    '- Keep it one sentence, concise, results-first.',
    'Return exactly three variations.',
  ].join('\n');
}

function buildUserPrompt(text: string) {
  return `Original bullet:\n${text}\n\nRewrite 3 improved bullets (concise, one line each).`;
}

/* ---------- Handler ---------- */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res, req.headers.origin as string | undefined);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { text, domain } = (req.body || {}) as { text?: string; domain?: string };
    const modeQuery = (req.query?.mode as string) || ''; // also allow ?mode=cyber
    const dom = (domain || modeQuery || 'general').toLowerCase() === 'cyber' ? 'cyber' : 'general';

    if (!text || typeof text !== 'string' || text.split(/\s+/).filter(Boolean).length < 8) {
      return res.status(400).json({ error: 'Please provide a bullet with at least 8 words.' });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const system = buildSystemPrompt(dom as 'general' | 'cyber');
    const user = buildUserPrompt(text);

    // You can use any model you’ve budgeted for; 4o-mini is a good cost/speed balance.
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.7,
    });

    const content = completion.choices[0]?.message?.content || '';
    // Try to split into 3 lines robustly
    const lines = content
      .split(/\n+/)
      .map(s => s.replace(/^\s*[-*\d.)]+\s*/, '').trim())
      .filter(Boolean)
      .slice(0, 3);

    if (lines.length < 3) {
      return res.status(200).json({ options: [content].filter(Boolean) });
    }

    return res.status(200).json({ options: lines, domain: dom });
  } catch (e: any) {
    console.error('polish-resume error:', e?.message || e);
    // Surface OpenAI errors cleanly to the frontend
    const detail = typeof e?.message === 'string' ? e.message : 'OpenAI request failed';
    return res.status(500).json({ error: 'Server error', detail });
  }
}
