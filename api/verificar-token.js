const crypto = require('crypto');

const SECRET = process.env.ACCESS_SECRET;

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
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
