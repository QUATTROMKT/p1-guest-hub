import { useState, useEffect, useRef } from 'react';
import { Search, Send, Phone, Tag, User, Plus, X, CreditCard, Save, Trash2, Paperclip, FileText, MapPin, ClipboardList, MessageSquare, Zap, Image as ImageIcon, Film, Shield, Forward, ChevronRight, Pin, Edit2, Check } from 'lucide-react';
import { getAuth } from 'firebase/auth';
// Importamos a nova função markAsRead e services
import { subscribeToGuests, subscribeToMessages, sendMessage, updateGuest, deleteGuest, markAsRead, uploadFile, createTask, revokeMessage, editMessage as updateMessageZapi } from '../services/chatService';
import { checkAndTriggerAutomation } from '../services/automationService';
import { messageTemplates } from '../data/templates';
import { getAgentName } from '../utils/authUtils';


interface Message {
  id: string; text: string; sender: 'guest' | 'agent'; createdAt: any;
  type: 'text' | 'template' | 'image' | 'audio' | 'video' | 'document' | 'location';
  mediaUrl?: string;
  agentName?: string;
  isGroup?: boolean;
  participantPhone?: string;
  participantName?: string;
  edited?: boolean;
  zapiId?: string;
}
interface Guest {
  id: string; name: string; phone: string; avatar: string;
  status: string; tags: string[]; notes?: string; lastMessage?: string; lastMessageTime?: any;
  unreadCount?: number;
  isGroup?: boolean;
  pinned?: boolean;
  cpf?: string; email?: string; checkinDate?: string; checkoutDate?: string;
  createdBy?: string; lastUpdatedBy?: string;
}

interface InboxProps { initialGuestId?: string | null; onInitialGuestHandled?: () => void; }

export default function Inbox({ initialGuestId, onInitialGuestHandled }: InboxProps) {
  const [guests, setGuests] = useState<Guest[]>([]);
  const [selectedGuest, setSelectedGuest] = useState<Guest | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [newTag, setNewTag] = useState('');
  const [localNote, setLocalNote] = useState('');
  const [showTemplates, setShowTemplates] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'media'>('details');
  const [editData, setEditData] = useState<Partial<Guest>>({});
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null);
  const [forwardSearchTerm, setForwardSearchTerm] = useState('');
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

  // States para Preview de Mídia antes de Enviar
  const [pendingMedia, setPendingMedia] = useState<{ file: File, url: string, type: 'image' | 'video' | 'audio' | 'document' } | null>(null);
  const [mediaCaption, setMediaCaption] = useState('');

  // States para edição inline
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const auth = getAuth();
  const agentName = getAgentName(auth.currentUser);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollToBottom = () => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); };
  useEffect(() => { scrollToBottom(); }, [messages]);

  // Auto-resize textarea quando newMessage muda (cobre templates selecionados)
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = '40px';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [newMessage]);

  // Ref para guardar referência do guest selecionado
  const selectedGuestRef = useRef<Guest | null>(null);
  useEffect(() => { selectedGuestRef.current = selectedGuest; }, [selectedGuest]);
  const initialGuestHandledRef = useRef(false);

  // Subscrição aos guests — INDEPENDENTE do initialGuestId
  useEffect(() => {
    const unsubscribe = subscribeToGuests((data: any[]) => {
      const loadedGuests = data as Guest[];
      setGuests(loadedGuests);
    });
    return () => unsubscribe();
  }, []);

  // Auto-seleciona o hóspede inicial UMA VEZ e limpa o valor no App
  useEffect(() => {
    if (initialGuestId && guests.length > 0 && !initialGuestHandledRef.current) {
      const target = guests.find(g => g.id === initialGuestId);
      if (target) {
        handleSelectGuest(target);
      }
      initialGuestHandledRef.current = true;
      // Limpa o initialGuestId no App para nunca mais re-selecionar
      if (onInitialGuestHandled) {
        onInitialGuestHandled();
      }
    }
    // Reset flag quando initialGuestId muda (novo guest selecionado via Contatos)
    if (!initialGuestId) {
      initialGuestHandledRef.current = false;
    }
  }, [initialGuestId, guests]);

  // Subscribes to messages do hóspede selecionado (por ID, não referência)
  const selectedGuestId = selectedGuest?.id || null;
  useEffect(() => {
    if (selectedGuest) {
      setLocalNote(selectedGuest.notes || '');
      setEditData({
        cpf: selectedGuest.cpf || '',
        email: selectedGuest.email || '',
        checkinDate: selectedGuest.checkinDate || '',
        checkoutDate: selectedGuest.checkoutDate || '',
        status: selectedGuest.status || 'lead',
        name: selectedGuest.name || ''
      });
    }
  }, [selectedGuest]);

  useEffect(() => {
    if (selectedGuestId) {
      const unsubscribe = subscribeToMessages(selectedGuestId, (data: any[]) => {
        setMessages(data as Message[]);
      });
      return () => unsubscribe();
    } else {
      setMessages([]);
    }
  }, [selectedGuestId]);

  const handleSelectGuest = async (guest: Guest) => {
    setSelectedGuest(guest);
    // Se tiver mensagens não lidas, marca como lida e zera no banco
    if (guest.unreadCount && guest.unreadCount > 0) {
      await markAsRead(guest.id);
    }
  };

  const handleTogglePin = async (e: React.MouseEvent, guest: Guest) => {
    e.stopPropagation();
    const newPinnedStatus = !guest.pinned;

    // Otimista (UX instantânea)
    setGuests(prev => prev.map(g => g.id === guest.id ? { ...g, pinned: newPinnedStatus } : g));
    if (selectedGuest?.id === guest.id) {
      setSelectedGuest({ ...selectedGuest, pinned: newPinnedStatus });
    }

    // Salva no banco
    await updateGuest(guest.id, { pinned: newPinnedStatus });
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedGuest) return;
    const textToSend = newMessage;
    setNewMessage('');
    if (textareaRef.current) {
      textareaRef.current.style.height = '40px';
    }
    await sendMessage(selectedGuest.id, selectedGuest.phone, textToSend, 'text', '', agentName);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0] || !selectedGuest) return;
    const file = e.target.files[0];

    // Determinar tipo
    let type: 'image' | 'video' | 'audio' | 'document' = 'document';
    if (file.type.startsWith('image/')) type = 'image';
    else if (file.type.startsWith('audio/')) type = 'audio';
    else if (file.type.startsWith('video/')) type = 'video';

    // Cria URL local preview e abre o modal (se for imagem ou video, senao manda direto ou pode aplicar regra igual)
    if (type === 'image' || type === 'video') {
      const localUrl = URL.createObjectURL(file);
      setPendingMedia({ file, url: localUrl, type });
      setMediaCaption('');
      // Limpa input
      if (fileInputRef.current) fileInputRef.current.value = '';
    } else {
      // Audio e docs vão direto como antes
      try {
        const url = await uploadFile(file);
        await sendMessage(selectedGuest.id, selectedGuest.phone, file.name, type, url, agentName);
      } catch (error) {
        console.error("Erro ao enviar arquivo:", error);
        alert("Erro ao enviar arquivo. Verifique o console ou a conexão.");
      }
    }
  };

  const handleConfirmMediaSend = async () => {
    if (!pendingMedia || !selectedGuest) return;

    try {
      const url = await uploadFile(pendingMedia.file);
      // Se tiver caption usa ela, senao vai sem texto extra ou o nome
      let captionText = mediaCaption.trim();
      await sendMessage(selectedGuest.id, selectedGuest.phone, captionText, pendingMedia.type, url, agentName);
    } catch (error) {
      console.error("Erro ao subir midia pendente:", error);
      alert("Erro ao enviar mídia.");
    } finally {
      // Limpeza de estado
      if (pendingMedia.url) URL.revokeObjectURL(pendingMedia.url);
      setPendingMedia(null);
      setMediaCaption('');
    }
  };

  const handleCancelMedia = () => {
    if (pendingMedia?.url) URL.revokeObjectURL(pendingMedia.url);
    setPendingMedia(null);
    setMediaCaption('');
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    let imageItem = null;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        imageItem = items[i];
        break;
      }
    }

    if (imageItem && selectedGuest) {
      const file = imageItem.getAsFile();
      if (!file) return;

      const localUrl = URL.createObjectURL(file);
      setPendingMedia({ file, url: localUrl, type: 'image' });
      setMediaCaption('');
    }
  };

  // Funções de Editar e Apagar Mensagens
  const handleDeleteMessage = async (msg: Message) => {
    if (!selectedGuest) return;
    const confirmed = window.confirm("Deseja apagar essa mensagem permanentemente? Obs: na ZAPI isso só afetará o celular do hóspede se tiver sido enviada a menos de 15 minutos.");
    if (!confirmed) return;

    try {
      await revokeMessage(selectedGuest.id, msg.id, msg.zapiId || '');
    } catch (e) {
      console.error(e);
      alert("Erro ao apagar");
    }
  };

  const handleStartEdit = (msg: Message) => {
    setEditingMessageId(msg.id);
    setEditText(msg.text || '');
  };

  const handleSaveEdit = async (msg: Message) => {
    if (!selectedGuest) return;
    try {
      await updateMessageZapi(selectedGuest.id, msg.id, msg.zapiId || '', selectedGuest.phone, editText);
    } catch (e) {
      console.error(e);
      alert("Erro ao salvar edição");
    } finally {
      setEditingMessageId(null);
      setEditText('');
    }
  };

  const handleUpdateGuestData = async () => {
    if (!selectedGuest) return;
    await updateGuest(selectedGuest.id, { ...editData, lastUpdatedBy: agentName });
    setSelectedGuest(prev => prev ? ({ ...prev, ...editData }) : null);
    alert("Dados salvos!");
  };

  const handleDeleteGuest = async () => {
    if (!selectedGuest) return;
    const confirm = window.confirm(`Tem certeza que deseja excluir ${selectedGuest.name}?`);
    if (confirm) {
      await deleteGuest(selectedGuest.id);
      setSelectedGuest(null);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!selectedGuest) return;
    setEditData(prev => ({ ...prev, status: newStatus }));
    await updateGuest(selectedGuest.id, { status: newStatus, lastUpdatedBy: agentName });

    // Automação
    const automationTriggered = await checkAndTriggerAutomation(selectedGuest.id, selectedGuest.name, selectedGuest.phone, newStatus);
    if (automationTriggered) {
      alert(`Automação disparada: ${automationTriggered}`);
    }

    setSelectedGuest(prev => prev ? ({ ...prev, status: newStatus }) : null);
  };

  const handleCreateTask = async () => {
    if (!selectedGuest) return;
    const taskTitle = window.prompt("O que precisa ser feito para este hóspede?");
    if (!taskTitle) return;

    try {
      await createTask({
        title: taskTitle,
        guestName: selectedGuest.name,
        status: 'pending',
        createdBy: agentName
      });
      alert("✅ Tarefa criada com sucesso! Verifique a aba Tarefas.");
    } catch (error) {
      console.error("Erro ao criar tarefa", error);
      alert("Erro ao criar tarefa.");
    }
  };

  const handleAddTag = async () => {
    if (!newTag.trim() || !selectedGuest) return;
    const currentTags = selectedGuest.tags || [];
    if (currentTags.includes(newTag.trim())) { setNewTag(''); return; }
    const updatedTags = [...currentTags, newTag.trim()];

    // Automação: Se for funcionário, muda status para internal
    let newStatus = selectedGuest.status;
    if (newTag.trim().toLowerCase() === 'funcionário' || newTag.trim().toLowerCase() === 'funcionario') {
      newStatus = 'internal';
      await updateGuest(selectedGuest.id, { tags: updatedTags, status: 'internal', lastUpdatedBy: agentName });
    } else {
      await updateGuest(selectedGuest.id, { tags: updatedTags, lastUpdatedBy: agentName });
    }

    setSelectedGuest({ ...selectedGuest, tags: updatedTags, status: newStatus });
    setNewTag('');
  };
  const handleRemoveTag = async (tagToRemove: string) => {
    if (!selectedGuest) return;
    const updatedTags = selectedGuest.tags?.filter(t => t !== tagToRemove) || [];
    setSelectedGuest({ ...selectedGuest, tags: updatedTags });
    await updateGuest(selectedGuest.id, { tags: updatedTags, lastUpdatedBy: agentName });
  };
  const handleSaveNote = async () => {
    if (!selectedGuest) return;
    if (localNote !== selectedGuest.notes) { await updateGuest(selectedGuest.id, { notes: localNote, lastUpdatedBy: agentName }); }
  };
  const handleSelectTemplate = (text: string) => { setNewMessage(text); setShowTemplates(false); };

  const handleForwardMessage = async (targetGuest: Guest) => {
    if (!forwardingMessage) return;
    try {
      await sendMessage(
        targetGuest.id, targetGuest.phone,
        forwardingMessage.text || '',
        forwardingMessage.type,
        forwardingMessage.mediaUrl || '',
        agentName
      );
      alert(`Mensagem encaminhada para ${targetGuest.name}!`);
    } catch (error) {
      console.error("Erro ao encaminhar:", error);
      alert("Erro ao encaminhar mensagem.");
    } finally {
      setForwardingMessage(null);
      setForwardSearchTerm('');
    }
  };

  const formatMessageTime = (timestamp: any) => {
    if (!timestamp || !timestamp.seconds) return '';
    const date = new Date(timestamp.seconds * 1000);
    const now = new Date();
    const isToday = date.getDate() === now.getDate() && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = date.getDate() === yesterday.getDate() && date.getMonth() === yesterday.getMonth() && date.getFullYear() === yesterday.getFullYear();
    if (isYesterday) {
      return 'Ontem';
    }
    return date.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: '2-digit' });
  };

  const filteredGuests = guests.filter(g => g.name.toLowerCase().includes(searchTerm.toLowerCase()) || g.phone.includes(searchTerm));

  // Sort guests: Pinned first, then by lastMessageTime
  const sortedGuests = [...filteredGuests].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    const timeA = a.lastMessageTime?.seconds || 0;
    const timeB = b.lastMessageTime?.seconds || 0;
    return timeB - timeA;
  });

  const forwardFilteredGuests = guests.filter(g => g.name.toLowerCase().includes(forwardSearchTerm.toLowerCase()) || g.phone.includes(forwardSearchTerm));
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'reserva': return 'bg-blue-600 text-white border-blue-600';
      case 'cancelada': return 'bg-red-600 text-white border-red-600';
      case 'checkin': return 'bg-emerald-600 text-white border-emerald-600';
      case 'checkout': return 'bg-slate-600 text-white border-slate-600';
      case 'atendimento_finalizado': return 'bg-stone-500 text-white border-stone-500';
      case 'internal': return 'bg-purple-600 text-white border-purple-600';
      default: return 'bg-yellow-400 text-yellow-900 border-yellow-400';
    }
  };

  const getTagStyle = (tag: string) => {
    if (tag.toLowerCase() === 'funcionário' || tag.toLowerCase() === 'funcionario') {
      return 'bg-purple-100 text-purple-700 border border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700';
    }
    if (tag.toLowerCase() === 'vip') {
      return 'bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700';
    }
    return 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-transparent';
  };

  const mediaMessages = messages.filter(m => ['image', 'video', 'document'].includes(m.type));

  // GARANTIR ORDEM EXATA DAS MENSAGENS:
  // Como o Firebase manda pra gente, vamos dar um sort duplo pra ter certeza absoluta
  const sortedMessages = [...messages].sort((a, b) => {
    const timeA = a.createdAt?.seconds || 0;
    const timeB = b.createdAt?.seconds || 0;
    if (timeA === timeB) {
      // Desempate por nanosegundos se existir
      const nanoA = a.createdAt?.nanoseconds || 0;
      const nanoB = b.createdAt?.nanoseconds || 0;
      if (nanoA === nanoB) {
        // Desempate final pelo localDocId ou default alfabético para forçar constância
        return a.id.localeCompare(b.id);
      }
      return nanoA - nanoB;
    }
    return timeA - timeB;
  });

  return (
    <div className="flex h-full w-full bg-slate-50 dark:bg-slate-900 transition-colors duration-200">
      {/* LISTA LATERAL */}
      <div className="w-80 flex-shrink-0 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 flex flex-col transition-colors duration-200">
        <div className="p-4 border-b border-slate-100 dark:border-slate-700">
          <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-4">Mensagens</h2>
          <div className="relative">
            <Search className="absolute left-3 top-3 text-slate-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Buscar..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500"
              value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {sortedGuests.map(guest => (
            <div
              key={guest.id}
              onClick={() => handleSelectGuest(guest)}
              className={`p-4 border-b border-slate-50 dark:border-slate-700/50 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors ${selectedGuest?.id === guest.id ? 'bg-emerald-50 dark:bg-emerald-900/20 border-l-4 border-l-emerald-500' : ''}`}
            >
              <div className="flex items-center gap-3">
                <div className="relative">
                  <img src={guest.avatar} className="w-12 h-12 rounded-full object-cover bg-slate-200 dark:bg-slate-600" onError={(e) => (e.currentTarget.src = `https://ui-avatars.com/api/?name=${guest.name}&background=random`)} />
                  {!!guest.unreadCount && guest.unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-emerald-500 text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full border-2 border-white dark:border-slate-800">
                      {guest.unreadCount}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start">
                    <h3 className={`font-bold truncate flex items-center gap-1 ${selectedGuest?.id === guest.id ? 'text-emerald-900 dark:text-emerald-400' :
                      (guest.tags?.includes('Funcionário') || guest.status === 'internal') ? 'text-purple-700 dark:text-purple-400' : 'text-slate-800 dark:text-slate-200'
                      }`}>
                      {guest.name}
                      {(guest.tags?.includes('Funcionário') || guest.status === 'internal') && <Shield size={12} className="text-purple-600 fill-purple-100" />}
                    </h3>
                    <div className="flex items-center gap-2">
                      <button onClick={(e) => handleTogglePin(e, guest)} className="text-slate-400 hover:text-amber-500 transition-colors">
                        <Pin className={guest.pinned ? "text-amber-500 fill-amber-500" : ""} size={14} />
                      </button>
                      <span className="text-[10px] text-slate-400 whitespace-nowrap">
                        {formatMessageTime(guest.lastMessageTime)}
                      </span>
                    </div>
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400 truncate">{guest.lastMessage}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ÁREA DE CHAT - CONTEÚDO */}
      <div className="flex-1 min-w-0 flex flex-col bg-slate-50 dark:bg-slate-900/50 transition-colors duration-200 relative overflow-hidden">
        {!selectedGuest ? (
          <div className="flex-1 flex items-center justify-center text-slate-400 dark:text-slate-500 flex-col gap-4">
            <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center">
              <MessageSquare size={32} />
            </div>
            <p>Selecione uma conversa para iniciar</p>
          </div>
        ) : (
          <>
            {/* HEADER DO CHAT */}
            <div className="p-4 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center shadow-sm z-10 w-full flex-shrink-0 min-w-0 max-w-full">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <img src={selectedGuest.avatar} className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-600 flex-shrink-0" onError={(e) => (e.currentTarget.src = `https://ui-avatars.com/api/?name=${selectedGuest.name}&background=10b981&color=fff`)} />
                <div className="flex-1 min-w-0 flex flex-col justify-center overflow-hidden">
                  <h2 className="font-bold text-slate-800 dark:text-white flex items-center gap-2 truncate">
                    <span className="truncate">{selectedGuest.name}</span>
                    {(selectedGuest.tags?.includes('Funcionário') || selectedGuest.status === 'internal') && (
                      <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-[10px] rounded-full border border-purple-200 flex items-center gap-1">
                        <Shield size={10} /> Equipe
                      </span>
                    )}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <span className="w-2 h-2 bg-emerald-500 rounded-full"></span> Online
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                <button
                  onClick={async () => {
                    await updateGuest(selectedGuest.id, { unreadCount: 1 });
                    setSelectedGuest(null);
                  }}
                  className="px-3 py-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg transition-colors flex items-center gap-1.5 uppercase tracking-wide border border-slate-200 dark:border-slate-600"
                  title="Marcar como não lida"
                >
                  <MessageSquare size={14} /> Não Lida
                </button>
              </div>
            </div>
            {/* AREA DE MENSAGENS E SCROLL - Corrigido Width Blowout min-w-0 e flex-1 */}
            <div className="flex-1 min-h-0 min-w-0 overflow-y-auto w-full p-6 space-y-4 bg-slate-100/50 dark:bg-slate-900/20">
              {sortedMessages.map((msg, index) => {
                const msgDate = msg.createdAt?.seconds ? new Date(msg.createdAt.seconds * 1000) : new Date();
                const dateString = msgDate.toLocaleDateString();
                const prevMsg = index > 0 ? messages[index - 1] : null;
                const prevDateString = prevMsg?.createdAt?.seconds ? new Date(prevMsg.createdAt.seconds * 1000).toLocaleDateString() : '';
                const showDateSeparator = dateString !== prevDateString;

                let separatorText = dateString;
                const todayString = new Date().toLocaleDateString();
                const yesterdayString = new Date(Date.now() - 86400000).toLocaleDateString();
                if (dateString === todayString) separatorText = 'Hoje';
                else if (dateString === yesterdayString) separatorText = 'Ontem';

                return (
                  <div key={msg.id} className="contents">
                    {showDateSeparator && (
                      <div className="flex justify-center my-6">
                        <span className="bg-slate-200/70 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 text-[10px] uppercase px-3 py-1 rounded-full font-bold">
                          {separatorText}
                        </span>
                      </div>
                    )}
                    <div className={`flex ${msg.sender === 'agent' ? 'justify-end' : 'justify-start'} relative group max-w-full`}>

                      {/* Botões do lado de FORA esquerdo (se HÓSPEDE mandou pra gente) */}
                      {msg.sender === 'guest' && (
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center mr-2 self-center">
                          <button onClick={() => setForwardingMessage(msg)} className="p-1.5 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded-full bg-white dark:bg-slate-800 shadow-sm" title="Encaminhar">
                            <Forward size={14} />
                          </button>
                        </div>
                      )}

                      <div className={`max-w-[70%] p-3 rounded-xl shadow-md text-sm ${msg.sender === 'agent'
                        ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 text-white rounded-tr-none'
                        : 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white border border-slate-200 dark:border-slate-600 rounded-tl-none'
                        }`}>

                        {msg.type === 'image' && msg.mediaUrl && (
                          <div
                            className="mb-2 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-600 cursor-pointer max-w-[280px]"
                            onClick={() => setExpandedImage(msg.mediaUrl!)}
                          >
                            <img src={msg.mediaUrl} alt="Imagem" className="w-full max-h-[300px] object-cover hover:opacity-90 transition-opacity" loading="lazy" />
                          </div>
                        )}
                        {msg.type === 'audio' && msg.mediaUrl && (
                          <div className="mb-2 flex items-center justify-center bg-slate-100 dark:bg-slate-600 rounded-lg p-2 min-w-[200px]">
                            <audio controls src={msg.mediaUrl} className="w-full h-8" />
                          </div>
                        )}
                        {msg.type === 'video' && msg.mediaUrl && (
                          <div className="mb-2 rounded-lg overflow-hidden bg-black">
                            <video controls src={msg.mediaUrl} className="w-full max-h-60" />
                          </div>
                        )}
                        {msg.type === 'document' && msg.mediaUrl && (
                          <div className="mb-2 p-3 bg-slate-50 dark:bg-slate-600 border border-slate-200 dark:border-slate-500 rounded-lg flex items-center gap-3">
                            <div className="bg-red-100 p-2 rounded text-red-500"><FileText size={24} /></div>
                            <div className="flex-1 min-w-0 overflow-hidden">
                              <p className="text-xs font-bold truncate text-slate-700 dark:text-slate-200">{msg.text || 'Documento'}</p>
                              <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-500 hover:underline">Baixar Arquivo</a>
                            </div>
                          </div>
                        )}
                        {msg.type === 'location' && msg.mediaUrl && (
                          <div className="mb-2 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-600">
                            <div className="bg-slate-100 dark:bg-slate-600 p-8 flex justify-center items-center text-slate-400"><MapPin size={32} /></div>
                            <div className="p-2 bg-white dark:bg-slate-700 min-w-0">
                              <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1 truncate"><MapPin size={12} /> Ver no Google Maps</a>
                            </div>
                          </div>
                        )}

                        {/* Renderer de Texto com Suporte a Edição */}
                        {editingMessageId === msg.id ? (
                          <div className="flex flex-col gap-2 min-w-[200px] text-slate-800">
                            <textarea
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              className="w-full rounded bg-white/90 p-2 text-sm outline-none resize-none"
                              rows={3}
                              autoFocus
                            />
                            <div className="flex justify-end gap-1">
                              <button onClick={() => setEditingMessageId(null)} className="px-2 py-1 text-[10px] rounded bg-slate-200 hover:bg-slate-300 transition-colors">Cancelar</button>
                              <button onClick={() => handleSaveEdit(msg)} className="px-2 py-1 text-[10px] rounded bg-emerald-700 text-emerald-50 hover:bg-emerald-800 flex items-center gap-1"><Check size={10} /> Salvar</button>
                            </div>
                          </div>
                        ) : (
                          <p style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                            {msg.text || ''}
                            {msg.edited && <span className="text-[10px] italic opacity-60 ml-1">(editado)</span>}
                          </p>
                        )}

                        <div className="flex justify-between items-end mt-1 gap-2">
                          {msg.isGroup && msg.sender === 'guest' && <span className="text-[9px] font-bold text-orange-500 opacity-80 truncate max-w-[120px]">{msg.participantName || (msg.participantPhone ? `+${msg.participantPhone.slice(-8, -4)}-${msg.participantPhone.slice(-4)}` : 'Membro')}</span>}
                          {msg.sender === 'agent' && <span className="text-[9px] font-bold text-emerald-100 opacity-80">{msg.agentName || 'Sistema'}</span>}
                          <span className={`text-[9px] opacity-70 ${msg.sender === 'agent' ? 'text-emerald-100' : 'text-slate-400 dark:text-slate-300'}`}>{msg.createdAt?.seconds ? new Date(msg.createdAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '...'}</span>
                        </div>
                      </div>

                      {/* Botões do lado de FORA direito (Se NÓS mandamos a msg) */}
                      {msg.sender === 'agent' && (
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center ml-2 self-center gap-1 shrink-0">
                          {msg.type === 'text' && (
                            <button onClick={() => handleStartEdit(msg)} className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-full bg-white dark:bg-slate-800 shadow-sm" title="Editar">
                              <Edit2 size={12} />
                            </button>
                          )}
                          <button onClick={() => handleDeleteMessage(msg)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-full bg-white dark:bg-slate-800 shadow-sm" title="Apagar">
                            <Trash2 size={12} />
                          </button>
                          <button onClick={() => setForwardingMessage(msg)} className="p-1.5 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded-full bg-white dark:bg-slate-800 shadow-sm" title="Encaminhar">
                            <Forward size={14} />
                          </button>
                        </div>
                      )}

                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
            {/* MODAL DE MEDIA PREVIEW PENDENTE */}
            {pendingMedia && (
              <div className="absolute inset-x-4 bottom-20 z-20 p-4 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-bold text-sm text-slate-700 dark:text-slate-200 flex items-center gap-2"><ImageIcon size={14} /> Pré-visualizar</h3>
                  <button onClick={handleCancelMedia} className="text-slate-400 hover:text-red-500 rounded p-1"><X size={18} /></button>
                </div>
                <div className="w-full h-64 bg-slate-100 dark:bg-slate-900 rounded-lg overflow-hidden mb-3 flex items-center justify-center">
                  {pendingMedia.type === 'image' && <img src={pendingMedia.url} className="max-w-full max-h-full object-contain" />}
                  {pendingMedia.type === 'video' && <video src={pendingMedia.url} controls className="max-w-full max-h-full" />}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    className="flex-1 p-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 dark:text-white text-sm outline-emerald-500"
                    placeholder="Legenda (opcional)..."
                    value={mediaCaption}
                    autoFocus
                    onChange={(e) => setMediaCaption(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleConfirmMediaSend()}
                  />
                  <button onClick={handleConfirmMediaSend} className="p-2.5 rounded-lg bg-emerald-600 text-white shrink-0 shadow hover:bg-emerald-700 active:scale-95 transition-all"><Send size={18} /></button>
                </div>
              </div>
            )}

            {/* INPUT AREA */}
            <div className="p-4 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 w-full flex-shrink-0">
              <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-700 p-2 rounded-xl border border-slate-200 dark:border-slate-600 focus-within:ring-2 ring-emerald-500 transition-all relative">
                {showTemplates && (
                  <div className="absolute bottom-full left-0 mb-2 w-64 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 max-h-80 overflow-y-auto z-50">
                    <div className="p-3 border-b border-slate-100 dark:border-slate-700 font-bold text-slate-700 dark:text-slate-200 text-xs uppercase tracking-wider">
                      Mensagens Rápidas
                    </div>
                    {messageTemplates.map(t => (
                      <button
                        key={t.id}
                        onClick={() => handleSelectTemplate(t.text)}
                        className="w-full text-left p-3 text-sm text-slate-600 dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:text-emerald-600 transition-colors border-b border-slate-50 dark:border-slate-700/50 last:border-0"
                      >
                        <span className="font-bold block text-xs mb-1">{t.title}</span>
                        <span className="text-[10px] opacity-70 line-clamp-2">{t.text}</span>
                      </button>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => setShowTemplates(!showTemplates)}
                  className={`p-2 rounded-lg transition-colors ${showTemplates ? 'bg-emerald-100 text-emerald-600' : 'text-slate-400 dark:text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-slate-600'}`}
                  title="Mensagens Rápidas"
                >
                  <Zap size={20} />
                </button>
                <button onClick={() => fileInputRef.current?.click()} className="p-2 text-slate-400 dark:text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-slate-600 rounded-lg transition-colors">
                  <Paperclip size={20} />
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  onChange={handleFileUpload}
                  accept="image/*,audio/*,video/*,application/pdf"
                />
                <textarea
                  ref={textareaRef}
                  value={newMessage}
                  onChange={e => {
                    setNewMessage(e.target.value);
                    e.target.style.height = 'inherit';
                    e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
                  }}
                  onKeyDown={handleKeyPress}
                  onPaste={handlePaste}
                  placeholder="Digite sua mensagem..."
                  className="flex-1 bg-transparent border-none focus:ring-0 text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 resize-none py-2 overflow-y-auto"
                  rows={1}
                  style={{ height: '40px', minHeight: '40px', maxHeight: '200px' }}
                />
                <button onClick={handleSendMessage} className="p-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 shadow-md transition-transform active:scale-95">
                  <Send size={20} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* BARRA LATERAL DIREITA - DETALHES flex-shrink-0 para não ser expulso pelo blowout */}
      <div className="w-80 flex-shrink-0 bg-white dark:bg-slate-800 border-l border-slate-200 dark:border-slate-700 overflow-y-auto hidden lg:block transition-colors duration-200">
        {selectedGuest ? (
          <>
            <div className="flex border-b border-slate-100 dark:border-slate-700">
              <button onClick={() => setActiveTab('details')} className={`flex-1 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'details' ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400' : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}>Dados</button>
              <button onClick={() => setActiveTab('media')} className={`flex-1 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'media' ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400' : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}>Mídia ({mediaMessages.length})</button>
            </div>

            {activeTab === 'details' ? (
              <>
                <div className="p-6 text-center border-b border-slate-100 dark:border-slate-700">
                  <div className="w-20 h-20 mx-auto rounded-full bg-slate-100 dark:bg-slate-700 mb-4 overflow-hidden border-4 border-white dark:border-slate-700 shadow-lg">
                    <img src={selectedGuest.avatar} className="w-full h-full object-cover" onError={(e) => (e.currentTarget.src = `https://ui-avatars.com/api/?name=${selectedGuest.name}&background=10b981&color=fff`)} />
                  </div>
                  <input
                    type="text"
                    value={editData.name || selectedGuest.name}
                    onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                    className="text-lg font-bold text-slate-800 dark:text-white bg-transparent border-b border-transparent focus:border-emerald-500 outline-none text-center w-full"
                  />
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 flex justify-center items-center gap-1"><Phone size={12} /> {selectedGuest.phone}</p>

                  <button
                    onClick={handleCreateTask}
                    className="mt-4 w-full py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-600 hover:text-emerald-600 flex items-center justify-center gap-2 transition-colors shadow-sm"
                  >
                    <ClipboardList size={14} /> Criar Solicitação
                  </button>

                  <div className="mt-4 flex flex-col gap-2">
                    <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider">Fase do Hóspede</span>
                    <select value={editData.status || 'lead'} onChange={(e) => handleStatusChange(e.target.value)} className={`w-full p-2 rounded-lg text-sm font-bold border outline-none cursor-pointer text-center dark:bg-slate-800 ${getStatusColor(editData.status || 'lead')}`}>
                      <option value="lead">Em Negociação</option>
                      <option value="reserva">Reserva Confirmada</option>
                      <option value="cancelada">Reserva Cancelada</option>
                      <option value="checkin">Check-in Realizado</option>
                      <option value="checkout">Check-out</option>
                      <option value="atendimento_finalizado">Atendimento Finalizado</option>
                    </select>
                  </div>
                </div>

                {/* MEMBROS DO GRUPO */}
                {selectedGuest?.isGroup && (
                  <div className="p-4 border-b border-slate-100 dark:border-slate-700">
                    <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                      <User size={12} /> Membros do Grupo ({(() => {
                        const members = new Map<string, string>();
                        messages.forEach(m => {
                          if (m.sender === 'guest' && (m.participantPhone || m.participantName)) {
                            const key = m.participantPhone || m.participantName || '';
                            if (!members.has(key)) {
                              members.set(key, m.participantName || m.participantPhone || 'Membro');
                            }
                          }
                        });
                        return members.size;
                      })()})
                    </h3>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {(() => {
                        const members = new Map<string, { name: string; phone: string; lastSeen: number }>();
                        messages.forEach(m => {
                          if (m.sender === 'guest' && (m.participantPhone || m.participantName)) {
                            const key = m.participantPhone || m.participantName || '';
                            const existing = members.get(key);
                            const ts = m.createdAt?.seconds || 0;
                            if (!existing || ts > existing.lastSeen) {
                              members.set(key, {
                                name: m.participantName || '',
                                phone: m.participantPhone || '',
                                lastSeen: ts,
                              });
                            }
                          }
                        });
                        return Array.from(members.values()).map((member, i) => (
                          <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-700/50">
                            <div className="w-7 h-7 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-orange-600 dark:text-orange-400 text-xs font-bold">
                              {(member.name || member.phone || '?')[0].toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">
                                {member.name || 'Membro'}
                              </p>
                              {member.phone && (
                                <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">
                                  {member.phone}
                                </p>
                              )}
                            </div>
                          </div>
                        ));
                      })()}
                    </div>
                  </div>
                )}

                <div className="p-6 space-y-6">
                  <div>
                    <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2"><CreditCard size={12} /> Dados do Hóspede</h3>
                    <div className="space-y-3">
                      <div><label className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">CPF</label><input type="text" value={editData.cpf} onChange={(e) => setEditData({ ...editData, cpf: e.target.value })} className="w-full p-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded text-sm text-slate-800 dark:text-white" placeholder="000.000.000-00" /></div>
                      <div><label className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Email</label><input type="text" value={editData.email} onChange={(e) => setEditData({ ...editData, email: e.target.value })} className="w-full p-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded text-sm text-slate-800 dark:text-white" placeholder="email@exemplo.com" /></div>
                      <div className="grid grid-cols-2 gap-2">
                        <div><label className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Check-in</label><input type="date" value={editData.checkinDate} onChange={(e) => setEditData({ ...editData, checkinDate: e.target.value })} className="w-full p-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded text-sm text-slate-800 dark:text-white" /></div>
                        <div><label className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Check-out</label><input type="date" value={editData.checkoutDate} onChange={(e) => setEditData({ ...editData, checkoutDate: e.target.value })} className="w-full p-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded text-sm text-slate-800 dark:text-white" /></div>
                      </div>
                      <button onClick={handleUpdateGuestData} className="w-full py-2 bg-slate-800 text-white rounded text-xs font-bold hover:bg-slate-700 flex justify-center gap-2 items-center"><Save size={14} /> Salvar Ficha</button>
                    </div>
                  </div>

                  <div className="mt-8 text-left">
                    <h3 className="font-bold text-slate-800 dark:text-white mb-3 text-sm flex items-center gap-2"><Tag size={16} /> Tags</h3>
                    <div className="flex flex-wrap gap-2">
                      {selectedGuest.tags?.map(tag => (
                        <span key={tag} className={`px-2 py-1 rounded-md text-xs font-bold flex items-center gap-1 group transition-colors ${getTagStyle(tag)}`}>
                          {tag}
                          <button onClick={() => handleRemoveTag(tag)} className="opacity-60 hover:opacity-100 hover:text-red-500"><X size={12} /></button>
                        </span>
                      ))}

                      <div className="flex items-center gap-1 w-full mt-2">
                        <input
                          type="text"
                          placeholder="+ Tag..."
                          className="flex-1 px-2 py-1 border border-slate-200 dark:border-slate-600 rounded-md text-xs focus:ring-2 focus:ring-emerald-500 outline-none dark:bg-slate-700 dark:text-white"
                          value={newTag}
                          onChange={e => setNewTag(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleAddTag()}
                        />
                        <button onClick={handleAddTag} className="p-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-md"><Plus size={14} /></button>
                      </div>
                      {/* Sugestão de Tag Rápida */}
                      <div className="mt-2 flex gap-2">
                        {!selectedGuest.tags?.includes('Funcionário') && (
                          <button onClick={() => { setNewTag('Funcionário'); setTimeout(handleAddTag, 100); }} className="text-[10px] px-2 py-1 bg-purple-50 text-purple-600 border border-purple-100 rounded-full hover:bg-purple-100 transition-colors">
                            + Funcionário
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">Notas Internas</h3>
                    <textarea
                      value={localNote}
                      onChange={(e) => setLocalNote(e.target.value)}
                      onBlur={handleSaveNote}
                      className="w-full h-24 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg p-3 text-sm text-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-yellow-400 resize-none placeholder:text-yellow-700/50 dark:placeholder:text-yellow-400/50"
                      placeholder="Digite observações..."
                    />
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 text-right">Salvo automaticamente</p>
                  </div>

                  <div className="mt-8 pt-8 border-t border-slate-100 dark:border-slate-700">
                    <button
                      onClick={handleDeleteGuest}
                      className="w-full py-2 border border-red-100 dark:border-red-900/30 text-red-500 dark:text-red-400 rounded-lg text-xs font-bold hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center justify-center gap-2 transition-colors"
                    >
                      <Trash2 size={14} /> Excluir Contato
                    </button>
                  </div>
                  <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700 text-center space-y-1">
                    {selectedGuest.lastUpdatedBy && (
                      <p className="text-[10px] text-slate-400">Atualizado por: {selectedGuest.lastUpdatedBy}</p>
                    )}
                    {selectedGuest.createdBy && (
                      <p className="text-[10px] text-slate-400">Criado por: {selectedGuest.createdBy}</p>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="p-4 bg-slate-50 dark:bg-slate-900/30 min-h-full">
                <h3 className="font-bold text-slate-700 dark:text-white mb-4 flex items-center gap-2"><ImageIcon size={18} /> Galeria de Mídia</h3>

                {mediaMessages.length === 0 ? (
                  <div className="text-center py-10 text-slate-400">
                    <ImageIcon size={48} className="mx-auto mb-2 opacity-20" />
                    <p>Nenhuma mídia compartilhada</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {mediaMessages.map(msg => (
                      <div key={msg.id} className="relative group rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                        {msg.type === 'image' && (
                          <button onClick={() => setExpandedImage(msg.mediaUrl!)} className="block w-full h-full text-left">
                            <img src={msg.mediaUrl} className="w-full h-24 object-cover hover:opacity-90 transition-opacity" />
                          </button>
                        )}
                        {msg.type === 'video' && (
                          <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer" className="block relative w-full h-24 bg-black">
                            <video src={msg.mediaUrl} className="w-full h-full object-cover opacity-60" />
                            <div className="absolute inset-0 flex items-center justify-center text-white"><Film size={24} /></div>
                          </a>
                        )}
                        {msg.type === 'document' && (
                          <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center justify-center h-24 p-2 text-center hover:bg-slate-50 dark:hover:bg-slate-700/50">
                            <FileText size={24} className="text-blue-500 mb-1" />
                            <span className="text-[10px] truncate w-full">{msg.text}</span>
                          </a>
                        )}
                        <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[9px] p-1 opacity-0 group-hover:opacity-100 transition-opacity truncate">
                          {msg.createdAt?.seconds ? new Date(msg.createdAt.seconds * 1000).toLocaleDateString() : '...'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-slate-300 dark:text-slate-600">
            <User size={64} className="mb-4 opacity-20" />
            <p className="text-lg">Selecione um hóspede</p>
          </div>
        )}
      </div>

      {/* MODAL DE ENCAMINHAR */}
      {
        forwardingMessage && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md shadow-2xl flex flex-col h-[500px]">
              <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                  <Forward size={20} className="text-emerald-500" />
                  Encaminhar Mensagem
                </h3>
                <button onClick={() => { setForwardingMessage(null); setForwardSearchTerm(''); }} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">
                  <X size={20} />
                </button>
              </div>

              <div className="p-4 border-b border-slate-100 dark:border-slate-700/50">
                <div className="relative">
                  <Search className="absolute left-3 top-3 text-slate-400 w-4 h-4" />
                  <input
                    type="text"
                    placeholder="Buscar contato para encaminhar..."
                    className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800 dark:text-white text-sm"
                    value={forwardSearchTerm}
                    onChange={e => setForwardSearchTerm(e.target.value)}
                    autoFocus
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-2">
                {forwardFilteredGuests.length > 0 ? (
                  forwardFilteredGuests.map(g => (
                    <button
                      key={g.id}
                      onClick={() => handleForwardMessage(g)}
                      className="w-full p-3 flex items-center gap-3 hover:bg-emerald-50 dark:hover:bg-slate-700/50 rounded-xl transition-colors text-left group"
                    >
                      <img src={g.avatar} className="w-10 h-10 rounded-full" onError={(e) => (e.currentTarget.src = `https://ui-avatars.com/api/?name=${g.name}&background=10b981&color=fff`)} />
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-slate-800 dark:text-slate-200 truncate">{g.name}</p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{g.phone}</p>
                      </div>
                      <ChevronRight size={18} className="text-slate-300 dark:text-slate-600 group-hover:text-emerald-500 transition-colors" />
                    </button>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center p-8 text-slate-400 dark:text-slate-500">
                    <User size={32} className="mb-2 opacity-50" />
                    <p className="text-sm">Nenhum contato encontrado.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      }

      {/* MODAL DE IMAGEM EXPANDIDA */}
      {expandedImage && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setExpandedImage(null)}
        >
          <button
            onClick={() => setExpandedImage(null)}
            className="absolute top-4 right-4 p-2 text-white/70 hover:text-white bg-black/20 hover:bg-black/40 rounded-full transition-colors z-[70]"
          >
            <X size={24} />
          </button>
          <img
            src={expandedImage}
            alt="Imagem Expandida"
            className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div >
  );
}