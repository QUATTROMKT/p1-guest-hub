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

    // Helper: normaliza telefone para apenas dígitos
    const normalizePhone = (p: string): string => p.replace(/\D/g, '').replace(/id$/i, '');

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
      participantPhone = body.participantPhone ? normalizePhone(body.participantPhone.split('@')[0]) : "Desconhecido";
    } else {
      const rawPhone = body.phone || body.sender || body.chatId || "";
      targetPhone = normalizePhone(rawPhone.split('@')[0]);
    }

    console.log("[Webhook] Raw body.phone:", body.phone, "| Parsed targetPhone:", targetPhone, "| fromMe:", body.fromMe, "| fromApi:", body.fromApi, "| guestName:", guestName);

    // Se não tiver telefone, aí sim é erro
    if (targetPhone.length < 5) {
      console.log("[Webhook] Ignored - phone too short:", targetPhone);
      res.status(200).send("Ignored (No Phone)");
      return;
    }

    // --- SALVAR NO BANCO (com busca flexível de telefone) ---
    const guestsRef = db.collection("guests");

    // Helper: verifica se dois telefones são o mesmo (comparando sufixos)
    const phonesMatch = (stored: string, incoming: string): boolean => {
      const a = normalizePhone(stored);
      const b = normalizePhone(incoming);
      if (a === b) return true;
      // Compara últimos 10-11 dígitos (DDD + número sem código do país)
      if (a.length >= 10 && b.length >= 10) {
        if (a.endsWith(b.slice(-10)) || b.endsWith(a.slice(-10))) return true;
        if (a.endsWith(b.slice(-11)) || b.endsWith(a.slice(-11))) return true;
      }
      return false;
    };

    let guestId = "";
    let matchedDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;

    // PASSO 1: Busca rápida por variantes de dígitos puros
    const phoneVariants: string[] = [targetPhone];
    if (targetPhone.startsWith("55") && targetPhone.length > 10) {
      phoneVariants.push(targetPhone.substring(2));
    }
    if (!targetPhone.startsWith("55")) {
      phoneVariants.push("55" + targetPhone);
    }
    if (targetPhone.length > 11) {
      phoneVariants.push(targetPhone.slice(-11));
      phoneVariants.push(targetPhone.slice(-10));
    }

    for (const variant of phoneVariants) {
      const snap = await guestsRef.where("phone", "==", variant).limit(1).get();
      if (!snap.empty) {
        matchedDoc = snap.docs[0];
        console.log("[Webhook] Found guest (exact variant):", variant, "| ID:", matchedDoc.id);
        break;
      }
    }

    // PASSO 2: Fallback — busca TODOS os guests e compara com normalização
    if (!matchedDoc) {
      console.log("[Webhook] No exact match. Trying in-memory normalized search...");
      const allGuests = await guestsRef.get();
      for (const doc of allGuests.docs) {
        const storedPhone = doc.data().phone || "";
        if (phonesMatch(storedPhone, targetPhone)) {
          matchedDoc = doc;
          console.log("[Webhook] Found guest (normalized):", storedPhone, "→", targetPhone, "| ID:", doc.id, "| Name:", doc.data().name);
          // Normaliza o telefone no banco para evitar problemas futuros
          await guestsRef.doc(doc.id).update({ phone: targetPhone });
          console.log("[Webhook] Normalized stored phone from", storedPhone, "to", targetPhone);
          break;
        }
      }
    }

    if (!matchedDoc) {
      // Cria novo guest
      console.log("[Webhook] No guest found. Creating:", guestName, targetPhone);
      const newGuest = await guestsRef.add({
        name: guestName,
        phone: targetPhone,
        avatar: body.photo || `https://ui-avatars.com/api/?name=${guestName}&background=random`,
        status: "lead",
        tags: ["WhatsApp"],
        lastMessage: text,
        lastMessageTime: admin.firestore.FieldValue.serverTimestamp(),
        unreadCount: isFromHotel ? 0 : 1,
        isGroup: isGroup,
        cpf: "", email: "", checkinDate: "", checkoutDate: ""
      });
      guestId = newGuest.id;
    } else {
      // Atualiza existente
      guestId = matchedDoc.id;
      const updateData: any = {
        lastMessage: text,
        lastMessageTime: admin.firestore.FieldValue.serverTimestamp(),
      };
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