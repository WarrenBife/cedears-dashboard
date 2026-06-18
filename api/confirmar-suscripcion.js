const { MercadoPagoConfig, PreApproval } = require('mercadopago');
const { Redis } = require('@upstash/redis');
const crypto = require('crypto');

const kv       = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
const client   = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
const SITE_URL = process.env.SITE_URL || `https://${process.env.VERCEL_URL}`;
const SECRET   = process.env.ACCESS_SECRET;
const EXPIRY_MS = 365 * 24 * 60 * 60 * 1000;

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

    const expiry = Date.now() + EXPIRY_MS;
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
    }

    console.log(`[confirmar-suscripcion] OK — sub=${preapproval_id} email=${email} products=${products}`);
    res.redirect(`${SITE_URL}/?token=${token}&pid=${preapproval_id}&exp=${expiry}&email=${encodeURIComponent(email)}&products=${products.join(',')}`);
  } catch (err) {
    console.error('[confirmar-suscripcion]', err.message);
    res.redirect(`${SITE_URL}/?pago=error`);
  }
};
