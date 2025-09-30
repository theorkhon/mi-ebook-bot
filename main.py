from flask import Flask, request, jsonify
import requests
import hmac
import hashlib
import os

app = Flask(__name__)

# === CONFIGURACIÓN CORRECTA (variables de entorno) ===
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
NOWPAYMENTS_API_KEY = os.getenv("NOWPAYMENTS_API_KEY", "")
NOWPAYMENTS_SECRET = os.getenv("NOWPAYMENTS_SECRET", "")
PRODUCT_LINK = "https://drive.google.com/uc?export=download&id=1oWz2RmkM69kRAH5lpeEK85J7L4nJW9uo"

def send_msg(chat_id, text):
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    requests.post(url, json={"chat_id": chat_id, "text": text, "parse_mode": "HTML"})

@app.route('/webhook/nowpayments', methods=['POST'])
def crypto_webhook():
    signature = request.headers.get('x-nowpayments-sig', '')
    if NOWPAYMENTS_SECRET:
        computed = hmac.new(NOWPAYMENTS_SECRET.encode(), request.data, hashlib.sha512).hexdigest()
        if signature != computed:
            return "Invalid", 400

    data = request.json
    if data.get('payment_status') == 'confirmed':
        chat_id = data.get('custom_id')
        if chat_id:
            send_msg(chat_id, f"✅ ¡Pago confirmado!\n\nDescarga tu ebook:\n{PRODUCT_LINK}")
    return "OK", 200

@app.route('/telegram', methods=['POST'])
def telegram_webhook():
    update = request.json
    if 'message' not in update or 'text' not in update['message']:
        return "OK", 200

    chat_id = str(update['message']['chat']['id'])
    text = update['message']['text'].lower()

    if text in ['/start', '/comprar']:
        msg = (
            "📚 <b>Ebook Digital - 15 USD</b>\n\n"
            "elige tu método de pago:\n\n"
            
            "🪙 <b>Cripto (USDT)</b>\n"
            "→ Pago automático, recibes el ebook al instante.\n"
            "→ Escribe: <code>/cripto</code>\n\n"
            
            "🇪🇸 <b>Transferencia SEPA (España)</b>\n"
            "→ Titular: TU NOMBRE\n"
            "→ IBAN: ESXX XXXX XXXX XXXX XXXX\n"
            "→ Concepto: <code>EBOOK-{chat_id}</code>\n"
            "→ Envía comprobante después de pagar.\n\n"
            
            "🇪🇨 <b>Transferencia (Ecuador)</b>\n"
            "→ Banco: Pichincha\n"
            "→ Cuenta: 2214543269\n"
            "→ Referencia: <code>EBOOK-{chat_id}</code>\n"
            "→ Envía comprobante aquí.\n\n"
            
            "🔷 <b>PayPal</b>\n"
            "→ Envía 15 USD a: theorkhon@gmail.com\n"
            "→ En la nota, escribe: <code>{chat_id}</code>\n"
            "→ Te enviaré el ebook manualmente."
        )
        send_msg(chat_id, msg.format(chat_id=chat_id))

    elif text == '/cripto':
        res = requests.post(
            "https://api.nowpayments.io/v1/payment",
            json={
                "price_amount": 15,
                "price_currency": "usd",
                "pay_currency": "usdt",
                "ipn_callback_url": "https://mi-ebook-bot.onrender.com/webhook/nowpayments",
                "custom_id": chat_id,
                "order_description": "Ebook Digital"
            },
            headers={"X-API-Key": NOWPAYMENTS_API_KEY}
        )
        if res.status_code == 201:
            url = res.json()["payment_url"]
            send_msg(chat_id, f"🔗 <b>Paga en USDT:</b>\n{url}\n\n✅ Al confirmarse, recibirás tu ebook automáticamente.")
        else:
            send_msg(chat_id, "❌ Error al generar enlace. Inténtalo más tarde.")

    return "OK", 200

@app.route('/')
def home():
    return "✅ Bot de pagos activo"