const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
initializeApp({ projectId: 'p1-hotel-painel' });
const db = getFirestore('p1hotel');

async function cleanupPhantoms() {
    const guestsSnap = await db.collection("guests").get();
    const allGuests = guestsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Detecta fantasmas: phone com mais de 13 digitos E nome "Hóspede (WhatsApp)"
    const phantoms = allGuests.filter(g => {
        const phone = (g.phone || "").replace(/\D/g, '');
        const isLid = phone.length > 13;
        const isGenericName = (g.name || "") === "Hóspede (WhatsApp)";
        return isLid && isGenericName;
    });

    console.log(`\n🔍 Encontrados ${phantoms.length} contatos fantasma (LID):\n`);

    if (phantoms.length === 0) {
        console.log("✅ Nenhum fantasma encontrado. Tudo limpo!");
        return;
    }

    for (const g of phantoms) {
        console.log(`  ❌ ${g.name} | Phone: ${g.phone} | ID: ${g.id}`);
    }

    console.log(`\n🗑️  Iniciando exclusão de ${phantoms.length} fantasmas...\n`);

    let deleted = 0;
    for (const g of phantoms) {
        try {
            // Exclui subcoleção de mensagens primeiro
            const msgsSnap = await db.collection("guests").doc(g.id).collection("messages").get();
            const batch = db.batch();
            msgsSnap.docs.forEach(msgDoc => batch.delete(msgDoc.ref));
            if (msgsSnap.docs.length > 0) await batch.commit();

            // Exclui o guest
            await db.collection("guests").doc(g.id).delete();
            deleted++;
            console.log(`  ✅ Excluído: ${g.phone} (${msgsSnap.docs.length} msgs removidas)`);
        } catch (err) {
            console.error(`  ⚠️  Erro ao excluir ${g.id}:`, err.message);
        }
    }

    console.log(`\n🎉 Limpeza concluída! ${deleted}/${phantoms.length} fantasmas removidos.`);
}

cleanupPhantoms().catch(console.error);
