const { Redis } = require('@upstash/redis');
const kv = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });

const EXPIRY_MS = 365 * 24 * 60 * 60 * 1000;
const PRODUCTOS_VALIDOS = ['dashboard', 'planilla'];

// Endpoint admin unico (consolida buscar-pago + otorgar-acceso para no pasar
// el limite de 12 Serverless Functions del plan Hobby de Vercel).
// Protegido con ADMIN_SECRET, no expuesto al frontend -- EXCEPTO
// action=feedback_enviar (ver mas abajo), que es la unica pensada para
// que la llame cualquier suscriptor, no el dueño del sitio.
//
// Uso:
//   ?action=buscar&payment_id=X&secret=...
//   ?action=otorgar&email=Y&products=dashboard,planilla&secret=...  (products opcional, default dashboard)
//   ?action=backfill&secret=...  (corrida unica: crea pago:{id} para los email:* viejos que no lo tengan)
//   ?action=listar&secret=...  (lista todos los email:* con dias restantes, ordenados por vencer antes primero --
//   para chequear a ojo que las renovaciones mensuales esten entrando: si un subscription_id se queda pegado
//   bajando de dia sin volver a subir a ~30-33, el webhook de esa renovacion no esta llegando)
//   POST ?action=feedback_enviar  body:{email, texto}  -- SIN secret, la llama el dashboard.
//     Guarda un comentario de un suscriptor (popup "Danos tu opinión", 2026-09-06).
//   ?action=feedback_listar&secret=...  -- lee todos los comentarios guardados, mas nuevos primero.
module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');

  // action=feedback_enviar va ANTES del gate de ADMIN_SECRET a propósito:
  // es la única acción de este archivo pensada para que la llame
  // cualquier suscriptor logueado desde el dashboard, no el dueño del
  // sitio -- todo lo demás de acá abajo sigue protegido igual que
  // siempre. CORS explícito porque, a diferencia del resto de este
  // archivo (uso interno del dueño vía curl/PowerShell), esta acción la
  // llama el navegador del suscriptor con fetch().
  if (req.query.action === 'feedback_enviar') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    const email = (req.body?.email || '').toLowerCase().trim();
    const texto = (req.body?.texto || '').trim();
    if (!texto) return res.status(400).json({ error: 'Comentario vacío' });
    if (texto.length > 2000) return res.status(400).json({ error: 'Comentario demasiado largo (máx. 2000 caracteres)' });

    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      await kv.set(`feedback:${id}`, { email: email || null, texto, fecha: new Date().toISOString() });
      return res.json({ ok: true });
    } catch (err) {
      console.error('[admin/feedback_enviar]', err.message);
      return res.status(500).json({ error: 'Error guardando el comentario' });
    }
  }

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

  if (action === 'feedback_listar') {
    const keys = await kv.keys('feedback:*');
    const comentarios = [];
    for (const key of keys) {
      const data = await kv.get(key);
      if (!data) continue;
      comentarios.push({ id: key.replace(/^feedback:/, ''), email: data.email, texto: data.texto, fecha: data.fecha });
    }
    // Mas nuevos primero (el id arranca con Date.now(), ordena bien como string)
    comentarios.sort((a, b) => b.id.localeCompare(a.id));
    return res.json({ ok: true, total: comentarios.length, comentarios });
  }

  res.status(400).json({ error: 'action invalido (buscar, otorgar, backfill, listar, feedback_listar)' });
};
