import { initializeApp } from "firebase/app";
import { initializeFirestore, collection, addDoc, onSnapshot, query, orderBy, doc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

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
const storage = getStorage(app);

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

export const uploadFile = async (file: File): Promise<string> => {
  const storageRef = ref(storage, `uploads/${Date.now()}_${file.name}`);
  const snapshot = await uploadBytes(storageRef, file);
  return getDownloadURL(snapshot.ref);
};

export const sendMessage = async (
  guestId: string,
  phone: string,
  text: string,
  type: string = 'text',
  mediaUrl: string = '',
  agentName: string = 'Sistema'
) => {
  if (!text.trim() && !mediaUrl) return;

  // 1. SALVA NA TELA IMEDIATAMENTE
  await addDoc(collection(db, "guests", guestId, "messages"), {
    text,
    sender: 'agent',
    createdAt: serverTimestamp(),
    type,
    mediaUrl,
    agentName,
    status: 'sent'
  });

  await updateDoc(doc(db, "guests", guestId), {
    lastMessage: type === 'text' ? text : (type === 'audio' ? '🎤 Áudio enviado' : '📎 Arquivo enviado'),
    lastMessageTime: serverTimestamp()
  });

  // 2. MANDA PRO WHATSAPP
  try {
    const cleanPhone = phone.replace(/\D/g, '');
    let url = `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}/send-text`;
    let body: any = { phone: cleanPhone, message: text };

    if (type === 'image') {
      url = `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}/send-image`;
      body = { phone: cleanPhone, image: mediaUrl, caption: text };
    } else if (type === 'audio') {
      url = `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}/send-audio`;
      body = { phone: cleanPhone, audio: mediaUrl };
    } else if (type === 'video') {
      url = `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}/send-video`;
      body = { phone: cleanPhone, video: mediaUrl, caption: text };
    } else if (type === 'document') {
      const ext = mediaUrl.split('.').pop()?.split('?')[0] || 'pdf';
      url = `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}/send-document/${ext}`;
      body = { phone: cleanPhone, document: mediaUrl, fileName: text || 'Documento' };
    } else if (type === 'location') {
      // Assumindo que mediaUrl tem "lat,lng" ou algo assim, mas location geralmente é complexo
      // Se for location, vamos simplificar e mandar como link por enquanto se não tiver coords
      // Mas se tiver coords:
      // body = { phone: cleanPhone, latitude: ..., longitude: ..., title: 'Localização' }
    }

    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Client-Token': ZAPI_CLIENT_TOKEN
      },
      body: JSON.stringify(body)
    });
  } catch (error) {
    console.error("Erro Z-API:", error);
    alert("Erro ao enviar. Verifique conexão.");
  }
};

export const createGuest = async (data: any) => {
  const docRef = await addDoc(collection(db, "guests"), {
    ...data,
    createdAt: serverTimestamp(),
    lastMessageTime: serverTimestamp(),
    unreadCount: 0,
    status: 'lead' // default status
  });
  return docRef.id;
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