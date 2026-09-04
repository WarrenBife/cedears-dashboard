const { MercadoPagoConfig, PreApproval } = require('mercadopago');
const { Redis } = require('@upstash/redis');
const crypto = require('crypto');

const kv       = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
const client   = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
const SITE_URL = process.env.SITE_URL
  || (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`)
  || `https://${process.env.VERCEL_URL}`;
const SECRET   = process.env.ACCESS_SECRET;

// Duración de acceso según la frecuencia REAL de la suscripción, no un valor fijo:
// si ya existiera alguna suscripción con otra frecuencia (ej. una anual armada a
// mano en el panel de MP), esto no la toca — solo el caso mensual nuevo (frequency:1,
// frequency_type:'months') recibe la duración corta. Cualquier otro caso cae al
// fallback de 365 días, igual que siempre.
function _duracionMs(autoRecurring) {
  const DIA_MS = 24 * 60 * 60 * 1000;
  const esMensualNueva = autoRecurring?.frequency_type === 'months' && autoRecurring?.frequency === 1;
  // Colchón subido de 3 a 5 días (2026-09-04, pedido del usuario): así le
  // da tiempo al 3er reintento de cobro de MercadoPago antes de cortar el
  // acceso -- caso real juanloderer, cuyo 3er intento entró bien el mismo
  // día en que el colchón de 3 días ya se le habría vencido.
  return esMensualNueva ? 35 * DIA_MS : 365 * DIA_MS; // 35 = 30 reales + colchón reintento MP
}

function generarToken(id, expiry) {
  return crypto.createHmac('sha256', SECRET).update(`${id}:${expiry}`).digest('hex');
}

module.exports = async (req, res) => {
  const { preapproval_id, status } = req.query;

  if (!preapproval_id || !['authorized', 'approved'].includes(status)) {
    return res.redirect(`${SITE_URL}/?pago=fallido`);
  }

  try {
    const preapprovalApi = new PreApproval(client);
    const sub = await preapprovalApi.get({ id: preapproval_id });

    if (!['authorized', 'active'].includes(sub.status)) {
      return res.redirect(`${SITE_URL}/?pago=fallido`);
    }

    const [rawEmail, productsStr] = (sub.external_reference || '').split('|');
    const email    = (rawEmail || '').toLowerCase().trim();
    const products = productsStr ? productsStr.split(',').filter(Boolean) : ['dashboard'];

    const expiry = Date.now() + _duracionMs(sub.auto_recurring);
    const token  = generarToken(preapproval_id, expiry);

    if (email) {
      const existing = await kv.get(`email:${email}`);
      const prev_products = existing?.products || (existing ? ['dashboard'] : []);
      const all_products  = [...new Set([...prev_products, ...products])];
      await kv.set(`email:${email}`, {
        payment_id:      preapproval_id,
        exp:             expiry,
        products:        all_products,
        subscription_id: preapproval_id,
      });
      await kv.set(`pago:${preapproval_id}`, { email, products: all_products, exp: expiry, subscription_id: preapproval_id, fecha: new Date().toISOString() });
    }

    console.log(`[confirmar-suscripcion] OK — sub=${preapproval_id} email=${email} products=${products}`);
    res.redirect(`${SITE_URL}/?token=${token}&pid=${preapproval_id}&exp=${expiry}&email=${encodeURIComponent(email)}&products=${products.join(',')}`);
  } catch (err) {
    console.error('[confirmar-suscripcion]', err.message);
    res.redirect(`${SITE_URL}/?pago=error`);
  }
};
