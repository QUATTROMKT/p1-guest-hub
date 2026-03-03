const admin = require('firebase-admin');

// Use the local emulator if needed or connection string
admin.initializeApp({
    projectId: "p1hotel"
});

const db = admin.firestore();

async function checkGuest() {
    try {
        const snap = await db.collection('guests').where('phone', '==', '555599114969').get();
        if (snap.empty) {
            console.log("No guest found with that phone.");
        } else {
            console.log("Found guest:", snap.docs[0].id);
            const msgs = await db.collection('guests').doc(snap.docs[0].id).collection('messages').orderBy('createdAt', 'desc').limit(5).get();
            msgs.forEach(m => console.log(m.id, m.data()));
        }
    } catch (e) {
        console.error(e);
    }
}
checkGuest();
