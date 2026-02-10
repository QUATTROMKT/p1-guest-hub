import { useState, useEffect } from 'react';
import { Users, Star, LogIn, MessageSquare, TrendingUp, Clock, ChevronRight } from 'lucide-react';
import { subscribeToGuests } from '../services/chatService';

// Recebe a função de navegar do App.tsx
interface DashboardProps {
  onNavigateChat: (guestId: string) => void;
}

export default function Dashboard({ onNavigateChat }: DashboardProps) {
  const [guests, setGuests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = subscribeToGuests((data) => {
      setGuests(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const totalGuests = guests.length;
  const vipGuests = guests.filter(g => g.tags?.includes('VIP')).length;
  const checkInToday = guests.filter(g => g.tags?.includes('Check-in')).length;
  const pendingMsgs = guests.filter(g => g.status === 'pendente').length;
  const recentActivity = guests.slice(0, 3);

  if (loading) return <div className="p-8">Carregando métricas...</div>;

  return (
    <div className="h-full bg-slate-50 dark:bg-slate-900 p-8 overflow-y-auto transition-colors duration-200">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-800 dark:text-white">Painel de Controle</h1>
        <p className="text-slate-500 dark:text-slate-400">Visão geral da operação do P1 Hotel</p>
      </div>

      {/* CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 flex items-center gap-4 transition-colors duration-200">
          <div className="p-4 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl"><Users size={24} /></div>
          <div><p className="text-sm text-slate-400 font-medium">Total Hóspedes</p><h3 className="text-2xl font-bold text-slate-800 dark:text-white">{totalGuests}</h3></div>
        </div>
        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 flex items-center gap-4 transition-colors duration-200">
          <div className="p-4 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-xl"><LogIn size={24} /></div>
          <div><p className="text-sm text-slate-400 font-medium">Check-ins Ativos</p><h3 className="text-2xl font-bold text-slate-800 dark:text-white">{checkInToday}</h3></div>
        </div>
        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 flex items-center gap-4 transition-colors duration-200">
          <div className="p-4 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-xl"><Star size={24} /></div>
          <div><p className="text-sm text-slate-400 font-medium">Hóspedes VIP</p><h3 className="text-2xl font-bold text-slate-800 dark:text-white">{vipGuests}</h3></div>
        </div>
        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 flex items-center gap-4 transition-colors duration-200">
          <div className="p-4 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-xl"><MessageSquare size={24} /></div>
          <div><p className="text-sm text-slate-400 font-medium">Msg Pendentes</p><h3 className="text-2xl font-bold text-slate-800 dark:text-white">{pendingMsgs}</h3></div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* ATIVIDADE RECENTE (AGORA CLICÁVEL) */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 p-6 transition-colors duration-200">
          <h2 className="font-bold text-lg text-slate-800 dark:text-white mb-4 flex items-center gap-2">
            <Clock size={20} className="text-slate-400" /> Atividade Recente
          </h2>
          <div className="space-y-4">
            {recentActivity.map(guest => (
              <div
                key={guest.id}
                onClick={() => onNavigateChat(guest.id)} // <--- O PULO DO GATO
                className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl hover:bg-emerald-50 dark:hover:bg-slate-700 border border-transparent transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-600 overflow-hidden">
                    <img src={guest.avatar} className="w-full h-full object-cover"
                      onError={(e) => (e.currentTarget.src = `https://ui-avatars.com/api/?name=${guest.name}&background=random`)} />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-800 dark:text-slate-100 group-hover:text-emerald-700 dark:group-hover:text-emerald-400">{guest.name}</h4>
                    <p className="text-sm text-slate-500 dark:text-slate-400 truncate max-w-[200px]">{guest.lastMessage}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-400 dark:text-slate-500 bg-white dark:bg-slate-800 px-2 py-1 rounded border border-slate-200 dark:border-slate-600">
                    {guest.lastMessageTime?.seconds ? new Date(guest.lastMessageTime.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Agora'}
                  </span>
                  <ChevronRight size={16} className="text-slate-300 dark:text-slate-600 group-hover:text-emerald-500" />
                </div>
              </div>
            ))}
            {guests.length === 0 && <p className="text-slate-400 text-center py-4">Nenhuma atividade registrada.</p>}
          </div>
        </div>

        {/* STATUS DO SISTEMA */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 p-6 transition-colors duration-200">
          <h2 className="font-bold text-lg text-slate-800 dark:text-white mb-4 flex items-center gap-2">
            <TrendingUp size={20} className="text-slate-400" /> Status do Sistema
          </h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between"><span className="text-sm text-slate-500 dark:text-slate-400">Z-API Conexão</span><span className="text-xs font-bold text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 px-2 py-1 rounded-full">Online</span></div>
            <div className="flex items-center justify-between"><span className="text-sm text-slate-500 dark:text-slate-400">Firebase Banco</span><span className="text-xs font-bold text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 px-2 py-1 rounded-full">Online</span></div>
            <div className="flex items-center justify-between"><span className="text-sm text-slate-500 dark:text-slate-400">Webhook</span><span className="text-xs font-bold text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 px-2 py-1 rounded-full">Ativo</span></div>
            <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-700"><p className="text-xs text-slate-400 text-center">P1 Guest Hub v1.0</p></div>
          </div>
        </div>
      </div>
    </div>
  );
}