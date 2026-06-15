const https = require('https');

function getQuote(sym) {
  return new Promise((resolve) => {
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`;
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json, */*',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    }, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) return resolve([sym, null]);
          const json = JSON.parse(data);
          const meta = json?.chart?.result?.[0]?.meta;
          if (!meta) return resolve([sym, null]);
          const price = meta.regularMarketPrice ?? null;
          const prev  = meta.chartPreviousClose ?? null;
          const change = (price !== null && prev) ? price - prev : null;
          const pct    = (change !== null && prev) ? (change / prev) * 100 : null;
          resolve([sym, { price, change, pct }]);
        } catch { resolve([sym, null]); }
      });
    });
    req.on('error', () => resolve([sym, null]));
    req.setTimeout(8000, () => { req.destroy(); resolve([sym, null]); });
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');

  const symbols = (req.query.symbols || '').trim().toUpperCase().split(',').filter(Boolean);
  if (!symbols.length) return res.status(400).json({ error: 'Missing symbols' });

  const entries = await Promise.all(symbols.map(getQuote));
  const result  = Object.fromEntries(entries.filter(([, v]) => v !== null));
  res.json(result);
};
