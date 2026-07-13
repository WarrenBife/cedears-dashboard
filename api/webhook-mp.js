const { MercadoPagoConfig, Payment, PreApproval } = require('mercadopago');
const { Redis } = require('@upstash/redis');
const crypto = require('crypto');

const kv     = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
const WEBHOOK_SECRET = process.env.MP_WEBHOOK_SECRET;
const EXPIRY_MS = 365 * 24 * 60 * 60 * 1000;

function firmaValida(req, id) {
  if (!WEBHOOK_SECRET) return true; // sin secret configurado: aceptar (dev)
  try {
    const sig       = req.headers['x-signature'] || '';
    const requestId = req.headers['x-request-id'] || '';
    const ts = (sig.match(/ts=(\d+)/) || [])[1];
    const v1 = (sig.match(/v1=([a-f0-9]+)/) || [])[1];
    if (!ts || !v1) return false;
    const expected = crypto
      .createHmac('sha256', WEBHOOK_SECRET)
      .update(`id:${id};request-id:${requestId};ts:${ts}`)
      .digest('hex');
    if (v1.length !== expected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(v1, 'hex'), Buffer.from(expected, 'hex'));
  } catch { return false; }
}

module.exports = async (req, res) => {
  // MP requiere 200 inmediato o reintenta
  res.status(200).end();

  // MP envía GET (topic + id) o POST (type + data.id)
  const topic = req.query.topic || req.query.type || req.body?.type;
  const id    = String(req.query.id || req.body?.data?.id || '');

  if (!topic || !id) return;

  try {
    if (topic === 'payment') {
      if (!firmaValida(req, id)) {
        console.warn('[webhook] Firma inválida — payment', id);
        return;
      }

      const paymentApi = new Payment(client);
      const p = await paymentApi.get({ id });
      if (p.status !== 'approved') return;

      const expiry = Date.now() + EXPIRY_MS;
      const subId  = p.subscription_id || p.metadata?.preapproval_id;

      if (subId) {
        // Renovación de suscripción — el mail correcto vive en la suscripción, no en el pago
        const preapprovalApi = new PreApproval(client);
        const sub = await preapprovalApi.get({ id: subId });
        const [rawEmail, productsStr] = (sub.external_reference || '').split('|');
        const email    = (rawEmail || '').toLowerCase().trim();
        const products = productsStr ? productsStr.split(',').filter(Boolean) : ['dashboard'];
        if (!email) return;

        const existing = await kv.get(`email:${email}`);
        await kv.set(`email:${email}`, {
          payment_id:      String(p.id),
          exp:             expiry,
          products:        existing?.products || products,
          subscription_id: subId,
        });
        await kv.set(`pago:${p.id}`, { email, products: existing?.products || products, exp: expiry, subscription_id: subId, fecha: new Date().toISOString() });
        console.log(`[webhook] Renovación OK — email=${email} pid=${p.id} sub=${subId} exp=${new Date(expiry).toISOString()}`);

      } else {
        // Pago único (Preference de crear-pago.js) — respaldo por si la redirección
        // nunca llegó a confirmar-pago.js (browser cerrado, conexión cortada, etc.)
        const [rawEmail, productsStr] = (p.external_reference || '').split('|');
        const email    = (rawEmail || '').toLowerCase().trim();
        const products = productsStr ? productsStr.split(',').filter(Boolean) : ['dashboard'];
        if (!email) {
          console.warn(`[webhook] Pago único sin external_reference válido — pid=${id}`);
          return;
        }

        const existing = await kv.get(`email:${email}`);
        const existing_products = existing?.products || (existing ? ['dashboard'] : []);
        const all_products = [...new Set([...existing_products, ...products])];
        await kv.set(`email:${email}`, { payment_id: String(p.id), exp: expiry, products: all_products });
        await kv.set(`pago:${p.id}`, { email, products: all_products, exp: expiry, fecha: new Date().toISOString() });
        console.log(`[webhook] Pago único OK (respaldo webhook) — email=${email} pid=${p.id}`);
      }

    } else if (topic === 'preapproval' || topic === 'subscription_preapproval') {
      const preapprovalApi = new PreApproval(client);
      const sub = await preapprovalApi.get({ id });
      if (sub.status === 'cancelled') {
        // El acceso vence solo con el exp guardado en Redis — no se elimina manualmente
        console.log(`[webhook] Suscripción cancelada — sub=${id} ref=${sub.external_reference}`);
      }
    }
  } catch (err) {
    console.error('[webhook] Error:', err.message, '| topic:', topic, '| id:', id);
  }
};
