const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
initializeApp();
const db = getFirestore('p1hotel');

async function checkDuplicates() {
    const guestsSnap = await db.collection("guests").get();
    const allGuests = guestsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const phoneCount = {};
    for (const g of allGuests) {
        if (!g.phone) continue;
        let p = g.phone;
        if (p.startsWith('55') && p.length > 10) p = p.substring(2);

        if (!phoneCount[p]) phoneCount[p] = [];
        phoneCount[p].push(g);
    }

    for (const [phone, list] of Object.entries(phoneCount)) {
        if (list.length > 1) {
            console.log(`\nPhone: ${phone} has ${list.length} entries`);
            for (const g of list) {
                console.log(`  ID: ${g.id} | Name: ${g.name} | Phone: ${g.phone} | LastMsg: ${g.lastMessage}`);
            }
        }
    }
}

checkDuplicates().catch(console.error);
