import json, requests
from datetime import datetime
import urllib.request

TELEGRAM_TOKEN   = "8608163960:AAEZpmmU0So3hwG-aNb6Slyjbz5DBOHDzvU"
TELEGRAM_CHAT_ID = "1673990665"

def enviar_mensaje(texto):
    url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage"
    requests.post(url, json={"chat_id": TELEGRAM_CHAT_ID, "text": texto, "parse_mode": "HTML"})

# Cargamos datos desde el JSON del repositorio
url = "https://warrenbife.github.io/cedears-dashboard/datos.json"
with urllib.request.urlopen(url) as r:
    datos = json.loads(r.read().decode())

# Filtramos acciones con RS Score y RS Ayer válidos
validos = [d for d in datos if d.get('RS Score') is not None and d.get('RS Ayer') is not None and d.get('Tipo') == 'Acción']

# Calculamos delta RS del día
for d in validos:
    d['Delta RS'] = round(d['RS Score'] - d['RS Ayer'], 1)

# TOP 5 mayor aumento
top5 = sorted(validos, key=lambda x: x['Delta RS'], reverse=True)[:5]

# Armamos mensaje
fecha = datetime.now().strftime('%d/%m/%Y')
hora  = datetime.now().strftime('%H:%M')
medallas = ['🥇','🥈','🥉','4️⃣','5️⃣']

msg  = f"📊 <b>TOP 5 — Mayor aumento RS Score</b>\n"
msg += f"📅 {fecha} | ⏰ {hora}\n"
msg += f"━━━━━━━━━━━━━━━━━━━━\n\n"

for i, d in enumerate(top5):
    msg += f"{medallas[i]} <b>{d['Ticker']}</b>\n"
    msg += f"   RS: <b>{d['RS Score']}</b>  (ayer: {d['RS Ayer']})  <b>▲+{d['Delta RS']}</b>\n"
    msg += f"   Sector: {d.get('Sector','—')}\n\n"

msg += f"━━━━━━━━━━━━━━━━━━━━\n"
msg += f"<i>Warren Bife Indicator</i>"

enviar_mensaje(msg)
print(f"✅ Mensaje enviado: {datetime.now()}")
for d in top5:
    print(f"  {d['Ticker']}: RS {d['RS Score']} (▲+{d['Delta RS']})")
