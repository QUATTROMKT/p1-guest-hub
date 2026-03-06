/**
 * Aplica CORS no Firebase Storage usando credenciais do Firebase CLI
 * Compatible with CommonJS
 */
const { execSync } = require('child_process');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Firebase CLI stores credentials here on Windows
const configDir = path.join(os.homedir(), '.config', 'configstore');
const firebaseTokenFile = path.join(configDir, 'firebase-tools.json');

async function getAccessToken() {
  // Try to get token from Firebase CLI config
  if (fs.existsSync(firebaseTokenFile)) {
    const config = JSON.parse(fs.readFileSync(firebaseTokenFile, 'utf8'));
    const refreshToken = config?.tokens?.refresh_token;
    const clientId = config?.tokens?.client_id || '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
    const clientSecret = config?.tokens?.client_secret || 'j9iVZfS8kkCEFUPaAeJV0sAi';
    
    if (refreshToken) {
      console.log('🔑 Found Firebase CLI refresh token, exchanging for access token...');
      
      return new Promise((resolve, reject) => {
        const postData = `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}&client_id=${clientId}&client_secret=${clientSecret}`;
        
        const req = https.request({
          hostname: 'oauth2.googleapis.com',
          path: '/token',
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            const parsed = JSON.parse(data);
            if (parsed.access_token) {
              resolve(parsed.access_token);
            } else {
              reject(new Error('No access token in response: ' + data));
            }
          });
        });
        req.on('error', reject);
        req.write(postData);
        req.end();
      });
    }
  }
  throw new Error('Firebase CLI token not found. Run: npx firebase login');
}

async function setCors(accessToken) {
  const bucket = 'p1-hotel-painel.firebasestorage.app';
  const corsConfig = [
    {
      origin: ['*'],
      method: ['GET', 'HEAD', 'PUT', 'POST', 'DELETE'],
      responseHeader: ['Content-Type', 'Authorization', 'Content-Length', 'User-Agent', 'x-goog-resumable'],
      maxAgeSeconds: 3600
    }
  ];
  
  return new Promise((resolve, reject) => {
    const patchData = JSON.stringify({ cors: corsConfig });
    
    const req = https.request({
      hostname: 'storage.googleapis.com',
      path: `/storage/v1/b/${bucket}?fields=cors`,
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(patchData)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log('✅ CORS configurado com sucesso!');
          console.log('📋 Resposta:', data);
          resolve(data);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.write(patchData);
    req.end();
  });
}

async function main() {
  try {
    const token = await getAccessToken();
    console.log('✅ Token obtido com sucesso');
    await setCors(token);
  } catch (err) {
    console.error('❌ Erro:', err.message);
  }
  process.exit(0);
}

main();
