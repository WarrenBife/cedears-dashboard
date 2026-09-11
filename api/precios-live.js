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
          if (res.statusCode !== 200) return resolve([sym, null, res.statusCode]);
          const json = JSON.parse(data);
          const meta = json?.chart?.result?.[0]?.meta;
          if (!meta) return resolve([sym, null, 'sin meta']);
          const price = meta.regularMarketPrice ?? null;
          const prev  = meta.chartPreviousClose ?? null;
          const change = (price !== null && prev) ? price - prev : null;
          const pct    = (change !== null && prev) ? (change / prev) * 100 : null;
          resolve([sym, { price, change, pct }, null]);
        } catch (e) { resolve([sym, null, e.message]); }
      });
    });
    req.on('error', (e) => resolve([sym, null, e.message]));
    req.setTimeout(5000, () => { req.destroy(); resolve([sym, null, 'timeout']); });
  });
}

// Pool de concurrencia (2026-09-11, pedido del usuario -- caso "precios
// de ayer hasta las 14h"): antes esto disparaba los N símbolos en
// paralelo TODOS JUNTOS (Promise.all sin límite -- con 383 tickers,
// eran 383 conexiones simultáneas a Yahoo desde la misma IP de Vercel).
// Yahoo bloquea/limita picos así en sus endpoints no oficiales -- si
// eso pasaba, TODOS los getQuote() volvían null a la vez, el frontend
// veía "0 actualizados" y no hacía nada (ni error visible, ver
// actualizarPrecios() en index.html). Con un pool de concurrencia fija
// el pico de conexiones simultáneas baja mucho sin dejar de traer los
// 383 -- mucho menos parecido a un ataque desde el lado de Yahoo, y
// además dentro del maxDuration de la función (ver vercel.json).
const CONCURRENCIA = 40;
async function getQuotesPool(symbols) {
  const resultados = new Array(symbols.length);
  let siguiente = 0;
  async function worker() {
    while (siguiente < symbols.length) {
      const i = siguiente++;
      resultados[i] = await getQuote(symbols[i]);
    }
  }
  const workers = Array.from({ length: Math.min(CONCURRENCIA, symbols.length) }, worker);
  await Promise.all(workers);
  return resultados;
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
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');

  const symbols = (req.query.symbols || '').trim().toUpperCase().split(',').filter(Boolean);
  if (!symbols.length) return res.status(400).json({ error: 'Missing symbols' });

  const entries = await getQuotesPool(symbols);
  const result  = Object.fromEntries(entries.filter(([, v]) => v !== null).map(([s, v]) => [s, v]));

  // Log server-side si la tasa de éxito es baja (2026-09-11, pedido del
  // usuario): antes un fallo masivo (bloqueo de Yahoo, etc.) era 100%
  // silencioso -- ni un log en Vercel para diagnosticarlo después. No
  // cambia la respuesta al frontend, solo deja rastro en los logs de la
  // función para la próxima vez que pase esto.
  const exitos = Object.keys(result).length;
  if (symbols.length > 0 && exitos / symbols.length < 0.5) {
    const fallidos = entries.filter(([, v]) => v === null);
    const motivos = {};
    fallidos.forEach(([, , motivo]) => { motivos[motivo] = (motivos[motivo] || 0) + 1; });
    console.warn(`[precios-live] ${exitos}/${symbols.length} ok -- motivos de fallo:`, motivos);
  }

  res.json(result);
};
