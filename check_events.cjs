const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp();
const db = getFirestore('p1hotel');

async function check() {
    const snap = await db.collection('webhook_events')
      .orderBy('receivedAt', 'desc')
      .limit(30)
      .get();
      
    snap.docs.forEach(doc => {
        const payload = doc.data().payload || {};
        const hasContent = payload.text || payload.image || payload.audio || payload.video || payload.document || payload.sticker || payload.location;
        if (!hasContent) {
            console.log("Found event with no content:", doc.id);
            console.log(JSON.stringify(payload, null, 2));
        }
    });
}
check().catch(console.error);
