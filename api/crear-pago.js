const { MercadoPagoConfig, Preference } = require('mercadopago');

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
});

const SITE_URL = process.env.SITE_URL || `https://${process.env.VERCEL_URL}`;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const email = (req.body?.email || '').toLowerCase().trim();

  try {
    const preference = new Preference(client);
    const result = await preference.create({
      body: {
        items: [
          {
            title: 'Warren Bife Dashboard — Acceso completo',
            description: 'Acceso ilimitado al dashboard de CEDEARs y mercados globales',
            quantity: 1,
            currency_id: 'ARS',
            unit_price: 10000,
          },
        ],
        back_urls: {
          success: `${SITE_URL}/api/confirmar-pago`,
          failure: `${SITE_URL}/?pago=fallido`,
          pending: `${SITE_URL}/?pago=pendiente`,
        },
        auto_return: 'approved',
        statement_descriptor: 'WARREN BIFE',
        external_reference: email,
      },
    });

    res.status(200).json({
      init_point:    result.init_point,
      sandbox_init_point: result.sandbox_init_point,
      preference_id: result.id,
    });
  } catch (err) {
    console.error('[crear-pago]', err.message);
    res.status(500).json({ error: err.message });
  }
};
