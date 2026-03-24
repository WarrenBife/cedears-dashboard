#!/usr/bin/env python3
"""
Bot de Telegram para monitoreo de CEDEARs y acciones.
Lee datos.json del repo y envía alertas diarias + responde comandos interactivos.

Uso:
  - Como alerta diaria (GitHub Actions): python bot_telegram.py --alerta
  - Como bot interactivo (polling):      python bot_telegram.py --bot
"""

import json
import requests
import argparse
import os
import sys
from datetime import datetime

# ─────────────────────────────────────────────
# CONFIGURACIÓN
# ─────────────────────────────────────────────
TELEGRAM_TOKEN = os.environ.get("TELEGRAM_TOKEN", "8608163960:AAEZpmmU0So3hwG-aNb6Slyjbz5DBOHDzvU")
CHAT_ID = os.environ.get("CHAT_ID", "1673990665")
DATOS_URL = "https://raw.githubusercontent.com/WarrenBife/cedears-dashboard/main/datos.json"
DASHBOARD_URL = "https://warrenbife.github.io/cedears-dashboard"
API_URL = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}"

# Umbrales para alertas
UMBRAL_VOLUMEN_INUSUAL = 2.0
UMBRAL_CERCA_MAXIMO_52W = 5
UMBRAL_RSI_SOBREVENDIDO = 30
UMBRAL_RSI_SOBRECOMPRADO = 70
TOP_N = 5


# ─────────────────────────────────────────────
# FUNCIONES AUXILIARES
# ─────────────────────────────────────────────

def cargar_datos():
    try:
        resp = requests.get(DATOS_URL, timeout=30)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        print(f"Error cargando datos: {e}")
        return None


def enviar_mensaje(texto, chat_id=None, parse_mode="HTML"):
    if chat_id is None:
        chat_id = CHAT_ID
    chunks = []
    while len(texto) > 4096:
        corte = texto[:4096].rfind("\n")
        if corte == -1:
            corte = 4096
        chunks.append(texto[:corte])
        texto = texto[corte:]
    chunks.append(texto)
    for chunk in chunks:
        try:
            requests.post(f"{API_URL}/sendMessage", json={
                "chat_id": chat_id,
                "text": chunk,
                "parse_mode": parse_mode,
                "disable_web_page_preview": True
            }, timeout=30)
        except Exception as e:
            print(f"Error enviando mensaje: {e}")


def emoji_tendencia(valor):
    if valor is None: return "➖"
    if valor > 0: return "🟢"
    elif valor < 0: return "🔴"
    return "⚪"


def emoji_rs(rs):
    if rs is None: return "❓"
    if rs >= 80: return "🔥"
    elif rs >= 60: return "💪"
    elif rs >= 40: return "😐"
    elif rs >= 20: return "😟"
    return "💀"


def emoji_rsi(rsi):
    if rsi is None: return "❓"
    if rsi >= 70: return "🔴"
    elif rsi <= 30: return "🟢"
    return "⚪"


def barra_progreso(valor, max_val=100, largo=10):
    if valor is None: return "░" * largo
    proporcion = min(max(valor / max_val, 0), 1)
    llenos = round(proporcion * largo)
    return "█" * llenos + "░" * (largo - llenos)


def safe_get(ticker_data, key, default=None):
    val = ticker_data.get(key, default)
    if val is None or val == "" or val == "N/A":
        return default
    try:
        return float(val)
    except (ValueError, TypeError):
        return val


def calcular_cambio_rs(t):
    rs_hoy = safe_get(t, "RS Score", None)
    rs_ayer = safe_get(t, "RS Ayer", None)
    if rs_hoy is not None and rs_ayer is not None:
        return rs_hoy - rs_ayer
    return None


def get_ticker_name(t):
    return t.get("ticker", t.get("Ticker", "???"))


def get_field(t, *keys):
    for k in keys:
        val = safe_get(t, k, None)
        if val is not None:
            return val
    return 0


def formatear_ticker_detalle(t):
    nombre = get_ticker_name(t)
    sector = t.get("sector", t.get("Sector", "—"))
    tipo = t.get("tipo", t.get("Tipo", "—"))
    rs = get_field(t, "RS Score")
    warren = get_field(t, "warren_score", "Warren Score")
    rsi = get_field(t, "rsi_14", "RSI 14")
    dist_ema200 = get_field(t, "dist_ema200", "Dist EMA200")
    dist_sma50 = get_field(t, "dist_sma50", "Dist SMA50")
    dist_max52 = get_field(t, "dist_max_52w", "Dist Max 52W")
    dist_min52 = get_field(t, "dist_min_52w", "Dist Min 52W")
    vol_relativa = get_field(t, "volatilidad_relativa", "Vol Relativa")
    vol_inusual = get_field(t, "volumen_inusual", "Vol Inusual")
    precio = get_field(t, "precio", "Precio")
    market_cap = t.get("market_cap", t.get("Market Cap", "—"))
    
    cambio_rs = calcular_cambio_rs(t)
    cambio_str = f"{cambio_rs:+.1f}" if cambio_rs is not None else "N/A"
    rs_sem = safe_get(t, "RS Semana ant.", None)
    rs_mes = safe_get(t, "RS Mes ant.", None)

    lineas = [
        f"<b>{emoji_rs(rs)} {nombre}</b>  •  {tipo} • {sector}",
        f"   💰 Precio: <b>${precio:.2f}</b>  •  Cap: {market_cap}",
        f"   📊 RS: <b>{rs:.0f}</b> {barra_progreso(rs)} ({cambio_str} hoy)",
        f"   🏆 Warren: <b>{warren:.0f}</b> {barra_progreso(warren)}",
        f"   📈 RSI: <b>{rsi:.1f}</b> {emoji_rsi(rsi)}",
        f"   📏 vs EMA200: <b>{dist_ema200:+.1f}%</b>  •  vs SMA50: <b>{dist_sma50:+.1f}%</b>",
        f"   📐 vs Max52W: <b>{dist_max52:+.1f}%</b>  •  vs Min52W: <b>{dist_min52:+.1f}%</b>",
        f"   🌊 Vol Relativa: <b>{vol_relativa:.2f}</b>  •  Vol Inusual: <b>{vol_inusual:.1f}x</b>",
    ]
    if rs_sem is not None or rs_mes is not None:
        hist = "   🕐 RS hist:"
        if rs_sem is not None: hist += f" sem ant. {rs_sem:.0f}"
        if rs_mes is not None: hist += f" | mes ant. {rs_mes:.0f}"
        lineas.append(hist)
    return "\n".join(lineas)


# ─────────────────────────────────────────────
# SECCIONES DE LA ALERTA DIARIA
# ─────────────────────────────────────────────

def seccion_header(datos):
    total = len(datos)
    fecha = datetime.now().strftime("%d/%m/%Y %H:%M")
    return (
        f"{'═' * 30}\n"
        f"🤖 <b>WARREN BIFE BOT</b>\n"
        f"📅 {fecha} (Argentina)\n"
        f"📊 {total} tickers analizados\n"
        f"{'═' * 30}"
    )


def seccion_mayor_aumento_rs(datos):
    con_cambio = []
    for t in datos:
        cambio = calcular_cambio_rs(t)
        if cambio is not None:
            con_cambio.append((t, cambio))
    con_cambio.sort(key=lambda x: x[1], reverse=True)
    top = con_cambio[:TOP_N]
    if not top:
        return "\n🚀 <b>MAYOR AUMENTO RS SCORE</b> (última rueda)\n  Sin datos de cambio disponibles"
    lineas = [f"\n🚀 <b>MAYOR AUMENTO RS SCORE</b> (última rueda)\n"]
    for i, (t, cambio) in enumerate(top, 1):
        ticker = get_ticker_name(t)
        rs = get_field(t, "RS Score")
        warren = get_field(t, "warren_score", "Warren Score")
        lineas.append(
            f"  {i}. {emoji_tendencia(cambio)} <b>{ticker}</b> — RS: <b>{rs:.0f}</b> (<b>{cambio:+.1f}</b>) "
            f"| Warren: {warren:.0f}"
        )
    return "\n".join(lineas)


def seccion_top_warren(datos):
    ordenados = sorted(datos, key=lambda x: get_field(x, "warren_score", "Warren Score"), reverse=True)[:TOP_N]
    lineas = [f"\n🎯 <b>TOP {TOP_N} — MAYOR WARREN SCORE</b>\n"]
    for i, t in enumerate(ordenados, 1):
        warren = get_field(t, "warren_score", "Warren Score")
        rs = get_field(t, "RS Score")
        cambio_rs = calcular_cambio_rs(t)
        cambio_str = f"({cambio_rs:+.1f})" if cambio_rs is not None else ""
        ticker = get_ticker_name(t)
        lineas.append(
            f"  {i}. <b>{ticker}</b> — Warren: <b>{warren:.0f}</b> {barra_progreso(warren, largo=8)} "
            f"| RS: {rs:.0f} {cambio_str}"
        )
    return "\n".join(lineas)


def seccion_volumen_inusual(datos):
    filtrados = [t for t in datos if get_field(t, "volumen_inusual", "Vol Inusual") >= UMBRAL_VOLUMEN_INUSUAL]
    filtrados.sort(key=lambda x: get_field(x, "volumen_inusual", "Vol Inusual"), reverse=True)
    if not filtrados:
        return "\n📢 <b>VOLUMEN INUSUAL</b>\n  Sin alertas hoy"
    lineas = [f"\n📢 <b>VOLUMEN INUSUAL</b> (>{UMBRAL_VOLUMEN_INUSUAL}x promedio 20 ruedas)\n"]
    for t in filtrados[:8]:
        vol = get_field(t, "volumen_inusual", "Vol Inusual")
        rs = get_field(t, "RS Score")
        ticker = get_ticker_name(t)
        lineas.append(f"  ⚡ <b>{ticker}</b> — <b>{vol:.1f}x</b> volumen | RS: {rs:.0f}")
    return "\n".join(lineas)


def seccion_sobrevendidos(datos):
    filtrados = [t for t in datos if get_field(t, "rsi_14", "RSI 14") <= UMBRAL_RSI_SOBREVENDIDO and get_field(t, "rsi_14", "RSI 14") > 0]
    filtrados.sort(key=lambda x: get_field(x, "rsi_14", "RSI 14"))
    if not filtrados:
        return "\n🟢 <b>RSI SOBREVENDIDO</b> (≤30)\n  Sin señales hoy"
    lineas = [f"\n🟢 <b>RSI SOBREVENDIDO</b> (≤{UMBRAL_RSI_SOBREVENDIDO}) — Posibles oportunidades\n"]
    for t in filtrados[:6]:
        rsi = get_field(t, "rsi_14", "RSI 14")
        rs = get_field(t, "RS Score")
        dist_min = get_field(t, "dist_min_52w", "Dist Min 52W")
        ticker = get_ticker_name(t)
        lineas.append(f"  🔋 <b>{ticker}</b> — RSI: <b>{rsi:.1f}</b> | RS: {rs:.0f} | vs Min52W: {dist_min:+.1f}%")
    return "\n".join(lineas)


def seccion_sobrecomprados(datos):
    filtrados = [t for t in datos if get_field(t, "rsi_14", "RSI 14") >= UMBRAL_RSI_SOBRECOMPRADO]
    filtrados.sort(key=lambda x: get_field(x, "rsi_14", "RSI 14"), reverse=True)
    if not filtrados:
        return ""
    lineas = [f"\n🔴 <b>RSI SOBRECOMPRADO</b> (≥{UMBRAL_RSI_SOBRECOMPRADO}) — Posible agotamiento\n"]
    for t in filtrados[:6]:
        rsi = get_field(t, "rsi_14", "RSI 14")
        rs = get_field(t, "RS Score")
        dist_max = get_field(t, "dist_max_52w", "Dist Max 52W")
        ticker = get_ticker_name(t)
        lineas.append(f"  ⚠️ <b>{ticker}</b> — RSI: <b>{rsi:.1f}</b> | RS: {rs:.0f} | vs Max52W: {dist_max:+.1f}%")
    return "\n".join(lineas)


def seccion_cerca_maximo_52w(datos):
    filtrados = [
        t for t in datos
        if abs(get_field(t, "dist_max_52w", "Dist Max 52W")) <= UMBRAL_CERCA_MAXIMO_52W
        and get_field(t, "dist_max_52w", "Dist Max 52W") != 0
    ]
    filtrados.sort(key=lambda x: abs(get_field(x, "dist_max_52w", "Dist Max 52W")))
    if not filtrados:
        return ""
    lineas = [f"\n📈 <b>CERCA DEL MÁXIMO 52W</b> (≤{UMBRAL_CERCA_MAXIMO_52W}%)\n"]
    for t in filtrados[:6]:
        dist_max = get_field(t, "dist_max_52w", "Dist Max 52W")
        rs = get_field(t, "RS Score")
        ticker = get_ticker_name(t)
        lineas.append(f"  ⬆️ <b>{ticker}</b> — a <b>{abs(dist_max):.1f}%</b> del máximo | RS: {rs:.0f}")
    return "\n".join(lineas)


def seccion_footer():
    return (
        f"\n{'─' * 30}\n"
        f"🔗 <a href='{DASHBOARD_URL}'>Ver Dashboard Completo</a>\n"
        f"💬 Comandos: /top /warren /ticker /scanner /vol /help"
    )


# ─────────────────────────────────────────────
# ALERTA DIARIA
# ─────────────────────────────────────────────

def enviar_alerta_diaria():
    datos = cargar_datos()
    if not datos:
        enviar_mensaje("❌ Error cargando datos. Revisar datos.json en GitHub.")
        return
    if isinstance(datos, dict):
        for key in ["tickers", "data", "datos"]:
            if key in datos:
                datos = datos[key]
                break
        if isinstance(datos, dict):
            datos = list(datos.values())
    secciones = [
        seccion_header(datos),
        seccion_mayor_aumento_rs(datos),
        seccion_top_warren(datos),
        seccion_volumen_inusual(datos),
        seccion_sobrevendidos(datos),
        seccion_sobrecomprados(datos),
        seccion_cerca_maximo_52w(datos),
        seccion_footer(),
    ]
    mensaje = "\n".join(s for s in secciones if s)
    enviar_mensaje(mensaje)
    print(f"✅ Alerta diaria enviada ({len(datos)} tickers)")


# ─────────────────────────────────────────────
# COMANDOS INTERACTIVOS
# ─────────────────────────────────────────────

def cmd_top(datos, args=""):
    n = TOP_N
    try: n = min(max(int(args.strip()), 1), 20)
    except: pass
    ordenados = sorted(datos, key=lambda x: get_field(x, "RS Score"), reverse=True)[:n]
    lineas = [f"🏆 <b>TOP {n} RS SCORE</b>\n"]
    for i, t in enumerate(ordenados, 1):
        rs = get_field(t, "RS Score")
        cambio = calcular_cambio_rs(t)
        cambio_str = f"({cambio:+.1f})" if cambio is not None else ""
        lineas.append(f"  {i}. {emoji_rs(rs)} <b>{get_ticker_name(t)}</b> — RS: {rs:.0f} {cambio_str}")
    return "\n".join(lineas)


def cmd_warren(datos, args=""):
    n = TOP_N
    try: n = min(max(int(args.strip()), 1), 20)
    except: pass
    ordenados = sorted(datos, key=lambda x: get_field(x, "warren_score", "Warren Score"), reverse=True)[:n]
    lineas = [f"🎯 <b>TOP {n} WARREN SCORE</b>\n"]
    for i, t in enumerate(ordenados, 1):
        warren = get_field(t, "warren_score", "Warren Score")
        rs = get_field(t, "RS Score")
        cambio = calcular_cambio_rs(t)
        cambio_str = f"({cambio:+.1f})" if cambio is not None else ""
        lineas.append(f"  {i}. <b>{get_ticker_name(t)}</b> — Warren: {warren:.0f} | RS: {rs:.0f} {cambio_str}")
    return "\n".join(lineas)


def cmd_ticker(datos, args=""):
    simbolo = args.strip().upper()
    if not simbolo: return "⚠️ Usá: /ticker AAPL"
    for t in datos:
        if get_ticker_name(t).upper() == simbolo:
            return formatear_ticker_detalle(t)
    return f"❌ Ticker <b>{simbolo}</b> no encontrado en los {len(datos)} tickers monitoreados."


def cmd_scanner(datos, args=""):
    filtrados = [
        t for t in datos
        if get_field(t, "RS Score") >= 60
        and get_field(t, "warren_score", "Warren Score") >= 50
        and get_field(t, "rsi_14", "RSI 14") < 70
        and get_field(t, "dist_ema200", "Dist EMA200") > 0
    ]
    filtrados.sort(key=lambda x: get_field(x, "warren_score", "Warren Score"), reverse=True)
    if not filtrados:
        return "🔍 <b>SCANNER</b>\n\nSin resultados hoy con los filtros:\nRS ≥ 60, Warren ≥ 50, RSI < 70, Arriba EMA200"
    lineas = [f"🔍 <b>SCANNER DE CALIDAD</b>\n", f"Filtros: RS≥60 | Warren≥50 | RSI<70 | >EMA200\n", f"Resultados: <b>{len(filtrados)}</b> tickers\n"]
    for t in filtrados[:10]:
        lineas.append(f"  ✅ <b>{get_ticker_name(t)}</b> — W:{get_field(t, 'warren_score', 'Warren Score'):.0f} RS:{get_field(t, 'RS Score'):.0f} RSI:{get_field(t, 'rsi_14', 'RSI 14'):.0f}")
    return "\n".join(lineas)


def cmd_vol(datos, args=""):
    filtrados = [t for t in datos if get_field(t, "volumen_inusual", "Vol Inusual") >= 1.5]
    filtrados.sort(key=lambda x: get_field(x, "volumen_inusual", "Vol Inusual"), reverse=True)
    if not filtrados: return "📢 <b>VOLUMEN INUSUAL</b>\n\nSin alertas hoy (umbral: 1.5x)"
    lineas = [f"📢 <b>VOLUMEN INUSUAL</b> (≥1.5x promedio 20 ruedas)\n"]
    for t in filtrados[:10]:
        lineas.append(f"  ⚡ <b>{get_ticker_name(t)}</b> — {get_field(t, 'volumen_inusual', 'Vol Inusual'):.1f}x | RS: {get_field(t, 'RS Score'):.0f}")
    return "\n".join(lineas)


def cmd_help(*_):
    return (
        "🤖 <b>WARREN BIFE BOT — COMANDOS</b>\n\n"
        "📊 <b>/top</b> [N] — Top N por RS Score (default 5)\n"
        "🎯 <b>/warren</b> [N] — Top N por Warren Score\n"
        "🔎 <b>/ticker</b> AAPL — Detalle completo de un ticker\n"
        "🔍 <b>/scanner</b> — Scanner de calidad (RS≥60, Warren≥50...)\n"
        "📢 <b>/vol</b> — Tickers con volumen inusual\n"
        "❓ <b>/help</b> — Este mensaje\n\n"
        f"🔗 <a href='{DASHBOARD_URL}'>Dashboard completo</a>"
    )


COMANDOS = {"/top": cmd_top, "/warren": cmd_warren, "/ticker": cmd_ticker, "/scanner": cmd_scanner, "/vol": cmd_vol, "/help": cmd_help, "/start": cmd_help}


# ─────────────────────────────────────────────
# BOT INTERACTIVO (polling)
# ─────────────────────────────────────────────

def procesar_update(update, datos):
    message = update.get("message", {})
    text = message.get("text", "").strip()
    chat_id = str(message.get("chat", {}).get("id", ""))
    if not text or not chat_id: return
    partes = text.split(maxsplit=1)
    comando = partes[0].lower().split("@")[0]
    args = partes[1] if len(partes) > 1 else ""
    if comando in COMANDOS:
        handler = COMANDOS[comando]
        respuesta = handler() if comando in ("/help", "/start") else handler(datos, args)
        enviar_mensaje(respuesta, chat_id=chat_id)
    elif text.startswith("/"):
        enviar_mensaje(f"❓ Comando no reconocido: <b>{comando}</b>\n\nUsá /help para ver comandos disponibles.", chat_id=chat_id)


def run_bot_polling():
    print("🤖 Warren Bife Bot iniciado en modo polling...\n   Presioná Ctrl+C para detener\n")
    datos = cargar_datos()
    if not datos:
        print("❌ No se pudieron cargar los datos"); return
    if isinstance(datos, dict):
        for key in ["tickers", "data", "datos"]:
            if key in datos: datos = datos[key]; break
        if isinstance(datos, dict): datos = list(datos.values())
    print(f"📊 {len(datos)} tickers cargados")
    offset = 0
    while True:
        try:
            resp = requests.get(f"{API_URL}/getUpdates", params={"offset": offset, "timeout": 30}, timeout=35)
            for update in resp.json().get("result", []):
                offset = update["update_id"] + 1
                procesar_update(update, datos)
        except KeyboardInterrupt:
            print("\n👋 Bot detenido"); break
        except Exception as e:
            print(f"Error polling: {e}"); import time; time.sleep(5)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Warren Bife Telegram Bot")
    parser.add_argument("--alerta", action="store_true", help="Enviar alerta diaria")
    parser.add_argument("--bot", action="store_true", help="Modo bot interactivo (polling)")
    args = parser.parse_args()
    if args.alerta: enviar_alerta_diaria()
    elif args.bot: run_bot_polling()
    else: enviar_alerta_diaria()
