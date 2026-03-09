import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { onDocumentCreated } from "firebase-functions/v2/firestore";

admin.initializeApp();
const db = getFirestore("p1hotel");
db.settings({ ignoreUndefinedProperties: true });

// Helpers globais
const normalizePhone = (p: string): string => (p || "").replace(/\D/g, '').replace(/id$/i, '');

// Valida se é um telefone brasileiro real (10–13 dígitos, com DDI 55)
// Rejeita LIDs do WhatsApp (números internos longos tipo 206279811873824)
const isValidBrazilianPhone = (phone: string): boolean => {
  const clean = (phone || "").replace(/\D/g, '');
  if (!clean) return false;
  // Telefone brasileiro: 10-13 dígitos, deve começar com 55 ou ter 10-11 dígitos locais
  if (clean.startsWith("55")) {
    return clean.length >= 12 && clean.length <= 13;
  }
  // Sem DDI: 10-11 dígitos (DDD + número)
  return clean.length >= 10 && clean.length <= 11;
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

export const zapiWebhook = functions.https.onRequest(async (req, res) => {
  try {
    const body = req.body;
    console.log("[Webhook Fast Receiver] Body received. Generating event ID.");

    // Ignorar eventos de status puro (delivery ack, read receipts, connection events)
    // que NÃO contêm conteúdo de mensagem
    const hasContent = body.text || body.image || body.audio || body.video || body.document 
      || body.imageUrl || body.audioUrl || body.videoUrl || body.documentUrl 
      || body.sticker || body.location || body.messageId;
    const isStatusEvent = (body.status && !body.fromMe && !hasContent) || (body.connectedPhone && !hasContent);
    if (isStatusEvent) {
      res.status(200).send("Ignored (Status/Connection Event)");
      return;
    }

    const messageId = body.messageId || `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    await db.collection("webhook_events").doc(messageId).set({
      payload: body,
      receivedAt: admin.firestore.FieldValue.serverTimestamp(),
      status: "pending"
    }, { merge: true });

    console.log(`[Webhook Fast Receiver] Event ${messageId} queued successfully.`);
    res.status(200).send("OK Webhook Queued");
  } catch (error) {
    console.error("[Webhook Fast Receiver] Error:", error);
    res.status(500).send("Error Queueing Webhook");
  }
});

export const processZapiWebhook = onDocumentCreated({
  document: "webhook_events/{eventId}",
  database: "p1hotel"
}, async (event) => {
  try {
    const snap = event.data;
    if (!snap) return;

    const eventId = event.params.eventId;
    const data = snap.data();
    const body = data.payload;

    console.log(`[Webhook Processor] Processing event ${eventId}`);

    // Ignorar eventos de status puro (delivery ack, read receipts, connection events)
    const hasContent = body.text || body.image || body.audio || body.video || body.document
      || body.imageUrl || body.audioUrl || body.videoUrl || body.documentUrl
      || body.sticker || body.location || body.messageId;
    const isStatusEvent = (body.status && !body.fromMe && !hasContent) || (body.connectedPhone && !hasContent);
    if (isStatusEvent) {
      console.log(`[Webhook Processor] Ignored status/connection event ${eventId}`);
      await snap.ref.update({ status: "processed_status_event", processedAt: admin.firestore.FieldValue.serverTimestamp() });
      return;
    }

    const isFromHotel = body.fromMe === true;
    const senderType = isFromHotel ? "agent" : "guest";

    let mediaUrl = "";
    let messageType = "text";
    let text = "";

    if (body.image || body.imageUrl || body.type === 'IMAGE') {
      messageType = "image";
      mediaUrl = body.imageUrl || (body.image && (body.image.imageUrl || body.image.url)) || "";
      text = body.caption || (body.image && body.image.caption) || "📷 Imagem";
    } else if (body.audio || body.audioUrl || body.type === 'AUDIO') {
      messageType = "audio";
      mediaUrl = body.audioUrl || (body.audio && (body.audio.audioUrl || body.audio.url)) || "";
      text = "🎤 Áudio";
    } else if (body.video || body.videoUrl || body.type === 'VIDEO') {
      messageType = "video";
      mediaUrl = body.videoUrl || (body.video && (body.video.videoUrl || body.video.url)) || "";
      text = body.caption || (body.video && body.video.caption) || "🎥 Vídeo";
    } else if (body.document || body.documentUrl || body.type === 'DOCUMENT') {
      messageType = "document";
      mediaUrl = body.documentUrl || (body.document && (body.document.documentUrl || body.document.url || body.document.document)) || "";
      text = body.fileName || (body.document && (body.document.fileName || body.document.title)) || "📄 Documento";
    } else if (body.sticker || body.type === 'STICKER') {
      messageType = "sticker";
      text = "💟 Figurinha";
    } else if (body.location || body.type === 'LOCATION') {
      messageType = "location";
      const lat = body.location?.latitude || "";
      const lng = body.location?.longitude || "";
      mediaUrl = (lat && lng) ? `https://maps.google.com/?q=${lat},${lng}` : "";
      text = "📍 Localização";
    }

    if (!text || (messageType === 'text' && !text)) {
      if (body.text && body.text.message) text = body.text.message;
      else if (typeof body.text === 'string') text = body.text;
      else if (typeof body.message === 'string') text = body.message;
      else if (typeof body.content === 'string') text = body.content;
      else if (body.caption) text = body.caption;
      else if (body.type === 'chat' && body.body) text = body.body;
      if (!text) text = "Mensagem Recebida";
    }

    const isGroup = body.isGroup === true;

    // GRUPOS: Ignorar completamente - o sistema opera apenas com contatos individuais
    if (isGroup) {
      console.log(`[Webhook Processor] Group message ignored.`);
      await snap.ref.update({ status: "processed_group_ignored", processedAt: admin.firestore.FieldValue.serverTimestamp() });
      return;
    }

    let targetPhone = "";
    let participantPhone = normalizePhone(body.participantPhone || "");
    if (!participantPhone) participantPhone = "Desconhecido";
    const participantName = isGroup ? (body.senderName || "") : "";

    const rawLid = body.chatLid || body.participantLid || (body.phone && body.phone.includes("@lid") ? body.phone : "") || "";
    let lid = normalizePhone(rawLid);
    // Se o targetPhone é um LID (>13 dígitos), usá-lo também como lid para busca
    if (targetPhone.length > 13 && !lid) {
      lid = targetPhone;
    }

    let guestName = isFromHotel
      ? (body.chatName || "Hóspede (WhatsApp)")
      : (body.senderName || body.chatName || "Hóspede (WhatsApp)");

    if (guestName.includes("@") || /^\d{10,}$/.test(guestName)) {
      guestName = "Hóspede (WhatsApp)";
    }

    const messageTime = body.momment ? admin.firestore.Timestamp.fromMillis(body.momment) : admin.firestore.FieldValue.serverTimestamp();

    if (isGroup) {
      targetPhone = normalizePhone((body.phone || body.chatId || "").split('@')[0]);
    } else {
      const rawPhone = body.phone || body.sender || body.chatId || "";
      targetPhone = normalizePhone(rawPhone.split('@')[0]);
    }

    if (targetPhone.length < 5) {
      console.log("[Webhook Processor] Ignored - phone too short:", targetPhone);
      return;
    }

    // CRÍTICO: Rejeitar LIDs do WhatsApp (números internos longos)
    // LIDs são IDs internos do WhatsApp tipo 206279811873824 (15+ dígitos)
    // Telefones brasileiros reais: 12-13 dígitos com DDI, ou 10-11 sem DDI
    // PORÉM: mensagens fromMe (hotel) com LID devem ser processadas — buscamos o guest pelo LID
    if (targetPhone.length > 13 && !isGroup) {
      if (!isFromHotel) {
        // Mensagem de hóspede com LID: rejeitar (criaria contato fantasma)
        console.log(`[Webhook Processor] Ignored - LID/internal number from guest: ${targetPhone}`);
        await snap.ref.update({ status: "processed_lid_ignored", processedAt: admin.firestore.FieldValue.serverTimestamp() });
        return;
      }
      // Mensagem fromMe com LID: usar o LID para encontrar o guest
      console.log(`[Webhook Processor] fromMe with LID phone ${targetPhone}, attempting LID-based guest lookup...`);
      // targetPhone é o LID — guardar para busca mas não usar como phone de contato
    }

    const guestsRef = db.collection("guests");
    let guestId = "";
    let matchedDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;

    // Para fromMe com LID, tentar LID lookup PRIMEIRO (phone variants não vão funcionar)
    const isLidPhone = targetPhone.length > 13;
    if (isFromHotel && isLidPhone && lid.length > 5) {
      console.log(`[Webhook Processor] fromMe LID: trying LID-based lookup first with lid=${lid}`);
      const snapLid = await guestsRef.where("lid", "==", lid).get();
      const goodGuest = snapLid.docs.find(d => {
        const p = d.data().phone || "";
        return p.startsWith("55") && p.length >= 10 && p.length <= 13;
      });
      if (goodGuest) {
        matchedDoc = goodGuest;
        console.log(`[Webhook Processor] fromMe LID: found guest by LID: ${goodGuest.data().name} (${goodGuest.data().phone})`);
      } else if (snapLid.docs.length > 0) {
        matchedDoc = snapLid.docs[0];
        console.log(`[Webhook Processor] fromMe LID: found guest by LID (fallback): ${snapLid.docs[0].data().name}`);
      }
    }

    // Buscar por variantes de telefone (pula se já encontrou por LID)
    if (!matchedDoc && !isLidPhone) {
      // Gerar TODAS as variações possíveis do telefone para matching robusto
      const phoneVariants: string[] = [targetPhone];
      if (targetPhone.startsWith("55") && targetPhone.length > 10) phoneVariants.push(targetPhone.substring(2));
      if (!targetPhone.startsWith("55") && targetPhone.length >= 10) phoneVariants.push("55" + targetPhone);
      // Variantes com/sem 9º dígito (celulares BR)
      for (const base of [...phoneVariants]) {
        const local = base.startsWith("55") && base.length > 10 ? base.substring(2) : base;
        if (local.length === 11 && local[2] === '9') {
          const without9 = local.slice(0, 2) + local.slice(3);
          phoneVariants.push(without9);
          phoneVariants.push("55" + without9);
        } else if (local.length === 10) {
          const with9 = local.slice(0, 2) + '9' + local.slice(2);
          phoneVariants.push(with9);
          phoneVariants.push("55" + with9);
        }
      }
      const uniqueVariants = [...new Set(phoneVariants)].filter(v => v.length >= 10);

      for (const variant of uniqueVariants) {
        const snap = await guestsRef.where("phone", "==", variant).limit(1).get();
        if (!snap.empty) { matchedDoc = snap.docs[0]; break; }
      }
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

    // REMOVIDA BUSCA MASSIVA DO BANCO (`await guestsRef.get()`) AQUÍ.

    if (!matchedDoc) {
      // Para fromMe com LID: NÃO criar contato fantasma — só logar e skippar
      if (isFromHotel && isLidPhone) {
        console.log(`[Webhook Processor] fromMe LID: no guest found for LID ${targetPhone}, skipping (won't create phantom)`);
        await snap.ref.update({ status: "processed_fromme_no_match", processedAt: admin.firestore.FieldValue.serverTimestamp() });
        return;
      }
      guestId = getDeterministicId(targetPhone) || targetPhone;
      await guestsRef.doc(guestId).set({
        name: guestName, phone: targetPhone, lid: lid,
        avatar: body.photo || `https://ui-avatars.com/api/?name=${guestName}&background=random`,
        status: "lead", tags: ["WhatsApp"], lastMessage: text,
        lastMessageTime: messageTime,
        unreadCount: isFromHotel ? 0 : 1, isGroup: isGroup,
        cpf: "", email: "", checkinDate: "", checkoutDate: ""
      }, { merge: true });
      console.log(`[Webhook Processor] Novo hóspede criado ou atualizado: ${guestId}`);
    } else {
      guestId = matchedDoc.id;
      const docData = matchedDoc.data();
      const updateData: any = {
        lastMessage: text,
        lastMessageTime: messageTime,
      };
      if (lid && !docData.lid) updateData.lid = lid;
      if (guestName !== "Hóspede (WhatsApp)" && (docData.name === "Hóspede (WhatsApp)" || !docData.name)) {
        updateData.name = guestName;
      }
      const storedPhone = docData.phone || "";
      const incomingIsValid = targetPhone.startsWith("55") && targetPhone.length >= 10 && targetPhone.length <= 13;
      const storedIsLidOrBad = storedPhone.length > 14 || !storedPhone.startsWith("55") || storedPhone.includes("@");
      if (incomingIsValid && (storedIsLidOrBad || !storedPhone)) updateData.phone = targetPhone;
      if (!isFromHotel) updateData.unreadCount = admin.firestore.FieldValue.increment(1);
      await guestsRef.doc(guestId).update(updateData);
    }

    const messagesRef = db.collection("guests").doc(guestId).collection("messages");
    const zapiMessageId = body.messageId;

    if (isFromHotel && zapiMessageId) {
      try {
        // Verificar se já existe um doc com esse zapiId (previne duplicata absoluta)
        const existingDoc = await messagesRef.doc(zapiMessageId).get();
        if (existingDoc.exists) {
          console.log(`[Webhook Processor] Mensagem ${zapiMessageId} já existe, ignorando.`);
          await snap.ref.update({ status: "processed_duplicate", processedAt: admin.firestore.FieldValue.serverTimestamp() });
          return;
        }

        // Buscar eco: mensagem local enviada pelo CRM que corresponde a este zapiId
        const recentMsgs = await messagesRef.orderBy("createdAt", "desc").limit(30).get();
        const fiveMinutesAgo = Date.now() - 300000;
        const ecoMsg = recentMsgs.docs.find(d => {
          const mData = d.data();
          if (mData.sender !== "agent") return false;
          // Match exato por zapiId (já linkado pelo frontend)
          if (mData.zapiId === zapiMessageId) return true;
          // Se já tem outro zapiId, não é eco deste
          if (mData.zapiId && mData.zapiId !== zapiMessageId) return false;
          // Match por conteúdo + janela de tempo
          const msgTime = mData.createdAt?.toMillis?.() || 0;
          const inWindow = msgTime > fiveMinutesAgo || msgTime === 0;
          if (!inWindow) return false;
          // Match por texto (para texto) ou tipo (para mídia)
          if (messageType === 'text') {
            const cleanSource = (mData.text || "").trim().substring(0, 100);
            const cleanTarget = (text || "").trim().substring(0, 100);
            return cleanSource === cleanTarget;
          }
          return mData.type === messageType;
        });

        if (ecoMsg) {
          await ecoMsg.ref.update({ zapiId: zapiMessageId, status: "delivered" });
          console.log(`[Webhook Processor] Eco detectado! zapiId atualizado no doc ${ecoMsg.id}: ${zapiMessageId}`);
          await snap.ref.update({ status: "processed_echo", processedAt: admin.firestore.FieldValue.serverTimestamp() });
          return;
        }
      } catch (dedupeError) {
        console.warn("[Webhook Processor] Deduplicação falhou, salvando normalmente:", dedupeError);
      }
    }

    const docId = zapiMessageId || `internal_${Date.now()}`;
    await messagesRef.doc(docId).set({
      text: text,
      sender: senderType,
      createdAt: messageTime,
      type: messageType,
      mediaUrl: mediaUrl,
      status: "read",
      isGroup: isGroup,
      participantPhone: participantPhone === "Desconhecido" ? null : participantPhone,
      participantName: participantName || undefined,
      agentName: isFromHotel ? "Hotel (WhatsApp)" : undefined,
      zapiId: zapiMessageId || null
    }, { merge: true });

    if (!isFromHotel && !matchedDoc && !isGroup) {
      // CRÍTICO: Só envia auto-reply para telefones brasileiros válidos
      const phoneIsValid = isValidBrazilianPhone(targetPhone);
      if (!phoneIsValid) {
        console.log(`[Webhook Processor] Auto-reply BLOCKED - invalid phone: ${targetPhone}`);
      } else {
        try {
          const ZAPI_INSTANCE = "3EDDA716EC1BF3F118711AC0A90830D6";
          const ZAPI_TOKEN = "2CA5B27FD7E8EA7872F88116";
          const ZAPI_CLIENT_TOKEN = "Fba70686a73f5409da3e0f33bfee5a190S";

          const welcomeText = "P1 Hotel Reservas agradece seu contato.\nPara orçamento de reserva, por favor, informe a data desejada e a quantidade de pessoas por quarto, logo retornamos.";
          const cleanPhone = targetPhone.replace(/\D/g, '');
          const url = `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}/send-text`;

          fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Client-Token': ZAPI_CLIENT_TOKEN },
            body: JSON.stringify({ phone: cleanPhone, message: welcomeText })
          }).catch(err => console.error("[Webhook Processor] Erro auto-reply", err));
        } catch (e) {
          console.error("Auto reply fail", e);
        }
      }
    }

    await snap.ref.update({ status: "processed", processedAt: admin.firestore.FieldValue.serverTimestamp() });
    console.log(`[Webhook Processor] Event ${eventId} processed successfully.`);

  } catch (error) {
    console.error(`[Webhook Processor] Fatal Error processing event ${event.params.eventId}:`, error);
    if (event.data) {
      await event.data.ref.update({ status: "error", error: String(error) });
    }
  }
});

// --- FUNÇÃO DE MERGE DE HÓSPEDES DUPLICADOS ---
export const mergeGuests = functions.https.onRequest(async (req, res) => {
  try {
    const guestsRef = db.collection("guests");
    const allSnap = await guestsRef.get();
    const allGuests = allSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));

    // Agrupa hóspedes por telefone
    const groups: { primary: any; duplicates: any[] }[] = [];
    const visitedIds = new Set<string>();

    for (const guest of allGuests) {
      if (visitedIds.has(guest.id)) continue;
      visitedIds.add(guest.id);

      const group = { primary: guest, duplicates: [] as any[] };

      for (const other of allGuests) {
        if (visitedIds.has(other.id)) continue;
        if (phonesMatch(guest.phone || "", other.phone || "") || (guest.lid && guest.lid.length > 5 && guest.lid === other.lid)) {
          group.duplicates.push(other);
          visitedIds.add(other.id);
        }
      }

      if (group.duplicates.length > 0) {
        groups.push(group);
      }
    }

    const report: any[] = [];

    for (const group of groups) {
      const all = [group.primary, ...group.duplicates];
      // Ordena para escolher o melhor como primário
      all.sort((a, b) => {
        const aValid = (a.phone || "").startsWith("55") && a.phone.length >= 10 && a.phone.length <= 13;
        const bValid = (b.phone || "").startsWith("55") && b.phone.length >= 10 && b.phone.length <= 13;
        if (aValid && !bValid) return -1;
        if (!aValid && bValid) return 1;
        const aScore = [a.cpf, a.email, a.checkinDate, a.checkoutDate, a.notes].filter(Boolean).length;
        const bScore = [b.cpf, b.email, b.checkinDate, b.checkoutDate, b.notes].filter(Boolean).length;
        return bScore - aScore;
      });

      const primary = all[0];
      const toMerge = all.slice(1);
      let messagesMovedTotal = 0;
      const mergedNames: string[] = [];

      for (const dup of toMerge) {
        mergedNames.push(`${dup.name} (${dup.phone})`);

        const dupMsgsSnap = await db.collection("guests").doc(dup.id).collection("messages").get();
        let messagesMoved = 0;
        const batchSize = 400;
        let batch = db.batch();
        let batchCount = 0;

        for (const msgDoc of dupMsgsSnap.docs) {
          const msgData = msgDoc.data();
          const targetRef = db.collection("guests").doc(primary.id).collection("messages").doc(msgDoc.id);
          batch.set(targetRef, msgData, { merge: true });
          // Delete do doc original
          batch.delete(msgDoc.ref);
          batchCount += 2;
          messagesMoved++;

          if (batchCount >= batchSize) {
            await batch.commit();
            batch = db.batch();
            batchCount = 0;
          }
        }
        if (batchCount > 0) await batch.commit();

        // Mescla dados
        const mergeUpdate: any = {};
        if (!primary.cpf && dup.cpf) mergeUpdate.cpf = dup.cpf;
        if (!primary.email && dup.email) mergeUpdate.email = dup.email;
        if (!primary.notes && dup.notes) mergeUpdate.notes = dup.notes;
        if (!primary.checkinDate && dup.checkinDate) mergeUpdate.checkinDate = dup.checkinDate;
        if (!primary.checkoutDate && dup.checkoutDate) mergeUpdate.checkoutDate = dup.checkoutDate;
        if (dup.lid && !primary.lid) mergeUpdate.lid = dup.lid;
        // Atualiza nome se o primário tem nome genérico
        if (primary.name === "Hóspede (WhatsApp)" && dup.name && dup.name !== "Hóspede (WhatsApp)") {
          mergeUpdate.name = dup.name;
          primary.name = dup.name;
        }
        if (dup.tags && dup.tags.length > 0) {
          const mergedTags = Array.from(new Set([...(primary.tags || []), ...dup.tags]));
          mergeUpdate.tags = mergedTags;
        }
        if (Object.keys(mergeUpdate).length > 0) {
          await guestsRef.doc(primary.id).update(mergeUpdate);
          Object.assign(primary, mergeUpdate);
        }

        await guestsRef.doc(dup.id).delete();
        messagesMovedTotal += messagesMoved;
      }

      report.push({
        primary: `${primary.name} (${primary.phone})`,
        merged: mergedNames,
        messagesMoved: messagesMovedTotal
      });
    }

    console.log("[mergeGuests] Relatório:", JSON.stringify(report, null, 2));
    res.status(200).json({
      success: true,
      groupsMerged: report.length,
      report
    });

  } catch (error) {
    console.error("[mergeGuests] Erro:", error);
    res.status(500).json({ success: false, error: String(error) });
  }
});
