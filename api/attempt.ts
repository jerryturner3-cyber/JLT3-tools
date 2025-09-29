import crypto from "crypto";
import { getPool } from "./_db.js";
import { applyCors } from "../utils/cors.js";  // reuse shared CORS

const pool = getPool();

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  const { cert, score, total, answers } = (req.body || {}) as {
    cert?: string; score?: number; total?: number; answers?: Record<string, string>;
  };

  if (!cert || typeof score !== "number" || typeof total !== "number" || !answers) {
    return res.status(400).json({ ok: false, error: "bad_request" });
  }

  const ip = (req.headers["x-forwarded-for"] as string) || "0.0.0.0";
  const ua = (req.headers["user-agent"] as string) || "";
  const salt = process.env.QUIZ_SALT || "";
  const ip_hash = crypto.createHash("sha256").update(ip + salt).digest("hex");

  await pool.query(
    `INSERT INTO quiz_attempts (cert, score, total, answers, ip_hash, ua)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
    [cert, score, total, JSON.stringify(answers), ip_hash, ua]
  );

  res.setHeader("content-type", "application/json");
  res.status(200).json({ ok: true });
}
