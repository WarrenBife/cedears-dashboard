const { Redis } = require('@upstash/redis');
const kv = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });

// Consulta rapida y privada: dado un payment_id (o preapproval_id) de MercadoPago,
// devuelve el mail y los productos que quedaron registrados en Redis para ese pago.
module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  const { payment_id, secret } = req.query;

  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  if (!payment_id) {
    return res.status(400).json({ error: 'payment_id requerido' });
  }

  const data = await kv.get(`pago:${payment_id}`);
  if (!data) return res.json({ found: false });
  res.json({ found: true, ...data });
};
