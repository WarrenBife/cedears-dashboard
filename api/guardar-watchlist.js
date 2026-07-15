const { Redis } = require('@upstash/redis');
const crypto    = require('crypto');

const kv     = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
const SECRET = process.env.ACCESS_SECRET;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, tables, token, pid, exp } = req.body || {};
  if (!email || !Array.isArray(tables)) return res.status(400).json({ error: 'Missing params' });

  // Verificar token de acceso antes de guardar
  if (!token || !pid || !exp || !SECRET) return res.status(401).json({ error: 'Unauthorized' });
  if (Date.now() > parseInt(exp, 10)) return res.status(401).json({ error: 'Token expired' });

  const expected = crypto.createHmac('sha256', SECRET).update(`${pid}:${exp}`).digest('hex');
  const valid = crypto.timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(expected, 'hex'));
  if (!valid) return res.status(401).json({ error: 'Invalid token' });

  await kv.set(`watchlist:${email.toLowerCase().trim()}`, { tables });
  res.json({ ok: true });
};
