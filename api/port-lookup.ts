import type { VercelRequest, VercelResponse } from '@vercel/node';

/* ---------------- CORS (env-driven, same style as subnet-calc) ---------------- */
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

/* ---------------- Mini well-known ports db (focused, high-signal) ----------------
   protocol: 'tcp' | 'udp' | 'both'
*/
type Entry = { port: number; protocol: 'tcp' | 'udp' | 'both'; service: string; description: string; common?: boolean };

const DB: Entry[] = [
  // Core
  { port: 20,  protocol: 'tcp',  service: 'ftp-data',  description: 'FTP data', common: true },
  { port: 21,  protocol: 'tcp',  service: 'ftp',       description: 'FTP control', common: true },
  { port: 22,  protocol: 'tcp',  service: 'ssh',       description: 'Secure Shell remote login', common: true },
  { port: 23,  protocol: 'tcp',  service: 'telnet',    description: 'Telnet (unencrypted remote login)' },
  { port: 25,  protocol: 'tcp',  service: 'smtp',      description: 'Simple Mail Transfer' },
  { port: 53,  protocol: 'udp',  service: 'dns',       description: 'Domain Name System (queries)', common: true },
  { port: 53,  protocol: 'tcp',  service: 'dns',       description: 'Domain Name System (zone transfers/DoT)' },
  { port: 67,  protocol: 'udp',  service: 'dhcp',      description: 'DHCP server' },
  { port: 68,  protocol: 'udp',  service: 'dhcp',      description: 'DHCP client' },
  { port: 69,  protocol: 'udp',  service: 'tftp',      description: 'Trivial File Transfer' },
  { port: 80,  protocol: 'tcp',  service: 'http',      description: 'HyperText Transfer Protocol', common: true },
  { port: 110, protocol: 'tcp',  service: 'pop3',      description: 'Post Office Protocol v3' },
  { port: 123, protocol: 'udp',  service: 'ntp',       description: 'Network Time Protocol', common: true },
  { port: 135, protocol: 'tcp',  service: 'msrpc',     description: 'Microsoft RPC endpoint mapper' },
  { port: 137, protocol: 'udp',  service: 'netbios-ns',description: 'NetBIOS Name Service' },
  { port: 138, protocol: 'udp',  service: 'netbios-dgm',description:'NetBIOS Datagram Service' },
  { port: 139, protocol: 'tcp',  service: 'netbios-ssn',description:'NetBIOS Session Service' },
  { port: 143, protocol: 'tcp',  service: 'imap',      description: 'IMAP (mail access)' },
  { port: 161, protocol: 'udp',  service: 'snmp',      description: 'SNMP (management)' },
  { port: 162, protocol: 'udp',  service: 'snmptrap',  description: 'SNMP traps' },
  { port: 389, protocol: 'tcp',  service: 'ldap',      description: 'Lightweight Directory Access Protocol' },
  { port: 443, protocol: 'tcp',  service: 'https',     description: 'HTTP over TLS/SSL', common: true },
  { port: 445, protocol: 'tcp',  service: 'microsoft-ds', description: 'SMB over TCP', common: true },
  { port: 465, protocol: 'tcp',  service: 'smtps',     description: 'SMTP over TLS' },
  { port: 514, protocol: 'udp',  service: 'syslog',    description: 'Syslog (legacy)' },
  { port: 515, protocol: 'tcp',  service: 'printer',   description: 'Line Printer Daemon' },
  { port: 587, protocol: 'tcp',  service: 'submission',description: 'Mail submission (STARTTLS)', common: true },
  { port: 636, protocol: 'tcp',  service: 'ldaps',     description: 'LDAP over TLS' },
  { port: 873, protocol: 'tcp',  service: 'rsync',     description: 'rsync file sync' },
  { port: 993, protocol: 'tcp',  service: 'imaps',     description: 'IMAP over TLS' },
  { port: 995, protocol: 'tcp',  service: 'pop3s',     description: 'POP3 over TLS' },
  // Remote mgmt & VPN
  { port: 500, protocol: 'udp',  service: 'isakmp',    description: 'IPsec IKE' },
  { port: 1701,protocol: 'udp',  service: 'l2tp',      description: 'Layer 2 Tunneling Protocol' },
  { port: 1723,protocol: 'tcp',  service: 'pptp',      description: 'Point-to-Point Tunneling Protocol' },
  { port: 3389,protocol: 'tcp',  service: 'rdp',       description: 'Remote Desktop Protocol', common: true },
  // Web & dev
  { port: 8080,protocol: 'tcp',  service: 'http-alt',  description: 'HTTP alternate/Proxies' },
  { port: 8443,protocol: 'tcp',  service: 'https-alt', description: 'HTTPS alternate' },
  // Databases
  { port: 1433,protocol: 'tcp',  service: 'mssql',     description: 'Microsoft SQL Server' },
  { port: 1521,protocol: 'tcp',  service: 'oracle',    description: 'Oracle DB listener' },
  { port: 3306,protocol: 'tcp',  service: 'mysql',     description: 'MySQL' },
  { port: 5432,protocol: 'tcp',  service: 'postgres',  description: 'PostgreSQL' },
  { port: 27017,protocol: 'tcp', service: 'mongodb',   description: 'MongoDB' },
  // Webapps/common extras
  { port: 8081,protocol: 'tcp',  service: 'http-alt-1',description: 'HTTP alternate' },
  { port: 9000,protocol: 'tcp',  service: 'svc-http',  description: 'Common app/console port' },
  // Email alt
  { port: 2525,protocol: 'tcp',  service: 'smtp-alt',  description: 'Alternative SMTP (esp. cloud providers)' },
  // DNS over TLS/QUIC
  { port: 853, protocol: 'tcp',  service: 'dot',       description: 'DNS over TLS' },
  { port: 853, protocol: 'udp',  service: 'doq',       description: 'DNS over QUIC' },
];

/* ---------------- helpers ---------------- */
type Query = { port?: number; protocol?: 'tcp'|'udp'|'both'; service?: string };

function parseQuery(input: string): Query[] {
  // Accept: "443", "80,443,22", "https", "http,https,ssh"
  return input
    .split(/[,\s]+/)
    .map(x => x.trim().toLowerCase())
    .filter(Boolean)
    .map(token => {
      const n = Number(token);
      if (Number.isInteger(n) && n >= 0 && n <= 65535) return { port: n, protocol: 'both' as const };
      return { service: token };
    });
}

function search(qs: Query[], proto?: 'tcp'|'udp'|'both') {
  const out: Entry[] = [];
  for (const q of qs) {
    const p = proto || q.protocol || 'both';
    if (q.port != null) {
      // Match on port and protocol (respect 'both' by returning any protocol matches)
      const hits = DB.filter(e => e.port === q.port && (p === 'both' || e.protocol === p));
      if (hits.length) out.push(...hits);
      else out.push({ port: q.port, protocol: p, service: 'unknown', description: 'No known assignment' });
    } else if (q.service) {
      const hits = DB.filter(e => e.service.toLowerCase() === q.service && (proto ? (e.protocol === proto || proto === 'both') : true));
      if (hits.length) out.push(...hits);
      else out.push({ port: -1, protocol: proto || 'both', service: q.service, description: 'No known port in local table' });
    }
  }
  return out;
}

/* ---------------- handler ---------------- */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res, req.headers.origin as string | undefined);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    // Accepted inputs:
    // GET  /api/port-lookup?q=443                (single)
    // GET  /api/port-lookup?q=80,443,22          (multi)
    // GET  /api/port-lookup?q=https              (service name)
    // GET  /api/port-lookup?q=http,https,ssh
    // GET  /api/port-lookup?port=443&protocol=tcp
    // POST JSON { q: "80,443" } or { ports: [80,443], protocol: "tcp" } or { services: ["https","ssh"] }
    const protoStr = (req.query?.protocol as string)?.toLowerCase();
    const protocol = protoStr === 'tcp' || protoStr === 'udp' ? (protoStr as 'tcp'|'udp') : 'both';

    let body: any = {};
    if (req.method === 'POST' && req.headers['content-type']?.includes('application/json')) {
      body = req.body || {};
    }

    const qParam = (req.query?.q as string) || (typeof body.q === 'string' ? body.q : '');
    const portParam = req.query?.port as string | undefined;
    const portsBody = Array.isArray(body.ports) ? body.ports : [];
    const servicesBody = Array.isArray(body.services) ? body.services : [];

    const queries: Query[] = [];

    if (qParam) queries.push(...parseQuery(qParam));
    if (portParam) {
      const n = Number(portParam);
      if (Number.isInteger(n)) queries.push({ port: n });
    }
    for (const p of portsBody) {
      const n = Number(p);
      if (Number.isInteger(n)) queries.push({ port: n });
    }
    for (const s of servicesBody) {
      if (typeof s === 'string' && s.trim()) queries.push({ service: s.trim().toLowerCase() });
    }

    if (!queries.length) {
      return res.status(400).json({
        error: 'Provide q (e.g., "80,443,https") or port=NUM or POST { ports: [...], services: [...] }',
        examples: [
          '/api/port-lookup?q=443',
          '/api/port-lookup?q=http,https,ssh',
          '/api/port-lookup?port=3389&protocol=tcp'
        ],
      });
    }

    const results = search(queries, protocol);
    return res.status(200).json({ results, count: results.length, filteredProtocol: protocol });
  } catch (e: any) {
    console.error('port-lookup error:', e?.message || e);
    return res.status(500).json({ error: 'Server error.' });
  }
}
