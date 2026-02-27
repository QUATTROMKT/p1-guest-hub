const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');

initializeApp();
const db = getFirestore('p1hotel');

async function check() {
    const snap = await db.collection('guests').get();
    const res = [];
    snap.docs.forEach(doc => {
        const data = doc.data();
        const name = data.name || "";
        if (name.includes('MARCELO') || name.includes('coordenador')) {
            res.push({ id: doc.id, name: name, phone: data.phone, lid: data.lid });
        }
    });
    fs.writeFileSync('./debug_res.json', JSON.stringify(res, null, 2));
}

check().then(() => console.log('done')).catch(e => console.error(e));
