const fetch = require('node-fetch');

async function testZapi() {
    const ZAPI_INSTANCE = "3EDDA716EC1BF3F118711AC0A90830D6";
    const ZAPI_TOKEN = "2CA5B27FD7E8EA7872F88116";
    const ZAPI_CLIENT_TOKEN = "Fba70686a73f5409da3e0f33bfee5a190S";

    // Enviar uma mensagem primeiro
    console.log("Enviando...");
    const sendRes = await fetch(`https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}/send-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Client-Token': ZAPI_CLIENT_TOKEN },
        body: JSON.stringify({ phone: '5511999999999', message: 'Teste edit 1' })
    });

    const sendData = await sendRes.json();
    console.log("Send:", sendData);

    if (sendData.messageId) {
        console.log("Tentando editar com PUT /messages...");
        const editRes1 = await fetch(`https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}/messages`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Client-Token': ZAPI_CLIENT_TOKEN },
            body: JSON.stringify({ phone: '5511999999999', messageId: sendData.messageId, message: 'Teste edit 1 FINAL' })
        });
        console.log("PUT /messages:", await editRes1.text());

        console.log("Tentando apagar...");
        const delRes = await fetch(`https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}/messages/${sendData.messageId}`, {
            method: 'DELETE',
            headers: { 'Client-Token': ZAPI_CLIENT_TOKEN }
        });
        console.log("DELETE:", await delRes.text());
    }
}

testZapi();
