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
UMBRAL_VOLUMEN_INUSUAL = 50       # Vol Inusual % > 50% sobre promedio
UMBRAL_CERCA_MAXIMO_52W = 5       # % cerca del máximo 52 semanas
UMBRAL_RSI_SOBREVENDIDO = 30
UMBRAL_RSI_SOBRECOMPRADO = 70
TOP_N = 5


# ─────────────────────────────────────────────
# NOMBRES EXACTOS DE CAMPOS EN datos.json
# ─────────────────────────────────────────────
F_TICKER = "Ticker"
F_PRECIO = "Precio"
F_VAR_DIA = "Var Día %"
F_EMA200 = "EMA200"
F_DIST_EMA200 = "Dist EMA200 %"
F_SMA50 = "SMA50"
F_DIST_SMA50 = "Dist SMA50 %"
F_MAX_52W = "Máx 52W"
F_DIST_MAX_52W = "Dist Máx52W %"
F_MIN_52W = "Mín 52W"
F_DIST_MIN_52W = "Dist Mín52W %"
F_RSI = "RSI 14"
F_VOL_RELATIVA = "Vol Relativa"
F_VOL_INUSUAL = "Vol Inusual %"
F_RS = "RS Score"
F_RS_AYER = "RS Ayer"
F_RS_SEMANA = "RS Semana ant."
F_RS_MES = "RS Mes ant."
F_FR_SMA50 = "FR > SMA50"
F_GRUPO = "Grupo"
F_MCAP_USD = "Market Cap USD"
F_MCAP_CAT = "Market Cap Cat"
F_SECTOR = "Sector"
F_TIPO = "Tipo"


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


def safe_num(ticker_data, key, default=0):
    """Obtiene valor numérico de forma segura."""
    val = ticker_data.get(key)
    if val is None or val == "" or val == "N/A":
        return default
    try:
        return float(val)
    except (ValueError, TypeError):
        return default


def calc_warren_score(t):
    """
    Calcula el Warren Score (0-100) con la misma fórmula del dashboard:
    - Condición de entrada: RS Score > 60 (si no, retorna 0)
    - RS base: min(40, RS - 60)
    - Sobre EMA200: +20
    - Sobre SMA50: +10
    - Lejos del mínimo 52W (>=25%): +10
    - Vol baja (<0.8): proporcional hasta +20
    """
    rs = safe_num(t, F_RS)
    if rs <= 60:
        return 0

    score = min(40, rs - 60)

    if safe_num(t, F_DIST_EMA200) > 0:
        score += 20

    if safe_num(t, F_DIST_SMA50) > 0:
        score += 10

    if safe_num(t, F_DIST_MIN_52W) >= 25:
        score += 10

    vol = safe_num(t, F_VOL_RELATIVA)
    if vol < 0.8:
        score += max(0, (0.8 - vol) / 0.8 * 20)

    return min(100, round(score, 1))


def calcular_cambio_rs(t):
    rs_hoy = safe_num(t, F_RS, None)
    rs_ayer = safe_num(t, F_RS_AYER, None)
    if rs_hoy is not None and rs_ayer is not None and rs_hoy != 0:
        return rs_hoy - rs_ayer
    return None


def emoji_tendencia(valor):
    if valor is None: return "➖"
    if valor > 0: return "🟢"
    elif valor < 0: return "🔴"
    return "⚪"


def emoji_rs(rs):
    if rs >= 80: return "🔥"
    elif rs >= 60: return "💪"
    elif rs >= 40: return "😐"
    elif rs >= 20: return "😟"
    return "💀"


def emoji_rsi(rsi):
    if rsi >= 70: return "🔴"
    elif rsi <= 30: return "🟢"
    return "⚪"


def barra_progreso(valor, max_val=100, largo=10):
    if valor is None or valor == 0: return "░" * largo
    proporcion = min(max(valor / max_val, 0), 1)
    llenos = round(proporcion * largo)
    return "█" * llenos + "░" * (largo - llenos)


def formatear_ticker_detalle(t):
    ticker = t.get(F_TICKER, "???")
    sector = t.get(F_SECTOR, "—")
    tipo = t.get(F_TIPO, "—")
    grupo = t.get(F_GRUPO, "—")
    precio = safe_num(t, F_PRECIO)
    mcap = t.get(F_MCAP_CAT, "—")
    rs = safe_num(t, F_RS)
    warren = calc_warren_score(t)
    rsi = safe_num(t, F_RSI)
    dist_ema = safe_num(t, F_DIST_EMA200)
    dist_sma = safe_num(t, F_DIST_SMA50)
    dist_max = safe_num(t, F_DIST_MAX_52W)
    dist_min = safe_num(t, F_DIST_MIN_52W)
    vol_rel = safe_num(t, F_VOL_RELATIVA)
    vol_inu = safe_num(t, F_VOL_INUSUAL)
    var_dia = safe_num(t, F_VAR_DIA)

    cambio_rs = calcular_cambio_rs(t)
    cambio_str = f"{cambio_rs:+.1f}" if cambio_rs is not None else "N/A"
    rs_sem = safe_num(t, F_RS_SEMANA, None)
    rs_mes = safe_num(t, F_RS_MES, None)

    lineas = [
        f"<b>{emoji_rs(rs)} {ticker}</b>  •  {tipo} • {sector}",
        f"   📍 Grupo: {grupo} • Cap: {mcap}",
        f"   💰 Precio: <b>${precio:.2f}</b> ({var_dia:+.2f}% hoy)",
        f"   📊 RS: <b>{rs:.0f}</b> {barra_progreso(rs)} ({cambio_str} hoy)",
        f"   🏆 Warren: <b>{warren:.0f}</b> {barra_progreso(warren)}",
        f"   📈 RSI: <b>{rsi:.1f}</b> {emoji_rsi(rsi)}",
        f"   📏 vs EMA200: <b>{dist_ema:+.1f}%</b>  •  vs SMA50: <b>{dist_sma:+.1f}%</b>",
        f"   📐 vs Máx52W: <b>{dist_max:+.1f}%</b>  •  vs Mín52W: <b>{dist_min:+.1f}%</b>",
        f"   🌊 Vol Relativa: <b>{vol_rel:.2f}</b>  •  Vol Inusual: <b>{vol_inu:+.1f}%</b>",
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
        ticker = t.get(F_TICKER, "???")
        rs = safe_num(t, F_RS)
        warren = calc_warren_score(t)
        lineas.append(
            f"  {i}. {emoji_tendencia(cambio)} <b>{ticker}</b> — RS: <b>{rs:.0f}</b> (<b>{cambio:+.1f}</b>) "
            f"| Warren: {warren:.0f}"
        )
    return "\n".join(lineas)


def seccion_top_warren(datos):
    # Calcular warren para todos y ordenar
    con_warren = [(t, calc_warren_score(t)) for t in datos]
    con_warren.sort(key=lambda x: x[1], reverse=True)
    top = con_warren[:TOP_N]
    lineas = [f"\n🎯 <b>TOP {TOP_N} — MAYOR WARREN SCORE</b>\n"]
    for i, (t, warren) in enumerate(top, 1):
        rs = safe_num(t, F_RS)
        cambio_rs = calcular_cambio_rs(t)
        cambio_str = f"({cambio_rs:+.1f})" if cambio_rs is not None else ""
        ticker = t.get(F_TICKER, "???")
        lineas.append(
            f"  {i}. <b>{ticker}</b> — Warren: <b>{warren:.0f}</b> {barra_progreso(warren, largo=8)} "
            f"| RS: {rs:.0f} {cambio_str}"
        )
    return "\n".join(lineas)


def seccion_volumen_inusual(datos):
    filtrados = [t for t in datos if safe_num(t, F_VOL_INUSUAL) >= UMBRAL_VOLUMEN_INUSUAL]
    filtrados.sort(key=lambda x: safe_num(x, F_VOL_INUSUAL), reverse=True)
    if not filtrados:
        return "\n📢 <b>VOLUMEN INUSUAL</b>\n  Sin alertas hoy"
    lineas = [f"\n📢 <b>VOLUMEN INUSUAL</b> (>{UMBRAL_VOLUMEN_INUSUAL}% sobre promedio 20 ruedas)\n"]
    for t in filtrados[:8]:
        vol = safe_num(t, F_VOL_INUSUAL)
        rs = safe_num(t, F_RS)
        ticker = t.get(F_TICKER, "???")
        lineas.append(f"  ⚡ <b>{ticker}</b> — <b>+{vol:.0f}%</b> volumen | RS: {rs:.0f}")
    return "\n".join(lineas)


def seccion_sobrevendidos(datos):
    filtrados = [t for t in datos if 0 < safe_num(t, F_RSI) <= UMBRAL_RSI_SOBREVENDIDO]
    filtrados.sort(key=lambda x: safe_num(x, F_RSI))
    if not filtrados:
        return "\n🟢 <b>RSI SOBREVENDIDO</b> (≤30)\n  Sin señales hoy"
    lineas = [f"\n🟢 <b>RSI SOBREVENDIDO</b> (≤{UMBRAL_RSI_SOBREVENDIDO}) — Posibles oportunidades\n"]
    for t in filtrados[:6]:
        rsi = safe_num(t, F_RSI)
        rs = safe_num(t, F_RS)
        dist_min = safe_num(t, F_DIST_MIN_52W)
        ticker = t.get(F_TICKER, "???")
        lineas.append(f"  🔋 <b>{ticker}</b> — RSI: <b>{rsi:.1f}</b> | RS: {rs:.0f} | vs Mín52W: +{dist_min:.1f}%")
    return "\n".join(lineas)


def seccion_sobrecomprados(datos):
    filtrados = [t for t in datos if safe_num(t, F_RSI) >= UMBRAL_RSI_SOBRECOMPRADO]
    filtrados.sort(key=lambda x: safe_num(x, F_RSI), reverse=True)
    if not filtrados:
        return ""
    lineas = [f"\n🔴 <b>RSI SOBRECOMPRADO</b> (≥{UMBRAL_RSI_SOBRECOMPRADO}) — Posible agotamiento\n"]
    for t in filtrados[:6]:
        rsi = safe_num(t, F_RSI)
        rs = safe_num(t, F_RS)
        dist_max = safe_num(t, F_DIST_MAX_52W)
        ticker = t.get(F_TICKER, "???")
        lineas.append(f"  ⚠️ <b>{ticker}</b> — RSI: <b>{rsi:.1f}</b> | RS: {rs:.0f} | vs Máx52W: {dist_max:+.1f}%")
    return "\n".join(lineas)


def seccion_cerca_maximo_52w(datos):
    filtrados = [
        t for t in datos
        if abs(safe_num(t, F_DIST_MAX_52W)) <= UMBRAL_CERCA_MAXIMO_52W
    ]
    filtrados.sort(key=lambda x: abs(safe_num(x, F_DIST_MAX_52W)))
    if not filtrados:
        return ""
    lineas = [f"\n📈 <b>CERCA DEL MÁXIMO 52W</b> (≤{UMBRAL_CERCA_MAXIMO_52W}%)\n"]
    for t in filtrados[:6]:
        dist_max = safe_num(t, F_DIST_MAX_52W)
        rs = safe_num(t, F_RS)
        ticker = t.get(F_TICKER, "???")
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

def normalizar_datos(datos):
    """Normaliza datos si vienen como dict en vez de lista."""
    if isinstance(datos, dict):
        for key in ["tickers", "data", "datos"]:
            if key in datos:
                return datos[key]
        return list(datos.values())
    return datos


def enviar_alerta_diaria():
    datos = cargar_datos()
    if not datos:
        enviar_mensaje("❌ Error cargando datos. Revisar datos.json en GitHub.")
        return
    datos = normalizar_datos(datos)
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
    ordenados = sorted(datos, key=lambda x: safe_num(x, F_RS), reverse=True)[:n]
    lineas = [f"🏆 <b>TOP {n} RS SCORE</b>\n"]
    for i, t in enumerate(ordenados, 1):
        rs = safe_num(t, F_RS)
        cambio = calcular_cambio_rs(t)
        cambio_str = f"({cambio:+.1f})" if cambio is not None else ""
        lineas.append(f"  {i}. {emoji_rs(rs)} <b>{t.get(F_TICKER, '???')}</b> — RS: {rs:.0f} {cambio_str}")
    return "\n".join(lineas)


def cmd_warren(datos, args=""):
    n = TOP_N
    try: n = min(max(int(args.strip()), 1), 20)
    except: pass
    con_warren = [(t, calc_warren_score(t)) for t in datos]
    con_warren.sort(key=lambda x: x[1], reverse=True)
    top = con_warren[:n]
    lineas = [f"🎯 <b>TOP {n} WARREN SCORE</b>\n"]
    for i, (t, warren) in enumerate(top, 1):
        rs = safe_num(t, F_RS)
        cambio = calcular_cambio_rs(t)
        cambio_str = f"({cambio:+.1f})" if cambio is not None else ""
        lineas.append(f"  {i}. <b>{t.get(F_TICKER, '???')}</b> — Warren: {warren:.0f} | RS: {rs:.0f} {cambio_str}")
    return "\n".join(lineas)


def cmd_ticker(datos, args=""):
    simbolo = args.strip().upper()
    if not simbolo: return "⚠️ Usá: /ticker AAPL"
    for t in datos:
        if t.get(F_TICKER, "").upper() == simbolo:
            return formatear_ticker_detalle(t)
    return f"❌ Ticker <b>{simbolo}</b> no encontrado en los {len(datos)} tickers monitoreados."


def cmd_scanner(datos, args=""):
    """Scanner usa los mismos criterios binarios del dashboard (mínimo 3 de 4)."""
    filtrados = []
    for t in datos:
        criterios = 0
        if safe_num(t, F_RS) > 70: criterios += 1
        if safe_num(t, F_DIST_EMA200) > 0: criterios += 1
        if safe_num(t, F_DIST_SMA50) > 0: criterios += 1
        if safe_num(t, F_VOL_RELATIVA) < 0.8: criterios += 1
        if criterios >= 3:
            filtrados.append((t, calc_warren_score(t), criterios))
    filtrados.sort(key=lambda x: x[1], reverse=True)
    if not filtrados:
        return "🔍 <b>SCANNER</b>\n\nSin resultados hoy con los filtros:\nRS>70, >EMA200, >SMA50, Vol<0.8 (mín 3 de 4)"
    lineas = [
        f"🔍 <b>SCANNER DE CALIDAD</b>\n",
        f"Filtros: RS>70 | >EMA200 | >SMA50 | Vol<0.8 (mín 3/4)\n",
        f"Resultados: <b>{len(filtrados)}</b> tickers\n"
    ]
    for t, warren, crit in filtrados[:10]:
        ticker = t.get(F_TICKER, "???")
        rs = safe_num(t, F_RS)
        rsi = safe_num(t, F_RSI)
        lineas.append(f"  ✅ <b>{ticker}</b> — W:{warren:.0f} RS:{rs:.0f} RSI:{rsi:.0f} ({crit}/4)")
    return "\n".join(lineas)


def cmd_vol(datos, args=""):
    filtrados = [t for t in datos if safe_num(t, F_VOL_INUSUAL) >= 30]
    filtrados.sort(key=lambda x: safe_num(x, F_VOL_INUSUAL), reverse=True)
    if not filtrados: return "📢 <b>VOLUMEN INUSUAL</b>\n\nSin alertas hoy (umbral: +30%)"
    lineas = [f"📢 <b>VOLUMEN INUSUAL</b> (≥30% sobre promedio 20 ruedas)\n"]
    for t in filtrados[:10]:
        vol = safe_num(t, F_VOL_INUSUAL)
        rs = safe_num(t, F_RS)
        lineas.append(f"  ⚡ <b>{t.get(F_TICKER, '???')}</b> — +{vol:.0f}% | RS: {rs:.0f}")
    return "\n".join(lineas)


def cmd_help(*_):
    return (
        "🤖 <b>WARREN BIFE BOT — COMANDOS</b>\n\n"
        "📊 <b>/top</b> [N] — Top N por RS Score (default 5)\n"
        "🎯 <b>/warren</b> [N] — Top N por Warren Score\n"
        "🔎 <b>/ticker</b> AAPL — Detalle completo de un ticker\n"
        "🔍 <b>/scanner</b> — Scanner de calidad (mín 3 de 4 criterios)\n"
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
    datos = normalizar_datos(datos)
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
