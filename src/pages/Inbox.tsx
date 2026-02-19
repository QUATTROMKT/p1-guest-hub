import { useState, useEffect, useRef } from 'react';
import { Search, Send, Phone, Tag, User, Plus, X, CreditCard, Save, Trash2, Paperclip, FileText, MapPin, ClipboardList, MessageSquare, Zap, Image as ImageIcon, Film, Shield } from 'lucide-react';
import { getAuth } from 'firebase/auth';
// Importamos a nova função markAsRead e services
import { subscribeToGuests, subscribeToMessages, sendMessage, updateGuest, deleteGuest, markAsRead, uploadFile, createTask } from '../services/chatService';
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
}
interface Guest {
  id: string; name: string; phone: string; avatar: string;
  status: string; tags: string[]; notes?: string; lastMessage?: string; lastMessageTime?: any;
  unreadCount?: number;
  isGroup?: boolean;
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

  const auth = getAuth();
  const agentName = getAgentName(auth.currentUser);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollToBottom = () => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); };
  useEffect(() => { scrollToBottom(); }, [messages]);

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
      console.log('[Inbox] Subscribing to messages for guestId:', selectedGuestId);
      const unsubscribe = subscribeToMessages(selectedGuestId, (data: any[]) => {
        console.log('[Inbox] Messages received:', data.length, 'messages for guest:', selectedGuestId);
        if (data.length > 0) {
          console.log('[Inbox] Last message:', data[data.length - 1]);
        }
        setMessages(data as Message[]);
      });
      return () => unsubscribe();
    } else {
      setMessages([]);
    }
  }, [selectedGuestId]);

  // --- NOVA FUNÇÃO DE SELECIONAR HÓSPEDE ---
  const handleSelectGuest = async (guest: Guest) => {
    setSelectedGuest(guest);
    // Se tiver mensagens não lidas, marca como lida e zera no banco
    if (guest.unreadCount && guest.unreadCount > 0) {
      await markAsRead(guest.id);
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedGuest) return;
    const textToSend = newMessage;
    setNewMessage('');
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
    let type = 'document';
    if (file.type.startsWith('image/')) type = 'image';
    else if (file.type.startsWith('audio/')) type = 'audio';
    else if (file.type.startsWith('video/')) type = 'video';

    try {
      const url = await uploadFile(file);
      await sendMessage(selectedGuest.id, selectedGuest.phone, file.name, type, url, agentName);
    } catch (error) {
      console.error("Erro ao enviar arquivo:", error);
      alert("Erro ao enviar arquivo. Verifique o console ou a conexão.");
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

  const filteredGuests = guests.filter(g => g.name.toLowerCase().includes(searchTerm.toLowerCase()) || g.phone.includes(searchTerm));
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'reserva': return 'bg-blue-600 text-white border-blue-600';
      case 'checkin': return 'bg-emerald-600 text-white border-emerald-600';
      case 'checkout': return 'bg-slate-600 text-white border-slate-600';
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

  return (
    <div className="flex h-full w-full bg-slate-50 dark:bg-slate-900 transition-colors duration-200">
      {/* LISTA LATERAL */}
      <div className="w-80 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 flex flex-col transition-colors duration-200">
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
          {filteredGuests.map(guest => (
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
                    <span className="text-[10px] text-slate-400 whitespace-nowrap">
                      {guest.lastMessageTime?.seconds ? new Date(guest.lastMessageTime.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400 truncate">{guest.lastMessage}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ÁREA DE CHAT - CONTEÚDO */}
      <div className="flex-1 flex flex-col bg-slate-50 dark:bg-slate-900/50 transition-colors duration-200">
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
            <div className="p-4 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center shadow-sm z-10">
              <div className="flex items-center gap-3">
                <img src={selectedGuest.avatar} className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-600" onError={(e) => (e.currentTarget.src = `https://ui-avatars.com/api/?name=${selectedGuest.name}&background=10b981&color=fff`)} />
                <div>
                  <h2 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                    {selectedGuest.name}
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
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-100/50 dark:bg-slate-900/20">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.sender === 'agent' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[70%] p-3 rounded-xl shadow-md text-sm ${msg.sender === 'agent'
                    ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 text-white rounded-tr-none'
                    : 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white border border-slate-200 dark:border-slate-600 rounded-tl-none'
                    }`}>
                    {msg.type === 'image' && msg.mediaUrl && (
                      <div className="mb-2 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-600">
                        <img src={msg.mediaUrl} alt="Imagem" className="w-full h-auto object-cover" loading="lazy" />
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
                        <div className="flex-1 overflow-hidden">
                          <p className="text-xs font-bold truncate text-slate-700 dark:text-slate-200">{msg.text || 'Documento'}</p>
                          <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-500 hover:underline">Baixar Arquivo</a>
                        </div>
                      </div>
                    )}
                    {msg.type === 'location' && msg.mediaUrl && (
                      <div className="mb-2 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-600">
                        <div className="bg-slate-100 dark:bg-slate-600 p-8 flex justify-center items-center text-slate-400"><MapPin size={32} /></div>
                        <div className="p-2 bg-white dark:bg-slate-700">
                          <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1"><MapPin size={12} /> Ver no Google Maps</a>
                        </div>
                      </div>
                    )}
                    <p style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg.text || ''}</p>
                    <div className="flex justify-between items-end mt-1 gap-2">
                      {msg.isGroup && msg.sender === 'guest' && <span className="text-[9px] font-bold text-orange-500 opacity-80">{msg.participantPhone?.slice(-4) || 'Membro'}</span>}
                      {msg.sender === 'agent' && <span className="text-[9px] font-bold text-emerald-100 opacity-80">{msg.agentName || 'Sistema'}</span>}
                      <span className={`text-[9px] opacity-70 ${msg.sender === 'agent' ? 'text-emerald-100' : 'text-slate-400 dark:text-slate-300'}`}>{msg.createdAt?.seconds ? new Date(msg.createdAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '...'}</span>
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            {/* INPUT AREA */}
            <div className="p-4 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700">
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
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder="Digite sua mensagem..."
                  className="flex-1 bg-transparent border-none focus:ring-0 text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 resize-none max-h-24 py-2"
                  rows={1}
                />
                <button onClick={handleSendMessage} className="p-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 shadow-md transition-transform active:scale-95">
                  <Send size={20} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* BARRA LATERAL DIREITA - DETALHES */}
      <div className="w-80 bg-white dark:bg-slate-800 border-l border-slate-200 dark:border-slate-700 overflow-y-auto hidden xl:block transition-colors duration-200">
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
                      <option value="checkin">Check-in Realizado</option>
                      <option value="checkout">Check-out</option>
                    </select>
                  </div>
                </div>

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
                          <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer">
                            <img src={msg.mediaUrl} className="w-full h-24 object-cover" />
                          </a>
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
    </div>
  );
}