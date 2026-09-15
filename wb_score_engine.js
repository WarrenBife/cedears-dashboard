// ── Motor del Warren Score para Node.js (pipeline) ───────────────────
// Copia verbatim de calcWarrenDetalleV50 (index.html) + toda su cadena de
// dependencias, para poder calcular el Score real fuera del navegador --
// lo usa wb_top20_historia.js para armar el ranking Top 20/30 de cada
// cierre de rueda (ver "Retorno Top 10 del Warren Score" en el dashboard).
//
// MANTENIMIENTO (2026-09-14, pedido del usuario -- decisión consciente
// tras evaluar la alternativa de extraer el JS del index.html en cada
// corrida, que es más frágil): cada vez que se modifique la fórmula del
// Warren Score en index.html (Pilares A-D, gates, penalizaciones, bonos,
// caps -- toda la cadena de _pilarXv4V50/_penalizacionesV50/_bonos...
// hasta calcWarrenDetalleV50 al final del archivo), hay que copiar el
// mismo cambio ACÁ. Si no se sincroniza, el ranking histórico queda
// calculado con una fórmula vieja mientras el dashboard en vivo ya usa
// la nueva -- silencioso, no tira error.
// Validado byte-a-byte contra datos.json en vivo el 2026-09-14 (YPF,
// AAPL, TSLA, ANET, PM -- score idéntico al que calcula el navegador).
function _lineal(x, x0, x1, y0, y1) {
  if (x === null || x === undefined || isNaN(x)) return 0;
  if (x0 === x1) return y1;
  const t = Math.max(0, Math.min(1, (x - x0) / (x1 - x0)));
  return y0 + t * (y1 - y0);
}

function _tri(x, izq, picoI, picoD, der) {
  if (x === null || x === undefined || isNaN(x)) return 0;
  if (x <= izq || x >= der) return 0;
  if (x >= picoI && x <= picoD) return 1;
  if (x < picoI) return (x - izq) / (picoI - izq);
  return (der - x) / (der - picoD);
}

function _bool(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  const s = String(v).trim().toLowerCase();
  if (s.includes('✅') || s.includes('✓')) return true;
  if (s.includes('❌') || s.includes('✗')) return false;
  return ['true','si','sí','yes','1','ok','verdadero'].includes(s);
}


var WB_SCORE_VERSION_50 = '4.9';

/* ── Gates, Pilar A, Pilar B, Pilar D, restas, churning -- SIN
   CAMBIOS, copias verbatim de V49 ── */
function _evalGatesV50(d) {
  const fallas = [];
  const precio = d['Precio'], ema200 = d['EMA200'];
  if (precio === null || ema200 === null || precio <= ema200) fallas.push('Precio ≤ EMA200');
  return fallas;
}
function _pilarAv4V50(d){
  let pts = 0;
  const atr14 = d['ATR14 %'];
  const atrValido = atr14 !== null && atr14 !== undefined && atr14 > 0;
  const distSma50 = d['Dist SMA50 %'];

  if (distSma50 !== null && distSma50 !== undefined) {
    if (atrValido) {
      const distSma50ATRs = distSma50 / atr14;
      pts += _tri(distSma50ATRs, -5, -2, 4, 8) * 10;
    } else if (distSma50 >= -5 && distSma50 <= 20) {
      pts += 10;
    } else {
      const exceso = distSma50 < -5 ? (-5 - distSma50) : (distSma50 - 20);
      pts += Math.max(0, 10 - exceso);
    }
  }

  if (atrValido) {
    const distATRs = d['Dist EMA200 %'] / atr14;
    pts += _tri(distATRs, 0, 0, 8, 14) * 5.8333;
  } else {
    pts += _tri(d['Dist EMA200 %'], 0, 10, 50, 70) * 5.8333;
  }

  pts += _lineal(d['EMA200 Slope'], 0, 0.15, 0, 4.1667);
  return Math.min(pts, 20);
}
function _fuerzaUnificadaV50(rs, rsSemana, rsMes){
  const viaNivel = _lineal(rs, 45, 75, 0, 20);
  // Vía delta -- v4.10 (2026-09-01, pedido del usuario): mide aceleración
  // MENSUAL (RS Score de hoy vs. 'RS Mes ant.') en vez de semanal.
  // Excepción: si en la ÚLTIMA SEMANA el RS Score cayó 5 puntos o más
  // ('RS Semana ant.'), no suma nada por esta vía -- un revés fuerte y
  // reciente invalida el impulso mensual, aunque venga de una base sólida.
  //
  // Piso de 40 en el punto de partida (2026-09-01, pedido del usuario):
  // solo cuenta el tramo de la mejora que queda POR ENCIMA de 40 -- si
  // 'RS Mes ant.' estaba por debajo de 40, se lo trata como si fuera 40
  // para este cálculo. Ejemplo del usuario: RS Mes ant.=30, RS hoy=55 ->
  // suma solo 15 (55-40), no los 25 puntos de mejora cruda. Escala sin
  // cambios (0 a 20 puntos de mejora "efectiva" = 0 a 20 pts, saturando
  // arriba de 20).
  let viaDeltaMensual = 0;
  if (rsSemana !== null && rsSemana !== undefined && rsMes !== null && rsMes !== undefined) {
    const deltaSemanal = rs - rsSemana;
    if (deltaSemanal > -5) {
      const deltaMensual = rs - Math.max(rsMes, 40);
      viaDeltaMensual = _lineal(deltaMensual, 0, 20, 0, 20);
    }
  }
  return { viaNivel, viaDeltaMensual, pts: Math.max(viaNivel, viaDeltaMensual) };
}
function _pilarBv6V50(d){
  const rs = d['RS Score'];
  const ptsFR = _bool(d['FR > SMA50']) ? 5 : 0;
  if (rs === null || rs === undefined) {
    return Math.min(ptsFR * (25 / 5), 25);
  }
  const { pts: ptsFuerza } = _fuerzaUnificadaV50(rs, d['RS Semana ant.'], d['RS Mes ant.']);
  return Math.min(ptsFuerza + ptsFR, 25);
}
/* ── Pilar C -- v4.9 (2026-08-26): se saca el Bono ER (pedido del
   usuario -- validado contra datos reales: solo 5 de 368 tickers lo
   tenían activo, la mayoría con valores mínimos <0.5 pts, señal
   demasiado angosta para pesar 10 pts fijos). Los 10 pts se
   redistribuyen DENTRO de Pilar C, mismo tope total (35): +4 a
   Contracción (11.25→15.25), +3 a RSI (8.25→11.25), +3 al bono VCP
   (5.5→8.5, escalado proporcional entre la parte lineal por VCP Score
   y el bonus fijo por volumen decreciente: 4.4→6.8, 1.1→1.7). El
   campo 'Bono ER Pts' sigue calculándose en el pipeline (Python) y
   mostrándose como métrica informativa en la card mobile -- solo deja
   de sumar puntos al score. Resto de Pilar C sin cambios respecto a
   V50 (ptsRSI en 0 si 'RSI Sobrecompra Sin Confirmar'). ── */
function _pilarCv50(d){
  const sacudon = _bool(d['Sacudon Activo']);
  // Contracción con memoria de 7 ruedas (2026-08-27, pedido del usuario
  // tras analizar 19 rupturas reales: TSLA, INTC, MRVL, MU, LRCX, HOOD,
  // PANW, NVDA, B, URA, SLV, GOOGL, AMD, C, CAT). Antes 'actual' era
  // solo el ratio de HOY -- un día de expansión aislado (típicamente el
  // día mismo de la ruptura) borraba de un plumazo hasta 15,25 pts de
  // compresión real que hubo recién 1-3 ruedas antes, justo el momento
  // que se quiere puntuar alto. 'Contraccion Volatilidad Min7' (nuevo,
  // calculado en el pipeline con contraccion_volatilidad_min7()) ya
  // trae el mínimo ratio de las últimas 7 ruedas -- fallback al de hoy
  // si todavía no está poblado. La lógica de sacudón de acá abajo sigue
  // igual, sin cambios (caso especial ya validado por separado).
  const actual = d['Contraccion Volatilidad Min7'] != null
    ? d['Contraccion Volatilidad Min7']
    : d['Contraccion Volatilidad'];
  const pre = d['Contraccion Vol Pre Sacudon'];
  let ratio;
  if (sacudon && pre !== null && pre !== undefined) {
    ratio = (actual !== null && actual !== undefined) ? Math.min(actual, pre) : pre;
  } else {
    ratio = actual;
  }

  const netoAtrs = d['Avance Neto Bloque 5r ATRs'];
  const factorDireccion = (netoAtrs === null || netoAtrs === undefined)
    ? 1.0
    : 1 - 0.5 * Math.max(0, Math.min(1, (netoAtrs - 0.8) / 1.7));

  // Lado izquierdo del triangular sacado (2026-08-26, pedido del
  // usuario): antes una contracción MUY fuerte (ratio<0.25) caía a 0
  // pts, como si "demasiado quieto" fuera malo -- no tiene sentido,
  // más contracción nunca debería restar. Ahora el puntaje se mantiene
  // constante en el máximo desde 0 hasta 0.70 (picoI=izq=0, sin rampa
  // de subida), y recién a partir de 0.70 empieza a caer hacia 1.05
  // igual que antes.
  const ptsContraccion = (ratio === null || ratio === undefined)
    ? null
    : _tri(ratio, 0, 0, 0.70, 1.05) * 15.25 * factorDireccion;

  const ptsRSI = _bool(d['RSI Sobrecompra Sin Confirmar'])
    ? 0
    : _tri(d['RSI 14'], 30, 45, 60, 70) * 11.25;

  // Bono VCP -- premia la COMPRESIÓN previa a la ruptura, no la ruptura
  // en sí. 2026-08-29: se reemplaza 'VCP Bono Pts' (detector viejo, pivote
  // fijo de 3 velas) por 'VCP2 Bono Pts' (ZigZag adaptativo + ciclo de
  // vida, ver detectar_vcp2() en actualizar_datos.py) -- a pedido del
  // usuario, el criterio pasa a ser SOLO VCP2, sin mezclar con el
  // detector anterior. Validado contra los 19 casos de referencia:
  // VCP2 reconoce bases reales que el detector viejo pierde del todo
  // (MRVL, LRCX, MU, GOOGL quedaban con bono null pese a ser setups
  // reales confirmados).
  const ptsVcp = d['VCP2 Bono Pts'] != null ? d['VCP2 Bono Pts'] : 0;

  const disponibleSinContraccion = ptsRSI + ptsVcp;
  let base;
  if (ptsContraccion === null) {
    base = Math.min(disponibleSinContraccion * (35 / 19.75), 35);
  } else {
    base = Math.min(ptsContraccion + disponibleSinContraccion, 35);
  }

  return base;
}
function _pilarDv7V50(d){
  const distMin = d['Dist Mín52W %'];
  const volA = d['Volatilidad Anual %'];
  let ptsExt;
  if (distMin !== null && distMin !== undefined && volA !== null && volA !== undefined && volA > 0) {
    const ext = distMin / volA;
    ptsExt = _tri(ext, 0.3, 0.5, 1.8, 3.2) * 5;
  } else {
    ptsExt = _tri(distMin, 25, 35, 110, 220) * 5;
  }

  // Rampa de madurez de base: antes arrancaba en semana 4 (0 pts hasta ahí),
  // ahora es lineal desde semana 1 -- una base recién iniciada ya suma algo
  // en vez de valer 0 hasta el umbral. Meseta 7-26 y bajada hasta 55 sin
  // cambios. Pedido del usuario 2026-08-27.
  const semanas = d['Base Semanas'];
  const ptsSemanas = (semanas !== null && semanas !== undefined) ? _tri(semanas, 1, 7, 26, 55) * 10 : 0;

  const pos = d['Base Posición %'];
  const ptsPos = (pos !== null && pos !== undefined) ? _lineal(pos, 20, 50, 0, 5) : 0;

  // Piso de Pilar D (2026-08-27): validado a escala (307 tickers/8 años,
  // 30.367 muestras sin gates) que dentro de Score>=70, un Pilar D<10
  // predice peor resultado a 10 ruedas de forma consistente en 10/10
  // splits (spread de fracaso 2,8-10,4pp, mediana de retorno siempre
  // negativa/plana en el grupo bajo vs. siempre positiva en el alto). La
  // señal se diluye a 20 ruedas y desaparece a 40 -- es una señal de
  // timing de setup, no estructural, pero suficientemente sólida para
  // gatear. Pedido del usuario: si Pilar D no llega a 10 pts, no suma
  // nada (mismo estilo binario que "RSI Sobrecompra Sin Confirmar" en
  // Pilar C).
  const totalD = Math.min(ptsExt + ptsSemanas + ptsPos, 20);
  return totalD < 10 ? 0 : totalD;
}
function _restaVerticalidadV50(d){
  const atrP = d['ATR14 %'], avPico = d['Avance Pico 15r %'];
  if (atrP === null || atrP === undefined || atrP <= 0 ||
      avPico === null || avPico === undefined) {
    return { resta: 0, velocidadAtrs: null };
  }
  const velocidadAtrs = avPico / atrP;
  return { resta: _lineal(velocidadAtrs, 5, 11, 0, 8), velocidadAtrs };
}
// Resta por Choppiness/Eficiencia SACADA (2026-08-28): dentro de Score>=70,
// aislada del resto de banderas de agotamiento, predice al REVÉS de forma
// consistente y creciente con el horizonte (10r: +2,3pp mejor con la
// bandera activa; 15r: +3,4pp; 20r: +3,4pp, sobre 8 años). Por año es más
// parejo (3 de 7 al revés, 4 de 7 bien) pero con swings enormes y sin
// patrón claro (+11 a +16pp en los años "mal" vs -1 a -16pp en los
// "bien") -- la firma típica de ruido, no de señal real (mismo patrón que
// "🌫️ Agotamiento OBV SOLO", ya sacado antes). Validado a escala que sacarla
// no empeora nada (neutro a levemente mejor en Score>=70/80, 2026 y 8 años)
// y en los 19 casos de referencia del usuario: 83 días cambian, TODOS para
// arriba, ninguno para abajo.
function _restaVolatilidadSinDireccionV50(d){
  return { resta: 0, chop: d['Choppiness'], efi: d['Eficiencia 10d'], activa: false };
}
function _churningResistenciaV50(d){
  const distRes  = d['Dist Resistencia ATRs'];
  const amplitud = d['Amplitud Bloque 5r ATRs'];
  const direc    = d['Direccionalidad 5r'];
  const atrP     = d['ATR14 %'];
  const avPico   = d['Avance Pico 15r %'];
  if (distRes === null || distRes === undefined ||
      amplitud === null || amplitud === undefined ||
      direc === null || direc === undefined ||
      atrP === null || atrP === undefined || atrP <= 0 ||
      avPico === null || avPico === undefined) {
    return false;
  }
  const velocidadAtrs = avPico / atrP;
  return (distRes > 0 && distRes < 4) &&
         (amplitud > 2.5) &&
         (direc < 0.35) &&
         (velocidadAtrs > 3);
}

/* ── Penalizaciones -- 🩸 redefinido 2026-08-26 (ver comentario abajo),
   resto SIN CAMBIOS respecto a V49. ── */
function _penalizacionesV50(d){
  let pen = 0; const flags = [];
  const d50 = d['Dist SMA50 %'], rsi = d['RSI 14'];
  const atrP = d['ATR14 %'];

  const sobreExt = (atrP !== null && atrP !== undefined && atrP > 0)
    ? (d50 !== null && d50 / atrP > 7)
    : (d50 !== null && d50 > 25);
  if (sobreExt || (rsi !== null && rsi > 80)) { pen -= 6; flags.push('🎈'); }

  // 🩸 Distribución activa -- redefinida tras backtest a escala (308
  // tickers, 8 años): la versión anterior (10 ruedas, >=7 con cierre<
  // cierre_anterior, sin importar la distancia al máximo) resultó casi
  // nula en general y hasta INVERTIDA más allá de 5% del máximo de 52
  // semanas (venta con volumen ahí es más agotamiento vendedor que
  // distribución real). Nueva versión, calculada en el pipeline
  // (distribucion_activa_vela(), actualizar_datos.py): solo aplica a
  // <5% del máximo, ventana de 8 ruedas, >=6 con cierre<apertura
  // (vela roja, no cierre<cierre anterior -- más robusto en el
  // backtest, splits por mitad de tickers mucho más parejos en TODAS
  // las combinaciones probadas), volumen verde <80% del volumen rojo.
  // Campo separado de 'Días ± 10s'/'Vol días ± 10s' a propósito -- esos
  // siguen sin cambios para la columna "10s" del scanner, el filtro de
  // volumen y las estadísticas de amplitud.
  if (_bool(d['Distribucion Activa Vela'])) { pen -= 15; flags.push('🩸'); }

  const varDia = d['Var Día %'], vol = d['Vol Inusual %'];
  if (varDia !== null && varDia < -3 && vol !== null && vol > 50) { pen -= 8; flags.push('💥'); }

  const boDays = d['Breakout Days Ago'];
  if (!_bool(d['Breakout Fresh']) && boDays !== null && boDays > 5 && boDays <= 15) {
    if ((d['VCP Dist Pivot %'] ?? 0) < 0) { pen -= 10; flags.push('⛔'); }
  }

  // Peso diferenciado (2026-08-28): dentro de Score>=70, Div RSI aislado
  // predice mucho peor de forma CONSTANTE en 10/15/20 ruedas (P(subir)
  // ~40-41% vs ~51% base, sin diluirse) -- Div OBV aislado solo es real
  // a 10 ruedas y se diluye después. Antes las dos pesaban lo mismo (4pts
  // solas, 10pts combinadas). Validado: los días que quedan por debajo de
  // 70 con el nuevo peso rinden peor de forma consistente (P(subir)
  // 37-44% vs 50-51% de los que quedan), afectando solo ~1,4% de la
  // población Score>=70 -- quirúrgico, sin regresión en los 19 casos de
  // referencia del usuario.
  const divRsi = _bool(d['Div RSI']), divObv = _bool(d['Div OBV']), churn = _bool(d['Churn Máximos']);
  const nAgot  = (divRsi ? 1 : 0) + (divObv ? 1 : 0) + (churn ? 1 : 0);
  if (nAgot >= 1) {
    let pesoAgot = 0;
    if (divRsi) pesoAgot += 8;
    if (divObv) pesoAgot += 4;
    if (churn)  pesoAgot += 4;
    pen -= Math.min(pesoAgot, 14);
    if (divRsi) flags.push('📉');
    if (divObv) flags.push('🪫');
    if (churn)  flags.push('🐘');
  }

  const rebEstado = d['Rebote SMA10 Estado'];
  if (rebEstado === 'falso') {
    pen -= 8; flags.push('🧊');
  } else if (rebEstado === 'observacion') {
    flags.push('👀');
  } else if (rebEstado === 'confirmado') {
    /* rebote confirmado: churning anulado, sin flag */
  } else if (_churningResistenciaV50(d) && _bool(d['VCP2 Detected'])) {
    // Se anula con VCP2 Detected (2026-09-11, caso ANET): "churning
    // contra resistencia" asume que el volumen alto sin avance cerca de
    // un máximo previo es indecisión/toma de ganancias -- pero si VCP2
    // ya reconoce ahí una base de contracciones genuina, ese mismo
    // volumen/rango lateral ES el patrón, no una señal de alarma. No es
    // una anulación permanente: si VCP2 deja de detectar (ej. se
    // ensancha o pierde el pivote), la penalización vuelve a aplicar
    // normalmente la próxima corrida.
  } else if (_churningResistenciaV50(d)) {
    pen -= 6; flags.push('🧊');
  }

  // 🌊 Caso B se anula con RS Score>85 (2026-08-28, caso MRVL: sacudón de
  // 2 ruedas justo antes de duplicarse el precio en un mes, penalización
  // máxima -25 pts en el peor momento posible). Validado a escala (609
  // disparos reales/8 años): con RS Score>85 el fracaso a 10-40 ruedas
  // es 38-40% con mediana +2,2/+3,5/+5,7% -- vs. 51-53% de fracaso y
  // mediana negativa con RS Score<=85. Spread de 12-13pp, consistente
  // en las 3 ventanas y en split por mitades (11,8-21,4pp), 114 tickers
  // distintos en la muestra -- de las señales más limpias validadas.
  // Un papel que ya lidera al mercado con un sacudón corto es un animal
  // distinto de uno débil deambulando sin romper.
  if (_bool(d['Caso B Penalizado']) && (d['RS Score'] === null || d['RS Score'] === undefined || d['RS Score'] <= 85)) {
    const casoBPts = +d['Caso B Pts'] || 0;
    if (casoBPts > 0) { pen -= casoBPts; flags.push('🌊'); }
  }

  // 🌫️ Agotamiento OBV SOLO: eliminado 2026-08-26. Backtest a escala
  // (308 tickers, 8 años): estaba activo ~14% de TODOS los días del
  // histórico y su spread de fracaso10 vs. baseline era +0,4 pts --
  // ruido, no señal, restando 5 pts a una población enorme. El combo
  // con Div RSI (🧨) se mantiene por ahora, pendiente de su propio
  // análisis. Ver no_demand_ruptura() en actualizar_datos.py para el
  // detector que lo reemplaza en la práctica.
  if (_bool(d['OBV RSI Combo Penaliza'])) {
    pen -= 12; flags.push('🧨');
  }

  // 🕯️ "No demand en ruptura" -- rompió el máximo de 40 ruedas y siguió
  // subiendo, pero con cuerpos de vela chicos y volumen seco (el precio
  // avanza por falta de oferta, no por demanda real). Estado pegajoso
  // hasta 2 velas verdes consecutivas -- todo calculado en el pipeline,
  // ver no_demand_ruptura() en actualizar_datos.py.
  // Validado a escala: solo -> +6,0 pts de spread (5/5 splits);
  // combinado con Agotamiento OBV -> +14,6 pts, retorno mediano -0,90%
  // (5/5 splits, la señal más fuerte validada). Caso de origen: AVGO
  // 4/8-14/8/2026, dispara el 7/8 con -13,87% por delante a 10 ruedas.
  if (_bool(d['No Demand Activo'])) {
    if (_bool(d['OBV Penaliza'])) { pen -= 15; flags.push('🕯️'); }
    else                          { pen -= 8;  flags.push('🕯️'); }
  }

  const pendSma50Pts = +d['Pend SMA50 Pts'] || 0;
  if (pendSma50Pts > 0) { pen -= pendSma50Pts; flags.push('🪤'); }

  // ⚠️ Posible toma de ganancias -- ver vela_rechazo_maximos()/
  // vela_rechazo_confirmada() en actualizar_datos.py (caso de origen:
  // XYZ 27/8/2026). Se muestra tanto el día del disparo crudo (recién
  // pasó, todavía sin confirmar) como durante todo el tramo confirmado
  // (el que tapa el score en 70, ver más abajo) -- para que la bandera
  // siga visible mientras el tope esté activo, no solo el primer día.
  if (_bool(d['Vela Rechazo Maximos']) || _bool(d['Vela Rechazo Confirmada'])) { flags.push('⚠️'); }

  return { pen, flags };
}

/* ── calcWarrenDetalleV50 -- misma firma, Warren Score v4.9: Pilar C
   ya no suma Bono ER (redistribuido dentro del propio Pilar C, ver
   cabecera de _pilarCv50). v4.8 (ptsRSI=0 si sobrecompra sin
   confirmar) sigue vigente, sin cambios. ── */
var calcWarrenDetalleV50 = function(d){
  const fallas = _evalGatesV50(d);
  const sacudon = _bool(d['Sacudon Activo']);

  const pa = _pilarAv4V50(d);
  const pb = _pilarBv6V50(d);
  const { resta: restaVertRaw, velocidadAtrs } = _restaVerticalidadV50(d);
  const { resta: restaChopRaw, activa: chopActiva } = _restaVolatilidadSinDireccionV50(d);
  const restaVert = sacudon ? 0 : restaVertRaw;
  const restaChop = sacudon ? 0 : restaChopRaw;
  const pc = Math.max(0, _pilarCv50(d) - restaVert - restaChop);
  const pd = _pilarDv7V50(d);
  const { pen, flags } = _penalizacionesV50(d);
  if (chopActiva && !sacudon) flags.push('🌪️');
  if (sacudon) flags.push('🫨');

  const bomba = _bool(d['Bomba Hoy']);
  if (bomba) flags.push('💣');

  const sumRaw = pa + pb + pc + pd + pen;
  let score = Math.round(Math.max(0, Math.min(100, sumRaw)) * 10) / 10;
  if (fallas.length > 0) score = Math.min(score, 40);

  if (d['Dist Máx52W %'] === null || d['Dist Máx52W %'] === undefined ||
      d['Dist Mín52W %'] === null || d['Dist Mín52W %'] === undefined) {
    score = Math.min(score, 40);
  }

  // Gate "calidad de entrada" en el tramo 80+ (2026-08-28): si el papel
  // es muy volátil en términos absolutos (ATR14%>4), topea en 79.
  // Único hallazgo de toda la sesión de investigación que sobrevivió
  // el escrutinio riguroso (mercado, sector, ML, reponderar pilares) --
  // leave-one-year-out sobre 306 tickers, sube P(subir a 10r) de
  // ~50-52% a ~53-55%.
  //
  // 2026-09-06 (pedido del usuario, caso MU): se saca la excepción del
  // percentil relativo (ATR14 Pctl>70) que se había agregado el
  // 2026-09-01 -- vuelve a ser SOLO el criterio absoluto, sin OR. La
  // excepción no le servía de nada a MU específicamente (percentil 13,
  // lejísimos de 70, sigue gateado igual con o sin ella) y el usuario
  // prefirió simplificar la regla para todos en vez de mantener una
  // excepción que en la práctica casi no cambiaba resultados. El campo
  // 'ATR14 Pctl' sigue calculándose en el pipeline (usado en la card
  // de contracción y disponible para análisis futuros), solo se dejó
  // de usar acá.
  const atrGate = d['ATR14 %'];
  const entradaSana = (atrGate !== null && atrGate !== undefined && atrGate <= 4);
  // Advertencia visible del gate (2026-09-15, sincronizado con index.html) --
  // gateATRPts + flag 🌡️ para que el ranking del pipeline (wb_top20_historia.js)
  // sepa igual que el navegador cuánto le costó el tope a cada ticker.
  let gateATRPts = 0;
  if (score > 80 && !entradaSana) {
    gateATRPts = Math.round((score - 79) * 10) / 10;
    score = 79;
    flags.push('🌡️');
  }

  // Tope por ⚠️ vela de rechazo CONFIRMADA (2026-09-1, a pedido del
  // usuario, caso XYZ) -- ojo: usa 'Vela Rechazo Confirmada' (dispara +
  // el día siguiente cerró en rojo, vigente hasta 2 verdes seguidos o un
  // nuevo máximo), NO 'Vela Rechazo Maximos' (el disparo crudo del día,
  // sin confirmar). Toparlo con el disparo crudo penalizaría de más: ese
  // día solo, sin confirmar, es en el 59% de los casos señal BUENA
  // (+2 a +2,6% a 10-20r) -- ver vela_rechazo_confirmada() en
  // actualizar_datos.py para la validación completa.
  if (_bool(d['Vela Rechazo Confirmada']) && score > 70) score = 70;

  // Cap "estirado sin pausa/agotándose" (capeaba a 40 si Dist SMA50/ATR14
  // > 6 Y (sin base de 2+ semanas O Div RSI/OBV/Churn activo) -- SACADO
  // 2026-08-28, caso PANW: el ratio oscilaba justo alrededor de 6 día por
  // medio (ruido de precio normal) y el disparador solía ser 🪫 solo, que
  // ya está probado que no predice nada. Validado a escala (48.000
  // muestras/8 años) que además el gate estaba INVERTIDO: el grupo que
  // capeaba rendía IGUAL O MEJOR que el resto en las 3 ventanas (spread
  // -1,2 a -1,8pp, no +). Era además redundante con Pilar A, que ya
  // descuenta gradualmente la misma distancia SMA50/ATR (meseta plena
  // hasta 4 ATRs, 0 pts desde 8 -- en 6 ya vale la mitad): este gate le
  // sumaba un cachetazo binario extra por la misma señal que Pilar A ya
  // penaliza de forma proporcional.

  return { score, fallas, pa, pb, pc, pd, pen, flags, restaVert, velocidadAtrs, restaChop, gateATRPts, sacudon, bomba, version: WB_SCORE_VERSION_50 };
};



module.exports = { calcWarrenDetalle: calcWarrenDetalleV50 };
