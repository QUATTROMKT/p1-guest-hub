/**
 * Check Z-API webhook configuration and fix if needed
 */
const https = require('https');
const fs = require('fs');

const INSTANCE = '3EDDA716EC1BF3F118711AC0A90830D6';
const TOKEN = '2CA5B27FD7E8EA7872F88116';
const CLIENT_TOKEN = 'Fba70686a73f5409da3e0f33bfee5a190S';
const WEBHOOK_URL = 'https://zapiwebhook-hqc6pnb3na-uc.a.run.app';

function zapiRequest(method, path, body) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.z-api.io',
            path: `/instances/${INSTANCE}/token/${TOKEN}${path}`,
            method,
            headers: { 'Client-Token': CLIENT_TOKEN, 'Content-Type': 'application/json' }
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                console.log(`  [${method} ${path}] Status: ${res.statusCode}`);
                try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
                catch { resolve({ status: res.statusCode, data }); }
            });
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function main() {
    console.log('═══════════════════════════════════════════════════');
    console.log('🔗 Z-API WEBHOOK CONFIGURATION CHECK');
    console.log('═══════════════════════════════════════════════════\n');

    // 1. Check instance status
    console.log('1. Instance Status:');
    const status = await zapiRequest('GET', '/status');
    console.log('  ', JSON.stringify(status.data));

    // 2. Check current webhook URLs via different endpoints
    console.log('\n2. Webhook Delivery:');
    const delivery = await zapiRequest('GET', '/webhook-delivery');
    console.log('  ', JSON.stringify(delivery.data));

    console.log('\n3. Webhook On-Message-Received:');
    const onReceived = await zapiRequest('GET', '/on-message-received');
    console.log('  ', JSON.stringify(onReceived.data, null, 2));

    console.log('\n4. Webhook On-Message-Send:');
    const onSend = await zapiRequest('GET', '/on-message-send');
    console.log('  ', JSON.stringify(onSend.data, null, 2));

    console.log('\n5. Webhook On-Message-Status:');
    const onStatus = await zapiRequest('GET', '/on-message-status');
    console.log('  ', JSON.stringify(onStatus.data, null, 2));

    // 3. CHECK: Is on-message-send configured?
    const sendUrl = onSend.data?.webhookUrl || onSend.data?.value || onSend.data?.url || '';
    if (!sendUrl || sendUrl === '') {
        console.log('\n🚨 ON-MESSAGE-SEND WEBHOOK IS EMPTY!');
        console.log('   This is why messages sent from WhatsApp don\'t appear in the Hub.');
        console.log(`   Fixing: Setting webhook to ${WEBHOOK_URL}\n`);
        
        const fixResult = await zapiRequest('POST', '/update-webhook-send', {
            value: WEBHOOK_URL
        });
        console.log('   Fix result:', JSON.stringify(fixResult.data));
    } else {
        console.log(`\n✅ on-message-send webhook: ${sendUrl}`);
    }

    // 4. Also ensure on-message-received is set
    const recvUrl = onReceived.data?.webhookUrl || onReceived.data?.value || onReceived.data?.url || '';
    if (!recvUrl || recvUrl === '') {
        console.log('\n🚨 ON-MESSAGE-RECEIVED WEBHOOK IS ALSO EMPTY!');
        console.log(`   Fixing: Setting webhook to ${WEBHOOK_URL}\n`);
        
        const fixResult = await zapiRequest('POST', '/update-webhook-received', {
            value: WEBHOOK_URL
        });
        console.log('   Fix result:', JSON.stringify(fixResult.data));
    } else {
        console.log(`✅ on-message-received webhook: ${recvUrl}`);
    }

    // 5. Check delivery webhook
    const delUrl = delivery.data?.webhookUrl || delivery.data?.value || delivery.data?.url || '';
    if (delUrl) {
        console.log(`✅ delivery webhook: ${delUrl}`);
    }

    console.log('\n═══════════════════════════════════════════════════');
    console.log('DONE');
}

main().catch(console.error);
