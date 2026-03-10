/**
 * COMPREHENSIVE diagnostic: Check everything that could cause message sync issues
 * - Recent webhook events status
 * - fromMe vs fromGuest breakdown
 * - Specific guest check (Cadu - 555599780132)
 * - Pending/stuck events
 * - Z-API webhook config check
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

async function firestoreGet(token, path) {
    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'firestore.googleapis.com',
            path: `/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents${path}`,
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(data); } });
        });
        req.on('error', reject);
        req.end();
    });
}

async function main() {
    console.log('🔑 Autenticando...');
    const token = await getAccessToken();
    console.log('✅ OK\n');

    // 1. Check LAST 100 webhook events
    console.log('═══════════════════════════════════════════════════');
    console.log('📋 1. ÚLTIMOS 100 WEBHOOK EVENTS');
    console.log('═══════════════════════════════════════════════════\n');
    
    const eventsRes = await firestoreQuery(token, {
        structuredQuery: {
            from: [{ collectionId: 'webhook_events' }],
            orderBy: [{ field: { fieldPath: 'receivedAt' }, direction: 'DESCENDING' }],
            limit: 100
        }
    });

    const statusMap = {};
    let fromMeTotal = 0, fromGuestTotal = 0;
    const fromMeEvents = [];
    const failedEvents = [];
    const pendingEvents = [];
    let todayEvents = 0;

    const today = new Date().toISOString().split('T')[0]; // 2026-03-10

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
            const receivedAt = fields.receivedAt?.timestampValue || '';
            const isToday = receivedAt.startsWith(today) || receivedAt.startsWith('2026-03-10');
            
            if (isToday) todayEvents++;
            statusMap[status] = (statusMap[status] || 0) + 1;

            if (isFromMe) {
                fromMeTotal++;
                fromMeEvents.push({ 
                    status, 
                    phone: phone.substring(0, 18), 
                    text: text.substring(0, 50),
                    time: receivedAt.substring(11, 19),
                    docId: result.document.name.split('/').pop()
                });
            } else {
                fromGuestTotal++;
            }

            if (status === 'pending') pendingEvents.push({ phone, text: text.substring(0, 40), time: receivedAt });
            if (status.includes('error') || status.includes('fail')) failedEvents.push({ status, phone, text: text.substring(0, 40) });
        }
    }

    console.log(`Total events (last 100): ${Array.isArray(eventsRes) ? eventsRes.filter(r => r.document).length : 0}`);
    console.log(`Eventos de hoje: ${todayEvents}`);
    console.log(`fromMe (hotel): ${fromMeTotal}`);
    console.log(`fromGuest: ${fromGuestTotal}`);
    console.log(`\nBreakdown por status:`);
    for (const [s, c] of Object.entries(statusMap).sort((a, b) => b[1] - a[1])) {
        const emoji = s === 'processed' ? '✅' : s.includes('echo') ? '🔄' : s.includes('ignored') ? '❌' : s === 'pending' ? '⏳' : '📌';
        console.log(`  ${emoji} ${s}: ${c}`);
    }

    // 2. fromMe events detail
    console.log('\n═══════════════════════════════════════════════════');
    console.log('📨 2. TODOS OS EVENTOS fromMe (hotel → WhatsApp):');
    console.log('═══════════════════════════════════════════════════\n');
    
    for (const e of fromMeEvents) {
        const statusIcon = e.status === 'processed' ? '✅' : e.status.includes('echo') ? '🔄' : e.status.includes('ignored') ? '❌' : e.status.includes('no_match') ? '⚠️' : '📌';
        console.log(`  ${statusIcon} [${e.time}] ${e.status.padEnd(28)} | ${e.phone.padEnd(18)} | "${e.text}"`);
    }

    // 3. Pending events
    if (pendingEvents.length > 0) {
        console.log('\n🚨 PENDING EVENTS (stuck):');
        for (const e of pendingEvents) console.log(`  ⏳ ${e.phone} | "${e.text}" | ${e.time}`);
    }

    // 4. Check Cadu specifically
    console.log('\n═══════════════════════════════════════════════════');
    console.log('👤 3. VERIFICANDO CONTATO CADU (555599780132):');
    console.log('═══════════════════════════════════════════════════\n');
    
    const caduRes = await firestoreQuery(token, {
        structuredQuery: {
            from: [{ collectionId: 'guests' }],
            where: {
                fieldFilter: {
                    field: { fieldPath: 'phone' },
                    op: 'EQUAL',
                    value: { stringValue: '555599780132' }
                }
            },
            limit: 5
        }
    });

    if (Array.isArray(caduRes) && caduRes[0]?.document) {
        const doc = caduRes[0].document;
        const f = doc.fields;
        const guestId = doc.name.split('/').pop();
        console.log(`  ID: ${guestId}`);
        console.log(`  Nome: ${f?.name?.stringValue}`);
        console.log(`  Phone: ${f?.phone?.stringValue}`);
        console.log(`  LID: ${f?.lid?.stringValue || 'VAZIO ⚠️'}`);
        console.log(`  Status: ${f?.status?.stringValue}`);
        console.log(`  lastMessage: ${f?.lastMessage?.stringValue?.substring(0, 50)}`);

        // Check recent messages for Cadu
        console.log(`\n  📩 Últimas 10 mensagens de Cadu:`);
        const msgsRes = await firestoreGet(token, `/guests/${guestId}/messages?pageSize=10&orderBy=createdAt%20desc`);
        if (msgsRes.documents) {
            for (const msg of msgsRes.documents) {
                const mf = msg.fields;
                const sender = mf?.sender?.stringValue || '?';
                const text = mf?.text?.stringValue?.substring(0, 50) || '';
                const time = mf?.createdAt?.timestampValue?.substring(11, 19) || '?';
                const icon = sender === 'agent' ? '🟢' : '⚪';
                console.log(`    ${icon} [${time}] ${sender.padEnd(6)} | "${text}"`);
            }
        }
    } else {
        console.log('  ⚠️ Cadu não encontrado pelo phone 555599780132');
    }

    // 5. Check Z-API webhook config
    console.log('\n═══════════════════════════════════════════════════');
    console.log('🔗 4. VERIFICANDO Z-API WEBHOOK CONFIG:');
    console.log('═══════════════════════════════════════════════════\n');
    
    // Read Z-API credentials from .env
    try {
        const envContent = fs.readFileSync(path.join(process.cwd(), '.env'), 'utf8');
        const instanceMatch = envContent.match(/VITE_ZAPI_INSTANCE=(.+)/);
        const tokenMatch = envContent.match(/VITE_ZAPI_TOKEN=(.+)/);
        const clientMatch = envContent.match(/VITE_ZAPI_CLIENT_TOKEN=(.+)/);
        
        if (instanceMatch && tokenMatch && clientMatch) {
            const instance = instanceMatch[1].trim();
            const zapiToken = tokenMatch[1].trim();
            const clientToken = clientMatch[1].trim();
            
            // Get webhook config
            const webhookRes = await new Promise((resolve, reject) => {
                const req = https.request({
                    hostname: 'api.z-api.io',
                    path: `/instances/${instance}/token/${zapiToken}/webhooks`,
                    method: 'GET',
                    headers: { 'Client-Token': clientToken }
                }, (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(data); } });
                });
                req.on('error', reject);
                req.end();
            });
            
            console.log(JSON.stringify(webhookRes, null, 2));
        }
    } catch (e) {
        console.log('  ⚠️ Não consegui ler .env:', e.message);
    }
}

main().catch(console.error);
