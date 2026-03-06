/**
 * Reset: Zera unreadCount de todos os guests (faz o dashboard parecer "novo")
 * Não apaga nenhum dado — apenas marca tudo como "lido"
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

async function firestorePatch(token, docName, fields) {
    const updateMask = Object.keys(fields).map(k => `updateMask.fieldPaths=${k}`).join('&');
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({ fields });
        const req = https.request({
            hostname: 'firestore.googleapis.com',
            path: `/v1/${docName}?${updateMask}`,
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

async function main() {
    console.log('🔑 Autenticando...');
    const token = await getAccessToken();
    console.log('✅ Token obtido\n');

    // Get all guests
    let allGuests = [];
    let pageToken = null;
    do {
        let url = `/guests?pageSize=300`;
        if (pageToken) url += `&pageToken=${pageToken}`;
        const res = await firestoreGet(token, url);
        if (res.documents) {
            for (const doc of res.documents) {
                const unread = doc.fields?.unreadCount?.integerValue || '0';
                if (parseInt(unread) > 0) {
                    allGuests.push({ docName: doc.name, name: doc.fields?.name?.stringValue || '?', unread: parseInt(unread) });
                }
            }
        }
        pageToken = res.nextPageToken || null;
    } while (pageToken);

    console.log(`📊 Encontrados ${allGuests.length} contatos com mensagens não lidas\n`);

    if (allGuests.length === 0) {
        console.log('✅ Tudo já está zerado!');
        return;
    }

    let total = 0;
    for (const g of allGuests) {
        await firestorePatch(token, g.docName, { unreadCount: { integerValue: '0' } });
        total++;
        if (total % 20 === 0) console.log(`  ⏳ ${total}/${allGuests.length} resetados...`);
    }

    console.log(`\n🎉 Reset concluído! ${total} contatos tiveram unreadCount zerado.`);
    console.log('   O dashboard agora mostra "Não Lidas: 0"');
}

main().catch(console.error);
