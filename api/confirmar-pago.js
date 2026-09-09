const { MercadoPagoConfig, Payment } = require('mercadopago');
const { Redis } = require('@upstash/redis');
const kv = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
const crypto = require('crypto');

const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
const SITE_URL = process.env.SITE_URL
  || (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`)
  || `https://${process.env.VERCEL_URL}`;
const SECRET  = process.env.ACCESS_SECRET;
const DIA_MS  = 24 * 60 * 60 * 1000;
const EXPIRY_MS_ANUAL  = 365 * DIA_MS; // default -- plan anual combo, pago único
const EXPIRY_MS_MANUAL = 35  * DIA_MS; // "mensual pago único" (ver admin.js action=generar_link_manual),
                                        // mismo colchón de 35 días que usan las suscripciones (PreApproval)

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

    // external_reference = "email|product1,product2" (plan anual, default)
    //                    o "email|product1,product2|manual35" (mensual pago único manual)
    // IMPORTANTE (fix seguridad 9/9/2026): se lee de result.external_reference
    // (verificado contra la API de MP, atado al payment_id ya confirmado como
    // 'approved') y NUNCA de req.query.external_reference -- ese query param
    // es parte de la URL de redirección, así que cualquiera podría armar a mano
    // un link con su propio payment_id aprobado (de cualquier monto) pero con un
    // external_reference distinto, y auto-otorgarse (o regalar) acceso a
    // cualquier email/producto/plan sin pagarlo. webhook-mp.js y
    // confirmar-suscripcion.js ya leían del objeto verificado -- éste era el
    // único de los tres que confiaba en el valor sin verificar.
    const ref      = result.external_reference || '';
    const [rawEmail, productsStr, planTag] = ref.split('|');
    const email    = (rawEmail || '').toLowerCase().trim();
    const products = productsStr ? productsStr.split(',').filter(Boolean) : ['dashboard'];

    const expiry = Date.now() + (planTag === 'manual35' ? EXPIRY_MS_MANUAL : EXPIRY_MS_ANUAL);
    const token  = generarToken(payment_id, expiry);

    if (email) {
      // Merge con productos existentes
      const existing = await kv.get(`email:${email}`);
      const existing_products = existing?.products || (existing ? ['dashboard'] : []);
      const all_products = [...new Set([...existing_products, ...products])];
      await kv.set(`email:${email}`, { payment_id, exp: expiry, products: all_products });
      await kv.set(`pago:${payment_id}`, { email, products: all_products, exp: expiry, fecha: new Date().toISOString() });
    }

    console.log(`[confirmar-pago] OK — pid=${payment_id} email=${email} products=${products}`);

    const productsParam = products.join(',');
    res.redirect(`${SITE_URL}/?token=${token}&pid=${payment_id}&exp=${expiry}&email=${encodeURIComponent(email)}&products=${productsParam}`);
  } catch (err) {
    console.error('[confirmar-pago]', err.message);
    res.redirect(`${SITE_URL}/?pago=error`);
  }
};
