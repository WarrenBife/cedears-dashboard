#!/usr/bin/env python3
"""
Warren Bife Bot - Telegram
Uso: python bot_telegram.py --alerta | --comandos
"""

import json
import os
import sys
import requests
from datetime import datetime
import pytz

# ── CONFIGURACIÓN ──────────────────────────────────────────────
TOKEN         = os.environ.get('TELEGRAM_TOKEN', '')
CHAT_ID       = os.environ.get('CHAT_ID', '')
DATOS_URL     = 'https://raw.githubusercontent.com/WarrenBife/cedears-dashboard/main/datos.json'
DASHBOARD_URL = 'https://warrenbife.github.io/cedears-dashboard'
OFFSET_FILE   = 'bot_offset.txt'
TG_API        = f'https://api.telegram.org/bot{TOKEN}'
MAX_MSG       = 4096

# ── DATOS ──────────────────────────────────────────────────────
def cargar_datos():
    r = requests.get(DATOS_URL, timeout=30)
    r.raise_for_status()
    return r.json()

# ── WARREN SCORE ───────────────────────────────────────────────
def calc_warren(d):
    rs = d.get('RS Score')
    if rs is None or rs <= 60:
        return 0
    score = min(40, rs - 60)
    if d.get('Dist EMA200 %') is not None and d['Dist EMA200 %'] > 0:
        score += 20
    if d.get('Dist SMA50 %') is not None and d['Dist SMA50 %'] > 0:
        score += 10
    if d.get('Dist Mín52W %') is not None and d['Dist Mín52W %'] >= 25:
        score += 10
    vol = d.get('Vol Relativa')
    if vol is not None and vol < 0.8:
        score += max(0, (0.8 - vol) / 0.8 * 20)
    return min(100, round(score))

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
        requests.post(f'{TG_API}/sendMessage', json={
            'chat_id': cid,
            'text': texto[i:i + MAX_MSG],
            'parse_mode': 'HTML',
            'disable_web_page_preview': True
        }, timeout=15)

def get_updates(offset=None):
    params = {'timeout': 0, 'allowed_updates': ['message']}
    if offset:
        params['offset'] = offset
    try:
        r = requests.get(f'{TG_API}/getUpdates', params=params, timeout=15)
        return r.json().get('result', [])
    except Exception as e:
        print(f'Error getUpdates: {e}')
        return []

def load_offset():
    try:
        with open(OFFSET_FILE) as f:
            return int(f.read().strip())
    except:
        return None

def save_offset(offset):
    with open(OFFSET_FILE, 'w') as f:
        f.write(str(offset))

# ══════════════════════════════════════════════════════════════
# MODO 1 — ALERTA DIARIA
# ══════════════════════════════════════════════════════════════
def modo_alerta():
    datos = cargar_datos()
    for d in datos:
        d['_ws'] = calc_warren(d)

    tz_arg = pytz.timezone('America/Argentina/Buenos_Aires')
    fecha  = datetime.now(tz_arg).strftime('%d/%m/%Y %H:%M')

    msg = f'🤖 <b>Warren Bife Bot</b> — {fecha} ARG\n'
    msg += f'📊 <i>{len(datos)} tickers analizados</i>\n'
    msg += '━' * 30 + '\n\n'

    # ── Mayor aumento RS (vs ayer)
    con_delta = [d for d in datos if d.get('RS Score') is not None and d.get('RS Ayer') is not None]
    top_delta = sorted(con_delta, key=lambda d: d['RS Score'] - d['RS Ayer'], reverse=True)
    top_delta = [d for d in top_delta[:5] if d['RS Score'] - d['RS Ayer'] > 0]
    if top_delta:
        msg += '🚀 <b>MAYOR AUMENTO RS (última rueda)</b>\n'
        for d in top_delta:
            diff = d['RS Score'] - d['RS Ayer']
            msg += f"  <code>{d['Ticker']:<6}</code> RS <b>{d['RS Score']:.0f}</b>  (+{diff:.1f})  WS {d['_ws']}\n"
        msg += '\n'

    # ── Top Warren Score
    top_ws = sorted([d for d in datos if d['_ws'] > 0], key=lambda d: d['_ws'], reverse=True)[:5]
    if top_ws:
        msg += '🏆 <b>TOP 5 WARREN SCORE</b>\n'
        for d in top_ws:
            msg += f"  <code>{d['Ticker']:<6}</code> {d['_ws']:>3}  {barra(d['_ws'])}  RS {d.get('RS Score', 0):.0f}  {delta_rs(d)}\n"
        msg += '\n'

    # ── Volumen inusual
    vol = sorted(
        [d for d in datos if d.get('Vol Inusual %') is not None and d['Vol Inusual %'] > 50],
        key=lambda d: d['Vol Inusual %'], reverse=True
    )
    if vol:
        msg += f'📈 <b>VOLUMEN INUSUAL (>50%) — {len(vol)} tickers</b>\n'
        for d in vol[:10]:
            msg += f"  <code>{d['Ticker']:<6}</code> +{d['Vol Inusual %']:.0f}%  RS {d.get('RS Score', 0):.0f}\n"
        msg += '\n'

    # ── RSI sobrevendido
    sobrev = sorted(
        [d for d in datos if d.get('RSI 14') is not None and d['RSI 14'] <= 30],
        key=lambda d: d['RSI 14']
    )
    if sobrev:
        msg += '📉 <b>RSI SOBREVENDIDO (≤30)</b>\n'
        for d in sobrev:
            msg += f"  <code>{d['Ticker']:<6}</code> RSI {d['RSI 14']:.1f}  RS {d.get('RS Score', 0):.0f}  Mín52W {pct(d.get('Dist Mín52W %'))}\n"
        msg += '\n'

    # ── RSI sobrecomprado
    sobrec = sorted(
        [d for d in datos if d.get('RSI 14') is not None and d['RSI 14'] >= 70],
        key=lambda d: d['RSI 14'], reverse=True
    )
    if sobrec:
        msg += f'🔥 <b>RSI SOBRECOMPRADO (≥70) — {len(sobrec)} tickers</b>\n'
        for d in sobrec[:10]:
            msg += f"  <code>{d['Ticker']:<6}</code> RSI {d['RSI 14']:.1f}  RS {d.get('RS Score', 0):.0f}  Máx52W {pct(d.get('Dist Máx52W %'))}\n"
        msg += '\n'

    # ── Footer
    msg += '━' * 30 + '\n'
    msg += f'📊 <a href="{DASHBOARD_URL}">Abrir Dashboard</a>\n'
    msg += '💬 /top · /warren · /ticker · /scanner · /vol · /help'

    enviar(msg)
    print(f'✅ Alerta enviada — {fecha}')


# ══════════════════════════════════════════════════════════════
# MODO 2 — COMANDOS INTERACTIVOS
# ══════════════════════════════════════════════════════════════
def modo_comandos():
    offset  = load_offset()
    updates = get_updates(offset)

    if not updates:
        print('Sin nuevos mensajes')
        return

    datos = None  # carga lazy

    for upd in updates:
        offset = upd['update_id'] + 1
        msg    = upd.get('message', {})
        texto  = msg.get('text', '').strip()
        cid    = str(msg.get('chat', {}).get('id', ''))

        if not texto or not texto.startswith('/'):
            continue

        # Carga lazy de datos
        if datos is None:
            datos = cargar_datos()
            for d in datos:
                d['_ws'] = calc_warren(d)

        partes = texto.split()
        cmd    = partes[0].lower().split('@')[0]  # /top@BotName → /top

        resp = procesar_comando(cmd, partes, datos)
        if resp:
            enviar(resp, cid)
            print(f'✅ {cmd} → chat {cid}')

    save_offset(offset)
    print(f'Offset guardado: {offset}')


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
            f'🤖 <b>Warren Bife Bot — Comandos</b>\n\n'
            f'/top [N]       → Top N por RS Score\n'
            f'/warren [N]    → Top N por Warren Score\n'
            f'/ticker AAPL   → Detalle completo de un ticker\n'
            f'/scanner       → Candidatos calidad (3+ de 4 criterios)\n'
            f'/vol           → Volumen inusual >30%\n'
            f'/help          → Este mensaje\n\n'
            f'📊 <a href="{DASHBOARD_URL}">Abrir Dashboard</a>'
        )

    return None


# ── MAIN ───────────────────────────────────────────────────────
if __name__ == '__main__':
    if not TOKEN:
        print('❌ Variable TELEGRAM_TOKEN no configurada')
        sys.exit(1)

    if '--alerta' in sys.argv:
        if not CHAT_ID:
            print('❌ Variable CHAT_ID no configurada')
            sys.exit(1)
        modo_alerta()
    elif '--comandos' in sys.argv:
        modo_comandos()
    else:
        print('Uso: python bot_telegram.py --alerta | --comandos')
        sys.exit(1)
