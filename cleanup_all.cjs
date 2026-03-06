/**
 * Cleanup: Remove phantom LID contacts and groups from Firestore
 * Uses Firebase CLI credentials (no gsutil/gcloud needed)
 */
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PROJECT_ID = 'p1-hotel-painel';
const DATABASE_ID = 'p1hotel';

// Get access token from Firebase CLI stored credentials
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

// Firestore REST API helper
async function firestoreRequest(token, method, path, body) {
    const basePath = `/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents`;
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'firestore.googleapis.com',
            path: basePath + path,
            method,
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
        };
        if (body) options.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(body));
        
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } catch { resolve(data); }
            });
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

// Get all guests using structured query
async function getAllGuests(token) {
    const guests = [];
    let pageToken = null;
    
    do {
        let url = `/guests?pageSize=300`;
        if (pageToken) url += `&pageToken=${pageToken}`;
        const res = await firestoreRequest(token, 'GET', url);
        
        if (res.documents) {
            for (const doc of res.documents) {
                const fields = doc.fields || {};
                const id = doc.name.split('/').pop();
                guests.push({
                    id,
                    docName: doc.name,
                    name: fields.name?.stringValue || '',
                    phone: fields.phone?.stringValue || '',
                    isGroup: fields.isGroup?.booleanValue || false,
                    status: fields.status?.stringValue || '',
                    tags: (fields.tags?.arrayValue?.values || []).map(v => v.stringValue),
                });
            }
        }
        pageToken = res.nextPageToken || null;
    } while (pageToken);
    
    return guests;
}

// Delete a document and its messages subcollection
async function deleteGuestAndMessages(token, guest) {
    // Get messages subcollection
    let msgCount = 0;
    try {
        const msgsRes = await firestoreRequest(token, 'GET', `/guests/${guest.id}/messages?pageSize=300`);
        if (msgsRes.documents) {
            for (const msgDoc of msgsRes.documents) {
                await firestoreRequest(token, 'DELETE', ``);
                // Use full path from document name
                const msgPath = msgDoc.name.replace(`projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents`, '');
                await new Promise((resolve, reject) => {
                    const req = https.request({
                        hostname: 'firestore.googleapis.com',
                        path: `/v1/${msgDoc.name}`,
                        method: 'DELETE',
                        headers: { 'Authorization': `Bearer ${token}` }
                    }, (res) => {
                        let d = '';
                        res.on('data', c => d += c);
                        res.on('end', () => resolve(d));
                    });
                    req.on('error', reject);
                    req.end();
                });
                msgCount++;
            }
        }
    } catch (e) { /* no messages */ }

    // Delete the guest document
    await new Promise((resolve, reject) => {
        const fullPath = `projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents/guests/${guest.id}`;
        const req = https.request({
            hostname: 'firestore.googleapis.com',
            path: `/v1/${fullPath}`,
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        }, (res) => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => resolve(d));
        });
        req.on('error', reject);
        req.end();
    });

    return msgCount;
}

function isValidBrazilianPhone(phone) {
    const digits = (phone || '').replace(/\D/g, '');
    return digits.length >= 10 && digits.length <= 13;
}

async function main() {
    console.log('🔑 Autenticando via Firebase CLI...');
    const token = await getAccessToken();
    console.log('✅ Token obtido\n');

    console.log('🔍 Buscando todos os guests...\n');
    const allGuests = await getAllGuests(token);
    console.log(`📊 Total de registros: ${allGuests.length}\n`);

    const groups = [];
    const phantomLids = [];
    const valid = [];

    for (const g of allGuests) {
        if (g.isGroup) {
            groups.push(g);
        } else if (!isValidBrazilianPhone(g.phone)) {
            phantomLids.push(g);
        } else {
            valid.push(g);
        }
    }

    console.log('═══════════════════════════════════════');
    console.log(`🏨 Contatos válidos: ${valid.length}`);
    console.log(`👥 Grupos: ${groups.length}`);
    console.log(`👻 Fantasmas (LID/inválidos): ${phantomLids.length}`);
    console.log('═══════════════════════════════════════\n');

    if (groups.length > 0) {
        console.log('👥 GRUPOS A EXCLUIR:');
        for (const g of groups) console.log(`   ❌ "${g.name}" | Phone: ${g.phone}`);
        console.log('');
    }

    if (phantomLids.length > 0) {
        console.log('👻 FANTASMAS A EXCLUIR:');
        for (const g of phantomLids) console.log(`   ❌ "${g.name}" | Phone: ${g.phone}`);
        console.log('');
    }

    const toDelete = [...groups, ...phantomLids];
    if (toDelete.length === 0) {
        console.log('✅ Nenhum registro para limpar!');
        return;
    }

    console.log(`🗑️  Excluindo ${toDelete.length} registros...\n`);

    let deleted = 0;
    for (const g of toDelete) {
        try {
            const msgCount = await deleteGuestAndMessages(token, g);
            deleted++;
            const icon = g.isGroup ? '👥' : '👻';
            console.log(`  ${icon} ✅ "${g.name}" excluído (${msgCount} msgs)`);
        } catch (err) {
            console.error(`  ⚠️  Erro "${g.name}":`, err.message);
        }
    }

    console.log(`\n🎉 Limpeza: ${deleted}/${toDelete.length} removidos. Restam ${valid.length} contatos válidos.`);
}

main().catch(console.error);
