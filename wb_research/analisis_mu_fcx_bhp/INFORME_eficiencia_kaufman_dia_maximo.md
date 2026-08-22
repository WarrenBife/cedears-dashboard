# Informe — Eficiencia de Kaufman desde el día del máximo con volumen+RSI

**Alcance: solo investigación.** No se modificó `index.html`, `actualizar_datos.py`, la fórmula del Warren Score, los pilares, las penalizaciones, el Google Sheet, el bot ni GitHub Actions. Este informe y los scripts que lo generan viven enteramente en `wb_research/analisis_mu_fcx_bhp/`.

## Pregunta original

MU (18/3–21/4/2026, foco desde 14/4), FCX y BHP (15/6–12/8/2026, foco desde 5/8) y AVGO (gap del 4/6, foco 5/8–14/8) formaron un máximo, corrigieron, armaron una base, y volvieron a la zona del máximo previo. Solo MU rompió y voló; FCX, BHP y AVGO se pincharon. ¿Hay una forma matemática de haber anticipado esto?

## Resultado — HAY SEÑAL, y es robusta

### Definición exacta (reproducible)

1. **Día del máximo**: primer día causal (sin mirar adelante), dentro de los 15 días de haber reingresado a la zona del 10% del máximo previo, en que se cumplen **las 3 condiciones a la vez**:
   - Cierre hace un nuevo máximo desde que entró en esa zona.
   - Volumen > SMA10 del volumen (10 ruedas previas, sin incluir el día actual) — es decir RVOL10 > 1.
   - RSI(14) > 60 ese mismo día.
2. **Eficiencia de Kaufman ESTÁNDAR** (`ER = |cambio neto de cierre| / Σ|cierre_i − cierre_i-1|`, ventana de cierres solamente — SIN cuerpo, SIN mechas, SIN gaps) medida desde ese día en adelante, ventanas de **5 a 8 ruedas** (todas probadas, todas con señal consistente).
3. **Resolución**: 10 ruedas después de que termina la ventana del índice (sin solaparse con ella) — ÉXITO si el cierre supera el máximo original, FRACASO si no lo supera y cae ≥3%.

### Validación a escala (universo de 255 tickers, taza genuina, n≈360-405 por ventana)

| Ventana | n | Éxito base | Pearson | Spearman | Spread quintil |
|---|---|---|---|---|---|
| 4 días ⚠️ | 403 | 69.0% | +0.186 | +0.198 | 22.3 pts (quintiles desparejos, ver advertencia abajo) |
| 5 días | 386 | 73.1% | — | — | (ver deciles abajo) |
| 6 días | 386 | 72.0% | +0.181 | +0.191 | 24.8 pts |
| 7 días | 380 | 71.8% | +0.199 | +0.191 | 15.8 pts |
| **8 días** | 363 | 76.3% | **+0.218** | **+0.216** | 21.8 pts |
| 10 días | 371 | 76.3% | +0.172 | +0.172 | 18.0 pts |

Correlación positiva y del mismo orden de magnitud en **las 6 ventanas probadas** (incluida la de 4 días) — a diferencia de todas las variantes del "índice con cuerpo de vela" (ver sección de líneas descartadas), acá la señal no cambia de signo ni se cae a ruido al mover la ventana. Esa consistencia es la que la hace confiable en general, aunque la ventana de 4 días tiene un problema propio documentado más abajo (no es que no tenga correlación — la tiene — sino que no es confiable caso a caso).

Detalle de los quintiles de 4 días (para que quede el dato completo, no solo el spread): 62.2% / 56.2% / 57.5% / 84.5% — el último quintil junta 161 de los 403 casos (en vez de ~80), por la enorme cantidad de empates en ER=1.0 que genera una ventana tan corta (ver advertencia).

### Umbral recomendado: **ER ≥ 0.75-0.80**

Deciles (5 y 6 ruedas — granularidad completa, n≈37-40 por decil):

| ER (rango) | Éxito 5d | Éxito 6d |
|---|---|---|
| 0.00–0.09 | 58.9% | 63.4% |
| 0.09–0.22 | 82.1% | 68.4% |
| 0.23–0.35 | 65.8% | 64.9% |
| 0.35–0.51 | 62.5% | 76.9% |
| 0.51–0.60 | 73.0% | 55.0% |
| 0.61–0.74 | 46.2% | 54.1% |
| 0.74–0.86 | 68.4% | 74.4% |
| **0.87–0.94** | **94.9%** | 82.5% |
| **0.95–1.00** | **89.6%** | 83.3–97.4% |

Zona media (0.35–0.68) es ruidosa en ambas ventanas (esperable con n≈37-40 por corte), pero el patrón robusto es: **por debajo de ~0.75 no hay ventaja sobre el promedio general; por encima de ~0.75-0.80, la tasa de éxito salta de forma sostenida a 82-97%**, en las dos ventanas.

### Los 4 casos reales, con esta definición exacta

| Ticker | Día del máximo | RSI | RVOL10 | ER (4d) | ER (5d) | ER (6d) |
|---|---|---|---|---|---|---|
| **MU** | **14/4/2026** | 66.1 | 1.01 | 0.8411 | **0.8960** | **0.8059** |
| AVGO | 4/8/2026 | 61.8 | 1.58 | 1.0000 ⚠️ | 0.2834 | 0.0977 |
| FCX | 4/8/2026 | 60.9 | 1.13 | 0.4895 | 0.5702 | 0.2160 |
| BHP | 5/8/2026 | 62.6 | 1.29 | 0.2936 | 0.1339 | 0.1516 |

MU: por encima del umbral (0.75-0.80) en las 3 ventanas, y de forma **estable** (0.84 / 0.90 / 0.81 — casi no cambia según la ventana). FCX/BHP/AVGO: todos por debajo del umbral con 5 y 6 ruedas.

**Advertencia importante — la ventana de 4 días NO es confiable**: con 4 ruedas, AVGO da ER=1.0000 (el más alto de los 4, prediciendo mal que sería el mejor caso) porque esos 4 días fueron el tramo de subida limpia justo antes de revertir el día 5-6 — la ventana es demasiado corta para alcanzar a "ver" la debilidad. Con 4 ruedas hay además muchísimos empates en ER=1.0 a escala (fácil lograr "eficiencia perfecta" con pocos pasos), lo que infla artificialmente esa cola. **Usar 5-8 ruedas, nunca 4.**

## Líneas descartadas (documentado para no repetir el trabajo)

Todas estas variantes se probaron sobre el mismo dataset (683 eventos "reintento con taza genuina", 255 tickers × 2 años) y **no mostraron señal utilizable**:

1. **ER con "cuerpo" en el denominador** (gap + cuerpo de vela en vez de solo cierres): r≈-0.02, sin señal.
2. **Índice `(Σ|Δcierre|) × (Σ|cuerpo|) / promedio²`**, en todas sus variantes de ventana probadas:
   - Ventana fija de 5 ruedas terminando en el pico del reintento: única variante con señal real (17.5 pts spread), pero **en la dirección CONTRARIA** a la hipótesis de "compresión sana" (índice bajo → peor resultado, no mejor). MU resultó un outlier estadístico de esta relación, no un ejemplo de ella.
   - Ventana desde el día del máximo + 3 siguientes (4 días totales): sin señal (r=0.07, no monótono).
   - Ventana de los 4 días posteriores al día del máximo (sin contarlo): sin señal (r=0.075, no monótono).
   - Ventana con reset a nuevo máximo + RSI>60 y 2 ruedas siguientes: ruido puro (r=0.006, spread negativo).
   - Denominador con rango completo (Máximo−Mínimo) en vez de solo cuerpo, misma ventana de reset: mismo resultado, ruido (r=0.014).
   - En las variantes de ruido, 28-31% de los casos de "índice bajo" fallaron igual, y 65-67% de los casos de "índice alto" tuvieron éxito igual — literalmente parecido a separar al azar.
3. **Filtrar por RSI>60/65/70/75 en el pico del reintento** (probando si la hipótesis de "compresión sana" aplicaba solo a papeles "estirados"): no cambió la dirección del hallazgo del punto 2; si acaso reforzó la dirección contraria.

## Hallazgo previo, también validado (de la fase anterior de esta investigación)

**Máquina de estados Caso A / Caso B** (RVOL10 = volumen / SMA10 de volumen previo):
- **Caso A** (el precio hace nuevo máximo de cierre): necesita confirmación con RVOL10≥1 o se degrada — 83.8% (n=74) confirmado vs. 70.2% (n=272) no confirmado.
- **Caso B** (el precio NO hace nuevo máximo, pausa): sano solo si RVOL10<1 (sin presión de venta real) — 45.8% (n=166) con volumen bajo vs. 15.3% (n=98) con volumen alto. **Spread de 30.5 puntos — el hallazgo más fuerte de toda la investigación.**

## Asimetría de las dos señales — cuál usar para qué (importante para uso práctico)

Ninguna de las dos señales es simétrica (alto=éxito, bajo=fracaso, en la misma medida). Cada una es fuerte en una sola dirección:

**ER de Kaufman en el día de la ruptura (esta sección del informe)** — fuerte para CONFIRMAR fortaleza, débil para señalar fracaso:

| | Tasa de éxito | Vs. base (~72-73%) |
|---|---|---|
| Decil más bajo de ER (<0.09) | 58.9%–63.4% | **solo −9 a −14 pts** |
| Decil más alto de ER (>0.87-0.98) | 89.6%–97.4% | **+20 a +25 pts** |

Un ER bajo no hunde la probabilidad de éxito (sigue siendo mayoría, 59-63%) — la población base ya es favorable (hizo nuevo máximo con volumen y RSI>60). El ER alto sí identifica con fuerza el subgrupo de mayor confianza.

**Caso B de la máquina de estados (el precio NO hace nuevo máximo, pausa)** — es la contracara: fuerte para señalar FRACASO cuando el volumen no baja:

| | Tasa de éxito | Tasa de fracaso |
|---|---|---|
| Deambula sin romper, volumen **alto** (RVOL10≥1) | 15.3% (n=98) | **84.7%** |
| Deambula sin romper, volumen **bajo** (RVOL10<1) | 45.8% (n=166) | 54.2% |

**Conclusión práctica combinada**: si el papel **rompe** un nuevo máximo, mirar el ER de esa ruptura (5-8 ruedas) para confirmar fortaleza — un ER≥0.75-0.80 es la señal de mayor confianza. Si el papel **no rompe** y se queda pausando cerca del máximo previo, mirar si el volumen se mantiene alto (RVOL10≥1, mala señal — 84.7% de fracaso histórico) o cae (RVOL10<1, señal neutra/sana). Son señales complementarias que aplican en momentos distintos del patrón, no la misma pregunta medida dos veces.

## Archivos generados (en `wb_research/analisis_mu_fcx_bhp/`)

- `series_cache_universo.pkl` — cache de histórico OHLCV, 255 tickers, 2 años.
- `eventos_reintento_v4_cuerpo.json` — 1005 eventos base (reintento de máximo, EXITO/FRACASO/AMBIGUO).
- `eventos_maquina_estados.json` — 610 eventos con la clasificación Caso A/B.
- `eventos_er_estandar_multiventana.json` — ER estándar desde el día del máximo (ventanas 6/7/8/10 días), n=443.
- `eventos_er_5d_6d.json` — mismo cálculo, ventanas 5 y 6 días específicamente.
- `eventos_indice_v2_causal.json`, `v3_sin_dia0.json`, `v4_reset2r.json`, `v5_rango.json` — variantes descartadas del índice con cuerpo (documentadas arriba).

## Diseño de implementación — APROBADO por el usuario (12/8-16/8/2026)

**Todavía no implementado en producción.** Esta sección documenta el diseño ya cerrado, para ejecutar cuando se decida avanzar sobre `index.html` / `actualizar_datos.py`.

### Reasignación de puntos (el máximo teórico se mantiene en 100)

| Pilar | Antes | Después |
|---|---|---|
| A — Tendencia | 20 | 20 (sin cambios) |
| B — Fuerza Relativa | 30 (RS Score hasta 25 + FR>SMA50 hasta 5) | **25** (RS Score baja a 20 + FR>SMA50 sigue en 5) |
| C — Setup Corto | 25 | **25 + hasta 10 de bono ER = 35 máx** |
| D — Base/Extensión | 25 (ext.5 + semanas 10.5 + posición 6.5 + vol trend 3) | **20** (ext.5 + semanas 10 + posición 5 + vol trend 0) |
| **Total máximo** | **100** | **100** |

Puntos removidos para financiar el bono: −5 (RS Score) −0.5 (semanas de base) −1.5 (posición en la base) −3 (ajuste tendencia de volumen) = **−10 exacto**, matchea el bono nuevo. El clamp final `Math.min(100, sumRaw)` no necesita tocarse, sigue siendo válido.

### Bono ER (dentro de Pilar C, hasta +10 pts)

- **Condición de entrada**: mismo detector validado — día del máximo del reintento (nuevo cierre máximo causal + RVOL10>1 + RSI14>60).
- **Cálculo**: `_lineal(ER, 0.65, 0.90, 0, 10)` — ER estándar de Kaufman (solo cierres, sin cuerpo/mechas), medido desde el día del máximo hasta hoy. Piso 0.65 (0 pts), techo 0.90 (10 pts, tope).
- **Ventana**: arranca a valorizar desde el **día 4** posterior al día del máximo (antes de eso, la ventana es demasiado corta y ruidosa — ver caso AVGO en este informe). La ventana crece día a día (día 4, 5, 6... hasta 10 — el límite más largo validado con señal real). A partir del día 10 sin resolución, se congela en el valor de ese día.
- **Se apaga (vuelve a 0) si**: el papel se cae de la zona de reintento (vuelve a estar lejos del máximo previo) sin haber roto.
- **Si rompe el máximo previo mientras el bono está activo**: ese día (inclusive) es el ÚLTIMO día que el bono suma. Al día siguiente, el bono vuelve a 0 sin importar qué pasó — no queda congelado ni permanente. Es efímero, solo aplica el día puntual de la ruptura.

### Penalización Caso B (−25 pts, fija/binaria)

- **Condición**: papel dentro de la zona de reintento (~10% del máximo previo, sin haberlo superado) Y volumen sostenido (RVOL10 ≥ 1) durante la pausa — el hallazgo más fuerte de toda la investigación (84.7% de fracaso histórico vs. 45.8% cuando el volumen sí cae).
- **Se reevalúa todos los días** (sin contador fijo de días) — se apaga sola el día que: (a) rompe el máximo previo, o (b) se cae de la zona.

### Badge "BOMBA" + panel "Episodic Pivots & Bombs"

- **Trigger**: el día que rompe el máximo previo con el bono ER activo (ER≥0.65 ese día).
- **En la tabla principal del Warren Score**: fondo verde + badge "BOMBA" **solo ese día puntual**. Al día siguiente la fila vuelve a la normalidad visual (coincide con que el bono también se apaga ese mismo día).
- **Panel "⚡ Episodic Pivots hoy" → renombrar a "⚡ Episodic Pivots & Bombs"**: agregar una sección de "Bombs" (tickers que activaron BOMBA), visibles durante **7 días** desde la ruptura — requiere que el pipeline guarde la fecha de activación y calcule `Bomba Días Ago` día a día (mismo patrón que ya usa `Breakout Days Ago`). Es un registro/vidriera de descubrimiento, independiente del puntaje (que ya se apagó el día después de romper).

## Actualización — implementado en producción (16/8/2026)

Se implementó en `actualizar_datos.py` (función `detectar_reintento_maximo`, ~línea 1578) y se está cableando en `index.html`. Cambios respecto al diseño original de más arriba, todos surgidos de validar cada decisión a escala antes de aplicarla:

### Duración mínima de la taza: 10 ruedas (bajada de 35), para las dos ramas

El caso real de MU (corrección 18/3→31/3/2026) duró solo 17 ruedas — con el umbral de 35 originalmente validado, **nunca hubiera calificado como "reintento con taza genuina"**, y el feature entero no habría disparado nunca para el caso que motivó la investigación. Se probó bajar el umbral a 10, 15, 20, 25, 30 ruedas:

- **Bono ER**: la correlación aguanta prácticamente igual en todo el rango (Pearson 0.12-0.16 en ventanas 5/6/8 días, vs. 0.18-0.22 con 35 — algo más débil pero real).
- **Caso B**: con la reconstrucción *fiel* del script original (ver más abajo), el hallazgo es **fuerte y monótono en todo el rango 10-35** (72.4% de fracaso a 10 ruedas, subiendo gradualmente a 84.7% a 35) — no hace falta un umbral alto para que la señal exista.

**Se dejó taza mínima = 10 ruedas para ambas ramas.**

### Corrección importante: reconstrucción fiel del Caso B

Un primer intento de re-validar el Caso B a duraciones bajas dio resultados mucho más débiles (~45-47% de fracaso, plano de 10 a 30 ruedas) que no coincidían con el 84.7% original. Se determinó que la reconstrucción tenía errores de construcción (usaba el *primer* día que cumplía la condición de volumen, cuando el script original usa el *último* día de la ventana de 15 ruedas que la cumple — sin cortar el loop). Se recuperó el script original completo desde el transcript de la sesión previa (guardado en disco) y se confirmó que reproduce el 84.7%/n=98 exacto. La lógica correcta quedó implementada en `detectar_reintento_maximo`.

**Las dos ramas usan definiciones de "día de referencia" DISTINTAS, cada una fiel a como se validó**:
- **Bono**: "día del máximo" = primer día causal con nuevo cierre máximo del intento + RVOL10>1 + RSI>60 a la vez.
- **Caso B**: "día 1" = el ÚLTIMO día causal (dentro de la misma ventana de 15 ruedas) que hace nuevo máximo del intento con RVOL10≥1, sin exigir RSI. Desde ahí, hasta 7 ruedas: si hace un nuevo cierre por encima de ese día, es Caso A (no penaliza); si no, es Caso B, y el promedio de RVOL10 de esos días sin progreso decide si penaliza (≥1, penaliza) o no (<1, sano).

### El chequeo de "taza genuina" (piso redondeado, no en V) se sacó SOLO de la rama del bono

MU además fallaba un segundo filtro independiente de la duración: solo tiene 2 días cerca del mínimo de la corrección (se exigían ≥3, para descartar correcciones en V). Se probó sacar este chequeo por completo: el bono aguanta bien sin él (correlación similar), pero el **Caso B se derrumba de 25.1 a 6.0 puntos de spread** — el filtro es imprescindible ahí. Se dejó el chequeo únicamente adentro de la rama de Caso B; la rama del bono no lo exige.

### Bug encontrado y corregido: el ER de "fue bomba" no puede incluir el día de la ruptura

Al calcular si una ruptura calificaba como "bomba" (ER≥piso), el cálculo original incluía el día de la ruptura misma dentro del bloque de eficiencia — el salto explosivo de ese día arruina la medición (daba 0.37 en vez de 0.81 en el caso real de MU). Se corrigió: el ER de "fue bomba" se mide sobre la pausa previa (día del máximo hasta el día ANTERIOR a romper, tope día 10), nunca incluyendo el día de la ruptura.

### Penalización graduada por duración de la taza (en vez de −25 fijo)

Por pedido explícito: en vez de una penalización fija de −25, escala linealmente según cuánto duró la base — **−15 puntos a partir de 10 ruedas de taza, subiendo hasta −25 puntos a partir de 25 ruedas** (interpolación lineal entre esos dos puntos).

### Validado contra los 4 casos reales (truncando el histórico día por día)

MU: el bono crece el 20/4 (9.84 pts) y 21/4 (6.24 pts), se congela en 6.24 y dispara "Bomba Hoy" + badge exactamente el 22/4 (día real de la ruptura); al día siguiente el bono vuelve a 0 y el badge desaparece, mientras `Bomba Días Ago` sigue contando (1, 2, 5...) para el panel. FCX, BHP y AVGO no disparan bono ni Bomba en ningún día de su ventana real (nunca rompieron) — cero falsos positivos.

### `index.html` cableado (17/8/2026)

Bloque `WB UPGRADE V27` agregado al final del archivo (mismo patrón que V2-V26): pilares reasignados (B 30→25, C 25→35 con el bono, D 25→20 = 100 total), `_penalizacionesV44` con el Caso B graduado, badge 💣 BOMBA con fondo verde el día de la ruptura, panel "Episodic Pivots & Bombs" con sección separada para Bombs (7 días de vigencia). `node --check` OK en los 32 bloques `<script>` del archivo.

### Ventana mínima de 5 ruedas para confirmar una Bomba (17/8/2026)

Al revisar en vivo el caso de PLTR (rompió el máximo previo solo 3 ruedas después del día del máximo), el ER de esa "pausa" tan corta dio 1.0000 exacto — ruidoso, poco confiable, mismo problema que ya habíamos visto con AVGO y ventanas de 4 días al principio de la investigación. Se agregó `REINTENTO_BOMBA_MIN_VENTANA = 5`: si la pausa entre el día del máximo y el día anterior a la ruptura tiene menos de 5 ruedas, no se confirma la bomba aunque el ER dé por encima del piso. Validado: PLTR deja de disparar, MU (ventana de 6 ruedas) sigue disparando sin cambios.

### Regla de "renovación de base" probada y descartada

Se probó renovar el "día del máximo" cada vez que, dentro de los 3 días siguientes, aparecía otro día con nuevo máximo + RSI>60 + más volumen que la base actual (motivado por un caso real de JD donde el día siguiente al elegido tenía más volumen en las tres dimensiones). Validado a escala: la correlación **empeora** en las tres ventanas (Pearson 0.09 vs. 0.13-0.17 sin la regla) y el spread de 8 días casi desaparece (11.3→4.6 pts). **No se adoptó** — se mantiene la regla original (primer día que cumple la condición).

### Pendiente

1. No se corrió el pipeline completo contra datos en vivo de yfinance de punta a punta, ni se abrió el dashboard en un navegador real — sólo se validó sintaxis y la lógica del detector contra histórico cacheado y datos en vivo puntuales (JD, PLTR, MU, FCX, BHP, AVGO). Antes de la próxima corrida real de GitHub Actions, conviene correr `actualizar_datos.py` una vez a mano y revisar que el Sheet/JSON traigan los campos nuevos bien poblados.
2. No se hizo ningún commit de esta última sección — los cambios quedaron en los archivos locales (el commit del bono ER + Caso B sí se pusheó, ver más abajo).

## Warren Score v4.2 — Agotamiento OBV v2 (17/8/2026)

Investigación adicional sobre el bloque "Agotamiento" (Div RSI + Div OBV + Churn Máximos), que en la validación original de todas las penalizaciones (ver tabla completa más abajo) mostró resultados dispares al desagregar cada componente.

### Hallazgo — Div OBV es la única de las tres que sostiene su peso, con una redefinición

`div_obv` mide "suba sin combustible": el precio sigue pegado al máximo de la última ventana con el mayor volumen (el "día de impulso"), pero con velas más chicas y volumen más seco que ese impulso. El usuario propuso 3 cambios, validados a escala:
- Ventana del impulso: 20 → **10 ruedas**.
- Banda "cerca del pico": 3% → **5%**.
- Condición de avance reciente: de "-3% a +3.5%" (permitía una leve corrección) a **"0% a +3.5%" (solo avance positivo débil)** — corregir con volumen seco se considera descanso sano, no agotamiento; solo seguir subiendo sin fuerza cuenta.

Resultado (n=5834, muestreo cada 10 ruedas, retorno a 10 ruedas):
| | ER estándar | Correlación / efecto |
|---|---|---|
| Div OBV v1 (original) | dif. retorno -1.35, dif. cayó>5% -0.4 (nulo) | débil en la mitad de las métricas |
| **Div OBV v2 (nueva)** | dif. retorno **-1.93**, dif. cayó>5% **+3.0** | mejora en las dos métricas |

La mejora viene de dos lados: descarta los casos que más diluían la señal original (los que solo calificaban por permitir avance negativo), y agrega casos nuevos más fuertes (que antes no calificaban por la ventana de 20 días) — el subconjunto "solo v2" muestra 29.8% de caídas >5%, muy por encima del 21% base.

### Div RSI y Churning en Máximos, por separado

- **Div RSI**: sin efecto en retorno promedio (dif=+0.05, nulo), pero sí en "cayó >5%" (dif=+5.6 pts) — funciona como señal de riesgo de caída puntual, no de peor retorno esperado.
- **Churning en Máximos**: solo 5 casos en 5834 muestras — no evaluable, evento demasiado raro en este universo/período.
- Escalada de -4 (1 señal) a -10 (2+ señales) del bloque original: sin datos suficientes para validarla (n=15 para 2+ señales).

### Combinaciones (OBV + RSI)

Con muestra chica (n=8, muestreo cada 10 ruedas) el combo OBV+RSI mostraba un efecto enorme (-4.47 de retorno) — **resultó ser ruido**. Con muestreo diario (n=123, con la salvedad de que un mismo episodio se cuenta varias veces por persistir varios días) el efecto se reduce a un tercio (-1.31) y el "cayó >5%" se invierte (-2.4, mejor que el promedio). Filtrando a RSI14>50 (n=90, foco en las condiciones que motivaron la pregunta original), el combo sí muestra un efecto más consistente: retorno -1.03% (10r) y -3.20% (20r), con "subió ≥10%" muy por debajo de la base en ambos horizontes (29% y 37% de la tasa base, respectivamente) — a diferencia de Div OBV sola, cuyo efecto casi desaparece para el horizonte de 20 ruedas (17.8% vs. base 19.3%).

**Conclusión: "Div OBV sola" es una señal de corto plazo (~10 ruedas) que se diluye rápido; "Div OBV + Div RSI combinadas" es más severa y persiste más en el tiempo, aunque con muestra más chica.** No corresponde llamarla "un papel muerto" en ningún caso — incluso en el peor subgrupo (combo, RSI>50, 20r) el 34.5% de los casos tuvo retorno positivo.

### Implementación (Warren Score v4.2)

Dos penalizaciones nuevas, independientes del bloque "Agotamiento" original (que sigue igual, sin tocar):
- **🌫️ OBV sola**: **-5 pts**.
- **🧨 OBV + RSI combinadas**: **-12 pts** (pisa a la de OBV sola si ambas aplican, no se suman).
- **Vigencia: 10 ruedas desde que arranca el episodio** (primer día causal en que la condición pasa de `False` a `True`), después se apaga sola sin importar si la condición sigue siendo cierta — mismo principio que el bono ER: no extender el castigo más allá del horizonte que efectivamente se validó (a los 20 días, OBV sola ya no tiene el respaldo de datos que tiene a los 10).

Implementado en `actualizar_datos.py` (`div_obv_v2`, `agotamiento_obv_v2`) e `index.html` (bloque `WB UPGRADE V28`, `_penalizacionesV45`, `WB_SCORE_VERSION_45='4.2'`). Validado contra ABBV, NVDA, PLTR, AAPL con datos en vivo (17/8/2026) — ABBV es, a esa fecha, el único ticker del universo con el combo activo.

### Snapshot en vivo (17/8/2026, para referencia — se desactualiza con el tiempo)

29 tickers con "OBV sola" activa dentro de los últimos 10 días; 1 ticker (ABBV) con el combo severo activo. Lista completa en el historial de esta conversación, no se preservó en archivo aparte.

## Tabla completa de efectividad de TODAS las penalizaciones (validación a escala, 17/8/2026)

Corrida sobre 255 tickers × 2 años, muestreo cada 10 ruedas (n=5834), retorno a 10 ruedas:

| Penalización | Puntos actuales | n activada | Dif. retorno vs. base | Dif. "cayó >5%" vs. base | Veredicto |
|---|---|---|---|---|---|
| 🎈 Sobreextensión | -6 | 154 | +1.23 (al revés) | +2.3 | Débil / dirección incorrecta en retorno |
| 🩸 Distribución | -15 | 831 | -0.97 | +4.7 | **Efectiva, buena muestra** |
| 💥 Reversión con volumen | -8 | 80 | -0.03 | +9.0 | Efectiva en cola de riesgo, muestra chica |
| ⛔ Breakout fallido | -10 | 0 | — | — | No evaluable con este muestreo (ventana angosta) |
| 🔻 Cerca del mínimo 52w | hasta -20 | 1157 | -0.05 | **-3.2 (al revés)** | **No sostiene el castigo, la muestra más grande de todas** |
| 📉 Div RSI (parte de Agotamiento) | -4 / -10 | 261 | +0.05 (nulo) | +5.6 | Solo cola de riesgo |
| 🪫 Div OBV vieja (parte de Agotamiento) | -4 / -10 | 361 | -1.35 | -0.4 (nulo) | Mejorada por la v2 (ver arriba) |
| 🐘 Churn Máximos (parte de Agotamiento) | -4 / -10 | 5 | — | — | No evaluable, evento rarísimo |
| 🧊 Churning en resistencia | -6 | 114 | -0.04 | +5.3 | Efectiva en cola de riesgo, muestra chica |
| 🌊 Caso B | -15 a -25 | — | — | 72-85% fracaso | **La más fuerte de todas, ya validada aparte** |
| 🌫️ OBV sola (nueva) | -5 | 150 | -1.88 | +2.9 | Efectiva, se diluye a los 20r |
| 🧨 OBV+RSI combo (nueva) | -12 | 90-123 según muestreo | -1.31 a -4.47 (sensible al muestreo) | mixto | Efectiva pero con muestra chica, persiste más en el tiempo que OBV sola |

**Pendiente de revisar con esta información**: 🎈 Sobreextensión y 🔻 Cerca del mínimo de 52 semanas no sostienen su castigo en esta validación (la segunda incluso va al revés, con la muestra más grande de la tabla) — quedan como candidatas a ajustar en una futura ronda, no se tocaron en esta sesión.

## Warren Score v4.3 — se elimina 🔻 Cerca del mínimo de 52 semanas (18/8/2026)

Confirmado el hallazgo de la tabla de arriba (n=1157, la muestra más grande de las 8 penalizaciones, con el efecto invertido: 18.6% de caídas >5% con la condición activa vs. 21.7% sin ella), se decidió eliminar esta penalización por completo. No se redistribuyeron sus puntos (hasta -20) porque, a diferencia de las 4 capas del Régimen de Mercado, las penalizaciones se restan DESPUÉS de que los 4 pilares ya suman 100 — sacar una no rompe ningún total fijo.

Implementado en `index.html` (bloque `WB UPGRADE V29`, `_penalizacionesV46`, `WB_SCORE_VERSION_46='4.3'`). Sin cambios en `actualizar_datos.py` — la condición usaba campos que ya se exportaban.

## Warren Score v4.4 — Agotamiento OBV: estado pegajoso sin tope de días (18/8/2026)

### El problema, encontrado revisando NVDA en vivo

Con el diseño original (v4.2), la penalización de OBV se re-evaluaba día a día chequeando las 3 condiciones completas de `div_obv_v2` — el "tope de 10 ruedas" era casi decorativo, porque en la práctica se apagaba apenas UNA corrección rompía la condición 1 (avance reciente positivo). Caso real: NVDA activó el patrón el 17/8/2026 y se apagó al día siguiente (18/8) simplemente porque el precio corrigió -2.47% en 3 ruedas — sin ninguna señal de que el papel se hubiera recuperado. El score de NVDA subió de 71.3 a 80.3 ese día pese a que el precio cayó, en parte por esto.

### Rediseño

El estado ahora es "pegajoso": una vez que arranca el episodio (mismo trigger de siempre: primer día causal con las 3 condiciones de Div OBV v2), se mantiene penalizando **sin límite de días** hasta que se confirma una recuperación real -- las 5 condiciones siguientes **a la vez, el mismo día**:
1. Al menos una de las 3 condiciones originales deja de cumplirse (el patrón técnico ya se disolvió)
2. Cierre de hoy > cierre de ayer
3. RVOL10 ≥ 1 (volumen real)
4. RS Score de hoy > RS Score de ayer (fuerza relativa mejorando)
5. Cierre de hoy > SMA10

`OBV RSI Combo Penaliza` (el castigo más severo, -12) ahora se define por si Div RSI **también** estaba activa el día que arrancó el episodio (no una máquina de estados separada) — comparte el mismo día de inicio y la misma condición de liberación que la de OBV sola.

Explícitamente **sin tope de seguridad** por pedido del usuario ("penalizalo hasta que cumpla") — si nunca aparece la combinación de recuperación, sigue penalizado indefinidamente. La búsqueda hacia atrás para encontrar el inicio del episodio actual está acotada a `OBV_LOOKBACK_MAXIMO=90` ruedas por límite práctico de cómputo (no de diseño) — un episodio que lleve más de 90 ruedas sin resolverse es un caso extremo no cubierto por esta ventana.

### Costo computacional

El nuevo cálculo necesita RS Score (contra SPY) en cada día del episodio activo, no solo hoy -- se midió en 8.3ms por llamada. Validado a escala: 255 tickers en ~0.6 minutos, despreciable dentro del pipeline diario.

### Validado

NVDA: con el rediseño, el 18/8 sigue penalizado (`obv_dias=1`, no se libera) en vez de apagarse como con el diseño anterior. ABBV mantiene el combo activo (ahora `obv_dias=5`, `combo_penaliza=True`). PLTR, AAPL, GS: episodios cortos (1-2 días), sin combo. JD: sin episodio activo.

Implementado en `actualizar_datos.py` (`agotamiento_obv_v2` reescrita, ahora recibe `hist_spy`). **`index.html` no requirió cambios** -- la fórmula JS sólo lee los booleanos `OBV Penaliza` / `OBV RSI Combo Penaliza`, sin importar cómo se calculan del lado Python.

### Pendiente

No se validó a escala el nuevo criterio de liberación (por ejemplo, si el castigo "pegajoso" captura mejor el drawdown real que el diseño anterior, comparando distribuciones de retorno durante el período penalizado). Sería el siguiente paso natural si se quiere confirmar que el cambio mejora la señal, no solo que resuelve el caso puntual de NVDA.

## Contracción de Volatilidad — ventana "reciente" ampliada de 5 a 10 ruedas (18/8/2026)

### El problema: validado "sin contexto", el componente no mostraba nada

Al testear `Contraccion Volatilidad` sin restringir a ningún escenario particular (cualquier día del universo, muestreo cada 10 ruedas, n=5834), la correlación con el retorno a 10 ruedas fue prácticamente cero (0.009) y la "zona de máximo puntaje" actual del Pilar C (ratio 0.45-0.80) rindió **peor** que el resto del universo (0.67% vs 0.98% de retorno). Esto generó dudas sobre si el componente aporta algo real.

### La corrección: hay que medirlo en contexto, no en cualquier día

El usuario insistió (con 3 casos reales: MU 15/4-21/4/2026, INTC 5/9-17/9/2025, SNDK 29/12-31/12/2025) en que la contracción es un componente central específicamente para papeles a punto de despegar cerca de una resistencia — no un predictor universal para cualquier día al azar. Al re-testear **dentro del contexto de "reintento a un máximo previo"** (mismo evento usado para el bono ER y Caso B, medido el día del máximo, filtrado a papeles por encima de la EMA200), el resultado se invirtió por completo: correlación -0.078 (Pearson) / -0.116 (Spearman), y la zona 0.45-0.80 SÍ rindió mejor que el resto (80.3% éxito vs. 69.7%, +10.6 pts). **Lección repetida de esta investigación: validar sin contexto puede ocultar (o hasta invertir) una señal real que sólo aplica en el escenario correcto.**

### Grid de ventanas — reciente=10 gana claro

Se probó una grilla de ventana "reciente" (3,4,5,7,10 ruedas) × ventana total/lookback (15,20,30,40,60 ruedas), en el mismo contexto (reintento + EMA200), n=640:

| Reciente | Lookback | Pearson | Spread quintiles |
|---|---|---|---|
| **10** | **20** | **-0.0990** | **11.8 pts** (la mejor combinación) |
| 5 | 15 | -0.0776 | 7.1 pts |
| 5 (actual) | 20 (actual) | -0.0640 | 4.2 pts |
| 7 | 60 | +0.1084 | -12.6 pts (invertida) |

Patrón general: lookbacks largos (30-60 ruedas) diluyen o invierten la señal; las mejores combinaciones están todas en lookback 15-20. La zona actual del Tri (0.45-0.80) sigue funcionando casi tan bien con reciente=10 (spread 11.8) como la mejor zona posible encontrada (0.30-0.80, spread 13.4) — no hizo falta recalibrar los umbrales del Tri, sólo ampliar la ventana reciente.

### Validado con caso real (MU, 2-3/9/2025)

MU lateralizó ~2 semanas ($115-122) entre el 20/8 y el 3/9/2025 antes de romper con fuerza el 4-5/9 (a $124-131). Con la ventana vieja (reciente=5), el 2/9 y 3/9 daban ratio 0.85 y 0.90 (fuera de la zona de máximo puntaje). Con la ventana nueva (reciente=10), dan 0.63 y 0.66 (dentro de la zona) — capta la compresión sostenida de 2 semanas que la ventana de 5 días se perdía parcialmente.

### Implementación

`contraccion_volatilidad()` reescrita en `actualizar_datos.py`: ventana reciente 5→10 ruedas, ventana de referencia ahora son las 10 ruedas anteriores a esas (partidas en 3 bloques de ~3-4 días, en vez de 3 bloques de 5). Sin cambios en `index.html` -- mismo nombre de campo, mismos umbrales del Tri (0.30-0.45-0.80-1.15). Validado: la función en producción reproduce exacto los valores de MU (2/9→0.6262, 3/9→0.6596) usados en la validación.

## Contracción de Volatilidad — Bollinger BandWidth vs. True Range (18/8/2026)

### Comparación

Se probó si Bollinger BandWidth (`(basis+2·stdev - (basis-2·stdev))/basis*100`, length=10, TradingView `BBW`) mide mejor la contracción que el True Range actual, aplicando el MISMO esqueleto (reciente=10 ruedas / referencia=10 ruedas previas en 3 bloques de ~3-4 días con `_promedio_sin_outlier`) sobre la serie diaria de BBW en vez de sobre TR. Testeado en el mismo contexto ya validado (reintento a un máximo previo, día del máximo, por encima de EMA200), n=695 eventos (universo completo, cache 255 tickers):

| Métrica (vs. retorno a 10 ruedas) | TR actual (reciente=10) | BBW length=10 |
|---|---|---|
| Pearson r | -0.0536 | **-0.1128** |
| Spearman ρ | -0.0463 | **-0.1275** |
| Spread quintiles Q1 vs Q5 | +1.35 pts | **+3.96 pts** |
| Zona Tri actual (0.30-0.45-0.80-1.15) vs. resto | +4.83% vs +2.52% (spread 2.31) | **+5.01% vs +1.99%** (spread 3.02) |

BBW gana en las cuatro métricas (~2-3x más fuerte). Los umbrales actuales del triángulo de puntaje no necesitan recalibrarse — misma escala de ratio (centrado en ~1), la zona de máximo puntaje ya separa mejor con BBW sin tocar nada.

### Por qué podría ser mejor

BBW usa desvío estándar (2 stdev), que pondera el CIERRE de todas las ruedas de la ventana relativas a su media móvil — captura dispersión de precio sostenida. True Range mide únicamente el rango intradía + gaps rueda por rueda, sin memoria de dónde quedó el cierre relativo a las ruedas previas — dos ruedas con TR idéntico pueden dejar cierres en extremos opuestos de la banda. Para "compresión antes de un breakout" (lo que se busca acá), la dispersión de cierres parece ser una mejor proxy que el rango bruto.

### Umbrales del Tri — los heredados de TR no son óptimos para BBW

Los umbrales actuales (0.30-0.45-0.80-1.15) se copiaron sin cambios de la fórmula de True Range. Grid search sobre picoI/picoD (con izq=picoI-0.15, der=picoD+0.35, mismos offsets que la estructura actual) sobre los 695 eventos:

| Umbrales (izq/picoI/picoD/der) | Spread full | Spread grupo1 (split por ticker) | Spread grupo2 |
|---|---|---|---|
| Actual: 0.30 / 0.45 / 0.80 / 1.15 | +3.02 | +2.87 | +2.99 |
| **Óptimo: 0.25 / 0.40 / 0.70 / 1.05** | **+4.46** | **+4.84** | **+3.95** |

Validado con dos esquemas de cross-validation (split aleatorio 50/50 por evento, y split por ticker — más exigente porque evita que el mismo papel aparezca en ambas mitades): la mejora se sostiene en los dos, no es sobreajuste de un corte afortunado. El "sweet spot" real de BBW está ~0.10-0.15 más abajo que el de TR (zona 0.40-0.70 en vez de 0.45-0.80), con techo de tolerancia en 1.05 en vez de 1.15.

### Pendiente

No implementado — pendiente de confirmación del usuario para: (a) reemplazar `contraccion_volatilidad()` (True Range) por la versión BBW(10), y (b) recalibrar los umbrales del Tri a 0.25/0.40/0.70/1.05 en `actualizar_datos.py`.

## Conclusión práctica

Si en el futuro se quiere estimar si un reintento a un máximo previo tiene buenas chances de romper: identificar el día en que se hace nuevo máximo del intento **con volumen por encima del promedio de 10 ruedas y RSI(14)>60**, y desde ese día medir la Eficiencia de Kaufman ESTÁNDAR (solo cierres, sin cuerpo ni mechas) en una ventana de **5 a 8 ruedas** (no 4). **ER ≥ 0.75-0.80 es la zona de mayor probabilidad de éxito (82-97% histórico)**; por debajo de eso, no hay ventaja clara sobre el promedio general (~72-76%).

Esto es investigación — no está implementado en el pipeline ni en el dashboard. Si en algún momento se quiere llevar a producción, requeriría: (a) replicar el detector de "reintento a máximo" dentro de `actualizar_datos.py`, y (b) decidir si se usa como filtro, como pilar adicional, o como alerta informativa — ninguna de esas decisiones se tomó acá.

## Penalización 🪤 "Pendiente SMA50 pronunciada" (20/8/2026) — IMPLEMENTADA

### Caso de origen

AVGO: rebotó con buen RS Score (~85) pero la SMA50 seguía con pendiente muy bajista (-3.03% en 20 ruedas, medida el 4/8/2026) -- señal de que "todavía le faltaba digerir la baja". Volvió a caer poco después.

### Hipótesis 1 (descartada): pendiente negativa, sin más

Testeada sin contexto (n=24.796, universo completo) y con gates+RS Score>60 (n=5.836): correlación prácticamente nula, y en varios cortes con **signo contrario** al esperado (pendiente más negativa → retorno futuro levemente *mejor*, no peor). También se probó la condición literal "precio ya por encima de la SMA50 pero la media todavía cayendo" (n=1.851-2.177 según ventana): el grupo con SMA50 bajando no rindió peor que el grupo con SMA50 confirmando (subiendo) -- rindió igual o mejor, con fracaso similar o menor. **Conclusión: pendiente negativa sola, en cualquier contexto probado, no predice nada.**

### Hipótesis 2 (confirmada): pendiente pronunciada, con buen RS Score

Se usó el valor real de AVGO el 4/8/2026 como umbral de referencia y se repitió el test **solo dentro de gates OK + RS Score>60** (contexto exacto de AVGO: "tenía buen score"):

| Ventana pendiente | Retorno mediana 20r — pronunciada (≤ umbral AVGO) | Retorno mediana 20r — resto | Fracaso≥5% — pronunciada | Fracaso≥5% — resto |
|---|---|---|---|---|
| 20 ruedas (umbral -3.03%) | **-0,56%** | +1,40% | **35,4%** | 25,6% |
| 30 ruedas (umbral -4,17%) | **-0,74%** | +1,42% | **36,3%** | 25,6% |

Validado con split por ticker (2 mitades aleatorias): misma dirección en ambos grupos (fracaso pronunciada siempre mayor que resto, 30-42% vs 25-26%), aunque la magnitud del gap varía entre mitades -- no es ruido de un corte afortunado.

**Sin el filtro de RS Score>60 no hay señal** -- es la misma lección repetida durante toda esta investigación (Contracción de Volatilidad, etc.): el contexto no es un detalle, es la señal.

### Hallazgo relacionado (no implementado)

Los deciles completos (sin cortar en el umbral de AVGO) muestran una relación en **U**: tanto la pendiente muy negativa (D1) como la muy positiva/vertical (D9-D10) tienen fracaso elevado -- D10 (pendiente extrema positiva) llegó a 41,8-42,5% de fracaso con mediana de retorno NEGATIVA, un efecto tan fuerte o más que el lado negativo. Es probablemente sobreextensión/parabólico -- un fenómeno distinto, parcialmente ya cubierto por 🎈 (que usa distancia a la SMA50 en ATRs, no pendiente). Queda pendiente si vale la pena testear específicamente.

### Implementación

- **Métrica nueva** (`actualizar_datos.py`): `SMA50 Slope Pct 20r` -- pendiente % de la SMA50 sobre 20 ruedas (normalizada, a diferencia del `SMA50 Slope` existente que es $ absoluto sobre 10 ruedas y no comparable entre tickers).
- **Penalización graduada** `_penalizacion_sma50_pendiente()`: 0 pts en pendiente≥-1% (sana), lineal hasta 8 pts en pendiente≤-6% (declive profundo) -- **solo si RS Score>60**. Campo exportado: `Pend SMA50 Pts`.
- **Frontend**: Warren Score v4.7 (`WB UPGRADE V33`, `WB_SCORE_VERSION_49`), flag 🪤 en `_penalizacionesV49`. Único cambio real de la versión -- todo lo demás copia verbatim de V48. Card "Penalizaciones" del detalle mobile actualizada (`WBM_PEN_LABEL`/`wbmPenaltyItems`) para reconocer 🪤 con su magnitud variable (igual que 🌊 Caso B).

## Churn Máximos en contexto alcista (20/8/2026) -- validado, NO implementado

Caso de origen: BKR, cerca de máximos con volumen elevado en velas de cierre débil, sin disparar 🐘 Churn Máximos.

### Umbral de volumen sin contexto -- descartado

Se testeó bajar el umbral de volumen de `churn_maximos()` (hoy 1.5x) a 1.0-1.4x, sin ningún filtro adicional, sobre el universo completo cerca de máximos (gate ≤4% del máximo de 20 ruedas). Resultado: **sin señal, e incluso invertida** en todos los umbrales probados (n=452-4477), confirmado con split por ticker (7/7 mitades en la misma dirección invertida). **No se recomienda bajar el umbral sin más.**

### Con contexto (Precio>EMA200 & RSI>60) -- señal real pero modesta

Repitiendo el mismo test pero solo dentro de tendencia alcista confirmada (Precio>EMA200 y RSI14>60), aparece una señal real, aunque modesta, a horizonte de 20 ruedas -- confirmada con split por ticker. A 10 ruedas no hay diferencia clara. Mismo patrón que el resto de esta investigación: el contexto no es un detalle, es la señal.

**Pendiente**: no se implementó -- señal validada pero débil, no se definió aún magnitud de penalización ni si vale la pena frente a la complejidad que agrega. Queda para retomar si se repiten casos como BKR.

## Caso B -- margen de progreso 1% (20/8/2026) -- IMPLEMENTADO

### Caso de origen

BKR: día 1 de Caso B el 14/8 (cierre $64,82). El 17/8 cerró en $64,90 (+0,12%) -- un progreso marginal, probablemente ruido -- pero como `ya_progreso` exigía superar `close_dia1` por **cualquier** margen, BKR quedó descalificado de Caso B para siempre a partir de ese único día, aunque después revirtiera y volviera a caer.

### Validación a escala

Se comparó, sobre el mismo universo/metodología ya validada de Caso B (resolución = ¿rompe el máximo previo `pico_high` dentro de una ventana de 40 ruedas desde el punto de evaluación?), el grupo de eventos "rescatados" por un margen de 1% (que bajo la regla original escapaban de Caso B por un progreso menor al 1%) contra el grupo que progresa de verdad (>1%):

- Rescatados por el margen (deberían seguir siendo Caso B): **41,2% de fracaso**.
- Progreso real (>1%, correctamente excluidos de Caso B): **22,8% de fracaso**.

Es decir, un progreso menor al 1% no distingue de un Caso B real -- confirma que es ruido, no una señal de fortaleza. Con el margen, el grupo Caso B crece de 108 a 142 casos y el fracaso total pasa de 50,9% a 48,6% (leve mejora, sigue siendo la señal más fuerte del sistema).

### Implementación

`REINTENTO_CASOB_MARGEN_PROGRESO = 0.01` en `actualizar_datos.py`. `ya_progreso` ahora exige `close > close_dia1*1.01` (antes: `close > close_dia1`, cualquier margen). Sin cambios en la fórmula de penalización graduada (`_penalizacion_casob_pts`, -15 a -25 según duración de la taza) ni en el resto de las condiciones de Caso B.

### Nota sobre BKR específicamente (no es un bug)

Con el fix, `ya_progreso` da correctamente `False` para BKR (el cierre marginal del 17/8 ya no cuenta como progreso). Pero al 20/8, BKR **todavía no dispara** Caso B Penalizado -- por la condición *separada* de `vol_sostenido` (RVOL10 promedio de los días sin progreso ≥1.0), que da 0,917: los 3 días entre el día 1 y hoy tuvieron volumen algo bajo (0,91 / 0,99 / 0,76), y aunque hoy mismo BKR cayó -2,6% con RVOL10=1,01 (justo el tipo de día que Caso B busca detectar), promediado con los 3 días previos no llega a 1,0. Es un caso límite genuino, no relacionado con este fix -- si el volumen se sostiene los próximos días el promedio subiría y probablemente sí dispare. Se decidió no tocar `vol_sostenido` en esta sesión (condición preexistente, no validada específicamente acá).

## Bono ER -- anulación por signo negativo + volumen sostenido (20/8/2026) -- IMPLEMENTADO

### Caso de origen

Auditando BKR completo (por qué no dispara ninguna penalización pese a la baja reciente) se encontró que además cargaba **Bono ER Pts = 9,79** (casi el máximo de 10) -- de un segundo "reintento" distinto al de Caso B, mismo ticker, pico de referencia en $69,92. El "día del máximo" fue el 14/8 (cierre $64,82); desde ahí el papel bajó *casi en línea recta* hasta $62,78 el 20/8. `_er_estandar_kaufman()` usa `cambio_neto = abs(close[-1]-close[0])` -- **sin signo** -- así que un descenso derecho puntúa exactamente igual que un avance derecho. De ahí el bono casi máximo pese a la baja.

### Primer intento (descartado): exigir signo positivo, sin más

Backtest inicial (n=21, universo 2 años): signo neto positivo → 92,3% éxito (rompe el máximo previo) vs. negativo → 37,5%. Parecía suficiente para exigir signo positivo sin más. **El usuario detectó el problema antes de implementar**: MU (14→21/4/2026, el caso ancla que originó todo el feature) *también* tiene signo neto negativo en esa ventana (cierre $465,59→$449,31) y aun así rompió con fuerza el 22/4. Exigir signo positivo solo habría anulado el bono del propio caso que valida el feature -- se descartó.

### Segundo intento (validado e implementado): signo negativo + volumen sostenido

La diferencia real entre MU y BKR es el **volumen durante la pausa, medido contra el volumen del propio día del máximo** (no contra el promedio de 10 ruedas):

- MU: volumen de la pausa = 64% del volumen del día del máximo (se secó) -- caso sano, consolidación de baja convicción antes de romper.
- BKR: volumen de la pausa = 87% del volumen del día del máximo (se sostuvo) -- posible toma de ganancias.

Ampliando el universo a 8 años (308 tickers, n=114 eventos "vivos" con ER≥piso), dentro del grupo de signo negativo:

| Corte (umbral 0,75) | n | Éxito | Retorno mediano 20r |
|---|---|---|---|
| Volumen sostenido (≥75% del día del máximo) | 9 | 33,3% | **-1,79%** |
| Volumen seco (<75%) | 29 | 34,5% | **+1,70%** |

Probado en el rango 0,65-0,80: el corte es estable (retorno mediano negativo del lado "sostenido" en casi todo el rango); en 0,85 la muestra baja a n=8 y dos outliers grandes (AMAT +35,7%, LRCX +31,8%) le dan vuelta la mediana -- se descartó ese umbral por ruidoso. MU (0,64) y BKR (0,87) clasifican del lado correcto en 0,65-0,80.

### Implementación

`REINTENTO_BONO_VOL_UMBRAL = 0.75` + función `_bono_anulado_por_volumen()`: anula el Bono ER (lo pone en 0) únicamente si el cierre al final de la ventana quedó igual o por debajo del cierre del día del máximo (signo neto ≤0) **y** el volumen promedio de la pausa fue ≥75% del volumen del día del máximo. Si el signo es positivo, sin cambios (el volumen no discrimina nada ahí, validado aparte). Cableado en las dos ramas de la función (bono "vivo" en crecimiento, y bono "congelado" el día que confirma la ruptura).

Validado contra los 2 casos reales: BKR (20/8) pasa de 9,79 a **0,0** pts; MU (20/4, 21/4, 22/4 -- incluyendo el día de la Bomba) se mantiene **exactamente igual** (9,84 / 6,24 / 6,24 + Bomba Hoy), sin ningún cambio.

### Exploración descartada: R² (rectitud de la corrección) como métrica alternativa

Después de implementar el fix de arriba, se probó si un R² de regresión lineal (cierre vs. tiempo, ventana FIJA de 10 ruedas terminando en el punto de evaluación -- no anclada a "día del máximo", para no diluirse con una rally previa como pasaba ampliando la ventana del ER) separaba mejor "pausa sana" de "deambular" que signo+volumen. Calculado a mano para los 2 casos ancla, la diferencia es dramática: **BKR R²=0,068** (zigzag puro) vs. **MU R²=0,575-0,841** según la ventana exacta (línea clara). Muy prometedor a primera vista.

Pero validado a escala (mismo universo 308 tickers/8 años, mismos 114 eventos "vivos" con ER≥piso): el R² de la ventana fija de 10 ruedas nunca baja de 0,435 en toda la muestra histórica -- **ningún evento se acerca al 0,068 de BKR**. El filtro previo (ER≥0,65 en la ventana angosta, ya usado para definir "candidato a bono") ya deja pasar casi exclusivamente casos con R² decente (correlación R²-ventana-fija vs. ER-ventana-angosta = 0,36). El "mismatch" que hace único a BKR (ER angosto alto pero R² ancho paupérrimo) es, aparentemente, raro -- no hay con qué calibrar un umbral general en esta muestra, y el propio caso BKR queda afuera de la validación por no tener aún 40 ruedas de resolución futura.

**Descartado por ahora** -- no se implementa. El R² es una buena explicación intuitiva de por qué BKR se ve raro en un gráfico, pero como regla nueva del sistema no tiene sustento a escala todavía. Si en el futuro aparecen más casos "tipo BKR" (ER angosto alto + R² ancho bajo), vale la pena rearmar esta validación con más muestra.

### ER del tramo de ACERCAMIENTO (zona_idx → día del máximo) -- IMPLEMENTADO (21/8/2026)

El R² de ventana fija fracasó porque la población ya viene pre-filtrada por el ER de la pausa (que empieza recién en "día del máximo"). La idea que sí funcionó: medir el ER del tramo ANTERIOR, desde que el precio reingresó a la banda del 10% del pico previo (`zona_idx`) hasta el "día del máximo" -- es decir, ¿el ACERCAMIENTO al nuevo máximo fue una rally derecha, o ya venía zigzagueando desde antes de que se disparara el día del máximo?

Calculado a mano en los 2 casos ancla: **BKR (6/8→14/8) ER=0,33** (zigzag ya desde el reingreso a la zona) vs. **MU (1/4→14/4) ER=0,95** (rally derecha y rápida hacia el nuevo máximo). A diferencia de ampliar el ER de la *pausa* hasta `zona_idx` (que se probó primero y se descartó por diluir a MU con la rally mezclada con la corrección posterior), este corte separa el tramo de acercamiento del tramo de pausa, así que no se diluye nada -- son ventanas distintas.

**Validado a escala** (308 tickers, 8 años, mismos 114 eventos "vivos"): solo 52/114 tienen un acercamiento medible (en 62/114, `zona_idx == dia_max_idx` -- reingreso instantáneo a la zona ya con el "día del máximo" cumplido, sin tramo previo que medir; ese grupo rinde igual o mejor que un acercamiento derecho -- 67,7% éxito, +1,71% ret20 -- así que NO se penaliza). Dentro de los 52 con dato: ER acercamiento<0,5 da 50,0% éxito y retorno mediano **-0,42%** (n=20) vs. 66,0% éxito y **+2,24%** del resto (n=94) -- confirmado en split por ticker (ambas mitades, misma dirección, aunque con muestras chicas: n=8 y n=12).

**Casi no se superpone con el filtro de volumen** (fix anterior, mismo día): de 20 casos "zigzag" y 9 casos "signo negativo+volumen sostenido", solo 2 están en ambos grupos -- capturan modos de falla distintos. Combinados con OR (se anula si cualquiera de los dos dispara), el grupo "malo" crece a n=27 con retorno mediano **-0,07%** vs. n=87 con **+1,97%** del resto -- la separación más limpia de las tres variantes probadas, confirmada en split por ticker.

**Implementación**: `REINTENTO_ACERCAMIENTO_ER_UMBRAL = 0.5` + función `_bono_anulado_por_acercamiento_choppy()` -- anula el bono si `zona_idx < dia_max_idx` (hay tramo de acercamiento) y su ER < 0,5. Se agrega con **OR** sobre `_bono_anulado_por_volumen()` (cualquiera de las dos anula, no hace falta que se cumplan las dos). Verificado: BKR sigue en 0 (ahora por las dos razones a la vez); MU sin cambios (9,84/6,24/6,24+Bomba).

## Warren Score v4.8 -- RSI Pilar C: 0 pts si viene de sobrecompra sin confirmar (22/8/2026) -- IMPLEMENTADO

### Caso de origen

BABA, 21/8/2026: RSI picaba cerca de sobrecompra (71,7 el 10/8), corrigió, se recuperó casi hasta los máximos (RSI 63,5 el 20/8) y se derrumbó **-8,37% en una sola rueda** (volumen 3x lo normal, earnings), aterrizando el RSI en 46,2 -- justo en la franja 45-60 que da puntaje PLENO al componente de RSI en Pilar C (desde el ajuste "RSI 14 más conservador", commit 46d585b) -- el mismo día del golpe, sin ningún tiempo para mostrar reacción. Preocupación del usuario: un papel sobrecomprado que corrige fuerte puede estar recién arrancando la baja, no "sano" -- el RSI solo no distingue eso.

### Primer intento (descartado): esperar 1 día verde

Evento: RSI hoy en [45,60], RSI máximo de los últimos 15 días ≥70, caída de precio desde ese máximo ≥8%. Comparando el día de ENTRADA a la zona rojo (sin reacción) vs. verde (con reacción), sobre 5.217 eventos (308 tickers, 8 años): el grupo rojo rindió **igual o mejor** que el verde (ret10 +0,14% vs. -0,31%, fracaso 28,4% vs. 28,2%) -- va al revés de la hipótesis, probablemente por reversión a la media de corto plazo tras una caída fuerte de un día. Se probó también con la lógica correcta de "esperar cuantos días haga falta hasta la primera vela verde" (n=5.183): **el 99,96% confirma en promedio 1 día** -- un umbral tan débil que no filtra nada (regla actual ret10 -0,04% vs. regla propuesta -0,22%, prácticamente igual o peor). Se probó además "1 día verde + le gana a SPY ese mismo día" (fuerza relativa): igual de débil, 99,8% confirma en ~1 día.

### Segundo intento (validado e implementado): 2 días verdes seguidos

Mismo evento base, pero exigiendo **2 días consecutivos** con cierre > cierre del día anterior en algún momento dentro de los 10 días desde que entró a la zona. Resultado, sobre 5.183 eventos:

| | n | Retorno mediano 10r / 20r | Fracaso 10r / 20r |
|---|---|---|---|
| Nunca logran 2 verdes seguidos en 10r | 634 (12,2%) | **-9,46% / -8,04%** | **68,5% / 61,4%** |
| Sí logran 2 verdes seguidos | 4.549 (87,8%) | -0,40% / +0,17% | 29,1% / 35,0% |

Confirmado en split por ticker: Mitad A (n=313, 11,5%) -10,23%/73,5% fracaso vs. resto -0,13%/28,8%; Mitad B (n=321, 13,1%) -8,10%/63,6% vs. resto -0,64%/29,5% -- misma dirección, señal muy fuerte, la más contundente de toda esta racha de investigaciones (más que Caso B, más que el fix del Bono ER).

### Implementación

**Backend** (`actualizar_datos.py`): nueva función `_rsi_sobrecompra_sin_confirmar(hist)` -- reconstruye el "día 0" del episodio (el primer día, mirando hacia atrás hasta 10 ruedas, en que ya se cumplía "RSI hoy en 45-60, viniendo de RSI≥70 en los últimos 15 días con caída de precio ≥8%"), y devuelve `True` si desde ese día hasta hoy TODAVÍA no hubo 2 días verdes seguidos. Constantes: `RSI_CONFIRMACION_RSI_TECHO=70.0`, `RSI_CONFIRMACION_CAIDA_MIN=0.08`, `RSI_CONFIRMACION_LOOKBACK_PICO=15`, `RSI_CONFIRMACION_VENTANA_ESPERA=10`. Exportado como `"RSI Sobrecompra Sin Confirmar"` en `calcular_kpis()`.

**Frontend** (`index.html`, Warren Score v4.8, `WB UPGRADE V34`, `WB_SCORE_VERSION_50`): `_pilarCv50` da `ptsRSI=0` (en vez de la triangular normal, hasta 8,25 pts) si el campo viene en `True`. Insertado ANTES del bloque mobile V32 (mismo orden que V33/V49, requisito de la arquitectura: el wrapper de `renderWarrenScore` del mobile tiene que ser el último en redefinir `window.renderWarrenScore`). Todo lo demás (gates, Pilar A, B, D, restas, penalizaciones) copia verbatim de V33/V49. Verificado con harness Node: diferencia exacta de 8,25 pts en Pilar C cuando el flag está activo (RSI=52, con y sin el flag); sin efecto cuando el RSI está fuera de la franja 45-60 (ej. 75).
