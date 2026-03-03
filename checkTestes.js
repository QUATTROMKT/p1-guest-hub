// run this in browser console to check duplicates
import { collection, getDocs } from 'firebase/firestore';
import { db } from './src/services/chatService'; // adjust path if running locally

async function getTestes() {
    const snap = await getDocs(collection(db, "guests"));
    const testes = snap.docs.filter(d => d.data().name && d.data().name.toLowerCase().includes("teste"));
    console.log("Encontrados", testes.length, "contatos 'teste'");
    testes.forEach(t => console.log(t.id, t.data().name, t.data().phone));
}
getTestes();
