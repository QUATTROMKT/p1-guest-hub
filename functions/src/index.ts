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
    if (body.status || body.connectedPhone) {
      if (!body.text && !body.image && !body.audio && !body.video && !body.document) {
        res.status(200).send("Ignored (Status Update)");
        return;
      }
    }

    // --- REGRA DE BLOQUEIO INTELIGENTE ---
    // Mensagens enviadas pela API (pelo sistema via chatService) são bloqueadas.
    if (body.fromMe && body.fromApi) {
      res.status(200).send("Ignored (From API/System)");
      return;
    }

    const isFromHotel = body.fromMe === true;
    const senderType = isFromHotel ? "agent" : "guest";

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

    if (!text || (messageType === 'text' && !text)) {
      if (body.text && body.text.message) text = body.text.message;
      else if (typeof body.text === 'string') text = body.text;
      else if (typeof body.message === 'string') text = body.message;
      else if (typeof body.content === 'string') text = body.content;
      else if (body.caption) text = body.caption;
      else if (body.type === 'chat' && body.body) text = body.body;
      if (!text) text = "Mensagem Recebida";
    }

    // --- IDENTIFICAR O HÓSPEDE (OU GRUPO) ---
    const isGroup = body.isGroup === true;
    let targetPhone = "";
    let participantPhone = (body.participantPhone || "").replace(/\D/g, '').replace(/id$/i, '') || "Desconhecido";

    const normalizePhone = (p: string): string => p.replace(/\D/g, '').replace(/id$/i, '');

    const rawLid = body.chatLid || body.participantLid || (body.phone && body.phone.includes("@lid") ? body.phone : "") || "";
    const lid = normalizePhone(rawLid);

    let guestName = isFromHotel
      ? (body.chatName || "Hóspede (WhatsApp)")
      : (body.senderName || body.chatName || "Hóspede (WhatsApp)");

    if (guestName.includes("@") || /^\d{10,}$/.test(guestName)) {
      guestName = "Hóspede (WhatsApp)";
    }

    if (isGroup) {
      targetPhone = normalizePhone((body.phone || body.chatId || "").split('@')[0]);
    } else {
      const rawPhone = body.phone || body.sender || body.chatId || "";
      targetPhone = normalizePhone(rawPhone.split('@')[0]);
    }

    console.log("[Webhook] targetPhone:", targetPhone, "| LID:", lid, "| fromMe:", body.fromMe, "| fromApi:", body.fromApi);

    if (targetPhone.length < 5) {
      res.status(200).send("Ignored (No Phone)");
      return;
    }

    // --- SALVAR NO BANCO ---
    const guestsRef = db.collection("guests");

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
      for (const docSnap of allGuests.docs) {
        if (phonesMatch(docSnap.data().phone || "", targetPhone) || (lid && lid === docSnap.data().lid)) {
          matchedDoc = docSnap;
          if (phonesMatch(docSnap.data().phone || "", targetPhone) && docSnap.data().phone !== targetPhone) {
            await guestsRef.doc(docSnap.id).update({ phone: targetPhone });
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

    // --- SALVAR MENSAGEM COM DEDUPLICAÇÃO ROBUSTA ---
    // Estratégia: quando é eco do sistema (fromMe=true, messageId existe),
    // buscamos mensagens com localDocId que sejam recentes e mesmo texto.
    // Essa abordagem não precisa de índice composto.
    const messagesRef = db.collection("guests").doc(guestId).collection("messages");
    const zapiMessageId = body.messageId;

    if (isFromHotel && zapiMessageId) {
      // Busca mensagens do agent com localDocId (enviadas pelo app) nos últimos 3 minutos
      const threeMinutesAgo = admin.firestore.Timestamp.fromMillis(Date.now() - 180000);
      const recentLocalMsgs = await messagesRef
        .where("sender", "==", "agent")
        .where("createdAt", ">=", threeMinutesAgo)
        .orderBy("createdAt", "desc")
        .limit(10)
        .get();

      // Encontra mensagem local com mesmo texto (eco do sistema)
      const ecoMsg = recentLocalMsgs.docs.find(d => {
        const data = d.data();
        return data.localDocId && data.text === text && !data.zapiId;
      });

      if (ecoMsg) {
        // Atualiza o doc existente com o zapiId real — sem duplicar
        await ecoMsg.ref.update({ zapiId: zapiMessageId, status: "delivered" });
        console.log("[Webhook] Eco encontrado e zapiId atualizado:", zapiMessageId);
        res.status(200).send("OK (Echo Deduplicated)");
        return;
      }
    }

    // Salva a mensagem normalmente (mensagem de hóspede ou do hotel via WhatsApp físico)
    const docId = zapiMessageId || `internal_${Date.now()}`;
    await messagesRef.doc(docId).set({
      text: text,
      sender: senderType,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      type: messageType,
      mediaUrl: mediaUrl,
      status: "read",
      isGroup: isGroup,
      participantPhone: participantPhone === "Desconhecido" ? null : participantPhone,
      agentName: isFromHotel ? "Hotel (WhatsApp)" : undefined,
      zapiId: zapiMessageId || null
    }, { merge: true });

    res.status(200).send("OK");

  } catch (error) {
    console.error("Erro Fatal:", error);
    res.status(200).send("Error Handled");
  }
});

// --- FUNÇÃO DE MERGE DE HÓSPEDES DUPLICADOS ---
// Chame via GET: https://[url]/mergeGuests
export const mergeGuests = functions.https.onRequest(async (req, res) => {
  try {
    const guestsRef = db.collection("guests");
    const allSnap = await guestsRef.get();
    const allGuests = allSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));

    const normalizePhone = (p: string): string => (p || "").replace(/\D/g, '').replace(/id$/i, '');

    const phonesMatch = (a: string, b: string): boolean => {
      const na = normalizePhone(a);
      const nb = normalizePhone(b);
      if (!na || !nb || na.length < 8 || nb.length < 8) return false;
      if (na === nb) return true;
      const strip = (p: string) => p.startsWith("55") && p.length > 10 ? p.substring(2) : p;
      const naL = strip(na);
      const nbL = strip(nb);
      if (naL === nbL) return true;
      const strip9 = (p: string) => (p.length === 11 && p[2] === '9') ? p.slice(0, 2) + p.slice(3) : p;
      const add9 = (p: string) => p.length === 10 ? p.slice(0, 2) + '9' + p.slice(2) : p;
      if (strip9(naL) === strip9(nbL)) return true;
      if (add9(naL) === nbL || naL === add9(nbL)) return true;
      if (na.slice(-8) === nb.slice(-8)) return true;
      return false;
    };

    // Agrupa hóspedes por telefone
    const groups: { primary: any; duplicates: any[] }[] = [];
    const visitedIds = new Set<string>();

    for (const guest of allGuests) {
      if (visitedIds.has(guest.id)) continue;
      visitedIds.add(guest.id);

      const group = { primary: guest, duplicates: [] as any[] };
      const gPhone = normalizePhone(guest.phone);

      for (const other of allGuests) {
        if (visitedIds.has(other.id)) continue;
        const oPhone = normalizePhone(other.phone);
        if (phonesMatch(gPhone, oPhone) || (guest.lid && guest.lid === other.lid)) {
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
      // Escolhe o primário: prefere o com telefone válido (55 + 10-13 dígitos), depois o mais antigo
      const all = [group.primary, ...group.duplicates];
      all.sort((a, b) => {
        const aValid = (a.phone || "").startsWith("55") && a.phone.length >= 10 && a.phone.length <= 13;
        const bValid = (b.phone || "").startsWith("55") && b.phone.length >= 10 && b.phone.length <= 13;
        if (aValid && !bValid) return -1;
        if (!aValid && bValid) return 1;
        // Prefere o com mais dados preenchidos
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

        // Move mensagens do duplicado para o primário
        const dupMsgsSnap = await db.collection("guests").doc(dup.id).collection("messages").get();
        let messagesMoved = 0;

        const batchSize = 400;
        let batch = db.batch();
        let batchCount = 0;

        for (const msgDoc of dupMsgsSnap.docs) {
          const msgData = msgDoc.data();
          const targetRef = db.collection("guests").doc(primary.id).collection("messages").doc(msgDoc.id);
          batch.set(targetRef, msgData, { merge: true });
          batchCount++;
          messagesMoved++;

          if (batchCount >= batchSize) {
            await batch.commit();
            batch = db.batch();
            batchCount = 0;
          }
        }
        if (batchCount > 0) await batch.commit();

        // Mescla dados do duplicado no primário (não sobrescreve campos já preenchidos)
        const mergeUpdate: any = {};
        if (!primary.cpf && dup.cpf) mergeUpdate.cpf = dup.cpf;
        if (!primary.email && dup.email) mergeUpdate.email = dup.email;
        if (!primary.notes && dup.notes) mergeUpdate.notes = dup.notes;
        if (!primary.checkinDate && dup.checkinDate) mergeUpdate.checkinDate = dup.checkinDate;
        if (!primary.checkoutDate && dup.checkoutDate) mergeUpdate.checkoutDate = dup.checkoutDate;
        if (dup.tags && dup.tags.length > 0) {
          const mergedTags = Array.from(new Set([...(primary.tags || []), ...dup.tags]));
          mergeUpdate.tags = mergedTags;
        }
        if (Object.keys(mergeUpdate).length > 0) {
          await guestsRef.doc(primary.id).update(mergeUpdate);
          Object.assign(primary, mergeUpdate);
        }

        // Deleta o duplicado
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
