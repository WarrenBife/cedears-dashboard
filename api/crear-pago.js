const { MercadoPagoConfig, PreApproval } = require('mercadopago');

const client   = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
const SITE_URL = process.env.SITE_URL || `https://${process.env.VERCEL_URL}`;

const PRECIOS = { dashboard: 10000, planilla: 10000, both: 15000 };

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const email    = (req.body?.email || '').toLowerCase().trim();
  const products = Array.isArray(req.body?.products) && req.body.products.length
    ? req.body.products.filter(p => ['dashboard', 'planilla'].includes(p))
    : ['dashboard'];

  if (!email) return res.status(400).json({ error: 'Email requerido' });

  const hasDash = products.includes('dashboard');
  const hasPlan = products.includes('planilla');
  const price   = (hasDash && hasPlan) ? PRECIOS.both : PRECIOS.dashboard;
  const label   = hasDash && hasPlan ? 'Dashboard + Planilla' : hasPlan ? 'Planilla' : 'Dashboard';

  try {
    const preapprovalApi = new PreApproval(client);
    const result = await preapprovalApi.create({
      body: {
        reason:             `Warren Bife ${label} — Suscripción anual`,
        external_reference: `${email}|${products.join(',')}`,
        payer_email:        email,
        auto_recurring: {
          frequency:          1,
          frequency_type:     'years',
          transaction_amount: price,
          currency_id:        'ARS',
        },
        back_url: `${SITE_URL}/api/confirmar-suscripcion`,
        status:   'pending',
      },
    });

    res.status(200).json({
      init_point:         result.init_point,
      sandbox_init_point: result.sandbox_init_point || result.init_point,
      preapproval_id:     result.id,
    });
  } catch (err) {
    console.error('[crear-pago]', err.message);
    res.status(500).json({ error: err.message });
  }
};
