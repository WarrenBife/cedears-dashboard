module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');

  const symbols = (req.query.symbols || '').trim().toUpperCase();
  if (!symbols) return res.status(400).json({ error: 'Missing symbols' });

  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent`;
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WarrenBife/1.0)' },
    });
    if (!r.ok) return res.status(502).json({ error: `Yahoo returned ${r.status}` });
    const json = await r.json();
    const result = {};
    for (const q of (json?.quoteResponse?.result || [])) {
      result[q.symbol] = {
        price: q.regularMarketPrice ?? null,
        change: q.regularMarketChange ?? null,
        pct: q.regularMarketChangePercent ?? null,
      };
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
