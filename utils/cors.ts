// CORS helpers
const DEFAULT_ALLOWED = [
  'https://jerryleonturner3.com',
  'https://www.jerryleonturner3.com',
  'https://jlt-3-tools.vercel.app',
  'https://jacybersecurity.com',
  'https://www.jacybersecurity.com',
];

function getAllowedOrigins(): string[] {
  const csv = process.env.ALLOWED_ORIGINS?.trim();
  return csv ? csv.split(/[, \s]+/).filter(Boolean) : DEFAULT_ALLOWED;
}

function getAllowedSuffixes(): string[] {
  const csv = process.env.ALLOWED_ORIGIN_SUFFIXES?.trim(); // e.g. ".lovable.dev"
  return csv ? csv.split(/[, \s]+/).filter(Boolean) : [];
}

function isAllowedOrigin(origin?: string): boolean {
  if (!origin) return false;
  const allowed = new Set(getAllowedOrigins());
  if (allowed.has(origin)) return true;
  try {
    const u = new URL(origin);
    const host = u.host.toLowerCase();
    // allow preview/editor subdomains, e.g. *.lovable.dev
    for (const suf of getAllowedSuffixes()) {
      const s = suf.toLowerCase().replace(/^\.+/, '.'); // normalize ".lovable.dev"
      if (host === s.slice(1) || host.endsWith(s)) return true;
    }
  } catch {}
  return false;
}

function setCors(res: any, origin?: string) {
  const originOk = isAllowedOrigin(origin);
  if (originOk && origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    // fall back to your primary site to avoid wildcarding in prod
    res.setHeader('Access-Control-Allow-Origin', getAllowedOrigins()[0]);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Requested-With'
  );
  res.setHeader('Vary', 'Origin');
}
export function applyCors(req: any, res: any) {
  setCors(res, req.headers.origin);

  // Handle preflight
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }
  return false;
}

