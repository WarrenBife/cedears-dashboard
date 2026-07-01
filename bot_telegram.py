#!/usr/bin/env python3
"""
Warren Bife Bot - Telegram (servicio continuo para Render)
"""

import os
import sys
sys.stdout.reconfigure(line_buffering=True)  # logs en tiempo real en Render
import time
import threading
from datetime import datetime
from http.server import HTTPServer, BaseHTTPRequestHandler
import requests
import pytz

# ── CONFIGURACIÓN ──────────────────────────────────────────────
TOKEN         = os.environ.get('TELEGRAM_TOKEN', '')
CHAT_ID       = os.environ.get('CHAT_ID', '')
DATOS_URL     = 'https://raw.githubusercontent.com/WarrenBife/cedears-dashboard/main/datos.json'
DASHBOARD_URL = 'https://warrenbife.github.io/cedears-dashboard'
TG_API        = f'https://api.telegram.org/bot{TOKEN}'
MAX_MSG       = 4096
TZ_ARG        = pytz.timezone('America/Argentina/Buenos_Aires')
PORT          = int(os.environ.get('PORT', 10000))
ALERT_HOUR    = 18
ALERT_MINUTE  = 0

# ── DATOS ──────────────────────────────────────────────────────
def cargar_datos():
    r = requests.get(DATOS_URL, timeout=30)
    r.raise_for_status()
    return r.json()

# ── WARREN SCORE v2 — Ranking pre-breakout ─────────────────────
def calc_warren(d):
    def lineal(x, x0, x1, y0, y1):
        if x is None: return 0
        t = max(0.0, min(1.0, (x - x0) / (x1 - x0))) if x0 != x1 else 1.0
        return y0 + t * (y1 - y0)

    def tri(x, izq, pi, pd, der):
        if x is None or x <= izq or x >= der: return 0
        if pi <= x <= pd: return 1
        return (x - izq) / (pi - izq) if x < pi else (der - x) / (der - pd)

    def b(key):
        v = d.get(key)
        if v is None: return False
        if isinstance(v, bool): return v
        if isinstance(v, (int, float)): return v != 0
        return str(v).strip().lower() in ('true','si','sí','yes','1','ok','✓','verdadero')

    def g(key, default=None):
        return d.get(key, default)

    # Gates Stage 2
    precio, ema200, slope = g('Precio'), g('EMA200'), g('EMA200 Slope')
    dist_min, dist_max, sma50 = g('Dist Mín52W %'), g('Dist Máx52W %'), g('SMA50')
    fallas = sum([
        precio is None or ema200 is None or precio <= ema200,
        slope is None or slope <= 0,
        dist_min is None or dist_min < 30,
        dist_max is None or dist_max < -25,
        sma50 is not None and precio is not None and precio < sma50 * 0.98,
    ])

    # Pilar A: Tendencia (25 pts)
    dx = g('Dist Máx52W %')
    pa  = (10 if dx is not None and dx > -5 else lineal(dx, -25, -5, 0, 10))
    pa += tri(g('Dist SMA50 %'), -3, 0, 8, 25) * 8
    pa += tri(g('Dist EMA200 %'), 0, 10, 50, 70) * 4
    pa += lineal(g('EMA200 Slope'), 0, 0.15, 0, 3)
    pa  = min(pa, 25)

    # Pilar B: Fuerza Relativa (30 pts)
    rs  = g('RS Score')
    pb  = lineal(rs, 0, 100, 0, 15)
    if rs is not None:
        if g('RS Ayer') is not None and rs > g('RS Ayer'):        pb += 2.5
        if g('RS Semana ant.') is not None and rs > g('RS Semana ant.'): pb += 2.5
        if g('RS Mes ant.') is not None and rs > g('RS Mes ant.'): pb += 3.0
    pb += 4 if b('FR > SMA50') else 0
    pb += lineal(g('Vs Sector %'), 0, 10, 0, 3)
    pb  = min(pb, 30)

    # Pilar C: Contracción (30 pts)
    pc  = lineal(g('Vol Relativa'), 1.2, 0.6, 0, 8)
    pc += tri(g('Vol 5d/40d'), 0.3, 0.5, 0.8, 1.3) * 7
    vp, vn = g('Vol días + 10s'), g('Vol días - 10s')
    if vp is not None and vn is not None:
        ratio = 3.0 if vn <= 0 and vp > 0 else (vp / vn if vn > 0 else None)
        if ratio is not None:
            if ratio >= 1.5:   pc += 10
            elif ratio >= 1.0: pc += lineal(ratio, 1.0, 1.5, 5, 10)
            elif ratio >= 0.8: pc += lineal(ratio, 0.8, 1.0, 0, 5)
    pc += tri(g('RSI 14'), 40, 55, 65, 78) * 5
    pc  = min(pc, 30)

    # Pilar D: Gatillo (15 pts)
    pd_ = 0
    if b('VCP Detected'):
        pv = min(lineal(g('VCP Score'), 0, 100, 0, 6) + (1 if b('VCP Vol Decreasing') else 0), 7)
        pd_ += pv
        dp = g('VCP Dist Pivot %')
        if dp is not None:
            pd_ += 5 if abs(dp) <= 3 else lineal(abs(dp), 10, 3, 0, 5)
    if b('Breakout Fresh'):
        days, vrat = g('Breakout Days Ago') or 99, g('Breakout Vol Ratio') or 0
        if days <= 3 and (vrat >= 1.5 or b('Breakout Vol OK')): pd_ += 3
        elif days <= 3: pd_ += 1.5
    pd_ = min(pd_, 15)

    # Penalizaciones
    pen = 0
    if (g('Dist SMA50 %') or 0) > 25 or (g('RSI 14') or 0) > 80: pen -= 10
    vp2, vn2 = g('Vol días + 10s'), g('Vol días - 10s')
    r2 = (vp2 / vn2) if (vp2 and vn2 and vn2 > 0) else None
    if (g('Días - 10s') or 0) >= 7 and r2 is not None and r2 < 0.8: pen -= 15
    if (g('Var Día %') or 0) < -3 and (g('Vol Inusual %') or 0) > 50: pen -= 8

    score = max(0.0, min(100.0, pa + pb + pc + pd_ + pen))
    if fallas > 0:
        score = min(score, 40.0)
    return round(score, 1)

# ── HELPERS ────────────────────────────────────────────────────
def barra(score, largo=10):
    filled = round(score / 100 * largo)
    return '█' * filled + '░' * (largo - filled)

def pct(v, dec=1):
    if v is None:
        return '—'
    return f'{"+" if v >= 0 else ""}{v:.{dec}f}%'

def delta_rs(d):
    rs, ayer = d.get('RS Score'), d.get('RS Ayer')
    if rs is None or ayer is None:
        return ''
    diff = rs - ayer
    return f'{"▲" if diff >= 0 else "▼"}{abs(diff):.1f}'

# ── TELEGRAM ───────────────────────────────────────────────────
def enviar(texto, chat_id=None):
    cid = chat_id or CHAT_ID
    for i in range(0, len(texto), MAX_MSG):
        try:
            requests.post(f'{TG_API}/sendMessage', json={
                'chat_id': cid,
                'text': texto[i:i + MAX_MSG],
                'parse_mode': 'HTML',
                'disable_web_page_preview': True
            }, timeout=15)
        except Exception as e:
            print(f'Error enviando mensaje: {e}')

# ══════════════════════════════════════════════════════════════
# ALERTA DIARIA
# ══════════════════════════════════════════════════════════════
def modo_alerta():
    datos = cargar_datos()
    for d in datos:
        d['_ws'] = calc_warren(d)

    fecha = datetime.now(TZ_ARG).strftime('%d/%m/%Y %H:%M')

    msg  = f'🤖 <b>Warren Bife Bot</b> — {fecha} ARG\n'
    msg += f'📊 <i>{len(datos)} tickers analizados</i>\n'
    msg += '━' * 30 + '\n\n'

    # Mayor aumento RS
    con_delta = [d for d in datos if d.get('RS Score') is not None and d.get('RS Ayer') is not None]
    top_delta = sorted(con_delta, key=lambda d: d['RS Score'] - d['RS Ayer'], reverse=True)
    top_delta = [d for d in top_delta[:5] if d['RS Score'] - d['RS Ayer'] > 0]
    if top_delta:
        msg += '🚀 <b>MAYOR AUMENTO RS (última rueda)</b>\n'
        for d in top_delta:
            diff = d['RS Score'] - d['RS Ayer']
            msg += f"  <code>{d['Ticker']:<6}</code> RS <b>{d['RS Score']:.0f}</b>  (+{diff:.1f})  WS {d['_ws']}\n"
        msg += '\n'

    # Top Warren Score
    top_ws = sorted([d for d in datos if d['_ws'] > 0], key=lambda d: d['_ws'], reverse=True)[:5]
    if top_ws:
        msg += '🏆 <b>TOP 5 WARREN SCORE</b>\n'
        for d in top_ws:
            msg += f"  <code>{d['Ticker']:<6}</code> {d['_ws']:>3}  {barra(d['_ws'])}  RS {d.get('RS Score', 0):.0f}  {delta_rs(d)}\n"
        msg += '\n'

    # Volumen inusual
    vol = sorted(
        [d for d in datos if d.get('Vol Inusual %') is not None and d['Vol Inusual %'] > 50],
        key=lambda d: d['Vol Inusual %'], reverse=True
    )
    if vol:
        msg += f'📈 <b>VOLUMEN INUSUAL (>50%) — {len(vol)} tickers</b>\n'
        for d in vol[:10]:
            msg += f"  <code>{d['Ticker']:<6}</code> +{d['Vol Inusual %']:.0f}%  RS {d.get('RS Score', 0):.0f}\n"
        msg += '\n'

    # RSI sobrevendido
    sobrev = sorted(
        [d for d in datos if d.get('RSI 14') is not None and d['RSI 14'] <= 30],
        key=lambda d: d['RSI 14']
    )
    if sobrev:
        sobrev_top = sorted(sobrev, key=lambda d: d.get('Market Cap USD') or 0, reverse=True)[:5]
        msg += f'📉 <b>RSI SOBREVENDIDO (≤30) — top 5 por MCap</b>\n'
        for d in sobrev_top:
            msg += f"  <code>{d['Ticker']:<6}</code> RSI {d['RSI 14']:.1f}  RS {d.get('RS Score', 0):.0f}  Mín52W {pct(d.get('Dist Mín52W %'))}\n"
        msg += '\n'

    # RSI sobrecomprado
    sobrec = sorted(
        [d for d in datos if d.get('RSI 14') is not None and d['RSI 14'] >= 70],
        key=lambda d: d['RSI 14'], reverse=True
    )
    if sobrec:
        sobrec_top = sorted(sobrec, key=lambda d: d.get('Market Cap USD') or 0, reverse=True)[:5]
        msg += f'🔥 <b>RSI SOBRECOMPRADO (≥70) — top 5 por MCap</b>\n'
        for d in sobrec_top:
            msg += f"  <code>{d['Ticker']:<6}</code> RSI {d['RSI 14']:.1f}  RS {d.get('RS Score', 0):.0f}  Máx52W {pct(d.get('Dist Máx52W %'))}\n"
        msg += '\n'

    msg += '━' * 30 + '\n'
    msg += f'📊 <a href="{DASHBOARD_URL}">Abrir Dashboard</a>\n'
    msg += '💬 /top · /warren · /ticker · /scanner · /vol · /help'

    enviar(msg)
    print(f'✅ Alerta enviada — {fecha}')

# ══════════════════════════════════════════════════════════════
# COMANDOS
# ══════════════════════════════════════════════════════════════
def procesar_comando(cmd, partes, datos):
    if cmd == '/top':
        n   = int(partes[1]) if len(partes) > 1 and partes[1].isdigit() else 5
        top = sorted([d for d in datos if d.get('RS Score') is not None],
                     key=lambda d: d['RS Score'], reverse=True)[:n]
        resp = f'🏅 <b>TOP {n} RS SCORE</b>\n'
        for i, d in enumerate(top, 1):
            resp += f"{i}. <code>{d['Ticker']:<6}</code> RS <b>{d['RS Score']:.0f}</b>  WS {d['_ws']}  RSI {d.get('RSI 14', 0):.0f}\n"
        return resp

    elif cmd == '/warren':
        n   = int(partes[1]) if len(partes) > 1 and partes[1].isdigit() else 5
        top = sorted([d for d in datos if d['_ws'] > 0],
                     key=lambda d: d['_ws'], reverse=True)[:n]
        resp = f'🏆 <b>TOP {n} WARREN SCORE</b>\n'
        for i, d in enumerate(top, 1):
            resp += f"{i}. <code>{d['Ticker']:<6}</code> {d['_ws']:>3}  {barra(d['_ws'], 8)}  RS {d.get('RS Score', 0):.0f}\n"
        return resp

    elif cmd == '/ticker':
        if len(partes) < 2:
            return '❌ Uso: /ticker AAPL'
        sym = partes[1].upper()
        d   = next((x for x in datos if x['Ticker'] == sym), None)
        if not d:
            return f'❌ Ticker <b>{sym}</b> no encontrado'
        ws = d['_ws']
        resp  = f'📊 <b>{d["Ticker"]}</b> — {d.get("Sector", "—")}\n'
        resp += '━' * 22 + '\n'
        resp += f'💰 Precio:    ${d.get("Precio", 0):.2f}  ({pct(d.get("Var Día %"))})\n'
        resp += f'⚡ RS Score:  {d.get("RS Score", 0):.1f}  (ayer {d.get("RS Ayer", 0):.1f}  sem {d.get("RS Semana ant.", 0):.1f}  mes {d.get("RS Mes ant.", 0):.1f})\n'
        resp += f'🏆 Warren:    {ws}/100  {barra(ws, 8)}\n'
        resp += f'📈 RSI 14:    {d.get("RSI 14", 0):.1f}\n'
        resp += f'📊 EMA200:    {pct(d.get("Dist EMA200 %"))}\n'
        resp += f'📊 SMA50:     {pct(d.get("Dist SMA50 %"))}\n'
        resp += f'🔝 Máx 52W:   {pct(d.get("Dist Máx52W %"))}\n'
        resp += f'🔻 Mín 52W:   {pct(d.get("Dist Mín52W %"))}\n'
        resp += f'📦 Vol Rel:   {d.get("Vol Relativa", 0):.2f}x\n'
        resp += f'💥 Vol Inus:  {pct(d.get("Vol Inusual %"))}\n'
        resp += f'🏢 MCap:      {d.get("Market Cap Cat", "—")}\n'
        resp += f'🔖 Tipo:      {d.get("Tipo", "—")}  |  {d.get("Grupo", "—")}\n'
        return resp

    elif cmd == '/scanner':
        candidatos = []
        for d in datos:
            criterios = sum([
                bool(d.get('RS Score', 0) > 70),
                bool(d.get('Dist EMA200 %') is not None and d['Dist EMA200 %'] > 0),
                bool(d.get('Dist SMA50 %') is not None and d['Dist SMA50 %'] > 0),
                bool(d.get('Vol Relativa') is not None and d['Vol Relativa'] < 0.8),
            ])
            if criterios >= 3:
                candidatos.append((d, criterios))
        candidatos.sort(key=lambda x: (-x[1], -(x[0].get('RS Score') or 0)))
        resp = f'🔍 <b>SCANNER — {len(candidatos)} candidatos (3+ criterios)</b>\n'
        for d, c in candidatos[:15]:
            flags  = '✅' if d.get('RS Score', 0) > 70 else '❌'
            flags += '✅' if d.get('Dist EMA200 %', -999) > 0 else '❌'
            flags += '✅' if d.get('Dist SMA50 %', -999) > 0 else '❌'
            flags += '✅' if d.get('Vol Relativa') is not None and d['Vol Relativa'] < 0.8 else '❌'
            resp += f"<code>{d['Ticker']:<6}</code> RS {d.get('RS Score', 0):.0f}  {flags}  WS {d['_ws']}\n"
        return resp

    elif cmd == '/vol':
        vol = sorted(
            [d for d in datos if d.get('Vol Inusual %') is not None and d['Vol Inusual %'] > 30],
            key=lambda d: d['Vol Inusual %'], reverse=True
        )
        resp = f'📈 <b>VOLUMEN INUSUAL (>30%) — {len(vol)} tickers</b>\n'
        for d in vol[:15]:
            resp += f"<code>{d['Ticker']:<6}</code> +{d['Vol Inusual %']:.0f}%  RS {d.get('RS Score', 0):.0f}  WS {d['_ws']}\n"
        return resp

    elif cmd == '/help':
        return (
            f'🤖 <b>Warren Bife Bot — Guía de comandos</b>\n'
            f'━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n'

            f'📊 <b>/top [N]</b>\n'
            f'Top N tickers por RS Score (fuerza relativa vs el mercado).\n'
            f'Muestra: ticker, RS Score, Warren Score, RSI.\n'
            f'Ejemplo: <code>/top 10</code> → top 10. Sin número: top 5.\n\n'

            f'🏆 <b>/warren [N]</b>\n'
            f'Top N tickers por Warren Score (score compuesto 0-100).\n'
            f'Fórmula: RS Score + tendencia + posición vs medias + volumen bajo.\n'
            f'Solo entran tickers con RS &gt; 60. Ideal para encontrar candidatos de calidad.\n'
            f'Ejemplo: <code>/warren 8</code> → top 8. Sin número: top 5.\n\n'

            f'🔎 <b>/ticker SYMBOL</b>\n'
            f'Ficha completa de un ticker. Muestra:\n'
            f'precio, variación del día, RS Score (hoy/ayer/semana/mes),\n'
            f'Warren Score, RSI 14, distancia a EMA200 y SMA50,\n'
            f'distancia a máx/mín 52 semanas, volumen relativo e inusual, MCap.\n'
            f'Ejemplo: <code>/ticker AAPL</code> o <code>/ticker GGAL</code>\n\n'

            f'🔍 <b>/scanner</b>\n'
            f'Lista tickers que cumplen 3 o más de estos 4 criterios:\n'
            f'✅ RS Score &gt; 70  ✅ Precio sobre EMA200  ✅ Precio sobre SMA50  ✅ Vol relativo &lt; 0.8x\n'
            f'Muestra hasta 15 candidatos ordenados por criterios y RS Score.\n\n'

            f'📈 <b>/vol</b>\n'
            f'Tickers con volumen inusual mayor al 30% sobre su promedio.\n'
            f'Muestra: ticker, % de desvío, RS Score y Warren Score.\n'
            f'Útil para detectar movimientos con respaldo de volumen.\n\n'

            f'━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'
            f'📊 <a href="{DASHBOARD_URL}">Abrir Dashboard completo</a>'
        )

    return None

# ══════════════════════════════════════════════════════════════
# LOOP DE POLLING (tiempo real)
# ══════════════════════════════════════════════════════════════
def polling_loop():
    offset = None
    print('🤖 Bot iniciado — escuchando mensajes en tiempo real...')
    while True:
        try:
            params = {'timeout': 30, 'allowed_updates': ['message']}
            if offset:
                params['offset'] = offset
            r = requests.get(f'{TG_API}/getUpdates', params=params, timeout=40)
            updates = r.json().get('result', [])

            if updates:
                datos = None
                for upd in updates:
                    offset = upd['update_id'] + 1
                    msg    = upd.get('message', {})
                    texto  = msg.get('text', '').strip()
                    cid    = str(msg.get('chat', {}).get('id', ''))

                    if not texto or not texto.startswith('/'):
                        continue

                    if datos is None:
                        datos = cargar_datos()
                        for d in datos:
                            d['_ws'] = calc_warren(d)

                    partes = texto.split()
                    cmd    = partes[0].lower().split('@')[0]
                    resp   = procesar_comando(cmd, partes, datos)
                    if resp:
                        enviar(resp, cid)
                        print(f'✅ {cmd} → chat {cid}')

        except Exception as e:
            print(f'Error en polling: {e}')
            time.sleep(5)

# ══════════════════════════════════════════════════════════════
# SCHEDULER DE ALERTA DIARIA (18:00 ARG, lun-vie)
# ══════════════════════════════════════════════════════════════
def alert_scheduler():
    enviada_hoy = None
    print(f'📅 Scheduler iniciado — alerta diaria a las {ALERT_HOUR:02d}:{ALERT_MINUTE:02d} ARG (lun-vie)')
    while True:
        try:
            now = datetime.now(TZ_ARG)
            hoy = now.date()
            dow = now.weekday()  # 0=lun … 4=vie
            if (dow < 5
                    and now.hour == ALERT_HOUR
                    and now.minute < 5
                    and enviada_hoy != hoy):
                print(f'📨 Enviando alerta diaria — {now.strftime("%d/%m/%Y %H:%M")}')
                modo_alerta()
                enviada_hoy = hoy
        except Exception as e:
            print(f'Error en scheduler: {e}')
        time.sleep(30)

# ══════════════════════════════════════════════════════════════
# SERVIDOR HTTP (mantiene el servicio activo en Render)
# ══════════════════════════════════════════════════════════════
class HealthHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'Warren Bife Bot OK')
    def log_message(self, *args):
        pass  # silenciar logs HTTP

# ── MAIN ───────────────────────────────────────────────────────
if __name__ == '__main__':
    if not TOKEN:
        print('❌ TELEGRAM_TOKEN no configurado')
        sys.exit(1)
    if not CHAT_ID:
        print('❌ CHAT_ID no configurado')
        sys.exit(1)

    threading.Thread(target=alert_scheduler, daemon=True).start()
    threading.Thread(target=polling_loop,    daemon=True).start()

    print(f'🌐 Servidor HTTP en puerto {PORT}')
    HTTPServer(('0.0.0.0', PORT), HealthHandler).serve_forever()
