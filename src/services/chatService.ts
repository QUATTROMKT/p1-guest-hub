import { initializeApp } from "firebase/app";
import { initializeFirestore, collection, addDoc, onSnapshot, query, orderBy, limit, doc, updateDoc, deleteDoc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
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
  const q = query(collection(db, "guests"), orderBy("lastMessageTime", "desc"), limit(3000));
  return onSnapshot(q, (snap) => {
    const guests = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    cb(guests);
  }, (error) => {
    console.error('[chatService] subscribeToGuests error:', error);
  });
};

export const subscribeToMessages = (guestId: string, cb: (data: any[]) => void) => {
  const q = query(collection(db, "guests", guestId, "messages"), orderBy("createdAt", "asc"));
  return onSnapshot(q, (snap) => {
    const messages = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    cb(messages);
  }, (error) => {
    console.error('[chatService] subscribeToMessages error for guest', guestId, ':', error);
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

  // Gera um ID local único que será usado como doc ID
  // O webhook do Z-API vai usar o messageId retornado — ao usar set(merge) no webhook
  // com o zapiId como doc ID, vai sobrescrever o doc existente sem duplicar.
  // Usamos um ID local temporário que começa com "local_" para fácil identificação.
  const localDocId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  // 1. SALVA NA TELA IMEDIATAMENTE com o ID local
  const messagesCol = collection(db, "guests", guestId, "messages");
  await setDoc(doc(messagesCol, localDocId), {
    text,
    sender: 'agent',
    createdAt: serverTimestamp(),
    type,
    mediaUrl,
    agentName,
    status: 'sent',
    localDocId, // marca para o webhook identificar e substituir
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
    }

    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Client-Token': ZAPI_CLIENT_TOKEN
      },
      body: JSON.stringify(body)
    }).then(async (response) => {
      const data = await response.json().catch(() => ({}));
      console.log('[Z-API] Status:', response.status, 'Response:', data);

      if (response.ok && data.messageId) {
        // Grava o zapiId instantaneamente para que Editar e Apagar funcionem logo após o envio
        try {
          await updateDoc(doc(db, "guests", guestId, "messages", localDocId), {
            zapiId: data.messageId
          });
        } catch (updateErr) {
          console.error("Erro ao gravar zapiId localmente:", updateErr);
        }
      }

      if (!response.ok) {
        console.error('[Z-API] Erro na resposta:', response.status, data);
      }
    });
  } catch (error) {
    console.error("Erro Z-API:", error);
    alert("Erro ao enviar. Verifique conexão.");
  }
};

export const revokeMessage = async (guestId: string, messageId: string, zapiId: string) => {
  if (zapiId) {
    try {
      // Z-API delete requires query params: messageId, phone, and owner=true
      // Note: phone needs to be the destination phone
      const guestSnap = await getDoc(doc(db, "guests", guestId));
      const phone = guestSnap.exists() ? guestSnap.data().phone : '';
      const cleanPhone = phone.replace(/\D/g, '');

      const url = `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}/messages?messageId=${zapiId}&phone=${cleanPhone}&owner=true`;
      await fetch(url, {
        method: 'DELETE',
        headers: {
          'Client-Token': ZAPI_CLIENT_TOKEN
        }
      });
    } catch (error) {
      console.error("Erro ao deletar na Z-API:", error);
    }
  }

  try {
    const msgRef = doc(db, "guests", guestId, "messages", messageId);
    await deleteDoc(msgRef);
  } catch (error) {
    console.error("Erro ao deletar local:", error);
  }
};

export const editMessage = async (guestId: string, messageId: string, zapiId: string, phone: string, newText: string) => {
  if (zapiId && phone) {
    try {
      const cleanPhone = phone.replace(/\D/g, '');
      const url = `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}/send-text`;
      await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Client-Token': ZAPI_CLIENT_TOKEN
        },
        body: JSON.stringify({
          phone: cleanPhone,
          message: newText,
          editMessageId: zapiId
        })
      });
    } catch (error) {
      console.error("Erro ao editar na Z-API:", error);
    }
  }

  try {
    const msgRef = doc(db, "guests", guestId, "messages", messageId);
    await updateDoc(msgRef, {
      text: newText,
      edited: true
    });
  } catch (error) {
    console.error("Erro ao editar local:", error);
  }
};

const getDeterministicId = (phone: string): string => {
  let p = (phone || "").replace(/\D/g, '');
  if (!p) return "";
  if (!p.startsWith("55") && p.length >= 10) {
    p = "55" + p;
  }
  if (p.startsWith("55") && p.length === 13 && p[4] === '9') {
    p = p.slice(0, 4) + p.slice(5);
  }
  return p;
};

export const createGuest = async (data: any) => {
  // Normaliza o telefone para apenas dígitos
  const phone = data.phone ? data.phone.replace(/\D/g, '') : '';
  const normalizedData = {
    ...data,
    phone: phone,
  };

  const deterministicId = getDeterministicId(phone);

  if (deterministicId) {
    const docRef = doc(db, "guests", deterministicId);
    await setDoc(docRef, {
      ...normalizedData,
      createdAt: serverTimestamp(),
      lastMessageTime: serverTimestamp(),
      unreadCount: 0,
      status: 'lead' // default status
    }, { merge: true });
    return deterministicId;
  } else {
    const docRef = await addDoc(collection(db, "guests"), {
      ...normalizedData,
      createdAt: serverTimestamp(),
      lastMessageTime: serverTimestamp(),
      unreadCount: 0,
      status: 'lead' // default status
    });
    return docRef.id;
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

// --- TAREFAS ---

export const subscribeToTasks = (cb: (data: any[]) => void) => {
  const q = query(collection(db, "tasks"), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => {
    const tasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    cb(tasks);
  });
};

export const createTask = async (data: any) => {
  const docRef = await addDoc(collection(db, "tasks"), {
    ...data,
    createdAt: serverTimestamp(),
    status: 'pending'
  });
  return docRef.id;
};

export const updateTask = async (taskId: string, data: any) => {
  const taskRef = doc(db, "tasks", taskId);
  await updateDoc(taskRef, data);
};

export const deleteTask = async (taskId: string) => {
  const taskRef = doc(db, "tasks", taskId);
  await deleteDoc(taskRef);
};