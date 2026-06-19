const { Redis } = require('@upstash/redis');
const crypto = require('crypto');

const kv     = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
const SECRET = process.env.ACCESS_SECRET;
const TRIAL_MS = 7 * 24 * 60 * 60 * 1000;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const email = (req.body?.email || '').toLowerCase().trim();
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Email inválido' });
  if (!SECRET) return res.status(503).json({ error: 'Servicio no configurado' });

  // Rate limit: 5 intentos por IP por hora
  const ip    = ((req.headers['x-forwarded-for'] || '') + '').split(',')[0].trim() || 'anon';
  const rlKey = `rl:trial:${ip}`;
  const count = await kv.incr(rlKey);
  if (count === 1) await kv.expire(rlKey, 3600);
  if (count > 5) return res.status(429).json({ error: 'Demasiados intentos. Intentá más tarde.' });

  // Verificar si ya usó el trial (marca permanente)
  const trialUsado = await kv.get(`trial:${email}`);
  if (trialUsado) return res.status(403).json({ error: 'Este email ya usó el período de prueba.' });

  // Si ya tiene acceso pago activo, no hace falta trial
  const existing = await kv.get(`email:${email}`);
  if (existing && !existing.trial && Date.now() < parseInt(existing.exp, 10)) {
    return res.status(403).json({ error: 'Este email ya tiene acceso activo.' });
  }

  const pid   = `trial-${Date.now()}`;
  const exp   = Date.now() + TRIAL_MS;
  const token = crypto.createHmac('sha256', SECRET).update(`${pid}:${exp}`).digest('hex');

  await kv.set(`email:${email}`, { payment_id: pid, exp, products: ['dashboard', 'planilla'], trial: true }, { ex: 7 * 24 * 60 * 60 });
  await kv.set(`trial:${email}`, 1); // sin TTL — marca permanente para evitar reusar

  res.json({ valid: true, token, pid, exp, email, products: ['dashboard', 'planilla'] });
};
