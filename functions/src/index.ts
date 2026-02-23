import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";

admin.initializeApp();
const db = getFirestore("p1hotel");
db.settings({ ignoreUndefinedProperties: true });

export const zapiWebhook = functions.https.onRequest(async (req, res) => {
  try {
    const body = req.body;
    console.log("[Webhook] Full Body:", JSON.stringify(body, null, 2));


    // --- REGRA DE BLOQUEIO DE STATUS E NOTIFICAÇÕES ---
    // Se for uma notificação de status (RECEIVED, READ, etc), ignora.
    if (body.status || body.connectedPhone) {
      if (!body.text && !body.image && !body.audio && !body.video && !body.document) {
        res.status(200).send("Ignored (Status Update)");
        return;
      }
    }

    // --- REGRA DE BLOQUEIO INTELIGENTE ---
    // Se a mensagem foi enviada pela API (pelo sistema), ignora para não duplicar.
    // Mensagens enviadas pelo celular/WhatsApp Web (fromMe=true, fromApi=false) SÃO salvas.
    if (body.fromMe && body.fromApi) {
      res.status(200).send("Ignored (From API/System)");
      return;
    }

    // Determina o remetente: fromMe = enviada pelo celular/WhatsApp Web do hotel
    const isFromHotel = body.fromMe === true; // Removemos check de fromApi aqui para aceitar do celular
    const senderType = isFromHotel ? "agent" : "guest";

    // ... (rest of media handling code) ...
    // [Note: I'll keep the existing media handling block as is, just updating the context around it]

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
    let participantPhone = (body.participantPhone || "").replace(/\D/g, '').replace(/id$/i, '') || "Desconhecido";

    // normaliza telefone para apenas dígitos
    const normalizePhone = (p: string): string => p.replace(/\D/g, '').replace(/id$/i, '');

    // Extrai LID se disponível
    const rawLid = body.chatLid || body.participantLid || (body.phone && body.phone.includes("@lid") ? body.phone : "") || "";
    const lid = normalizePhone(rawLid);

    // Para mensagens fromMe, o chatName tem o nome do destinatário (hóspede)
    // Para mensagens de hóspedes, senderName tem o nome de quem enviou
    let guestName = isFromHotel
      ? (body.chatName || "Hóspede (WhatsApp)")
      : (body.senderName || body.chatName || "Hóspede (WhatsApp)");

    // Sanitiza nome: se parecer um chatId cru (ex: "274049146044619@lid"), usa fallback
    if (guestName.includes("@") || /^\d{10,}$/.test(guestName)) {
      guestName = "Hóspede (WhatsApp)";
    }

    if (isGroup) {
      targetPhone = normalizePhone((body.phone || body.chatId || "").split('@')[0]);
    } else {
      const rawPhone = body.phone || body.sender || body.chatId || "";
      targetPhone = normalizePhone(rawPhone.split('@')[0]);
    }

    console.log("[Webhook] Raw body.phone:", body.phone, "| Parsed targetPhone:", targetPhone, "| LID:", lid, "| fromMe:", body.fromMe);

    // Se não tiver telefone, aí sim é erro
    if (targetPhone.length < 5) {
      console.log("[Webhook] Ignored - phone too short:", targetPhone);
      res.status(200).send("Ignored (No Phone)");
      return;
    }

    // --- SALVAR NO BANCO (com busca flexível de telefone e LID) ---
    const guestsRef = db.collection("guests");

    // Helper: verifica se dois telefones são o mesmo (com normalização brasileira)
    const phonesMatch = (stored: string, incoming: string): boolean => {
      const a = normalizePhone(stored);
      const b = normalizePhone(incoming);
      if (!a || !b || a.length < 8 || b.length < 8) return false;
      if (a === b) return true;

      const stripCountry = (p: string) => p.startsWith("55") && p.length > 10 ? p.substring(2) : p;
      const aLocal = stripCountry(a);
      const bLocal = stripCountry(b);
      if (aLocal === bLocal) return true;

      const strip9thDigit = (p: string) => (p.length === 11 && p[2] === '9') ? p.slice(0, 2) + p.slice(3) : p;
      const add9thDigit = (p: string) => (p.length === 10) ? p.slice(0, 2) + '9' + p.slice(2) : p;

      if (strip9thDigit(aLocal) === strip9thDigit(bLocal)) return true;
      if (add9thDigit(aLocal) === bLocal || aLocal === add9thDigit(bLocal)) return true;
      if (strip9thDigit(aLocal) === bLocal || aLocal === strip9thDigit(bLocal)) return true;
      if (a.slice(-8) === b.slice(-8)) return true;

      return false;
    };

    let guestId = "";
    let matchedDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;

    const phoneVariants: string[] = [targetPhone];
    if (targetPhone.startsWith("55") && targetPhone.length > 10) phoneVariants.push(targetPhone.substring(2));
    if (!targetPhone.startsWith("55")) phoneVariants.push("55" + targetPhone);

    for (const variant of phoneVariants) {
      const snap = await guestsRef.where("phone", "==", variant).limit(1).get();
      if (!snap.empty) { matchedDoc = snap.docs[0]; break; }
    }

    const matchedIsBad = matchedDoc && (matchedDoc.data().phone.length > 14 || !matchedDoc.data().phone.startsWith("55"));
    if ((!matchedDoc || matchedIsBad) && lid.length > 5) {
      const snapLid = await guestsRef.where("lid", "==", lid).get();
      const goodGuest = snapLid.docs.find(d => {
        const p = d.data().phone || "";
        return p.startsWith("55") && p.length >= 10 && p.length <= 13;
      });
      if (goodGuest) matchedDoc = goodGuest;
      else if (!matchedDoc && snapLid.docs.length > 0) matchedDoc = snapLid.docs[0];
    }

    if (!matchedDoc) {
      const allGuests = await guestsRef.get();
      for (const doc of allGuests.docs) {
        if (phonesMatch(doc.data().phone || "", targetPhone) || (lid && lid === doc.data().lid)) {
          matchedDoc = doc;
          if (phonesMatch(doc.data().phone || "", targetPhone) && doc.data().phone !== targetPhone) {
            await guestsRef.doc(doc.id).update({ phone: targetPhone });
          }
          break;
        }
      }
    }

    if (!matchedDoc) {
      const newGuest = await guestsRef.add({
        name: guestName, phone: targetPhone, lid: lid,
        avatar: body.photo || `https://ui-avatars.com/api/?name=${guestName}&background=random`,
        status: "lead", tags: ["WhatsApp"], lastMessage: text,
        lastMessageTime: admin.firestore.FieldValue.serverTimestamp(),
        unreadCount: isFromHotel ? 0 : 1, isGroup: isGroup,
        cpf: "", email: "", checkinDate: "", checkoutDate: ""
      });
      guestId = newGuest.id;
    } else {
      guestId = matchedDoc.id;
      const docData = matchedDoc.data();
      const updateData: any = {
        lastMessage: text,
        lastMessageTime: admin.firestore.FieldValue.serverTimestamp(),
      };
      if (lid && !docData.lid) updateData.lid = lid;
      const storedPhone = docData.phone || "";
      const incomingIsValid = targetPhone.startsWith("55") && targetPhone.length >= 10 && targetPhone.length <= 13;
      const storedIsLidOrBad = storedPhone.length > 14 || !storedPhone.startsWith("55") || storedPhone.includes("@");
      if (incomingIsValid && (storedIsLidOrBad || !storedPhone)) updateData.phone = targetPhone;
      if (!isFromHotel) updateData.unreadCount = admin.firestore.FieldValue.increment(1);
      await guestsRef.doc(guestId).update(updateData);
    }

    // --- SALVAR A MENSAGEM COM DE-DUPLICAÇÃO ---
    const messageId = body.messageId || `internal_${Date.now()}`;
    await db.collection("guests").doc(guestId).collection("messages").doc(messageId).set({
      text: text,
      sender: senderType,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      type: messageType,
      mediaUrl: mediaUrl,
      status: "read",
      isGroup: isGroup,
      participantPhone: participantPhone === "Desconhecido" ? null : participantPhone,
      agentName: isFromHotel ? "Hotel (WhatsApp)" : undefined,
      zapiId: body.messageId || null
    }, { merge: true });

    res.status(200).send("OK");

  } catch (error) {
    console.error("Erro Fatal:", error);
    // Retorna OK pro Z-API não travar, mesmo com erro
    res.status(200).send("Error Handled");
  }
});
