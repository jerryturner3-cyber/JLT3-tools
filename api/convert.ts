// /api/convert.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { IncomingForm, File } from 'formidable';
import fs from 'fs';
import path from 'path';
import { setCors } from '../utils/cors';


export const config = { api: { bodyParser: false } };

// Allowed origins for browser calls
const ALLOWED_ORIGINS = [
  'https://jerryleonturner3.com',
  'https://www.jerryleonturner3.com',
  'https://jlt-3-tools.vercel.app', // keep for testing
];

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

function setCors(res: VercelResponse, origin?: string) {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[2];
  res.setHeader('Access-Control-Allow-Origin', allowed);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');
}

function parseForm(req: VercelRequest): Promise<{ file: File }> {
  return new Promise((resolve, reject) => {
    const form = new IncomingForm({ maxFileSize: MAX_SIZE_BYTES, multiples: false, keepExtensions: true });
    form.parse(req, (err, _fields, files) => {
      if (err) return reject(err);
      const f = (files.file || files.upload || files.input || files['resume']) as File | File[] | undefined;
      if (!f) return reject(new Error('No file uploaded. Use multipart/form-data with field name "file".'));
      resolve({ file: Array.isArray(f) ? f[0] : f });
    });
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res, req.headers.origin as string | undefined);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });

  const SECRET = process.env.CONVERTAPI_SECRET;
  if (!SECRET) return res.status(500).json({ error: 'Server misconfigured: CONVERTAPI_SECRET is missing.' });

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
      return res.status(413).json({ error: `File too large. Max ${Math.round(MAX_SIZE_BYTES/1024/1024)}MB` });
    }

    // Validate input type
    if (to === 'pdf' && !(ext === '.docx' || mime.includes('word'))) {
      return res.status(400).json({ error: 'For ?to=pdf please upload a DOCX (.docx) file.' });
    }
    if (to === 'docx' && !(ext === '.pdf' || mime.includes('pdf'))) {
      return res.status(400).json({ error: 'For ?to=docx please upload a PDF (.pdf) file.' });
    }

    // ---- 1) Upload to ConvertAPI to get a FileId ----
    const buffer = await fs.promises.readFile(file.filepath);
    const uploadForm = new FormData();
    uploadForm.append('file', new Blob([buffer]), file.originalFilename || `upload${ext || ''}`);

    const uploadResp = await fetch(`https://v2.convertapi.com/upload?Secret=${SECRET}`, {
      method: 'POST',
      body: uploadForm
    });

    const uploadText = await uploadResp.text();
    let uploadJson: any;
    try { uploadJson = JSON.parse(uploadText); } catch {
      return res.status(502).json({ error: 'Upload failed (non-JSON)', detail: uploadText.slice(0, 1000) });
    }
    const fileId: string | undefined = uploadJson?.FileId || uploadJson?.fileId;
    if (!uploadResp.ok || !fileId) {
      return res.status(502).json({ error: 'Upload failed', detail: uploadJson });
    }

    // ---- 2) Convert using FileId via JSON ----
    const convertUrl =
      to === 'pdf'
        ? `https://v2.convertapi.com/convert/docx/to/pdf?Secret=${SECRET}`
        : `https://v2.convertapi.com/convert/pdf/to/docx?Secret=${SECRET}`;

    const convertBody = {
      Parameters: [
        { Name: 'File', FileValue: { Id: fileId } }
      ]
    };

    const convertResp = await fetch(convertUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(convertBody)
    });

    const convertText = await convertResp.text();
    let convertJson: any;
    try { convertJson = JSON.parse(convertText); } catch {
      return res.status(502).json({ error: 'Conversion response not JSON', detail: convertText.slice(0, 1000) });
    }

    if (!convertResp.ok) {
      return res.status(502).json({ error: 'Conversion upstream failed', detail: convertJson });
    }

    // ConvertAPI sometimes returns:
    //   Files[0].Url  (preferred)
    // or Files[0].FileData (base64)
    const fileEntry = (convertJson?.Files && convertJson.Files[0]) || (convertJson?.files && convertJson.files[0]);
    if (!fileEntry) {
      return res.status(502).json({ error: 'Conversion succeeded but no file returned.', detail: convertJson });
    }

    let outBuf: Buffer | null = null;

    if (fileEntry.Url) {
      // Download the file from the returned URL
      const converted = await fetch(fileEntry.Url);
      if (!converted.ok) {
        const t = await converted.text().catch(() => '');
        return res.status(502).json({ error: 'Failed to fetch converted file', detail: t.slice(0, 1000) });
      }
      outBuf = Buffer.from(await converted.arrayBuffer());
    } else if (fileEntry.FileData) {
      // Base64 file content
      try {
        outBuf = Buffer.from(fileEntry.FileData, 'base64');
      } catch {
        return res.status(502).json({ error: 'Invalid FileData base64 in conversion response.' });
      }
    } else {
      return res.status(502).json({ error: 'Conversion succeeded but no file URL or data returned.', detail: convertJson });
    }

    const outNameBase = (file.originalFilename || 'resume').replace(/\.[^.]+$/, '');
    const outExt = to === 'pdf' ? '.pdf' : '.docx';
    const outMime =
      to === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    res.setHeader('Content-Type', outMime);
    res.setHeader('Content-Disposition', `attachment; filename="${outNameBase}${outExt}"`);
    return res.status(200).send(outBuf);
  } catch (err: any) {
    console.error('convert error:', err?.message || err);
    return res.status(500).json({ error: 'Server error during conversion', detail: err?.message || String(err) });
  }
}
