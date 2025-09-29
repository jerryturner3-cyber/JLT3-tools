export default function handler(req, res) {
  res.setHeader("content-type", "application/json");
  res.status(200).json({ ok: true, time: new Date().toISOString() });
}
