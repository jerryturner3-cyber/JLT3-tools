import type { VercelRequest, VercelResponse } from '@vercel/node';

/* ---------- CORS (env-driven) ---------- */
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');
}

/* ---------- Handler ---------- */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res, req.headers.origin as string | undefined);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    // Accept:
    // 1) GET ?q=192.168.1.10/24
    // 2) GET ?ip=192.168.1.10&mask=255.255.255.0  (or &cidr=24)
    // 3) POST JSON { q: ".../24" } or { ip, mask } or { ip, cidr }
    const query = (req.query?.q as string) || '';
    const ipQ = (req.query?.ip as string) || '';
    const maskQ = (req.query?.mask as string) || '';
    const cidrQ = req.query?.cidr != null ? Number(req.query.cidr) : undefined;

    let body: any = {};
    if (req.method === 'POST' && req.headers['content-type']?.includes('application/json')) {
      body = req.body || {};
    }

    const q = query || (typeof body.q === 'string' ? body.q : '');
    const ipStr = ipQ || (typeof body.ip === 'string' ? body.ip : '');
    const maskStr = maskQ || (typeof body.mask === 'string' ? body.mask : '');
    const cidr = cidrQ ?? (typeof body.cidr === 'number' ? body.cidr : undefined);

    let ip: number | null = null;
    let prefix: number | null = null;

    if (q) {
      const parts = q.trim().split('/');
      if (parts.length === 2) {
        ip = ipv4ToInt(parts[0]);
        prefix = parsePrefix(parts[1]);
      } else if (parts.length === 1) {
        ip = ipv4ToInt(parts[0]);
      }
    }
    if (ipStr) ip = ipv4ToInt(ipStr);

    if (typeof cidr === 'number' && Number.isFinite(cidr)) {
      prefix = parsePrefix(String(cidr));
    } else if (maskStr) {
      const maskInt = ipv4ToInt(maskStr);
      if (maskInt === null) return res.status(400).json({ error: 'Invalid mask.' });
      prefix = maskToPrefix(maskInt);
      if (prefix === null) return res.status(400).json({ error: 'Subnet mask must be contiguous (e.g., 255.255.255.0).' });
    }

    if (ip === null) return res.status(400).json({ error: 'Missing or invalid IP.' });
    if (prefix === null) return res.status(400).json({ error: 'Missing subnet size (CIDR or mask).' });

    const mask = prefixToMask(prefix);
    const network = (ip & mask) >>> 0;
    const broadcast = (network | (~mask >>> 0)) >>> 0;

    let firstHost = network, lastHost = broadcast, hostCount: number;
    if (prefix === 32) {
      hostCount = 1; firstHost = lastHost = ip;
    } else if (prefix === 31) {
      // RFC 3021: /31 usable pair
      hostCount = 2; firstHost = network; lastHost = broadcast;
    } else {
      const total = 2 ** (32 - prefix);
      hostCount = Math.max(0, total - 2);
      firstHost = total > 2 ? (network + 1) >>> 0 : network;
      lastHost  = total > 2 ? (broadcast - 1) >>> 0 : broadcast;
    }

    return res.status(200).json({
      input: { ip: intToIPv4(ip), mask: intToIPv4(mask), cidr: prefix },
      network: intToIPv4(network),
      broadcast: intToIPv4(broadcast),
      firstHost: intToIPv4(firstHost),
      lastHost: intToIPv4(lastHost),
      hostCount,
      wildcardMask: intToIPv4((~mask) >>> 0),
      class: ipv4Class(ip),
      isPrivate: isPrivateIPv4(ip),
      bits: {
        ip: toBits(ip), mask: toBits(mask),
        network: toBits(network), broadcast: toBits(broadcast),
      },
    });
  } catch (e: any) {
    console.error('subnet-calc error:', e?.message || e);
    return res.status(500).json({ error: 'Server error.' });
  }
}

/* ---------- helpers ---------- */
function ipv4ToInt(s: string): number | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s.trim());
  if (!m) return null;
  const oct = m.slice(1).map(Number);
  if (oct.some(n => n < 0 || n > 255)) return null;
  return (((oct[0] << 24) >>> 0) + (oct[1] << 16) + (oct[2] << 8) + oct[3]) >>> 0;
}
function intToIPv4(x: number): string {
  return [(x>>>24)&255, (x>>>16)&255, (x>>>8)&255, x&255].join('.');
}
function parsePrefix(s: string): number | null {
  const n = Number(s); return (Number.isInteger(n) && n>=0 && n<=32) ? n : null;
}
function prefixToMask(prefix: number): number {
  return prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
}
function maskToPrefix(mask: number): number | null {
  let seenZero = false, ones = 0;
  for (let i=31;i>=0;i--) {
    const bit = (mask >>> i) & 1;
    if (bit) { if (seenZero) return null; ones++; } else { seenZero = true; }
  }
  return ones;
}
function ipv4Class(ip: number): 'A'|'B'|'C'|'D'|'E' {
  const f = (ip>>>24)&255; if (f<=127) return 'A'; if (f<=191) return 'B'; if (f<=223) return 'C'; if (f<=239) return 'D'; return 'E';
}
function isPrivateIPv4(ip: number): boolean {
  const a=(ip>>>24)&255, b=(ip>>>16)&255;
  if (a===10) return true;
  if (a===172 && b>=16 && b<=31) return true;
  if (a===192 && b===168) return true;
  return false;
}
function toBits(x: number): string {
  return (x>>>0).toString(2).padStart(32,'0').replace(/(.{8})/g,'$1 ').trim();
}
