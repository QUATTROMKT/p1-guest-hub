/**
 * Diagnostic: Check if Firestore data still exists and is accessible
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

async function diagnose() {
    console.log('🔑 Autenticando...');
    const token = await getAccessToken();
    console.log('✅ Token OK\n');

    // 1. Check if guests collection has data
    console.log('📊 1. Verificando coleção guests...');
    const guestsRes = await new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'firestore.googleapis.com',
            path: `/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents/guests?pageSize=5`,
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

    if (guestsRes.error) {
        console.log('❌ ERRO ao acessar Firestore:', JSON.stringify(guestsRes.error, null, 2));
    } else if (guestsRes.documents) {
        console.log(`✅ Firestore OK! Encontrados documentos. Primeiros 5:`);
        guestsRes.documents.forEach(doc => {
            const name = doc.fields?.name?.stringValue || '?';
            const phone = doc.fields?.phone?.stringValue || '?';
            console.log(`   - ${name} (${phone})`);
        });
    } else {
        console.log('⚠️  Resposta inesperada:', JSON.stringify(guestsRes).substring(0, 500));
    }

    // 2. Check Firestore rules
    console.log('\n📋 2. Verificando Firestore Rules...');
    const rulesRes = await new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'firestore.googleapis.com',
            path: `/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}`,
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
    console.log('   Database info:', JSON.stringify(rulesRes, null, 2));

    // 3. Check Firebase Auth settings (could be blocking)
    console.log('\n🔐 3. Check se o projeto está ativo...');
    const projectRes = await new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'firebase.googleapis.com',
            path: `/v1beta1/projects/${PROJECT_ID}`,
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
    console.log('   Project:', JSON.stringify(projectRes, null, 2));
}

diagnose().catch(console.error);
