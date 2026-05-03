const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp();
const db = getFirestore('p1hotel');

async function check() {
    const snap = await db.collection('guests').get();
    const res = [];
    snap.docs.forEach(doc => {
        const data = doc.data();
        const name = (data.name || "").toLowerCase();
        if (name.includes('cadu') || name.includes('fê') || name.includes('fe')) {
            res.push({ id: doc.id, name: data.name, phone: data.phone, lid: data.lid, unreadCount: data.unreadCount, isGroup: data.isGroup });
        }
    });
    console.log(JSON.stringify(res, null, 2));
    
    // Also check messages for Fê
    const feDoc = res.find(r => (r.name || "").toLowerCase() === 'fê' || (r.name || "").toLowerCase() === 'fe');
    if (feDoc) {
        const msgs = await db.collection('guests').doc(feDoc.id).collection('messages').get();
        console.log("Fê messages count:", msgs.docs.length);
        if (msgs.docs.length > 0) {
           console.log("Sample msg:", msgs.docs[0].data());
        }
    }
}

check().then(() => console.log('done')).catch(e => console.error(e));
