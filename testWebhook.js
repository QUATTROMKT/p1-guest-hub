const fetch = require('node-fetch');

const payload = {
    "isGroup": false,
    "instanceId": "3EDDA716EC1BF3F118711AC0A90830D6",
    "messageId": "fake_msg_" + Date.now(),
    "phone": "555599114969",
    "fromMe": false,
    "text": {
        "message": "Teste do webhook direto"
    },
    "type": "text",
    "senderName": "Kadu Teste Webhook"
};

async function testWebhook() {
    try {
        const res = await fetch('https://us-central1-p1-hotel.cloudfunctions.net/zapiWebhook', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const text = await res.text();
        console.log("Status:", res.status);
        console.log("Body:", text);
    } catch (e) {
        console.error(e);
    }
}

testWebhook();
