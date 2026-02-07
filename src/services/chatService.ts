import { initializeApp } from "firebase/app";
import { initializeFirestore, collection, addDoc, onSnapshot, query, orderBy, doc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, {}, "p1hotel");

const ZAPI_INSTANCE = import.meta.env.VITE_ZAPI_INSTANCE;
const ZAPI_TOKEN = import.meta.env.VITE_ZAPI_TOKEN;
const ZAPI_CLIENT_TOKEN = import.meta.env.VITE_ZAPI_CLIENT_TOKEN;

export const subscribeToGuests = (cb: (data: any[]) => void) => {
  const q = query(collection(db, "guests"), orderBy("lastMessageTime", "desc"));
  return onSnapshot(q, (snap) => {
    const guests = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    cb(guests);
  });
};

export const subscribeToMessages = (guestId: string, cb: (data: any[]) => void) => {
  const q = query(collection(db, "guests", guestId, "messages"), orderBy("createdAt", "asc"));
  return onSnapshot(q, (snap) => {
    const messages = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    cb(messages);
  });
};

export const sendMessage = async (guestId: string, phone: string, text: string) => {
  if (!text.trim()) return;

  // 1. SALVA NA TELA IMEDIATAMENTE (Sensação de rapidez)
  await addDoc(collection(db, "guests", guestId, "messages"), {
    text,
    sender: 'agent',
    createdAt: serverTimestamp(),
    type: 'text',
    status: 'sent' 
  });
  
  await updateDoc(doc(db, "guests", guestId), {
    lastMessage: text,
    lastMessageTime: serverTimestamp()
  });

  // 2. MANDA PRO WHATSAPP
  try {
    const cleanPhone = phone.replace(/\D/g, ''); 
    const url = `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}/send-text`;
    
    await fetch(url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        'Client-Token': ZAPI_CLIENT_TOKEN 
      },
      body: JSON.stringify({ phone: cleanPhone, message: text })
    });
  } catch (error) {
    console.error("Erro Z-API:", error);
    alert("Erro ao enviar. Verifique conexão.");
  }
};

export const updateGuest = async (guestId: string, data: any) => {
  const guestRef = doc(db, "guests", guestId);
  await updateDoc(guestRef, data);
};

export const deleteGuest = async (guestId: string) => {
  const guestRef = doc(db, "guests", guestId);
  await deleteDoc(guestRef);
};

export const markAsRead = async (guestId: string) => {
  const guestRef = doc(db, "guests", guestId);
  await updateDoc(guestRef, { unreadCount: 0 });
};