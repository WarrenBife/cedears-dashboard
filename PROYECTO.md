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
