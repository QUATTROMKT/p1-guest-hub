/**
 * Diagnostic: Check if fromMe webhook events are being received and processed
 */
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PROJECT_ID = 'p1-hotel-painel';
const DATABASE_ID = 'p1hotel';

async function getAccessToken() {
    const configFile = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
    const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    const refreshToken = config?.tokens?.refresh_token;
    const clientId = config?.tokens?.client_id || '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
    const clientSecret = config?.tokens?.client_secret || 'j9iVZfS8kkCEFUPaAeJV0sAi';
    return new Promise((resolve, reject) => {
        const postData = `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}&client_id=${clientId}&client_secret=${clientSecret}`;
        const req = https.request({
            hostname: 'oauth2.googleapis.com', path: '/token', method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                const parsed = JSON.parse(data);
                parsed.access_token ? resolve(parsed.access_token) : reject(new Error(data));
            });
        });
        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

async function firestoreQuery(token, query) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify(query);
        const req = https.request({
            hostname: 'firestore.googleapis.com',
            path: `/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents:runQuery`,
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(data); } });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

async function main() {
    console.log('🔑 Autenticando...');
    const token = await getAccessToken();
    console.log('✅ OK\n');

    // 1. Check recent webhook_events (last 50)
    console.log('📋 1. Últimos 50 webhook_events:\n');
    const eventsRes = await firestoreQuery(token, {
        structuredQuery: {
            from: [{ collectionId: 'webhook_events' }],
            orderBy: [{ field: { fieldPath: 'receivedAt' }, direction: 'DESCENDING' }],
            limit: 50
        }
    });

    let fromMeCount = 0;
    let fromGuestCount = 0;
    let statusEvents = 0;
    let echoDetected = 0;
    let duplicateDetected = 0;
    let processedNormal = 0;
    let pending = 0;

    const fromMeEvents = [];

    if (Array.isArray(eventsRes)) {
        for (const result of eventsRes) {
            if (!result.document) continue;
            const fields = result.document.fields || {};
            const status = fields.status?.stringValue || '?';
            const payload = fields.payload?.mapValue?.fields || {};
            const isFromMe = payload.fromMe?.booleanValue === true;
            const text = payload.text?.mapValue?.fields?.message?.stringValue || 
                         payload.text?.stringValue || 
                         payload.body?.stringValue || '';
            const phone = payload.phone?.stringValue || payload.chatId?.stringValue || '?';

            if (isFromMe) {
                fromMeCount++;
                fromMeEvents.push({
                    id: result.document.name.split('/').pop(),
                    status,
                    phone: phone.substring(0, 15),
                    text: text.substring(0, 40),
                });
            } else {
                fromGuestCount++;
            }

            if (status === 'processed_echo') echoDetected++;
            else if (status === 'processed_duplicate') duplicateDetected++;
            else if (status === 'processed') processedNormal++;
            else if (status === 'pending') pending++;
            else if (status.includes('status') || status.includes('ignored')) statusEvents++;
        }
    }

    console.log(`   Total events: ${Array.isArray(eventsRes) ? eventsRes.filter(r => r.document).length : 0}`);
    console.log(`   fromMe (hotel): ${fromMeCount}`);
    console.log(`   fromGuest: ${fromGuestCount}`);
    console.log(`   Status events: ${statusEvents}`);
    console.log(`   ───────────────────`);
    console.log(`   Processed normal: ${processedNormal}`);
    console.log(`   Echo detected: ${echoDetected}`);
    console.log(`   Duplicate detected: ${duplicateDetected}`);
    console.log(`   Pending: ${pending}`);

    if (fromMeEvents.length > 0) {
        console.log(`\n📨 2. Eventos fromMe (hotel → hóspede via WhatsApp):\n`);
        for (const e of fromMeEvents.slice(0, 20)) {
            console.log(`   ${e.status.padEnd(25)} | ${e.phone.padEnd(15)} | "${e.text}"`);
        }
    } else {
        console.log('\n⚠️  NENHUM evento fromMe encontrado nos últimos 50 webhooks!');
        console.log('   Isso significa que o Z-API NÃO está enviando mensagens sent-by-me.');
        console.log('   Verificar: Z-API Panel → "Notify all messages sent by me" deve estar ✅');
    }

    // 3. Check if there are any recent "processed_echo" events that might be wrongly caught
    console.log('\n📊 3. Breakdown de status dos eventos:');
    const statusMap = {};
    if (Array.isArray(eventsRes)) {
        for (const result of eventsRes) {
            if (!result.document) continue;
            const s = result.document.fields?.status?.stringValue || '?';
            statusMap[s] = (statusMap[s] || 0) + 1;
        }
    }
    for (const [s, c] of Object.entries(statusMap)) {
        console.log(`   ${s}: ${c}`);
    }
}

main().catch(console.error);
