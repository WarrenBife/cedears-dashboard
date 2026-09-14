// DIAGNÓSTICO TEMPORAL (2026-09-14) -- investigar por qué el checkout de
// suscripciones (PreApproval) devuelve "Esta página no existe" en
// MercadoPago pese a que la creación via API responde 200 OK. Se borra
// apenas se tenga el diagnóstico, no queda en producción.
const { MercadoPagoConfig, PreApproval, PreApprovalPlan } = require('mercadopago');

const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const out = {};

  // 1) Info del token (sin exponer el valor real) -- prefijo revela si es
  //    TEST- (sandbox) o APP_USR- (produccion), y si esta seteado.
  const token = process.env.MP_ACCESS_TOKEN || '';
  out.token_presente = !!token;
  out.token_prefijo = token ? token.split('-')[0] : null;
  out.token_largo = token.length;

  // 2) Crear un preapproval de prueba (igual que crear-pago.js) y
  //    despues consultarlo via GET con el mismo token, a ver que dice
  //    MP de su propio objeto recien creado.
  try {
    const preapprovalApi = new PreApproval(client);
    const creado = await preapprovalApi.create({
      body: {
        reason: 'DIAGNOSTICO temporal - Warren Bife',
        external_reference: 'diagnostico-temporal',
        payer_email: 'test-diagnostico-wb@example.com',
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          transaction_amount: 100,
          currency_id: 'ARS',
        },
        back_url: 'https://warrenbife.com/api/confirmar-suscripcion',
        status: 'pending',
      },
    });
    out.create_ok = true;
    out.create_id = creado.id;
    out.create_status = creado.status;
    out.create_init_point = creado.init_point;

    // GET del mismo objeto
    try {
      const leido = await preapprovalApi.get({ id: creado.id });
      out.get_ok = true;
      out.get_raw = leido;
    } catch (e2) {
      out.get_ok = false;
      out.get_error = e2?.message || String(e2);
    }
  } catch (e1) {
    out.create_ok = false;
    out.create_error_message = e1?.message;
    out.create_error_cause = e1?.cause;
    out.create_error_full = JSON.stringify(e1);
  }

  // 3) Intentar crear un Plan de Suscripción (PreApprovalPlan) -- si la
  //    cuenta necesita un plan asociado, esto deberia funcionar bien;
  //    si la cuenta no esta habilitada para Suscripciones, esto deberia
  //    fallar con un error explicito (a diferencia del preapproval
  //    "suelto", que arriba de crea sin quejarse).
  try {
    const planApi = new PreApprovalPlan(client);
    const plan = await planApi.create({
      body: {
        reason: 'DIAGNOSTICO temporal - Plan Warren Bife',
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          transaction_amount: 100,
          currency_id: 'ARS',
        },
        back_url: 'https://warrenbife.com/api/confirmar-suscripcion',
      },
    });
    out.plan_ok = true;
    out.plan_id = plan.id;
    out.plan_init_point = plan.init_point;
  } catch (e3) {
    out.plan_ok = false;
    out.plan_error_message = e3?.message;
    out.plan_error_cause = e3?.cause;
    out.plan_error_full = JSON.stringify(e3);
  }

  res.status(200).json(out);
};
