const { MercadoPagoConfig, Payment } = require('mercadopago');
const { Redis } = require('@upstash/redis');
const kv = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
const crypto = require('crypto');

const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
const SITE_URL = process.env.SITE_URL
  || (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`)
  || `https://${process.env.VERCEL_URL}`;
const SECRET    = process.env.ACCESS_SECRET;
const EXPIRY_MS = 365 * 24 * 60 * 60 * 1000;

function generarToken(paymentId, expiry) {
  return crypto.createHmac('sha256', SECRET).update(`${paymentId}:${expiry}`).digest('hex');
}

module.exports = async (req, res) => {
  const { payment_id, status } = req.query;

  if (status !== 'approved') {
    return res.redirect(`${SITE_URL}/?pago=fallido`);
  }

  try {
    const payment = new Payment(client);
    const result  = await payment.get({ id: payment_id });

    if (result.status !== 'approved') {
      return res.redirect(`${SITE_URL}/?pago=fallido`);
    }

    const expiry = Date.now() + EXPIRY_MS;
    const token  = generarToken(payment_id, expiry);

    // external_reference = "email|product1,product2"
    const ref      = req.query.external_reference || '';
    const [rawEmail, productsStr] = ref.split('|');
    const email    = (rawEmail || '').toLowerCase().trim();
    const products = productsStr ? productsStr.split(',').filter(Boolean) : ['dashboard'];

    if (email) {
      // Merge con productos existentes
      const existing = await kv.get(`email:${email}`);
      const existing_products = existing?.products || (existing ? ['dashboard'] : []);
      const all_products = [...new Set([...existing_products, ...products])];
      await kv.set(`email:${email}`, { payment_id, exp: expiry, products: all_products });
    }

    console.log(`[confirmar-pago] OK — pid=${payment_id} email=${email} products=${products}`);

    const productsParam = products.join(',');
    res.redirect(`${SITE_URL}/?token=${token}&pid=${payment_id}&exp=${expiry}&email=${encodeURIComponent(email)}&products=${productsParam}`);
  } catch (err) {
    console.error('[confirmar-pago]', err.message);
    res.redirect(`${SITE_URL}/?pago=error`);
  }
};
