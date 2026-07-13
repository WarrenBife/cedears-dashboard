const { Redis } = require('@upstash/redis');
const kv = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });

const EXPIRY_MS = 365 * 24 * 60 * 60 * 1000;
const PRODUCTOS_VALIDOS = ['dashboard', 'planilla'];

// Endpoint admin unico (consolida buscar-pago + otorgar-acceso para no pasar
// el limite de 12 Serverless Functions del plan Hobby de Vercel).
// Protegido con ADMIN_SECRET, no expuesto al frontend.
//
// Uso:
//   ?action=buscar&payment_id=X&secret=...
//   ?action=otorgar&email=Y&products=dashboard,planilla&secret=...  (products opcional, default dashboard)
module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  const { action, secret } = req.query;

  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  if (action === 'buscar') {
    const { payment_id } = req.query;
    if (!payment_id) return res.status(400).json({ error: 'payment_id requerido' });

    const data = await kv.get(`pago:${payment_id}`);
    if (!data) return res.json({ found: false });
    return res.json({ found: true, ...data });
  }

  if (action === 'otorgar') {
    const { email: rawEmail, products: rawProducts, payment_id } = req.query;

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

    return res.json({ ok: true, email, products: all_products, exp, payment_id: pid });
  }

  res.status(400).json({ error: 'action invalido (buscar, otorgar)' });
};
