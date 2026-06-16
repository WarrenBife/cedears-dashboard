const { Redis } = require('@upstash/redis');
const crypto    = require('crypto');

const kv     = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
const SECRET = process.env.ACCESS_SECRET;

const ALLOWED_ORIGINS = ['https://warrenbife.com', 'https://www.warrenbife.com'];
function setCors(req, res) {
  const origin = req.headers.origin || '';
  const ok = ALLOWED_ORIGINS.includes(origin) || /\.vercel\.app$/.test(origin);
  res.setHeader('Access-Control-Allow-Origin', ok ? origin : ALLOWED_ORIGINS[0]);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Vary', 'Origin');
}

// Bypass users: solo en servidor, no expuestos en el frontend
const BYPASS_USERS = {
  ale:  ['dashboard', 'planilla'],
  cata: ['dashboard'],
  pipe: ['planilla'],
};

module.exports = async (req, res) => {
  setCors(req, res);
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const email = (req.query.email || '').toLowerCase().trim();
  if (!email || !SECRET) return res.status(400).json({ valid: false, reason: 'params_missing' });

  // Rate limit: 10 intentos por IP por minuto
  const ip    = ((req.headers['x-forwarded-for'] || '') + '').split(',')[0].trim() || 'anon';
  const rlKey = `rl:ve:${ip}`;
  const count = await kv.incr(rlKey);
  if (count === 1) await kv.expire(rlKey, 60);
  if (count > 10) return res.status(429).json({ valid: false, reason: 'too_many_requests' });

  // Bypass users (verificado server-side, no expuesto al cliente)
  const bypassProds = BYPASS_USERS[email];
  if (bypassProds) {
    const pid   = `bypass-${email}`;
    const exp   = Date.now() + 365 * 24 * 60 * 60 * 1000;
    const token = crypto.createHmac('sha256', SECRET).update(`${pid}:${exp}`).digest('hex');
    return res.json({ valid: true, token, pid, exp, email, products: bypassProds });
  }

  // Usuarios normales: verificar en Redis
  const data = await kv.get(`email:${email}`);
  if (!data) return res.json({ valid: false, reason: 'not_found' });

  const { payment_id, exp } = data;
  if (Date.now() > parseInt(exp, 10)) return res.json({ valid: false, reason: 'expired' });

  const token    = crypto.createHmac('sha256', SECRET).update(`${payment_id}:${exp}`).digest('hex');
  const products = data.products || ['dashboard'];

  res.json({ valid: true, token, pid: payment_id, exp, email, products });
};
