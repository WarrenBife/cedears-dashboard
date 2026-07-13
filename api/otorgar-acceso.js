const { Redis } = require('@upstash/redis');
const kv = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });

const EXPIRY_MS = 365 * 24 * 60 * 60 * 1000;
const PRODUCTOS_VALIDOS = ['dashboard', 'planilla'];

// Alta manual de acceso: para casos donde un pago real no quedo registrado
// (por ejemplo, ocurrido antes de tener el webhook andando). Protegido con
// ADMIN_SECRET, no expuesto al frontend.
module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  const { email: rawEmail, products: rawProducts, secret, payment_id } = req.query;

  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const email = (rawEmail || '').toLowerCase().trim();
  if (!email) return res.status(400).json({ error: 'email requerido' });

  const products = (rawProducts || 'dashboard')
    .split(',')
    .map(p => p.trim())
    .filter(p => PRODUCTOS_VALIDOS.includes(p));
  if (!products.length) return res.status(400).json({ error: 'products invalido (dashboard, planilla)' });

  const pid = payment_id || `manual-${Date.now()}`;
  const exp = Date.now() + EXPIRY_MS;

  const existing = await kv.get(`email:${email}`);
  const existing_products = existing?.products || [];
  const all_products = [...new Set([...existing_products, ...products])];

  await kv.set(`email:${email}`, { payment_id: pid, exp, products: all_products });
  await kv.set(`pago:${pid}`, { email, products: all_products, exp, fecha: new Date().toISOString(), manual: true });

  res.json({ ok: true, email, products: all_products, exp, payment_id: pid });
};
