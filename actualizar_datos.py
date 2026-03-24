import yfinance as yf
import pandas as pd
import numpy as np
import json, base64, requests, os
from datetime import datetime

# ── CONFIGURACIÓN ──────────────────────────────────────────
GITHUB_TOKEN = os.environ.get("PAT_TOKEN")
GITHUB_USER  = "WarrenBife"
GITHUB_REPO  = "cedears-dashboard"
ARCHIVO      = "datos.json"

TICKERS = {
    "ADRs Argentina": ["YPF","GGAL","BMA","LOMA","MELI","GLOB","SUPV","BBAR","CEPU","PAM","TGS","IRS","BIOX","VIST","CAAP"],
    "CEDEARs Tecnología": ["AAPL","MSFT","GOOGL","META","AMZN","NVDA","TSLA","NFLX","AMD","INTC","QCOM","AVGO","MU","AMAT","LRCX","MRVL","TXN","TSM","ARM","ASML","ADBE","CRM","NOW","CSCO","IBM","ORCL","PYPL","SQ","COIN","PLTR","PANW","SHOP","UBER","ABNB","BKNG","SNAP","SPOT","ZM","EA","BIDU","BABA","JD","PDD","AI","PATH","HOOD","RKLB","ARKK"],
    "CEDEARs Finanzas": ["JPM","BAC","GS","C","WFC","AXP","V","MA","SCHW","BX","HSBC","IBN","KB","XP","PAGS","STNE","NU"],
    "CEDEARs Salud": ["JNJ","PFE","ABBV","MRK","AMGN","GILD","MRNA","BMY","LLY","MDT","UNH","CVS","VRTX"],
    "CEDEARs Consumo": ["KO","PEP","MCD","WMT","COST","TGT","HD","NKE","SBUX","DIS","PM","PG","CL","HSY","MDLZ","SYY","TJX","ROST"],
    "CEDEARs Energía": ["XOM","CVX","BP","SHEL","TTE","OXY","HAL","SLB","PSX","EQNR","FCX","RIO","VALE","GOLD","NEM","GGB","DOW","PBR","USO"],
    "CEDEARs Industria": ["BA","CAT","MMM","GE","HON","RTX","LMT","DE","UNP","FDX","DAL","UAL","GM","F","RACE","HPQ"],
    "CEDEARs ETFs": ["SPY","QQQ","DIA","IVV","IWM","VEA","EWZ","EEM","EFA","EWJ","FXI","XLK","XLF","XLE","XLV","XLI","XLB","XLC","XLY","XLP","XLU","SMH","IBB","GLD","SLV","GDX","TLT","HYG"],
}

ETF_SECTOR = {
    "AAPL":"XLK","MSFT":"XLK","GOOGL":"XLK","META":"XLK","UBER":"XLK","SHOP":"XLK","ADBE":"XLK","CRM":"XLK","IBM":"XLK","ORCL":"XLK","CSCO":"XLK","PLTR":"XLK","PANW":"XLK","AI":"XLK",
    "NVDA":"SMH","AMD":"SMH","INTC":"SMH","QCOM":"SMH","AVGO":"SMH","MU":"SMH","AMAT":"SMH","LRCX":"SMH","MRVL":"SMH","TXN":"SMH","TSM":"SMH","ARM":"SMH","ASML":"SMH",
    "JPM":"XLF","BAC":"XLF","GS":"XLF","C":"XLF","WFC":"XLF","AXP":"XLF","V":"XLF","MA":"XLF","SCHW":"XLF","BX":"XLF",
    "JNJ":"XLV","PFE":"XLV","ABBV":"XLV","MRK":"XLV","AMGN":"XLV","MRNA":"XLV","LLY":"XLV","UNH":"XLV","CVS":"XLV","VRTX":"XLV",
    "XOM":"XLE","CVX":"XLE","BP":"XLE","SHEL":"XLE","TTE":"XLE","OXY":"XLE","HAL":"XLE","SLB":"XLE","PSX":"XLE","EQNR":"XLE",
    "GOLD":"GDX","NEM":"GDX","FCX":"COPX",
    "AMZN":"XLY","TSLA":"XLY","MCD":"XLY","NKE":"XLY","SBUX":"XLY","HD":"XLY","TGT":"XLY","BKNG":"XLY",
    "KO":"XLP","PEP":"XLP","WMT":"XLP","COST":"XLP","PG":"XLP","PM":"XLP","MDLZ":"XLP",
    "META":"XLC","NFLX":"XLC","DIS":"XLC","SPOT":"XLC",
    "MELI":"EWZ","VALE":"EWZ","PBR":"EWZ",
    "BA":"XLI","CAT":"XLI","MMM":"XLI","GE":"XLI","HON":"XLI","RTX":"XLI","LMT":"XLI","DE":"XLI","UNP":"XLI","FDX":"XLI",
}

def calcular_rsi(close, periodo=14):
    delta = close.diff()
    ganancia = delta.clip(lower=0).rolling(window=periodo).mean()
    perdida = (-delta.clip(upper=0)).rolling(window=periodo).mean()
    rs = ganancia / perdida
    return round((100 - (100 / (1 + rs))).iloc[-1], 2)

def calcular_volatilidad_relativa(close, ruedas_corto=5, ruedas_largo=252):
    retornos = close.pct_change().dropna()
    if len(retornos) < ruedas_largo:
        return None
    vol_corto = retornos.tail(ruedas_corto).std() * np.sqrt(252) * 100
    vol_historica = retornos.tail(ruedas_largo).std() * np.sqrt(252) * 100
    if vol_historica == 0:
        return None
    return round(vol_corto / vol_historica, 2)

def calcular_volumen_inusual(volume, ruedas=20):
    if len(volume) < ruedas + 1:
        return None
    vol_hoy = volume.iloc[-1]
    vol_promedio = volume.iloc[-ruedas-1:-1].mean()
    if vol_promedio == 0:
        return None
    return round((vol_hoy / vol_promedio - 1) * 100, 2)

def calcular_rs_score(close_ticker, close_spy, periodo_sma=50, lookback=252):
    df = pd.DataFrame({"ticker": close_ticker, "spy": close_spy}).dropna()
    if len(df) < lookback + 1:
        return None, None, None, None, None
    df["fr"] = df["ticker"] / df["spy"]
    df["sma_fr"] = df["fr"].rolling(window=periodo_sma).mean()
    def percentrank_tv(series, length):
        scores = []
        arr = series.values
        for i in range(len(arr)):
            if i < length:
                scores.append(np.nan)
            else:
                ventana = arr[i-length:i]
                rank = (ventana < arr[i]).sum() / length * 100
                scores.append(round(rank, 2))
        return pd.Series(scores, index=series.index)
    df["rs_score"] = percentrank_tv(df["fr"], lookback)
    ultimo = df.iloc[-1]
    ayer = df.iloc[-2]
    semana = df.iloc[-6] if len(df) >= 6 else df.iloc[0]
    mes = df.iloc[-22] if len(df) >= 22 else df.iloc[0]
    sobre_sma = "✅ Sí" if ultimo["fr"] > ultimo["sma_fr"] else "❌ No"
    return (round(ultimo["rs_score"],1), round(ayer["rs_score"],1),
            round(semana["rs_score"],1), round(mes["rs_score"],1), sobre_sma)

def clasificar_market_cap(mc):
    if mc is None: return "—"
    if mc >= 200e9: return "Mega Cap"
    if mc >= 10e9: return "Large Cap"
    if mc >= 2e9: return "Mid Cap"
    if mc >= 300e6: return "Small Cap"
    return "Micro Cap"

def obtener_info_ticker(ticker_symbol):
    try:
        info = yf.Ticker(ticker_symbol).info
        mc = info.get('marketCap', None)
        sector = info.get('sector', None)
        es_etf = info.get('quoteType', '') in ['ETF', 'MUTUALFUND']
        if es_etf and not sector:
            sector = "ETF"
        if not sector:
            sector = info.get('category', '—') or '—'
        return {
            "Market Cap USD": mc,
            "Market Cap Cat": clasificar_market_cap(mc),
            "Sector": sector or "—",
            "Tipo": "ETF" if es_etf else "Acción"
        }
    except:
        return {"Market Cap USD": None, "Market Cap Cat": "—", "Sector": "—", "Tipo": "—"}

def calcular_kpis(ticker_symbol, hist_spy):
    try:
        tk = yf.Ticker(ticker_symbol)
        hist = tk.history(period="2y")
        if hist.empty or len(hist) < 60:
            return None
        close = hist["Close"]
        volume = hist["Volume"]
        precio_actual = round(close.iloc[-1], 2)
        ema200 = round(close.ewm(span=200, adjust=False).mean().iloc[-1], 2)
        sma50 = round(close.rolling(window=50).mean().iloc[-1], 2)
        dist_ema200 = round((precio_actual - ema200) / ema200 * 100, 2)
        dist_sma50 = round((precio_actual - sma50) / sma50 * 100, 2)
        max_52w = round(close.tail(252).max(), 2)
        dist_max52 = round((precio_actual - max_52w) / max_52w * 100, 2)
        min_52w = round(close.tail(252).min(), 2)
        dist_min52 = round((precio_actual - min_52w) / min_52w * 100, 2)
        var_dia = round((close.iloc[-1] - close.iloc[-2]) / close.iloc[-2] * 100, 2)
        rsi = calcular_rsi(close)
        vol_rel = calcular_volatilidad_relativa(close)
        vol_inu = calcular_volumen_inusual(volume, 20)
        score_actual, score_ayer, score_semana, score_mes, sobre_sma = calcular_rs_score(close, hist_spy["Close"])
        return {
            "Ticker": ticker_symbol,
            "Precio": precio_actual,
            "Var Día %": var_dia,
            "EMA200": ema200,
            "Dist EMA200 %": dist_ema200,
            "SMA50": sma50,
            "Dist SMA50 %": dist_sma50,
            "Máx 52W": max_52w,
            "Dist Máx52W %": dist_max52,
            "Mín 52W": min_52w,
            "Dist Mín52W %": dist_min52,
            "RSI 14": rsi,
            "Vol Relativa": vol_rel,
            "Vol Inusual %": vol_inu,
            "RS Score": score_actual,
            "RS Ayer": score_ayer,
            "RS Semana ant.": score_semana,
            "RS Mes ant.": score_mes,
            "FR > SMA50": sobre_sma,
        }
    except Exception as e:
        print(f"  ⚠️ Error con {ticker_symbol}: {e}")
        return None

# ── MAIN ────────────────────────────────────────────────────
print(f"⏳ Iniciando: {datetime.now().strftime('%d/%m/%Y %H:%M')}")
hist_spy = yf.Ticker("SPY").history(period="2y")
todos_los_datos = []
tickers_procesados = set()

for grupo, tickers in TICKERS.items():
    print(f"\n📂 {grupo}")
    for ticker in list(dict.fromkeys(tickers)):
        if ticker in tickers_procesados:
            continue
        tickers_procesados.add(ticker)
        print(f"  → {ticker}")
        datos = calcular_kpis(ticker, hist_spy)
        if not datos:
            continue
        datos["Grupo"] = grupo
        info = obtener_info_ticker(ticker)
        datos.update(info)
        sector_etf = ETF_SECTOR.get(ticker, None)
        if sector_etf:
            try:
                t = yf.Ticker(ticker).history(period="3mo")["Close"]
                s = yf.Ticker(sector_etf).history(period="3mo")["Close"]
                vs = round(((t.iloc[-1]/t.iloc[0]) / (s.iloc[-1]/s.iloc[0]) - 1) * 100, 2)
                datos["Vs Sector %"] = vs
                datos["ETF Sector"] = sector_etf
            except:
                datos["Vs Sector %"] = None
                datos["ETF Sector"] = None
        else:
            datos["Vs Sector %"] = None
            datos["ETF Sector"] = None
        todos_los_datos.append(datos)

# ── EXPORTAR ────────────────────────────────────────────────
datos_export = []
for item in todos_los_datos:
    clean = {}
    for k, v in item.items():
        if v is None or (isinstance(v, float) and np.isnan(v)):
            clean[k] = None
        elif isinstance(v, (int, float)):
            clean[k] = round(float(v), 2)
        else:
            clean[k] = str(v)
    datos_export.append(clean)

json_str = json.dumps(datos_export, ensure_ascii=False)
contenido_b64 = base64.b64encode(json_str.encode()).decode()
headers = {"Authorization": f"token {GITHUB_TOKEN}", "Accept": "application/vnd.github.v3+json"}
url_api = f"https://api.github.com/repos/{GITHUB_USER}/{GITHUB_REPO}/contents/{ARCHIVO}"
resp = requests.get(url_api, headers=headers)
sha = resp.json().get("sha") if resp.status_code == 200 else None
payload = {"message": f"Auto-update {datetime.now().strftime('%d/%m/%Y %H:%M')}", "content": contenido_b64}
if sha:
    payload["sha"] = sha
resp = requests.put(url_api, headers=headers, json=payload)
if resp.status_code in [200, 201]:
    print(f"\n✅ datos.json actualizado con {len(datos_export)} tickers")
else:
    print(f"\n❌ Error subiendo JSON: {resp.status_code} — {resp.json().get('message')}")
    exit(1)
