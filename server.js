const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

// === ALMACENAMIENTO TEMPORAL ===
const userData = {}; // { chatId: { idioma: 'es', metodo: 'usdt', banco: 'es' } }

// === CONFIGURACIÓN ===
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY;

// === DATOS BANCARIOS (PERSONALIZA ESTO) ===
const PAYPAL_EMAIL = "theorkhon@gmail.com";
const BANCO_ES = {
  titular: "TU NOMBRE COMPLETO",
  iban: "ES12 3456 7890 1234 5678 90",
  concepto: "EBOOK-{chatId}"
};
const BANCO_EC = {
  banco: "Banco Pichincha",
  cuenta: "2214543269",
  referencia: "EBOOK-{chatId}"
};

// === ENLACES DE EBOOK (PERSONALIZA ESTO) ===
const EBOOK_ES = "https://drive.google.com/uc?export=download&id=TU_ID_ESPAÑOL";
const EBOOK_EN = "https://drive.google.com/uc?export=download&id=TU_ID_INGLÉS";

// === FUNCIÓN PARA ENVIAR MENSAJES ===
function sendMsg(chatId, text, keyboard = null) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const payload = {
    chat_id: chatId,
    text: text,
    parse_mode: 'HTML',
    reply_markup: keyboard ? JSON.stringify(keyboard) : undefined
  };
  axios.post(url, payload).catch(err => console.error('Error:', err.message));
}

// === WEBHOOK DE MENSAJES (/start) ===
app.post('/telegram', (req, res) => {
  const update = req.body;
  if (update.message && update.message.text === '/start') {
    const chatId = update.message.chat.id;
    const keyboard = {
      inline_keyboard: [[
        { text: '🛒 Comprar ebook', callback_data: 'comprar' }
      ]]
    };
    sendMsg(chatId, `📚 ¡Hola! Bienvenido a mi tienda de ebooks.\n\nHaz clic para comenzar.`, keyboard);
  }
  res.status(200).send('OK');
});

// === WEBHOOK DE BOTONES ===
app.post('/callback', (req, res) => {
  const callbackQuery = req.body.callback_query;
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;

  // 1. Comprar → elegir idioma
  if (data === 'comprar') {
    const keyboard = {
      inline_keyboard: [
        [{ text: '🇪🇸 Español', callback_data: 'idioma_es' }],
        [{ text: '🇬🇧 English', callback_data: 'idioma_en' }]
      ]
    };
    sendMsg(chatId, `📚 ¿En qué idioma quieres tu ebook?`, keyboard);
  }

  // 2. Idioma seleccionado → elegir método de pago
  else if (data === 'idioma_es' || data === 'idioma_en') {
    userData[chatId] = { idioma: data === 'idioma_es' ? 'es' : 'en' };
    const keyboard = {
      inline_keyboard: [
        [{ text: '🪙 USDT (automático)', callback_data: 'pago_usdt' }],
        [{ text: '🔷 PayPal', callback_data: 'pago_paypal' }],
        [{ text: '🏦 Transferencia bancaria', callback_data: 'pago_banco' }]
      ]
    };
    const msg = userData[chatId].idioma === 'es'
      ? `💰 ¿Cómo deseas pagar?`
      : `💰 How would you like to pay?`;
    sendMsg(chatId, msg, keyboard);
  }

  // 3. USDT → genera enlace
  else if (data === 'pago_usdt') {
    userData[chatId].metodo = 'usdt';
    const lang = userData[chatId].idioma;
    axios.post('https://api.nowpayments.io/v1/payment', {
      price_amount: 15,
      price_currency: 'usd',
      pay_currency: 'usdt',
      ipn_callback_url: 'https://TU_APP.onrender.com/webhook/nowpayments',
      custom_id: chatId,
      order_description: 'Ebook Digital'
    }, {
      headers: { 'X-API-Key': NOWPAYMENTS_API_KEY }
    })
    .then(response => {
      const url = response.data.payment_url;
      const msg = lang === 'es'
        ? `🔗 <b>Paga en USDT:</b>\n${url}\n\n✅ Al confirmarse, recibirás tu ebook automáticamente.`
        : `🔗 <b>Pay in USDT:</b>\n${url}\n\n✅ Once confirmed, you'll receive your ebook automatically.`;
      sendMsg(chatId, msg);
    })
    .catch(() => {
      const msg = lang === 'es'
        ? '❌ Error al generar enlace. Inténtalo más tarde.'
        : '❌ Error generating payment link.';
      sendMsg(chatId, msg);
    });
  }

  // 4. PayPal → muestra datos
  else if (data === 'pago_paypal') {
    userData[chatId].metodo = 'paypal';
    const lang = userData[chatId].idioma;
    const msg = lang === 'es'
      ? `🔷 <b>PayPal</b>\n\nEnvía 15 USD a:\n📧 ${PAYPAL_EMAIL}\n\n👉 En la nota, escribe: <code>EBOOK-${chatId}</code>\n\n✅ Te enviaré tu ebook manualmente al recibir el pago.`
      : `🔷 <b>PayPal</b>\n\nSend 15 USD to:\n📧 ${PAYPAL_EMAIL}\n\n👉 In the note, write: <code>EBOOK-${chatId}</code>\n\n✅ I'll send your ebook manually once payment is received.`;
    sendMsg(chatId, msg);
  }

  // 5. Transferencia → elegir país
  else if (data === 'pago_banco') {
    userData[chatId].metodo = 'banco';
    const keyboard = {
      inline_keyboard: [
        [{ text: '🇪🇸 España (SEPA)', callback_data: 'banco_es' }],
        [{ text: '🇪🇨 Ecuador', callback_data: 'banco_ec' }]
      ]
    };
    const lang = userData[chatId].idioma;
    const msg = lang === 'es'
      ? `🏦 ¿A qué país deseas transferir?`
      : `🏦 Which country do you want to transfer to?`;
    sendMsg(chatId, msg, keyboard);
  }

  // 6. Banco España
  else if (data === 'banco_es') {
    userData[chatId].banco = 'es';
    const lang = userData[chatId].idioma;
    const concepto = BANCO_ES.concepto.replace('{chatId}', chatId);
    const msg = lang === 'es'
      ? `🇪🇸 <b>Transferencia SEPA (España)</b>\n\nTitular: ${BANCO_ES.titular}\nIBAN: <code>${BANCO_ES.iban}</code>\nConcepto: <code>${concepto}</code>\n\n✅ Envía comprobante aquí después de pagar.`
      : `🇪🇸 <b>SEPA Transfer (Spain)</b>\n\nHolder: ${BANCO_ES.titular}\nIBAN: <code>${BANCO_ES.iban}</code>\nReference: <code>${concepto}</code>\n\n✅ Send proof of payment here after paying.`;
    sendMsg(chatId, msg);
  }

  // 7. Banco Ecuador
  else if (data === 'banco_ec') {
    userData[chatId].banco = 'ec';
    const lang = userData[chatId].idioma;
    const referencia = BANCO_EC.referencia.replace('{chatId}', chatId);
    const msg = lang === 'es'
      ? `🇪🇨 <b>Transferencia (Ecuador)</b>\n\nBanco: ${BANCO_EC.banco}\nCuenta: <code>${BANCO_EC.cuenta}</code>\nReferencia: <code>${referencia}</code>\n\n✅ Envía comprobante aquí después de pagar.`
      : `🇪🇨 <b>Bank Transfer (Ecuador)</b>\n\nBank: ${BANCO_EC.banco}\nAccount: <code>${BANCO_EC.cuenta}</code>\nReference: <code>${referencia}</code>\n\n✅ Send proof of payment here after paying.`;
    sendMsg(chatId, msg);
  }

  // Responder al botón (sin alerta)
  axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
    callback_query_id: callbackQuery.id
  });

  res.status(200).send('OK');
});

// === WEBHOOK DE NOWPAYMENTS (solo para USDT) ===
app.post('/webhook/nowpayments', (req, res) => {
  const data = req.body;
  if (data.payment_status === 'confirmed') {
    const chatId = data.custom_id;
    if (chatId && userData[chatId]) {
      const lang = userData[chatId].idioma;
      const link = lang === 'es' ? EBOOK_ES : EBOOK_EN;
      const msg = lang === 'es'
        ? `✅ ¡Pago en USDT confirmado!\n\nDescarga tu ebook:\n${link}`
        : `✅ USDT payment confirmed!\n\nDownload your ebook:\n${link}`;
      sendMsg(chatId, msg);
      delete userData[chatId];
    }
  }
  res.status(200).send('OK');
});

// === PÁGINA DE PRUEBA ===
app.get('/', (req, res) => {
  res.send('✅ Bot activo');
});

// === INICIAR SERVIDOR ===
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Servidor en puerto ${PORT}`);
});
