const crypto = require('crypto');

const SECRET = process.env.ACCESS_SECRET;
const ALLOWED_ORIGINS = ['https://warrenbife.com', 'https://www.warrenbife.com'];

module.exports = (req, res) => {
  const origin = req.headers.origin || '';
  const ok = ALLOWED_ORIGINS.includes(origin) || /\.vercel\.app$/.test(origin);
  res.setHeader('Access-Control-Allow-Origin', ok ? origin : ALLOWED_ORIGINS[0]);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Content-Type', 'application/json');

  const { token, pid, exp } = req.query;

  if (!token || !pid || !exp || !SECRET) {
    return res.status(400).json({ valid: false, reason: 'params_missing' });
  }

  // Verificar expiración
  if (Date.now() > parseInt(exp, 10)) {
    return res.status(200).json({ valid: false, reason: 'expired' });
  }

  // Reconstruir el token esperado y comparar en tiempo constante
  const expected = crypto
    .createHmac('sha256', SECRET)
    .update(`${pid}:${exp}`)
    .digest('hex');

  const valid = crypto.timingSafeEqual(
    Buffer.from(token,    'hex'),
    Buffer.from(expected, 'hex'),
  );

  res.status(200).json({ valid });
};
