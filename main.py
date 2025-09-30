from flask import Flask, request, jsonify
import requests
import hmac
import hashlib
import os
import logging

# Configurar logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# === CONFIGURACIÓN CORRECTA (variables de entorno) ===
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
if not TELEGRAM_BOT_TOKEN:
    logger.error("TELEGRAM_BOT_TOKEN no está configurado")
    raise ValueError("TELEGRAM_BOT_TOKEN no está configurado")

NOWPAYMENTS_API_KEY = os.getenv("NOWPAYMENTS_API_KEY", "")
NOWPAYMENTS_SECRET = os.getenv("NOWPAYMENTS_SECRET", "")
PRODUCT_LINK = "https://drive.google.com/uc?export=download&id=1oWz2RmkM69kRAH5lpeEK85J7L4nJW9uo"

def send_msg(chat_id, text):
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    try:
        response = requests.post(url, json={"chat_id": chat_id, "text": text, "parse_mode": "HTML"}, timeout=10)
        response.raise_for_status()
    except requests.RequestException as e:
        logger.error(f"Error al enviar mensaje a Telegram: {e}")
        raise

@app.route('/webhook/nowpayments', methods=['POST'])
def crypto_webhook():
    signature = request.headers.get('x-nowpayments-sig', '')
    if not NOWPAYMENTS_SECRET:
        return "Secret no configurado", 403
    try:
        computed = hmac.new(NOWPAYMENTS_SECRET.encode(), request.data, hashlib.sha512).hexdigest()
        if signature != computed:
            return "Invalid signature", 400
        data = request.json
        if data.get('payment_status') == 'confirmed':
            chat_id = data.get('custom_id')
            if chat_id:
                send_msg(chat_id, f"✅ ¡Pago confirmado!\n\nDescarga tu ebook:\n{PRODUCT_LINK}")
        return "OK", 200
    except ValueError:
        return "Datos inválidos", 400
    except Exception as e:
        logger.error(f"Error en webhook NowPayments: {e}")
        return str(e), 500

@app.route('/telegram', methods=['POST'])
def telegram_webhook():
    try:
        update = request.json
        if 'message' not in update or 'text' not in update['message']:
            return "OK", 200

        chat_id = str(update['message']['chat']['id'])
        text = update['message']['text'].lower()

        if text in ['/start', '/comprar']:
            msg = (
                "📚 <b>Ebook Digital - 15 USD</b>\n\n"
                "Elige tu método de pago:\n\n"
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
                    "ipn_callback_url": os.getenv("CALLBACK_URL", "https://mi-ebook-bot.onrender.com/webhook/nowpayments"),
                    "custom_id": chat_id,
                    "order_description": "Ebook Digital"
                },
                headers={"X-API-Key": NOWPAYMENTS_API_KEY},
                timeout=10
            )
            res.raise_for_status()
            if res.status_code == 201:
                url = res.json()["payment_url"]
                send_msg(chat_id, f"🔗 <b>Paga en USDT:</b>\n{url}\n\n✅ Al confirmarse, recibirás tu ebook automáticamente.")
            else:
                send_msg(chat_id, "❌ Error al generar enlace. Inténtalo más tarde.")
        return "OK", 200
    except ValueError:
        return "Datos inválidos", 400
    except Exception as e:
        logger.error(f"Error en webhook Telegram: {e}")
        return str(e), 500

@app.route('/')
def home():
    return "✅ Bot de pagos activo"

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
