const { MercadoPagoConfig, Preference, PreApproval } = require('mercadopago');

const client   = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
const SITE_URL = process.env.SITE_URL
  || (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`)
  || `https://${process.env.VERCEL_URL}`;

const PRECIOS_MENSUAL    = { dashboard: 10000, planilla: 10000, both: 15000 };
const PRECIO_ANUAL_COMBO = 100000; // solo combo Dashboard + Planilla

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
  const plan = req.body?.plan === 'anual' ? 'anual' : 'mensual';

  if (!email) return res.status(400).json({ error: 'Email requerido' });

  const hasDash = products.includes('dashboard');
  const hasPlan = products.includes('planilla');

  try {
    if (plan === 'anual') {
      // El anual con descuento solo existe como combo — pago único (Preference), igual que antes
      if (!(hasDash && hasPlan)) {
        return res.status(400).json({ error: 'El plan anual solo está disponible para Dashboard + Planilla combinado' });
      }

      const preference = new Preference(client);
      const result = await preference.create({
        body: {
          items: [{
            title:       'Warren Bife Dashboard + Planilla — Suscripción anual',
            description: 'Acceso por 12 meses',
            quantity:    1,
            currency_id: 'ARS',
            unit_price:  PRECIO_ANUAL_COMBO,
          }],
          back_urls: {
            success: `${SITE_URL}/api/confirmar-pago`,
            failure: `${SITE_URL}/?pago=fallido`,
            pending: `${SITE_URL}/?pago=pendiente`,
          },
          auto_return:          'approved',
          statement_descriptor: 'WARREN BIFE',
          external_reference:   `${email}|dashboard,planilla`,
        },
      });

      return res.status(200).json({
        init_point:         result.init_point,
        sandbox_init_point: result.sandbox_init_point,
        preference_id:      result.id,
      });
    }

    // plan === 'mensual' — suscripción recurrente (PreApproval), cobro automático todos los meses
    const price = (hasDash && hasPlan) ? PRECIOS_MENSUAL.both : PRECIOS_MENSUAL.dashboard;
    const label = hasDash && hasPlan ? 'Dashboard + Planilla' : hasPlan ? 'Planilla' : 'Dashboard';

    const preapprovalApi = new PreApproval(client);
    const result = await preapprovalApi.create({
      body: {
        reason:             `Warren Bife ${label} — Suscripción mensual`,
        external_reference: `${email}|${products.join(',')}`,
        payer_email:        email,
        auto_recurring: {
          frequency:          1,
          frequency_type:     'months',
          transaction_amount: price,
          currency_id:        'ARS',
        },
        back_url: `${SITE_URL}/api/confirmar-suscripcion`,
        status:   'pending',
      },
    });

    return res.status(200).json({
      init_point:     result.init_point,
      preapproval_id: result.id,
    });
  } catch (err) {
    console.error('[crear-pago]', err.message);
    res.status(500).json({ error: err.message });
  }
};
