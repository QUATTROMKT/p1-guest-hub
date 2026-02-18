import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";

admin.initializeApp();
const db = getFirestore("p1hotel");

export const zapiWebhook = functions.https.onRequest(async (req, res) => {
  try {
    const body = req.body;

    // --- REGRA DE BLOQUEIO INTELIGENTE ---
    // Se a mensagem foi enviada pela API (pelo sistema), ignora para não duplicar.
    // Mensagens enviadas pelo celular/WhatsApp Web (fromMe=true, fromApi=false) SÃO salvas.
    if (body.fromMe && body.fromApi) {
      res.status(200).send("Ignored (From API/System)");
      return;
    }

    // Determina o remetente: fromMe = enviada pelo celular/WhatsApp Web do hotel
    const isFromHotel = body.fromMe === true && body.fromApi === false;
    const senderType = isFromHotel ? "agent" : "guest";

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
      messageType = "video";
      mediaUrl = body.video.videoUrl || "";
      text = body.video.caption || "🎥 Vídeo";
    } else if (body.document) {
      messageType = "document";
      mediaUrl = body.document.documentUrl || "";
      text = body.document.fileName || "📄 Documento";
    } else if (body.sticker) {
      messageType = "sticker";
      text = "💟 Figurinha";
    } else if (body.location) {
      messageType = "location";
      mediaUrl = `https://maps.google.com/?q=${body.location.latitude},${body.location.longitude}`;
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

    // --- IDENTIFICAR O HÓSPEDE (OU GRUPO) ---
    const isGroup = body.isGroup === true;
    let targetPhone = "";
    let participantPhone = "";

    // Para mensagens fromMe, o chatName tem o nome do destinatário (hóspede)
    // Para mensagens de hóspedes, senderName tem o nome de quem enviou
    let guestName = isFromHotel
      ? (body.chatName || "Hóspede (WhatsApp)")
      : (body.senderName || body.chatName || "Hóspede (WhatsApp)");

    if (isGroup) {
      targetPhone = (body.phone || body.chatId || "").split('@')[0];
      participantPhone = body.participantPhone ? body.participantPhone.split('@')[0].replace(/\D/g, '') : "Desconhecido";

      if (!guestName.includes("Grupo")) {
        // Nome do grupo pode vir em chatName
      }
    } else {
      // Para mensagens fromMe, o phone pode vir como "155654571808281id"
      // Precisamos limpar corretamente
      const rawPhone = body.phone || body.sender || body.chatId || "";
      targetPhone = rawPhone.split('@')[0].replace(/\D/g, '').replace(/id$/i, '');
    }

    // Se não tiver telefone, aí sim é erro
    if (targetPhone.length < 5) {
      res.status(200).send("Ignored (No Phone)");
      return;
    }

    // --- SALVAR NO BANCO ---
    const guestsRef = db.collection("guests");
    const snapshot = await guestsRef.where("phone", "==", targetPhone).limit(1).get();
    let guestId = "";

    if (snapshot.empty) {
      // Cria novo
      const newGuest = await guestsRef.add({
        name: guestName,
        phone: targetPhone,
        avatar: body.photo || `https://ui-avatars.com/api/?name=${guestName}&background=random`,
        status: "lead",
        tags: ["WhatsApp"],
        lastMessage: text,
        lastMessageTime: admin.firestore.FieldValue.serverTimestamp(),
        unreadCount: isFromHotel ? 0 : 1, // Não marca como não lida se foi o hotel que enviou
        isGroup: isGroup,
        cpf: "", email: "", checkinDate: "", checkoutDate: ""
      });
      guestId = newGuest.id;
    } else {
      // Atualiza existente
      guestId = snapshot.docs[0].id;
      const updateData: any = {
        lastMessage: text,
        lastMessageTime: admin.firestore.FieldValue.serverTimestamp(),
      };
      // Só incrementa unread se for mensagem de hóspede (não do hotel)
      if (!isFromHotel) {
        updateData.unreadCount = admin.firestore.FieldValue.increment(1);
      }
      await guestsRef.doc(guestId).update(updateData);
    }

    // Salva a mensagem
    await db.collection("guests").doc(guestId).collection("messages").add({
      text: text,
      sender: senderType,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      type: messageType,
      mediaUrl: mediaUrl,
      status: "read",
      isGroup: isGroup,
      participantPhone: participantPhone || null,
      agentName: isFromHotel ? "Hotel (WhatsApp)" : undefined
    });

    res.status(200).send("OK");

  } catch (error) {
    console.error("Erro Fatal:", error);
    // Retorna OK pro Z-API não travar, mesmo com erro
    res.status(200).send("Error Handled");
  }
});