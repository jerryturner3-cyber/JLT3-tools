// /api/convert.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { IncomingForm, File } from 'formidable';
import fs from 'fs';
import path from 'path';

// If this runs under Next.js API routes, disable body parsing.
// (Ignored by pure Vercel functions, harmless to keep.)
export const config = {
  api: { bodyParser: false },
};

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
  'https://jerryleonturner3.com',
  'https://www.jerryleonturner3.com',
  'https://jlt-3-tools.vercel.app',
];

// Basic file guardrails
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

function setCors(res: VercelResponse, origin?: string) {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[2];
  res.setHeader('Access-Control-Allow-Origin', allowed);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');
}

function parseForm(req: VercelRequest): Promise<{ file: File }> {
  return new Promise((resolve, reject) => {
    const form = new IncomingForm({
      maxFileSize: MAX_SIZE_BYTES,
      multiples: false,
      keepExtensions: true,
    });
    form.parse(req, (err, _fields, files) => {
      if (err) return reject(err);
      const f = (files.file || files.upload || files.input || files['resume']) as File | File[] | undefined;
      if (!f) return reject(new Error('No file uploaded. Use multipart/form-data with field name "file".'));
      resolve({ file: Array.isArray(f) ? f[0] : f });
    });
  });
}

/**
 * Uses ConvertAPI: https://www.convertapi.com/
 * Set env var in Vercel: CONVERTAPI_SECRET
 * DOCX -> PDF:  https://v2.convertapi.com/convert/docx/to/pdf
 * PDF  -> DOCX: https://v2.convertapi.com/convert/pdf/to/docx
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res, req.headers.origin as string | undefined);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });

  if (!process.env.CONVERTAPI_SECRET) {
    return res.status(500).json({ error: 'Server misconfigured: CONVERTAPI_SECRET is missing.' });
  }

  const to = String((req.query.to || '').toString().toLowerCase());
  if (to !== 'pdf' && to !== 'docx') {
    return res.status(400).json({ error: 'Invalid or missing "to" query param. Use ?to=pdf or ?to=docx' });
  }

  try {
    const { file } = await parseForm(req);
    if (!file.filepath) return res.status(400).json({ error: 'Upload failed (no file path).' });

    const ext = path.extname(file.originalFilename || '').toLowerCase();
    const mime = file.mimetype || '';
    const size = file.size || 0;
    if (size > MAX_SIZE_BYTES) {
      return res.status(413).json({ error: `File too large. Max ${Math.round(MAX_SIZE_BYTES / 1024 / 1024)}MB` });
    }

    // Validate input type by direction
    if (to === 'pdf' && !(ext === '.docx' || mime.includes('word'))) {
      return res.status(400).json({ error: 'For ?to=pdf please upload a DOCX (.docx) file.' });
    }
    if (to === 'docx' && !(ext === '.pdf' || mime.includes('pdf'))) {
      return res.status(400).json({ error: 'For ?to=docx please upload a PDF (.pdf) file.' });
    }

    const buffer = await fs.promises.readFile(file.filepath);

    // Build multipart request to ConvertAPI
    const endpoint =
      to === 'pdf'
        ? `https://v2.convertapi.com/convert/docx/to/pdf?Secret=${process.env.CONVERTAPI_SECRET}`
        : `https://v2.convertapi.com/convert/pdf/to/docx?Secret=${process.env.CONVERTAPI_SECRET}`;

    // Node 18+ has global FormData/Blob/fetch in Vercel
    const form = new FormData();
    form.append('file', new Blob([buffer]), file.originalFilename || `upload${ext || ''}`);

    const upstream = await fetch(endpoint, { method: 'POST', body: form as any });
    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '');
      return res.status(502).json({ error: 'Conversion upstream failed', detail: text.slice(0, 500) });
    }

    const json = await upstream.json();
    // ConvertAPI returns file URL(s) under Files
    const url: string | undefined = json?.Files?.[0]?.Url || json?.files?.[0]?.url;
    if (!url) {
      return res.status(502).json({ error: 'Conversion succeeded but no file URL returned.' });
    }

    const converted = await fetch(url);
    if (!converted.ok) {
      const t = await converted.text().catch(() => '');
      return res.status(502).json({ error: 'Failed to fetch converted file', detail: t.slice(0, 500) });
    }

    const outBuf = Buffer.from(await converted.arrayBuffer());
    const outNameBase = (file.originalFilename || 'resume').replace(/\.[^.]+$/, '');
    const outExt = to === 'pdf' ? '.pdf' : '.docx';
    const outMime =
      to === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    res.setHeader('Content-Type', outMime);
    res.setHeader('Content-Disposition', `attachment; filename="${outNameBase}${outExt}"`);
    res.status(200).send(outBuf);
  } catch (err: any) {
    console.error('convert error:', err?.message || err);
    return res.status(500).json({ error: 'Server error during conversion' });
  }
}
