import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.POSTGRES_URL });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).send('Method Not Allowed');

  const cert = (req.query.cert as string) || 'secplus';
  const limit = Math.max(1, Math.min(Number(req.query.limit ?? 25), 50));
  const shuffle = req.query.shuffle === '1';
  const domain = req.query.domain as string | undefined;
  const difficulty = req.query.difficulty as string | undefined;

  const where: string[] = ['cert = $1'];
  const vals: any[] = [cert];
  if (domain) { where.push(`domain = $${vals.length + 1}`); vals.push(domain); }
  if (difficulty) { where.push(`difficulty = $${vals.length + 1}`); vals.push(difficulty); }

  const order = shuffle ? 'ORDER BY random()' : 'ORDER BY qnum';
  const sql = `
    SELECT qnum, question, option_a, option_b, option_c, option_d, answer, difficulty, domain
    FROM quiz_questions
    WHERE ${where.join(' AND ')}
    ${order}
    LIMIT ${limit}
  `;

  const { rows } = await pool.query(sql, vals);
  res.setHeader('content-type', 'application/json');
  res.status(200).json({ cert, count: rows.length, questions: rows });
}
