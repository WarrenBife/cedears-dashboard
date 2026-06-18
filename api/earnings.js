const https = require('https');

const API_KEY = process.env.FINNHUB_KEY;

function finnhubGet(path) {
  return new Promise((resolve) => {
    const url = `https://finnhub.io/api/v1${path}&token=${API_KEY}`;
    const req = https.get(url, { headers: { 'Accept': 'application/json' } }, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) return resolve(null);
          resolve(JSON.parse(data));
        } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(10000, () => { req.destroy(); resolve(null); });
  });
}

const ALLOWED_ORIGINS = ['https://warrenbife.com', 'https://www.warrenbife.com'];
function setCors(req, res) {
  const origin = req.headers.origin || '';
  const ok = ALLOWED_ORIGINS.includes(origin) || /\.vercel\.app$/.test(origin);
  res.setHeader('Access-Control-Allow-Origin', ok ? origin : ALLOWED_ORIGINS[0]);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Vary', 'Origin');
}

module.exports = async (req, res) => {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'max-age=900');

  if (!API_KEY) return res.status(503).json({ error: 'Finnhub key not configured' });

  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'Missing from/to' });

  const data = await finnhubGet(`/calendar/earnings?from=${from}&to=${to}`);
  if (!data) return res.status(502).json({ error: 'Finnhub unavailable' });

  const HOUR_MAP = { bmo: 'BMO', amc: 'AMC', dmh: 'TBD' };

  const earnings = (data.earningsCalendar || []).map(e => ({
    date:      e.date,
    ticker:    e.symbol,
    when:      HOUR_MAP[e.hour] || 'TBD',
    epsEst:    e.epsEstimate  ?? null,
    epsActual: e.epsActual    ?? null,
    revEst:    e.revenueEstimate ?? null,
  }));

  res.json({ earnings });
};
