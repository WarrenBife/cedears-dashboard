# ── actualizar_precios_rapido.py ──────────────────────────────────────
# Actualizacion liviana de precios, cada 15 min durante la rueda
# (2026-09-16, pedido del usuario: "no se puede hacer que solo se
# actualicen los precios y no tener que hacer la corrida del GitHub?").
#
# A diferencia de actualizar_datos.py (que baja 2 anios de historial por
# cada uno de los 383 tickers para recalcular TODO -- RSI, MACD, VCP,
# Warren Score, etc. -- y por eso corre solo 2 veces por dia), este
# script SOLO pide el precio actual de los 383 tickers en un par de
# pedidos en bloque (mucho mas rapido) y actualiza "Precio" y
# "Var Día %" -- nada mas. El resto de los campos (que no cambian tan
# seguido durante el dia) quedan tal cual los dejo la ultima corrida
# completa.
#
# Necesita el campo "Cierre Anterior" que ya escribe actualizar_datos.py
# (agregado en el mismo pedido) -- sin eso no hay referencia para
# calcular la variacion sin volver a bajar historial. Si un ticker
# todavia no lo tiene (por ejemplo, la primera vez que corre esto
# despues de agregar el campo, antes de la proxima corrida completa),
# simplemente se lo salta -- no rompe nada.
#
# Mismo criterio de nunca-null que el resto del pipeline: si no se
# consigue un precio en vivo para un ticker, se deja como estaba, no se
# pisa con nada.

import base64
import json
import os

import requests
import yfinance as yf

GITHUB_TOKEN = os.environ.get("PAT_TOKEN")
GITHUB_USER  = "WarrenBife"
GITHUB_REPO  = "cedears-dashboard"
ARCHIVO      = "datos.json"


def headers():
    return {"Authorization": f"token {GITHUB_TOKEN}", "Accept": "application/vnd.github.v3+json"}


def obtener_precios_vivos(tickers):
    """Precio actual en vivo, en bloque -- mismo criterio que
    yahoo_intraday_close() en actualizar_datos.py (1 minuto, con
    respaldo a 5 minutos), pero pidiendo TODOS los tickers de una sola
    vez en vez de uno por uno -- mucho mas rapido, pensado para correr
    cada 15 minutos."""
    precios = {}
    pendientes = list(tickers)
    for intervalo in ("1m", "5m"):
        if not pendientes:
            break
        try:
            data = yf.download(
                pendientes, period="1d", interval=intervalo,
                group_by="ticker", auto_adjust=False, progress=False, threads=True,
            )
        except Exception as e:
            print(f"  ⚠️  Descarga en bloque ({intervalo}) fallo: {e}")
            continue

        siguen_pendientes = []
        for tk in pendientes:
            try:
                df = data[tk] if len(pendientes) > 1 else data
                df = df.dropna(subset=["Close"])
                if df.empty:
                    siguen_pendientes.append(tk)
                    continue
                precios[tk] = round(float(df["Close"].iloc[-1]), 2)
            except Exception:
                siguen_pendientes.append(tk)
        pendientes = siguen_pendientes
    return precios


def main():
    if not GITHUB_TOKEN:
        raise RuntimeError("Falta PAT_TOKEN")

    # datos.json pesa >1MB -- la API de contenidos de GitHub NO devuelve
    # el campo "content" para archivos de mas de 1MB (viene vacio, rompe
    # el base64/json.loads de abajo con un JSONDecodeError -- caso real,
    # 2026-09-16). El "sha" si viene siempre, sin importar el tamano, asi
    # que se sigue pidiendo por acá (hace falta para el PUT de mas
    # abajo) -- pero el CONTENIDO se lee del raw de GitHub, que no tiene
    # ese limite.
    url = f"https://api.github.com/repos/{GITHUB_USER}/{GITHUB_REPO}/contents/{ARCHIVO}"
    r = requests.get(url, headers=headers())
    r.raise_for_status()
    sha = r.json()["sha"]

    raw_url = f"https://raw.githubusercontent.com/{GITHUB_USER}/{GITHUB_REPO}/main/{ARCHIVO}"
    r_raw = requests.get(raw_url, headers={"Cache-Control": "no-cache"})
    r_raw.raise_for_status()
    datos = r_raw.json()

    tickers = [d["Ticker"] for d in datos if d.get("Ticker")]
    print(f"⏳ Pidiendo precio en vivo de {len(tickers)} tickers...")
    precios_vivos = obtener_precios_vivos(tickers)
    print(f"✅ Conseguidos {len(precios_vivos)} de {len(tickers)}")

    actualizados = 0
    for d in datos:
        tk = d.get("Ticker")
        nuevo_precio = precios_vivos.get(tk)
        cierre_ant = d.get("Cierre Anterior")
        if nuevo_precio is None or not cierre_ant:
            continue
        d["Precio"] = nuevo_precio
        d["Var Día %"] = round((nuevo_precio - cierre_ant) / cierre_ant * 100, 2)
        actualizados += 1

    print(f"📊 {actualizados}/{len(datos)} tickers con precio y variación actualizados")

    if actualizados == 0:
        print("ℹ️  Nada para actualizar -- no se sube nada.")
        return

    nuevo_contenido = json.dumps(datos, ensure_ascii=False)
    payload = {
        "message": f"Precios en vivo {actualizados}/{len(datos)} tickers",
        "content": base64.b64encode(nuevo_contenido.encode("utf-8")).decode("utf-8"),
        "sha": sha,
    }
    resp = requests.put(url, headers=headers(), json=payload)
    if not resp.ok:
        raise RuntimeError(f"Error subiendo {ARCHIVO}: {resp.status_code} — {resp.text[:300]}")
    print(f"✅ {ARCHIVO} actualizado (solo precios).")


if __name__ == "__main__":
    main()
