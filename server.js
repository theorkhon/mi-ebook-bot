const express = require('express');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// === CONFIGURACIÓN ===
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY;
const NOWPAYMENTS_SECRET = process.env.NOWPAYMENTS_SECRET || '';
const PRODUCT_LINK = "https://drive.google.com/uc?export=download&id=1oWz2RmkM69kRAH5lpeEK85J7L4nJW9uo";

// === Enviar mensaje por Telegram ===
function sendMsg(chatId, text) {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    axios.post(url, { chat_id: chatId, text, parse_mode: 'HTML' })
        .catch(err => console.error('Error al enviar mensaje:', err));
}

// === Webhook de NOWPayments ===
app.post('/webhook/nowpayments', (req, res) => {
    const signature = req.headers['x-nowpayments-sig'];
    if (NOWPAYMENTS_SECRET) {
        const computed = crypto.createHmac('sha512', NOWPAYMENTS_SECRET)
            .update(JSON.stringify(req.body))
            .digest('hex');
        if (signature !== computed) {
            return res.status(400).send('Invalid signature');
        }
    }

    const data = req.body;
    if (data.payment_status === 'confirmed') {
        const chatId = data.custom_id;
        if (chatId) {
            sendMsg(chatId, `✅ ¡Pago confirmado!\n\nDescarga tu ebook:\n${PRODUCT_LINK}`);
        }
    }

    res.status(200).send('OK');
});

// === Webhook de Telegram ===
app.post('/telegram', (req, res) => {
    const update = req.body;
    if (!update.message || !update.message.text) return res.status(200).send('OK');

    const chatId = update.message.chat.id;
    const text = update.message.text.toLowerCase();

    if (text === '/start' || text === '/comprar') {
        const msg = `
📚 <b>Ebook Digital - 15 USD</b>\n\n
elige tu método de pago:\n\n

🪙 <b>Cripto (USDT)</b>\n
→ Pago automático, recibes el ebook al instante.\n
→ Escribe: <code>/cripto</code>\n\n

🇪🇸 <b>Transferencia SEPA (España)</b>\n
→ Titular: TU NOMBRE\n
→ IBAN: ESXX XXXX XXXX XXXX XXXX\n
→ Concepto: <code>EBOOK-${chatId}</code>\n
→ Envía comprobante después de pagar.\n\n

🇪🇨 <b>Transferencia (Ecuador)</b>\n
→ Banco: Pichincha\n
→ Cuenta: 2214543269\n
→ Referencia: <code>EBOOK-${chatId}</code>\n
→ Envía comprobante aquí.\n\n

🔷 <b>PayPal</b>\n
→ Envía 15 USD a: theorkhon@gmail.com\n
→ En la nota, escribe: <code>${chatId}</code>\n
→ Te enviaré el ebook manualmente.
        `;
        sendMsg(chatId, msg);
    } else if (text === '/cripto') {
        axios.post('https://api.nowpayments.io/v1/payment', {
            price_amount: 15,
            price_currency: 'usd',
            pay_currency: 'usdt',
            ipn_callback_url: 'https://mi-ebook-bot.onrender.com/webhook/nowpayments',
            custom_id: chatId,
            order_description: 'Ebook Digital'
        }, {
            headers: { 'X-API-Key': NOWPAYMENTS_API_KEY }
        })
        .then(response => {
            const paymentUrl = response.data.payment_url;
            sendMsg(chatId, `🔗 <b>Paga en USDT:</b>\n${paymentUrl}\n\n✅ Al confirmarse, recibirás tu ebook automáticamente.`);
        })
        .catch(error => {
            sendMsg(chatId, '❌ Error al generar enlace. Inténtalo más tarde.');
        });
    }

    res.status(200).send('OK');
});

// === Ruta de prueba ===
app.get('/', (req, res) => {
    res.send('✅ Bot de pagos activo');
});

// === Iniciar servidor ===
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
