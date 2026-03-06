import { sendMessage } from './chatService';
import { messageTemplates } from '../data/templates';

export const checkAndTriggerAutomation = async (
    guestId: string,
    guestName: string,
    guestPhone: string,
    newStatus: string
): Promise<string | null> => {
    let templateId = '';

    // Regras de Automação
    switch (newStatus) {
        case 'confirmacao_reserva':
            templateId = 'confirmacao_reserva';
            break;
        case 'reserva':
            templateId = 'reserva_confirmada_msg';
            break;
        case 'checkin':
            templateId = 'checkin_pt'; // Poderia ser lógica pra checkin_es dependendo do telefone (+54...)
            break;
        case 'previsao_checkout':
            templateId = 'previsao_checkout_msg';
            break;
        case 'checkout':
            templateId = 'checkout_finalizado_msg';
            break;
        default:
            return null;
    }

    const template = messageTemplates.find(t => t.id === templateId);

    if (template) {
        console.log(`[Automação] Enviando template ${templateId} para ${guestName}`);
        await sendMessage(guestId, guestPhone, template.text, 'text', '', 'Sistema (Automático)');
        return template.title;
    }

    return null;
};
