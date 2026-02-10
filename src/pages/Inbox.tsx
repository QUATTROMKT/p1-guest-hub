import { useState, useEffect, useRef } from 'react';
import { Search, Send, Phone, Tag, User, Plus, X, Zap, ArrowLeft, CreditCard, Save, Trash2, Paperclip, FileText, MapPin, Users, ClipboardList } from 'lucide-react';
import { getAuth } from 'firebase/auth';
// Importamos a nova função markAsRead e services
import { subscribeToGuests, subscribeToMessages, sendMessage, updateGuest, deleteGuest, markAsRead, uploadFile, createTask } from '../services/chatService';
import { checkAndTriggerAutomation } from '../services/automationService';
import { messageTemplates } from '../data/templates';

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
}

interface InboxProps { initialGuestId?: string | null; }

export default function Inbox({ initialGuestId }: InboxProps) {
  const [guests, setGuests] = useState<Guest[]>([]);
  const [selectedGuest, setSelectedGuest] = useState<Guest | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [newTag, setNewTag] = useState('');
  const [localNote, setLocalNote] = useState('');
  const [showTemplates, setShowTemplates] = useState(false);
  const [editData, setEditData] = useState<Partial<Guest>>({});

  const auth = getAuth();
  const agentName = auth.currentUser?.email?.split('@')[0] || "Recepcionista";

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollToBottom = () => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); };
  useEffect(() => { scrollToBottom(); }, [messages]);

  useEffect(() => {
    const unsubscribe = subscribeToGuests((data: any[]) => {
      const loadedGuests = data as Guest[];
      setGuests(loadedGuests);
      if (initialGuestId && !selectedGuest) {
        const target = loadedGuests.find(g => g.id === initialGuestId);
        if (target) handleSelectGuest(target); // Usa a nova função de selecionar
      }
    });
    return () => unsubscribe();
  }, [initialGuestId]);

  useEffect(() => {
    if (selectedGuest) {
      setLocalNote(selectedGuest.notes || '');
      setEditData({
        cpf: selectedGuest.cpf || '',
        email: selectedGuest.email || '',
        checkinDate: selectedGuest.checkinDate || '',
        checkoutDate: selectedGuest.checkoutDate || '',
        status: selectedGuest.status || 'lead'
      });
      const unsubscribe = subscribeToMessages(selectedGuest.id, (data: any[]) => {
        setMessages(data as Message[]);
      });
      return () => unsubscribe();
    }
  }, [selectedGuest]);

  // --- NOVA FUNÇÃO DE SELECIONAR HÓSPEDE ---
  const handleSelectGuest = async (guest: Guest) => {
    setSelectedGuest(guest);
    // Se tiver mensagens não lidas, marca como lida e zera no banco
    if (guest.unreadCount && guest.unreadCount > 0) {
      await markAsRead(guest.id);
    }
  };

  const handleSend = async () => {
    if (!newMessage.trim() || !selectedGuest) return;
    const textToSend = newMessage;
    setNewMessage('');
    await sendMessage(selectedGuest.id, selectedGuest.phone, textToSend, 'text', '', agentName);
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
      alert("Erro ao enviar arquivo.");
      console.error(error);
    }
  };

  const handleUpdateGuestData = async () => {
    if (!selectedGuest) return;
    await updateGuest(selectedGuest.id, { ...editData });
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
    await updateGuest(selectedGuest.id, { status: newStatus });

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
        status: 'pending'
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
    setSelectedGuest({ ...selectedGuest, tags: updatedTags });
    setNewTag('');
    await updateGuest(selectedGuest.id, { tags: updatedTags });
  };
  const handleRemoveTag = async (tagToRemove: string) => {
    if (!selectedGuest) return;
    const updatedTags = selectedGuest.tags?.filter(t => t !== tagToRemove) || [];
    setSelectedGuest({ ...selectedGuest, tags: updatedTags });
    await updateGuest(selectedGuest.id, { tags: updatedTags });
  };
  const handleSaveNote = async () => {
    if (!selectedGuest) return;
    if (localNote !== selectedGuest.notes) { await updateGuest(selectedGuest.id, { notes: localNote }); }
  };
  const handleSelectTemplate = (text: string) => { setNewMessage(text); setShowTemplates(false); };

  const filteredGuests = guests.filter(g => g.name.toLowerCase().includes(searchTerm.toLowerCase()) || g.phone.includes(searchTerm));
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'reserva': return 'bg-blue-600 text-white border-blue-600';
      case 'checkin': return 'bg-emerald-600 text-white border-emerald-600';
      case 'checkout': return 'bg-slate-600 text-white border-slate-600';
      default: return 'bg-yellow-400 text-yellow-900 border-yellow-400';
    }
  };

  return (
    <div className="flex h-full w-full bg-slate-50 text-slate-900 font-sans overflow-hidden">

      {/* COLUNA 1: LISTA */}
      <div className={`${selectedGuest ? 'hidden md:flex' : 'flex'} flex-none w-full md:w-80 bg-white border-r border-slate-200 flex-col h-full z-20`}>
        <div className="p-4 border-b border-slate-100 bg-white">
          <h1 className="text-xl font-bold text-slate-800 mb-4 flex justify-between items-center">
            Inbox <span className="bg-emerald-100 text-emerald-800 text-xs px-2 py-1 rounded-full">{guests.length}</span>
          </h1>
          <div className="relative">
            <Search className="absolute left-3 top-3 text-slate-400 w-4 h-4" />
            <input type="text" placeholder="Buscar..." className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredGuests.map(guest => (
            <div
              onClick={() => handleSelectGuest(guest)}
              className={`p-4 border-b border-slate-50 cursor-pointer hover:bg-slate-50 transition-all ${selectedGuest?.id === guest.id ? 'bg-emerald-50 border-l-4 border-l-emerald-500' : ''} ${guest.unreadCount && guest.unreadCount > 0 ? 'bg-yellow-50' : ''}`}
            >
              <div className="flex justify-between items-start mb-1">
                <h3 className="font-bold text-slate-700 truncate flex-1 flex items-center gap-1">
                  {guest.isGroup && <Users size={14} className="text-slate-400" />}
                  {guest.name}
                </h3>
                <span className="text-[10px] text-slate-400 ml-2">{guest.lastMessageTime?.seconds ? new Date(guest.lastMessageTime.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
              </div>

              <div className="flex justify-between items-center mt-1">
                <p className={`text-sm truncate max-w-[80%] ${guest.unreadCount && guest.unreadCount > 0 ? 'font-bold text-slate-800' : 'text-slate-500'}`}>
                  {guest.lastMessage}
                </p>

                {/* --- A BOLINHA VERDE --- */}
                {guest.unreadCount && guest.unreadCount > 0 ? (
                  <div className="w-5 h-5 bg-emerald-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-sm animate-pulse">
                    {guest.unreadCount}
                  </div>
                ) : null}
              </div>

              <div className="flex gap-1 mt-2 flex-wrap items-center">
                <span className={`w-2 h-2 rounded-full ${getStatusColor(guest.status || 'lead').replace('bg-', 'bg-').split(' ')[0]}`}></span>
                {guest.tags?.slice(0, 2).map(tag => (<span key={tag} className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded border border-slate-200 uppercase font-semibold">{tag}</span>))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* COLUNA 2: CHAT */}
      {selectedGuest ? (
        <div className="flex-1 flex flex-col bg-[#efeae2] relative h-full min-w-0 z-10">
          <div className="bg-white p-3 border-b border-slate-200 flex justify-between items-center shadow-sm z-10">
            <div className="flex items-center gap-3">
              <button onClick={() => setSelectedGuest(null)} className="md:hidden p-2 text-slate-500 hover:bg-slate-100 rounded-full"><ArrowLeft size={20} /></button>
              <div className="w-10 h-10 rounded-full bg-slate-200 overflow-hidden"><img src={selectedGuest.avatar} className="w-full h-full object-cover" onError={(e) => (e.currentTarget.src = `https://ui-avatars.com/api/?name=${selectedGuest.name}&background=10b981&color=fff`)} /></div>
              <div><h2 className="font-bold text-slate-800">{selectedGuest.name}</h2><p className="text-xs text-slate-500">Online</p></div>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-xs text-slate-400 bg-slate-100 px-3 py-1 rounded-full hidden sm:block">Atendente: <b>{agentName}</b></div>
              <button onClick={() => setSelectedGuest(null)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full"><X size={20} /></button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-100/50">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.sender === 'agent' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[70%] p-3 rounded-xl shadow-md text-sm ${msg.sender === 'agent'
                  ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 text-white rounded-tr-none'
                  : 'bg-white text-slate-800 border border-slate-200 rounded-tl-none'
                  }`}>
                  {msg.type === 'image' && msg.mediaUrl && (
                    <div className="mb-2 rounded-lg overflow-hidden bg-slate-100">
                      <img src={msg.mediaUrl} alt="Imagem" className="w-full h-auto object-cover" loading="lazy" />
                    </div>
                  )}
                  {msg.type === 'audio' && msg.mediaUrl && (
                    <div className="mb-2 flex items-center justify-center bg-slate-100 rounded-lg p-2 min-w-[200px]">
                      <audio controls src={msg.mediaUrl} className="w-full h-8" />
                    </div>
                  )}
                  {msg.type === 'video' && msg.mediaUrl && (
                    <div className="mb-2 rounded-lg overflow-hidden bg-black">
                      <video controls src={msg.mediaUrl} className="w-full max-h-60" />
                    </div>
                  )}
                  {msg.type === 'document' && msg.mediaUrl && (
                    <div className="mb-2 p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center gap-3">
                      <div className="bg-red-100 p-2 rounded text-red-500"><FileText size={24} /></div>
                      <div className="flex-1 overflow-hidden">
                        <p className="text-xs font-bold truncate text-slate-700">{msg.text || 'Documento'}</p>
                        <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-500 hover:underline">Baixar Arquivo</a>
                      </div>
                    </div>
                  )}
                  {msg.type === 'location' && msg.mediaUrl && (
                    <div className="mb-2 rounded-lg overflow-hidden border border-slate-200">
                      <div className="bg-slate-100 p-8 flex justify-center items-center text-slate-400"><MapPin size={32} /></div>
                      <div className="p-2 bg-white">
                        <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1"><MapPin size={12} /> Ver no Google Maps</a>
                      </div>
                    </div>
                  )}
                  <p dangerouslySetInnerHTML={{ __html: (msg.text || '').replace(/\n/g, '<br/>') }}></p>
                  <div className="flex justify-between items-end mt-1 gap-2">
                    {msg.isGroup && msg.sender === 'guest' && <span className="text-[9px] font-bold text-orange-500 opacity-80">{msg.participantPhone?.slice(-4) || 'Membro'}</span>}
                    {msg.sender === 'agent' && <span className="text-[9px] font-bold text-emerald-100 opacity-80">{msg.agentName || 'Sistema'}</span>}
                    <span className={`text-[9px] opacity-70 ${msg.sender === 'agent' ? 'text-emerald-100' : 'text-slate-400'}`}>{msg.createdAt?.seconds ? new Date(msg.createdAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '...'}</span>
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
          <div className="p-3 bg-white border-t border-slate-200 relative">
            {showTemplates && (
              <div className="absolute bottom-full left-4 mb-2 w-72 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden z-50">
                <div className="bg-slate-50 p-3 border-b border-slate-100 flex justify-between items-center"><span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Respostas Rápidas</span><button onClick={() => setShowTemplates(false)}><X size={14} className="text-slate-400 hover:text-red-500" /></button></div>
                <div className="max-h-60 overflow-y-auto">{messageTemplates.map(tmpl => (<button key={tmpl.id} onClick={() => handleSelectTemplate(tmpl.text)} className="w-full text-left p-3 hover:bg-emerald-50 border-b border-slate-50"><div className="font-bold text-slate-700 text-sm">{tmpl.title}</div><div className="text-xs text-slate-400 truncate mt-1">{tmpl.text}</div></button>))}</div>
              </div>
            )}
            <div className="flex items-center gap-2">
              <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
              <button onClick={() => fileInputRef.current?.click()} className="p-2 text-slate-400 hover:text-emerald-500 hover:bg-slate-100 rounded-lg transition-colors"><Paperclip size={20} /></button>
              <button onClick={() => setShowTemplates(!showTemplates)} className={`p-2 rounded-lg transition-colors ${showTemplates ? 'bg-emerald-100 text-emerald-600' : 'text-slate-400 hover:text-emerald-500 hover:bg-slate-100'}`}><Zap size={20} /></button>
              <input type="text" value={newMessage} onChange={(e) => setNewMessage(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleSend()} placeholder="Digite uma mensagem..." className="flex-1 py-3 px-4 bg-slate-50 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              <button onClick={handleSend} className="p-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 shadow-md"><Send size={20} /></button>
            </div>
          </div>
        </div>
      ) : (
        <div className="hidden md:flex flex-1 flex-col items-center justify-center text-slate-300 bg-slate-50"><User size={64} className="mb-4 opacity-20" /><p className="text-lg">Selecione um hóspede</p></div>
      )}

      {/* COLUNA 3: DETALHES */}
      {selectedGuest && (
        <div className="hidden lg:flex flex-none w-80 bg-white border-l border-slate-200 flex-col h-full overflow-y-auto z-20">
          <div className="p-6 text-center border-b border-slate-100">
            <div className="w-20 h-20 mx-auto rounded-full bg-slate-100 mb-4 overflow-hidden border-4 border-white shadow-lg"><img src={selectedGuest.avatar} className="w-full h-full object-cover" onError={(e) => (e.currentTarget.src = `https://ui-avatars.com/api/?name=${selectedGuest.name}&background=10b981&color=fff`)} /></div>
            <h2 className="text-lg font-bold text-slate-800">{selectedGuest.name}</h2>
            <p className="text-sm text-slate-500 mt-1 flex justify-center items-center gap-1"><Phone size={12} /> {selectedGuest.phone}</p>

            <button
              onClick={handleCreateTask}
              className="mt-4 w-full py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-50 hover:text-emerald-600 flex items-center justify-center gap-2 transition-colors shadow-sm"
            >
              <ClipboardList size={14} /> Criar Solicitação
            </button>

            <div className="mt-4 flex flex-col gap-2">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Fase do Hóspede</span>
              <select value={editData.status || 'lead'} onChange={(e) => handleStatusChange(e.target.value)} className={`w-full p-2 rounded-lg text-sm font-bold border outline-none cursor-pointer text-center ${getStatusColor(editData.status || 'lead')}`}>
                <option value="lead">🟡 Em Negociação</option>
                <option value="reserva">🔵 Reserva Confirmada</option>
                <option value="checkin">🟢 Hóspede na Casa</option>
                <option value="checkout">⚪ Finalizado</option>
              </select>
            </div>
          </div>

          <div className="p-6 space-y-6">
            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2"><CreditCard size={12} /> Dados do Hóspede</h3>
              <div className="space-y-3">
                <div><label className="text-[10px] text-slate-500 uppercase">CPF</label><input type="text" value={editData.cpf} onChange={(e) => setEditData({ ...editData, cpf: e.target.value })} className="w-full p-2 bg-slate-50 border border-slate-200 rounded text-sm" placeholder="000.000.000-00" /></div>
                <div><label className="text-[10px] text-slate-500 uppercase">Email</label><input type="text" value={editData.email} onChange={(e) => setEditData({ ...editData, email: e.target.value })} className="w-full p-2 bg-slate-50 border border-slate-200 rounded text-sm" placeholder="email@exemplo.com" /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="text-[10px] text-slate-500 uppercase">Check-in</label><input type="date" value={editData.checkinDate} onChange={(e) => setEditData({ ...editData, checkinDate: e.target.value })} className="w-full p-2 bg-slate-50 border border-slate-200 rounded text-sm" /></div>
                  <div><label className="text-[10px] text-slate-500 uppercase">Check-out</label><input type="date" value={editData.checkoutDate} onChange={(e) => setEditData({ ...editData, checkoutDate: e.target.value })} className="w-full p-2 bg-slate-50 border border-slate-200 rounded text-sm" /></div>
                </div>
                <button onClick={handleUpdateGuestData} className="w-full py-2 bg-slate-800 text-white rounded text-xs font-bold hover:bg-slate-700 flex justify-center gap-2 items-center"><Save size={14} /> Salvar Ficha</button>
              </div>
            </div>
            <div className="border-t border-slate-100 pt-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2"><Tag size={12} /> Etiquetas</h3>
              <div className="flex flex-wrap gap-2 mb-2">{selectedGuest.tags?.map(tag => (<span key={tag} className="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs rounded-full font-medium border border-emerald-200 flex items-center gap-1">{tag}<button onClick={(e) => { e.stopPropagation(); handleRemoveTag(tag); }}><X size={10} /></button></span>))}</div><div className="flex gap-2"><input type="text" value={newTag} onChange={(e) => setNewTag(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleAddTag()} placeholder="Nova tag..." className="flex-1 px-3 py-1 text-xs border border-slate-200 rounded-full focus:outline-none focus:ring-2 focus:ring-emerald-500" /><button onClick={handleAddTag} className="p-1 bg-slate-100 text-slate-500 rounded-full hover:bg-emerald-500 hover:text-white"><Plus size={16} /></button></div>
            </div>
            <div><h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Notas Internas</h3><textarea value={localNote} onChange={(e) => setLocalNote(e.target.value)} onBlur={handleSaveNote} className="w-full h-24 bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-yellow-400 resize-none placeholder:text-yellow-700/50" placeholder="Digite observações..."></textarea><p className="text-[10px] text-slate-400 mt-1 text-right">Salvo automaticamente</p></div>
            <div className="pt-6 border-t border-slate-100">
              <button onClick={handleDeleteGuest} className="w-full py-3 border border-red-100 text-red-500 rounded-lg hover:bg-red-50 text-xs font-bold flex items-center justify-center gap-2 transition-colors"><Trash2 size={16} /> Excluir Cadastro</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}