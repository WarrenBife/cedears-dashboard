# Warren Bife Dashboard — Resumen del Proyecto

## Descripción
Dashboard de mercado para CEDEARs y acciones internacionales, publicado en Netlify para seguidores de @Warren_Bife en X. Muestra KPIs técnicos calculados en Python (GitHub Actions) y subidos a GitHub como JSON.

## URLs importantes
- **Sitio público (Netlify):** el usuario lo renombró manualmente (revisar en netlify.com)
- **Datos JSON:** `https://warrenbife.github.io/cedears-dashboard/datos.json`
- **Perfil X:** `https://x.com/Warren_Bife`
- **Logo:** `https://i.imgur.com/GuVsAWY.jpeg`

## Archivos locales
- `C:\Users\Net\Desktop\Claude\index.html` — archivo principal del dashboard (se sube al repo)
- `C:\Users\Net\Desktop\Claude\actualizar_datos.py` — script Python que genera datos.json
- `C:\Users\Net\Desktop\Claude\server.js` — backend Node.js local (puerto 3002), proxy Yahoo Finance para precios en tiempo real
- `C:\Users\Net\Desktop\Claude\package.json` — dependencias: express, cors
- `C:\Users\Net\Desktop\Claude\manifest.json` — PWA manifest
- `C:\Users\Net\Desktop\Claude\service-worker.js` — PWA service worker (cache offline, network-first para datos.json)
- `C:\Users\Net\Desktop\Claude\bot_telegram.py` — bot de Telegram (servicio continuo para Render)
- `C:\Users\Net\Desktop\Claude\.github\workflows\actualizar_datos.yml` — GitHub Action actualización de datos (10:00 y 17:00 ARG), con `workflow_dispatch` para correr manualmente
- `C:\Users\Net\Desktop\Claude\PROYECTO.md` — este archivo

## Servidor local
- Correr con: `node server.js` en la carpeta del proyecto
- Abrir dashboard en: `http://localhost:3002/index.html`
- Obtiene precios de Yahoo Finance usando crumb + cookies (sesión válida 30 min)
- Si el servidor no está corriendo, el dashboard funciona igual con datos del JSON

## Stack tecnológico
- **Frontend:** HTML + JS puro, sin frameworks
- **Gráficos:** Chart.js 4.4.1
- **Datos KPI:** `actualizar_datos.py` → `datos.json` en GitHub Pages (GitHub Actions)
- **Precios/variación:** actualizados en tiempo real cada 5 min via Yahoo Finance (servidor local Node.js)
- **Hosting frontend:** GitHub Pages (`warrenbife.github.io/cedears-dashboard`)
- **Hosting bot:** Render (Web Service, free tier, servicio continuo)
- **Fuente:** DM Mono + DM Sans (Google Fonts)

## Campos disponibles en datos.json
Ticker, Precio, Var Día %, EMA200, EMA200 Slope, Dist EMA200 %, SMA50, Dist SMA50 %, Máx 52W, Dist Máx52W %, Mín 52W, Dist Mín52W %, RSI 14, Vol Relativa, Vol Inusual %, RS Score, RS Ayer, RS Semana ant., RS Mes ant., FR > SMA50, Vol 5d/40d, Días + 10s, Días - 10s, Vol días + 10s, Vol días - 10s, Market Cap USD, Market Cap Cat, Sector, Tipo, ETF Sector, Vs Sector %, Breakout Fresh, Breakout Days Ago, Breakout Vol OK, Breakout Vol Ratio

## Estructura del dashboard (orden de paneles)

### Landing page (home)
- Canvas animado + Logo + título "Warren Bife Dashboard" con efecto MatrixText
- Botones Dashboard / Seguimiento de Cartera
- Cards SPY y QQQ, status mercado, relojes ARG y NY

### Header (topbar)
- Logo + título + badge "EN VIVO" + timestamp + botón ↺ Actualizar

### Ticker Strip
- Tickers: SPY, QQQ, DIA, EWZ, FXI, AAPL, MSFT, NVDA, GOOGL, META, AMZN, TSLA

### Stat Cards (6 tarjetas clickeables)
Tickers activos, Sobre EMA200, RS Score >70, RSI sobrecomprado, Vol inusual hoy, Candidatos calidad

### Paneles (orden actual)
1. **Mapa de Re-surgimiento** (bubble chart) — RS actual vs RS semana anterior. Puntos dorados con radio mayor para tickers con Despegue Fresco válido. Labels de ticker visibles cuando hay < 50 burbujas.
2. **Warren Score** (tabla) — score compuesto 0–100. Filas doradas con 🚀 para tickers con Despegue Fresco válido.
3. **Despegue Fresco** (panel de breakouts) — 3 capas: precio > pivot 20d (≤3 días), volumen ≥1.5x promedio 50d, Dist SMA50 entre 0–10%
4. **Tendencia RS Score** (líneas) — evolución últimas 4 semanas
5. **Sesiones & Volumen** (barras)
6. **Volumen inusual hoy** (barras)
7. **Cartelera del día** (tabla)
8. **Scanner de calidad** (tabla)
9. **Semáforo por sector** — Top 3 por sector
10. **Comparador de activos** (líneas)

## Warren Score — Fórmula actual

**Condición de entrada:** RS Score > 60 (si ≤ 60 → score = 0)

| Criterio | Puntos |
|---|---|
| RS nivel: `min(40, RS - 60)` | 0–40 |
| RS momentum semanal (asimétrico): sube `min(7.5, Δ × 0.5)`, baja `−min(7.5, |Δ| × 1.5)` | −7.5 a +7.5 |
| EMA200 binario (precio > EMA200) | +20 |
| EMA200 proporcional (`min(10, dist% × 0.5)`) | 0–10 |
| SMA50 binario (precio > SMA50) | +10 |
| Dist Mín52W ≥ 25% | +10 |
| Vol Relativa < 1.0: `max(0, (1.0 − vol) × 15)` | 0–15 |
| **Máximo (capped)** | **100** |

- Filtro tabla: solo tickers con RS > 60 y mínimo N criterios binarios (configurable 2/3/4)

## Vol Relativa — cálculo actual (Python)
Promedio del rango diario `(High − Low) / Close` de los últimos 5 días, dividido por el promedio histórico de esa métrica en los últimos 252 días.
- **< 1** = velas más estrechas que de costumbre → acción comprimida → buena señal de setup
- **> 1** = velas más anchas → extendida/volátil → penaliza en Warren Score
- Captura tanto semanas extendidas (IBB +8% suave) como días individuales amplios (SNDK +20% en un día)

## Despegue Fresco — detección de breakouts
3 capas calculadas en `actualizar_datos.py`:
1. **Precio:** cruza por encima del máximo de las últimas 20 ruedas hace ≤ 3 días (`Breakout Fresh`, `Breakout Days Ago`)
2. **Volumen:** volumen del día del breakout ≥ 1.5× promedio 50 días (`Breakout Vol OK`, `Breakout Vol Ratio`)
3. **Extensión:** `Dist SMA50 %` entre 0–10% (verificado en JS client-side)

La función `isValidBreakout(d)` en el JS verifica las 3 capas simultáneamente.

## Filtros globales
Tipo (Acción/ETF), Market Cap Cat, Sector, Grupo, Vol inusual umbral
- Se combinan con quickFilter de stat cards
- Aplican a TODOS los gráficos y tablas via `getDatosFiltrados()`

## Sistema de datos
- `actualizar_datos.py` corre via GitHub Actions: 10:00 ARG y 17:00 ARG (lun-vie)
- También se puede correr manualmente desde GitHub → Actions → workflow_dispatch
- Dashboard hace fetch con cache-busting (`?t=Date.now()`)
- Auto-refresh cada 5 minutos

## Scanner de calidad — columnas actuales
Ticker | Precio | Var% | Sector | MCap | RS | Δ RS Hoy | Δ RS 1m | RSI | Vol Rel | Vol Inu | EMA200 | SMA50
- **Δ RS Hoy** = RS Score - RS Ayer
- **Δ RS 1m** = RS Score - RS Mes ant.
- Headers clickeables para ordenar

## Colores del tema (dark)
- bg: #0d0f14 / bg2: #13161e / bg3: #1a1e28
- green: #22c98a / red: #f0605a / amber: #f5a623 / blue: #4f8ef7 / purple: #a78bfa
- gold (Despegue Fresco): #f5c842

## Bot de Telegram
- Archivo: `bot_telegram.py` — servicio continuo
- Hosteado en **Render** (Web Service, free tier)
- Variables de entorno en Render: `TELEGRAM_TOKEN`, `CHAT_ID`
- Polling en tiempo real, alerta diaria automática a las 18:00 ARG
- Comandos: `/top [N]`, `/warren [N]`, `/ticker SYMBOL`, `/scanner`, `/vol`, `/help`

## GitHub Actions
- **actualizar_datos.yml**: cron `0 13` (10:00 ARG) y `0 20` (17:00 ARG) lun-vie + `workflow_dispatch`
- Dependencias Python: `yfinance pandas numpy requests gspread google-auth gspread-formatting`

## Notas técnicas
- DD removido de la lista de tickers (split distorsionaba scores)
- El cap de RS nivel en 40 pts permite diferenciar RS=90 (30pts) de RS=100 (40pts)
- El momentum RS es asimétrico: caer penaliza más (×1.5) que subir premia (×0.5), para evitar que acciones en baja se cuelen por otros criterios
- Vol Relativa < 1 no garantiza compresión si el stock tuvo días amplios intraday; el H-L range lo captura

## Historial de cambios principales
1. Migración de Twelve Data API → datos desde JSON en GitHub (sin API key expuesta)
2. Ticker strip con banderas y favicons
3. Stat cards clickeables como quickFilter
4. Warren Score reemplazó gráfico Top/Bottom RS
5. Bubble chart: tamaño por Market Cap (log scale)
6. Tendencia RS: 4 semanas
7. Scanner: filtros RSI mín/máx agregados
8. Vol Relativa: actualizado de 20 a 5 ruedas
9. Mín 52W: nuevo campo en datos, usado en Warren Score
10. Diccionario NOMBRES con ~70 tickers: tooltips en gráficos y tablas
11. Popover TradingView: gráfico de precios 3M al hover sobre ticker
12. PWA: manifest.json, service-worker.js, metas apple
13. Precios en tiempo real: servidor Node.js local proxy de Yahoo Finance
14. Scanner: Δ RS Hoy, Δ RS 1m, headers ordenables
15. Landing page con animaciones canvas, MatrixText, SPY/QQQ cards, relojes
16. Bot Telegram migrado a Render: polling tiempo real, alerta 18:00 ARG
17. DD removido (split distorsionaba Vol Relativa y Warren Score)
18. Warren Score: RS momentum semanal (+15 pts), EMA200 proporcional (+10 pts extra)
19. Warren Score: RS nivel cap subido de 30 a 40 pts
20. Warren Score: momentum semanal asimétrico (×0.5 up, ×1.5 down, max ±7.5)
21. Despegue Fresco: panel de breakouts con 3 capas (Python + JS)
22. Despegue Fresco: gold highlight en Warren Score y scatter Resurgimiento
23. Resurgimiento: labels de ticker visibles cuando < 50 burbujas
24. Vol Relativa: cambiado a promedio H-L range vs histórico (captura días amplios individuales)
25. Orden de paneles: Resurgimiento → Warren Score → Despegue Fresco → resto
26. V7 (jul 2026): Toggle Acciones ⇄ ETFs en "Cuadrantes de Rotación". Modo ETFs: 11 sector ETFs (XLK XLE XLF XLV XLI XLY XLP XLU XLB XLRE XLC) con estelas animadas 16 semanas, ▶ Play, slider, click para aislar trail. Modo Acciones: sin cambios. Pipeline: `calcular_rs_historia()` genera `rs_historia.json` vía GitHub Actions. Fallback: posición actual sin estelas si el archivo no existe. Para remover V7: borrar bloque entre "WB UPGRADE V7" y "FIN WB UPGRADE V7" en index.html, y el bloque `calcular_rs_historia` en actualizar_datos.py.

## Sesión 9–13 jul 2026 — Warren Score v2.3, señales técnicas, sistema de pagos, UX

> Nota: las secciones de arriba (Warren Score "fórmula actual", orden de paneles, etc.) describen una versión anterior del dashboard y están desactualizadas. Esta sección documenta los cambios reales aplicados sobre el `index.html` y `actualizar_datos.py` actuales (post V8, con `calcWarrenDetalleV2`).

### Warren Score v2 — rebalanceo de pilares (`index.html`, funciones `_pilarAv2/Bv2/Cv2/Dv2`, `calcWarrenDetalle` = `calcWarrenDetalleV2`)
- **Pilar A — Tendencia (20 pts, sin cambio de total):** se eliminó el componente "Distancia al Máximo" (8 pts) y se redistribuyó proporcionalmente entre Dist SMA50 (6→10), Dist EMA200/ATR (3.5→5.83) y EMA200 Slope (2.5→4.17).
- **Pilar B — Fuerza RS: 25 → 30 pts.** Todos los componentes escalados ×1.2 (RS Score 12.5→15, bumps ayer/semana/mes, FR>SMA50 3.5→4.2, Vs Sector 2.5→3).
- **Pilar C — Setup Corto: 30 → 25 pts.** Todos los componentes escalados ×0.8333. Luego se sacó el componente "Ratio de acumulación" (Vol+/Vol- 10 ruedas, 5.83 pts) y se repartió en partes iguales (1.94 c/u) entre Vol Relativa comprimida, Volumen seco y RSI en zona neutra. El RSI dejó de sumar puntos por encima de 70 (antes decaía hasta 78): `_tri(RSI, 40, 55, 65, 70)`.
- **Pilar D — Setup Estructural: sin cambios** (25 pts, o 5 sin `Base Semanas` detectada).
- **Reponderación sobre 80 eliminada:** antes, si a un ticker le faltaba la Base (pipeline `detectar_base`), el score se escalaba `sumRaw/80*100`. Ahora el score sale directo sobre 100 — un ticker sin base pierde esos puntos en vez de que se reponderen artificialmente hacia arriba (ej: IWM pasó de 85 a 68).
- **Gates de `_evalGates(d)`:** el de "distancia al mínimo de 52W" bajó de 30% a 20%. El de "distancia al máximo de 52W" (`>25%`) se **eliminó**.
- **Total de pilares:** A=20, B=30, C=25, D=25 (o 5 sin base) = 100.

### Fix crítico: `_bool()` ignoraba `FR > SMA50` (`index.html`)
El backend manda ese campo como string con emoji (`"✅ Sí"` / `"❌ No"`), pero `_bool()` solo matcheaba texto exacto sin emoji (`'sí'`, `'true'`, etc.), así que el bono de Fuerza RS por FR>SMA50 **nunca se aplicaba en ningún ticker**. Se agregó detección de `✅`/`✓` (true) y `❌`/`✗` (false) antes del match de texto.

### Señales técnicas — `actualizar_datos.py`
- **`churn_maximos()`:** el umbral de volumen pasó de "≥ promedio de 20 ruedas" a **"≥ 1.5× el promedio de las últimas 10 ruedas"** (la misma ventana que se evalúa). Más exigente, menos falsos positivos (caso real: ANET).
- **`div_rsi()`:** un pivote de precio necesita 4 ruedas futuras para confirmarse (lag estructural). Si en las **últimas 5 ruedas** el precio ya superó el último pivote confirmado Y el RSI lo acompañó (no cayó ≥3 pts), se **anula** la divergencia vieja aunque técnicamente siga sin confirmarse un pivote nuevo.
- **`div_obv()` — reemplazo completo ("Suba sin combustible"):** la vieja divergencia de OBV (comparación de máximos de 2 ventanas de 10 ruedas) se diluía y llegaba tarde. Nuevo detector: aísla la última pierna del avance (`R=3` ruedas) contra el impulso que marcó el **pico de mayor volumen** (no de mayor High — así no se corre día a día durante un grind de máximos marginales) de las últimas `L=20` ruedas. Se activa si las 3 condiciones se cumplen a la vez: (1) precio pegado al pico sin progresar (`close ≥ 0.97×High_pico` y avance de R ruedas entre -3% y +3.5%), (2) velas más chicas que el impulso (rango < 65% del rango del impulso), (3) volumen más seco (< 70% del volumen del impulso). Mismo nombre de función, misma columna "Div OBV", mismo emoji 🪫 y mismo peso en penalizaciones. Calibrado contra el caso real GE (jul-2026): activa 1-jul a 6-jul, se apaga al desplomarse el 7-jul.
- **`isValidBreakout()` / `isFail()` (index.html, badges "Despegue Fresco válido" / "FAIL BREAK OUT"):** umbral de vela de distribución bajado de `Var Día % ≤ -3` a `≤ -2` (mismo criterio que ya se usaba para volumen: Vol Relativa ≥1.3 o Vol Inusual % ≥50). Caso real: IBB (-2.68%, Vol Inusual 73%) no se detectaba con -3%.

### "Retorno Top 10 de la semana" (`index.html`, `wbSnapGuardar`/`wbRenderSnap`)
- Antes: guardaba un snapshot del Top 10 **todos los días** (localStorage `wb_snap_v1`, client-side) y comparaba contra el snapshot de "hace ~7 días" (ventana rolling).
- Ahora: solo guarda un snapshot nuevo si `hoyISO()` cae en **viernes**, y siempre compara contra el **último viernes guardado** (incluido hoy mismo si hoy es viernes) — atado al calendario, no a cuándo se abrió el dashboard. Purga automáticamente snapshots viejos que no caen en viernes (residuos de la lógica diaria anterior).
- El precio base del snapshot se calcula como **cierre de ayer** (`Precio / (1 + Var Día %/100)`), no el precio intradiario del momento de captura — así el retorno del viernes de captura ya arranca igualado a la variación diaria real, no en 0%.
- Sigue siendo 100% client-side (localStorage por navegador, no hay una única fuente de verdad compartida entre visitantes).

### Click en cualquier ticker abre la Ficha de Ticker (`index.html`)
Listener global de click (`document.addEventListener('click', ...)`) que detecta `.ticker-badge`, `.brk-ticker` y `.wb-spot-card` en cualquier parte del DOM y llama a `wbAbrirFicha(ticker)`. Cubre Warren Score, Cartelera, Scanner, Despegue Fresco, Episodic Pivots (se le agregó la clase `ticker-badge`, antes texto plano) y el Podio del día (Top 3 Spotlight). **Pendiente:** RRG, Volumen Inusual, Sesiones & Volumen y Tendencia RS Score usan Chart.js (canvas) y necesitan wiring aparte vía `onClick` del chart — no cubiertos por esta delegación basada en DOM.

### Sistema de pagos — webhook de MercadoPago (`api/`)
**Problema original:** un pago aprobado por MercadoPago no siempre quedaba registrado (mail + acceso) en Redis, porque el único punto de registro (`confirmar-pago.js`) depende de que el navegador del cliente complete la redirección post-pago. Si el cliente cerraba la pestaña antes, no quedaba ningún rastro.

**Fixes aplicados en `api/webhook-mp.js`:**
1. Antes solo procesaba pagos que fueran parte de una **suscripción** (`subscription_id`/`preapproval_id`); ahora también procesa **pagos únicos** (Preference de `crear-pago.js`) leyendo `external_reference` directo del pago, como respaldo si la redirección nunca llegó.
2. Firma HMAC (`x-signature`) corregida: al manifest le faltaba el `;` final (`id:...;request-id:...;ts:...;`) que exige MercadoPago — sin eso, la validación de firma siempre fallaba aunque `MP_WEBHOOK_SECRET` fuera correcto.
3. Extracción de `id`/`topic` corregida: MercadoPago puede mandar `data.id` como **query param literal** (`?data.id=X&type=payment`, con el punto, no anidado), no solo en el body JSON o como `?id=X&topic=Y` clásico.
4. Orden de ejecución corregido: antes respondía `200` **antes** de procesar (patrón riesgoso en serverless — el runtime puede cortar la ejecución apenas se manda la respuesta). Ahora responde `200` en un `finally`, después de terminar todo el procesamiento.

**Índice cruzado por `payment_id`:** se agregó `pago:{payment_id} → {email, products, exp, fecha}` en Redis, escrito desde `confirmar-pago.js`, `confirmar-suscripcion.js` y `webhook-mp.js`, para poder buscar un pago por su ID sin depender del mail.

**`api/admin.js` (endpoint único, protegido con `ADMIN_SECRET`):** consolida 3 acciones que antes eran archivos separados (se juntaron para no pasar el límite de **12 Serverless Functions** del plan Hobby de Vercel):
- `?action=buscar&payment_id=X` → busca en `pago:{payment_id}`, devuelve mail/productos/vencimiento o `found:false`.
- `?action=otorgar&email=Y&products=dashboard,planilla` → alta manual de acceso (para pagos reales que nunca se registraron), escribe `email:{email}` y `pago:{payment_id manual}`.
- `?action=backfill` → corrida única que recorre todos los `email:*` existentes y les crea el índice `pago:*` que les falte (con fecha aproximada = `exp - 365 días`, ya que los registros viejos no guardaban fecha exacta). Ya se corrió una vez (jul-2026): 47 mails totales, 46 índices creados.
- Responde con `Cache-Control: no-store` (evita que el navegador cachee un `found:false` viejo).

**Variables de entorno relevantes:** `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` (la da MercadoPago en el panel de webhooks), `ADMIN_SECRET` (inventada, no la da nadie — protege `admin.js`), `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `ACCESS_SECRET`.

**Configuración pendiente del lado de MercadoPago:** verificar que el webhook en el panel de MP apunte a `https://warrenbife.com/api/webhook-mp` con el evento "Pagos" activado.
