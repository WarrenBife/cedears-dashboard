const { MercadoPagoConfig, Payment } = require('mercadopago');
const crypto = require('crypto');

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
});

const SITE_URL   = process.env.SITE_URL || `https://${process.env.VERCEL_URL}`;
const SECRET     = process.env.ACCESS_SECRET;
const EXPIRY_MS  = 365 * 24 * 60 * 60 * 1000; // 1 año

function generarToken(paymentId, expiry) {
  return crypto
    .createHmac('sha256', SECRET)
    .update(`${paymentId}:${expiry}`)
    .digest('hex');
}

module.exports = async (req, res) => {
  const { payment_id, status } = req.query;

  // Pago no aprobado → volver al inicio con mensaje
  if (status !== 'approved') {
    return res.redirect(`${SITE_URL}/?pago=fallido`);
  }

  try {
    // Verificar el pago directamente con la API de MP
    const payment = new Payment(client);
    const result  = await payment.get({ id: payment_id });

    if (result.status !== 'approved') {
      console.warn('[confirmar-pago] Pago no aprobado:', result.status);
      return res.redirect(`${SITE_URL}/?pago=fallido`);
    }

    // Generar token firmado con expiración de 1 año
    const expiry = Date.now() + EXPIRY_MS;
    const token  = generarToken(payment_id, expiry);

    console.log(`[confirmar-pago] Pago OK — payment_id=${payment_id}`);

    // Redirigir al dashboard con el token en la URL
    res.redirect(`${SITE_URL}/?token=${token}&pid=${payment_id}&exp=${expiry}`);
  } catch (err) {
    console.error('[confirmar-pago]', err.message);
    res.redirect(`${SITE_URL}/?pago=error`);
  }
};
