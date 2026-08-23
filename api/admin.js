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
//   ?action=backfill&secret=...  (corrida unica: crea pago:{id} para los email:* viejos que no lo tengan)
//   ?action=listar&secret=...  (lista todos los email:* con dias restantes, ordenados por vencer antes primero --
//   para chequear a ojo que las renovaciones mensuales esten entrando: si un subscription_id se queda pegado
//   bajando de dia sin volver a subir a ~30-33, el webhook de esa renovacion no esta llegando)
module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');

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
    const { email: rawEmail, products: rawProducts, payment_id, dias } = req.query;

    const email = (rawEmail || '').toLowerCase().trim();
    if (!email) return res.status(400).json({ error: 'email requerido' });

    const products = (rawProducts || 'dashboard')
      .split(',')
      .map(p => p.trim())
      .filter(p => PRODUCTOS_VALIDOS.includes(p));
    if (!products.length) return res.status(400).json({ error: 'products invalido (dashboard, planilla)' });

    const pid = payment_id || `manual-${Date.now()}`;
    // dias opcional: default 365 (anual). Para un pago mensual que no se registró solo, usar ?dias=33
    const expiryMs = dias ? Number(dias) * 24 * 60 * 60 * 1000 : EXPIRY_MS;
    const exp = Date.now() + expiryMs;

    const existing = await kv.get(`email:${email}`);
    const existing_products = existing?.products || [];
    const all_products = [...new Set([...existing_products, ...products])];

    await kv.set(`email:${email}`, { payment_id: pid, exp, products: all_products });
    await kv.set(`pago:${pid}`, { email, products: all_products, exp, fecha: new Date().toISOString(), manual: true });

    return res.json({ ok: true, email, products: all_products, exp, payment_id: pid });
  }

  if (action === 'backfill') {
    const keys = await kv.keys('email:*');
    let creados = 0, existentes = 0, sinPid = 0;

    for (const key of keys) {
      const data = await kv.get(key);
      if (!data || !data.payment_id) { sinPid++; continue; }

      const pagoKey = `pago:${data.payment_id}`;
      const yaExiste = await kv.get(pagoKey);
      if (yaExiste) { existentes++; continue; }

      const email = key.replace(/^email:/, '');
      // Fecha aproximada: no se guardaba explicita en los registros viejos,
      // se calcula como exp - 365 dias (la duracion fija del acceso).
      const fecha = data.exp ? new Date(data.exp - EXPIRY_MS).toISOString() : null;

      await kv.set(pagoKey, {
        email,
        products:        data.products || ['dashboard'],
        exp:             data.exp,
        fecha,
        subscription_id: data.subscription_id,
        backfill:        true,
      });
      creados++;
    }

    return res.json({ ok: true, total: keys.length, creados, existentes, sinPid });
  }

  if (action === 'listar') {
    const keys  = await kv.keys('email:*');
    const ahora = Date.now();

    const registros = [];
    for (const key of keys) {
      const data = await kv.get(key);
      if (!data) continue;

      const diasRestantes = data.exp ? Math.round((data.exp - ahora) / (24 * 60 * 60 * 1000)) : null;
      registros.push({
        email:            key.replace(/^email:/, ''),
        products:         data.products || ['dashboard'],
        exp_fecha:        data.exp ? new Date(data.exp).toISOString() : null,
        dias_restantes:   diasRestantes,
        vencido:          diasRestantes !== null && diasRestantes < 0,
        es_suscripcion:   !!data.subscription_id, // false = pago unico anual
        subscription_id:  data.subscription_id || null,
        payment_id:       data.payment_id || null,
      });
    }

    // Los que estan por vencer primero, para verlos de un vistazo arriba de todo
    registros.sort((a, b) => (a.dias_restantes ?? Infinity) - (b.dias_restantes ?? Infinity));

    return res.json({ ok: true, total: registros.length, registros });
  }

  res.status(400).json({ error: 'action invalido (buscar, otorgar, backfill, listar)' });
};
