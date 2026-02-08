import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";

admin.initializeApp();
const db = getFirestore("p1hotel");

export const zapiWebhook = functions.https.onRequest(async (req, res) => {
  try {
    const body = req.body;

    // --- ÚNICA REGRA DE BLOQUEIO ---
    // Se a mensagem veio do sistema/hotel, ignora para não duplicar.
    // TUDO O RESTO ENTRA.
    if (body.fromMe) {
      res.status(200).send("Ignored (From Me)");
      return;
    }

    // Verificamos se é mídia primeiro para já capturar a URL
    let mediaUrl = "";
    let messageType = "text";
    let text = "";

    if (body.image) {
      messageType = "image";
      mediaUrl = body.image.imageUrl || "";
      text = body.image.caption || "📷 Imagem";
    } else if (body.audio) {
      messageType = "audio";
      mediaUrl = body.audio.audioUrl || "";
      text = "🎤 Áudio";
    } else if (body.video) {
      messageType = "video"; // Futuro
      text = "🎥 Vídeo";
    } else if (body.document) {
      messageType = "document";
      text = "📄 Documento";
    } else if (body.sticker) {
      messageType = "sticker";
      text = "💟 Figurinha";
    } else if (body.location) {
      messageType = "location";
      text = "📍 Localização";
    }

    // Se ainda não temos texto (e não é mídia com caption), tenta extrair do padrão de texto
    if (!text || (messageType === 'text' && !text)) {
      if (body.text && body.text.message) text = body.text.message;
      else if (typeof body.text === 'string') text = body.text;
      else if (typeof body.message === 'string') text = body.message;
      else if (typeof body.content === 'string') text = body.content;
      else if (body.caption) text = body.caption;
      else if (body.type === 'chat' && body.body) text = body.body;

      // Fallback final
      if (!text) text = "Mensagem Recebida";
    }

    // --- IDENTIFICAR O HÓSPEDE ---
    // Pega o telefone de qualquer campo possível
    const rawPhone = body.phone || body.sender || body.chatId || "";
    const targetPhone = rawPhone.split('@')[0].replace(/\D/g, '');
    const guestName = body.senderName || body.chatName || "Hóspede (WhatsApp)";

    // Se não tiver telefone, aí sim é erro
    if (targetPhone.length < 5) {
      res.status(200).send("Ignored (No Phone)");
      return;
    }

    // --- SALVAR NO BANCO (SEM FRESCURA) ---
    const guestsRef = db.collection("guests");
    const snapshot = await guestsRef.where("phone", "==", targetPhone).limit(1).get();
    let guestId = "";

    if (snapshot.empty) {
      // Cria novo
      const newGuest = await guestsRef.add({
        name: guestName,
        phone: targetPhone,
        avatar: body.photo || `https://ui-avatars.com/api/?name=${guestName}&background=random`,
        status: "lead", // Cria como Lead
        tags: ["WhatsApp"],
        lastMessage: text,
        lastMessageTime: admin.firestore.FieldValue.serverTimestamp(),
        unreadCount: 1,
        cpf: "", email: "", checkinDate: "", checkoutDate: ""
      });
      guestId = newGuest.id;
    } else {
      // Atualiza existente
      guestId = snapshot.docs[0].id;
      await guestsRef.doc(guestId).update({
        lastMessage: text,
        lastMessageTime: admin.firestore.FieldValue.serverTimestamp(),
        unreadCount: admin.firestore.FieldValue.increment(1)
      });
    }

    // Salva a mensagem
    await db.collection("guests").doc(guestId).collection("messages").add({
      text: text,
      sender: "guest",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      type: messageType,
      mediaUrl: mediaUrl,
      status: "read"
    });

    res.status(200).send("OK");

  } catch (error) {
    console.error("Erro Fatal:", error);
    // Retorna OK pro Z-API não travar, mesmo com erro
    res.status(200).send("Error Handled");
  }
});