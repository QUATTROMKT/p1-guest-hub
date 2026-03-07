const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

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

async function main() {
    const token = await getAccessToken();
    
    // Get the active Firestore ruleset content
    const ruleContent = await new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'firebaserules.googleapis.com',
            path: `/v1/projects/p1-hotel-painel/rulesets/e26c46e8-2675-4cb4-b63b-983d17566de4`,
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

    if (ruleContent.source && ruleContent.source.files) {
        for (const file of ruleContent.source.files) {
            console.log(`📄 ${file.name}:`);
            console.log('═'.repeat(60));
            console.log(file.content);
            console.log('═'.repeat(60));
            
            if (file.content.includes('timestamp.date') || file.content.includes('2026')) {
                console.log('\n🚨 TIME-BASED RULE FOUND! This is likely expired!');
            }
        }
    } else {
        console.log(JSON.stringify(ruleContent, null, 2));
    }
}

main().catch(console.error);
