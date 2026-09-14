// ── wb_top20_historia.js ──────────────────────────────────────────────
// Ranking diario del Warren Score (Top 30), guardado en top20_historia.json,
// para automatizar los paneles "🏆 Retorno Top 10 del Warren Score" y
// "🆕 Nuevos ingresos al Top 30" del dashboard (2026-09-14, pedido del
// usuario: "debería actualizarse todos los días al cierre de cada rueda").
//
// Corre DESPUÉS de actualizar_datos.py, en la misma corrida de GitHub
// Actions -- lee el datos.json recién escrito localmente por el paso de
// Python (mismo checkout, no hace falta bajarlo de nuevo), calcula el
// Warren Score real de cada ticker con wb_score_engine.js (ver ese
// archivo para el porqué de una copia aparte en Node) y agrega UNA
// entrada por día a top20_historia.json.
//
// El workflow solo llama a este script en la corrida de CIERRE (17:00
// ARG / 20:00 UTC) -- ver el "if:" del paso en actualizar_datos.yml --
// igual que ya hace actualizar_datos.py con datos_lunes_cierre.json, para
// tener una sola foto por rueda.
//
// index.html (WB UPGRADE V47) lee este archivo y calcula ahí mismo, del
// lado del cliente, el retorno de cada ticker desde que entró al Top 20
// dentro de la ventana y los "nuevos ingresos" al Top 30 -- este script
// solo guarda la foto cruda de cada día, no los rankings derivados.

const fs = require('fs');
const { calcWarrenDetalle } = require('./wb_score_engine.js');

const GITHUB_TOKEN = process.env.PAT_TOKEN;
const GITHUB_USER   = 'WarrenBife';
const GITHUB_REPO   = 'cedears-dashboard';
const ARCHIVO       = 'top20_historia.json';
const TOP_N         = 30;
// Cuántas ruedas conservar en el archivo. El panel solo mira las últimas
// 10, pero se guardan bastantes más (~4 meses) para tener margen para
// features futuras (evolución de RS Score más larga, etc.) sin que el
// archivo pese nada serio (30 tickers/día * ~85 días es chico).
const DIAS_RETENCION = 85;

// Mismo ticker excluido del ranking del Warren Score que WARREN_SCORE_EXCLUIDOS
// en index.html (TQQQ, ETF apalancado 3x sin setup técnico propio) -- si
// se agrega/saca alguno ahí, replicar acá también.
const EXCLUIDOS = ['TQQQ'];

function headers() {
  return { Authorization: `token ${GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json' };
}

async function githubGetJson(archivo) {
  const url = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${archivo}`;
  const resp = await fetch(url, { headers: headers() });
  if (resp.status !== 200) return { sha: null, data: null };
  const body = await resp.json();
  const contenido = Buffer.from(body.content, 'base64').toString('utf-8');
  return { sha: body.sha, data: JSON.parse(contenido) };
}

async function githubPutJson(archivo, data, sha, mensaje) {
  const url = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${archivo}`;
  const contenido_b64 = Buffer.from(JSON.stringify(data), 'utf-8').toString('base64');
  const payload = { message: mensaje, content: contenido_b64 };
  if (sha) payload.sha = sha;
  const resp = await fetch(url, { method: 'PUT', headers: headers(), body: JSON.stringify(payload) });
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(`Error subiendo ${archivo}: ${resp.status} — ${body.message || ''}`);
  }
}

async function main() {
  if (!GITHUB_TOKEN) throw new Error('Falta PAT_TOKEN');

  const datos = JSON.parse(fs.readFileSync('datos.json', 'utf-8'));

  const spy = datos.find(d => d.Ticker === 'SPY');
  const ranking = datos
    .filter(d => !EXCLUIDOS.includes(d.Ticker))
    .map(d => {
      let score = 0;
      try { score = calcWarrenDetalle(d).score; } catch (e) { score = 0; }
      return {
        t: d.Ticker, s: score, p: d['Precio'], rs: d['RS Score'],
        ema200: d['Dist EMA200 %'], vcp: !!d['VCP2 Detected'],
      };
    })
    .filter(x => x.s > 0 && x.p !== null && x.p !== undefined)
    .sort((a, b) => b.s - a.s)
    .slice(0, TOP_N);

  // Precio de TODOS los tickers (no solo el Top 30) -- necesario para medir
  // el retorno de una acción hasta el último día de la ventana aunque ya
  // haya salido del Top 30 en el medio (pedido explícito del usuario:
  // "medir el retorno desde el día que entró hasta el último día
  // analizando, no hasta que salió del Top"). Separado del ranking para no
  // repetir score/rs de las 383 acciones todos los días.
  const precios = {};
  datos.forEach(d => { if (d['Precio'] !== null && d['Precio'] !== undefined) precios[d.Ticker] = d['Precio']; });

  const fecha = new Date().toISOString().slice(0, 10);
  const entrada = { fecha, spy: spy ? spy['Precio'] : null, top30: ranking, precios };

  const { sha, data: historiaActual } = await githubGetJson(ARCHIVO);
  let historia = Array.isArray(historiaActual) ? historiaActual : [];

  if (historia.some(e => e.fecha === fecha)) {
    console.log(`ℹ️  ${ARCHIVO} ya tiene una entrada para ${fecha} -- no se duplica (corrida de respaldo).`);
    return;
  }

  historia.push(entrada);
  historia = historia.slice(-DIAS_RETENCION);

  await githubPutJson(ARCHIVO, historia, sha, `Auto-update top20_historia ${new Date().toLocaleString('es-AR')}`);
  console.log(`✅ ${ARCHIVO} actualizado -- ${historia.length} ruedas guardadas, hoy: ${ranking.length} tickers en el Top ${TOP_N}`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
