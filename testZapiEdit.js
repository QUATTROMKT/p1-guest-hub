import fetch from 'node-fetch';

async function testZapi() {
    const phoneArgs = process.argv.slice(2);
    const myPhone = phoneArgs[0] || 'INFORME SEU NUMERO AQUI';
    if (myPhone === 'INFORME SEU NUMERO AQUI') {
        console.log("Por favor, rode o comando assim: node testZapiEdit.js 5511999999999");
        return;
    }

    const ZAPI_INSTANCE = "3EDDA716EC1BF3F118711AC0A90830D6";
    const ZAPI_TOKEN = "2CA5B27FD7E8EA7872F88116";
    const ZAPI_CLIENT_TOKEN = "Fba70686a73f5409da3e0f33bfee5a190S";

    console.log(`Enviando mensagem para ${myPhone}...`);
    const sendRes = await fetch(`https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}/send-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Client-Token': ZAPI_CLIENT_TOKEN },
        body: JSON.stringify({ phone: myPhone, message: 'Teste mensagem base' })
    });

    const sendData = await sendRes.json();
    console.log("-> Send Response:", sendData);

    if (sendData.messageId) {
        console.log(`\nAguardando 5 segundos para testar EDIÇÃO com o ID: ${sendData.messageId}...`);
        await new Promise(r => setTimeout(r, 5000));

        console.log("-> Testando POST /send-text com atributo editMessageId...");
        const editRes1 = await fetch(`https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}/send-text`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Client-Token': ZAPI_CLIENT_TOKEN },
            body: JSON.stringify({ phone: myPhone, message: 'Teste editado via editMessageId property!', editMessageId: sendData.messageId })
        });
        console.log("   Result:", await editRes1.text());

        console.log(`\nAguardando 3 segundos...`);
        await new Promise(r => setTimeout(r, 3000));

        console.log("-> Testando DELETE /messages via Query String...");
        const delRes1 = await fetch(`https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}/messages?messageId=${sendData.messageId}&phone=${myPhone}&owner=true`, {
            method: 'DELETE',
            headers: { 'Client-Token': ZAPI_CLIENT_TOKEN }
        });
        console.log("-> DELETE Query Result:", await delRes1.text());

        if (sendData.zaapId) {
            console.log("\n-> Testando DELETE /messages via Query String usando ZAAP_ID...");
            const delRes2 = await fetch(`https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}/messages?messageId=${sendData.zaapId}&phone=${myPhone}&owner=true`, {
                method: 'DELETE',
                headers: { 'Client-Token': ZAPI_CLIENT_TOKEN }
            });
            console.log("-> DELETE Query ZAAP_ID Result:", await delRes2.text());
        }
    }
}

testZapi();
