const { Redis } = require('@upstash/redis');
const kv = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN });
const crypto = require('crypto');

const SECRET = process.env.ACCESS_SECRET;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const email = (req.query.email || '').toLowerCase().trim();
  if (!email || !SECRET) {
    return res.status(400).json({ valid: false, reason: 'params_missing' });
  }

  const data = await kv.get(`email:${email}`);
  if (!data) {
    return res.json({ valid: false, reason: 'not_found' });
  }

  const { payment_id, exp } = data;
  if (Date.now() > parseInt(exp, 10)) {
    return res.json({ valid: false, reason: 'expired' });
  }

  const token = crypto
    .createHmac('sha256', SECRET)
    .update(`${payment_id}:${exp}`)
    .digest('hex');

  res.json({ valid: true, token, pid: payment_id, exp });
};
