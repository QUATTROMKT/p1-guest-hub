import { useState, useEffect } from 'react';
import { Users, MessageSquare, Briefcase } from 'lucide-react';
import { subscribeToGuests } from '../services/chatService';

export default function Dashboard() {
  const [guests, setGuests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = subscribeToGuests((data) => {
      setGuests(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const totalConversations = guests.length; // Conversas (numero de conversas unicas)
  const activeGuests = guests.filter(g => g.status === 'checkin').length; // Hóspedes ativos (conta somente após mudança de status checkin)
  const confirmedReservations = guests.filter(g => g.status === 'reserva').length; // Reservas confirmadas (somente após mudança de status reserva)
  const unreadMessages = guests.reduce((acc, g) => acc + (g.unreadCount || 0), 0); // Mensagens não lidas

  if (loading) return <div className="p-8 flex items-center justify-center h-full"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div></div>;

  return (
    <div className="h-full bg-slate-50 dark:bg-slate-900 p-8 overflow-y-auto transition-colors duration-200 flex flex-col items-center justify-center">
      <div className="w-full max-w-5xl">
        <div className="mb-12 text-center">
          <h1 className="text-4xl font-bold text-slate-800 dark:text-white mb-2">Painel de Controle</h1>
          <p className="text-slate-500 dark:text-slate-400 text-lg">Visão geral da operação do P1 Hotel</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Card 1: Conversas */}
          <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-lg border border-slate-100 dark:border-slate-700 flex items-center gap-6 transition-transform hover:scale-105 duration-200">
            <div className="p-5 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-2xl">
              <MessageSquare size={32} />
            </div>
            <div>
              <p className="text-base text-slate-500 dark:text-slate-400 font-medium mb-1">Conversas Totais</p>
              <h3 className="text-4xl font-extrabold text-slate-800 dark:text-white">{totalConversations}</h3>
            </div>
          </div>

          {/* Card 2: Hóspedes Ativos */}
          <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-lg border border-slate-100 dark:border-slate-700 flex items-center gap-6 transition-transform hover:scale-105 duration-200">
            <div className="p-5 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 rounded-2xl">
              <Users size={32} />
            </div>
            <div>
              <p className="text-base text-slate-500 dark:text-slate-400 font-medium mb-1">Hóspedes Ativos</p>
              <h3 className="text-4xl font-extrabold text-slate-800 dark:text-white">{activeGuests}</h3>
            </div>
          </div>

          {/* Card 3: Reservas Confirmadas */}
          <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-lg border border-slate-100 dark:border-slate-700 flex items-center gap-6 transition-transform hover:scale-105 duration-200">
            <div className="p-5 bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 rounded-2xl">
              <Briefcase size={32} />
            </div>
            <div>
              <p className="text-base text-slate-500 dark:text-slate-400 font-medium mb-1">Reservas Confirmadas</p>
              <h3 className="text-4xl font-extrabold text-slate-800 dark:text-white">{confirmedReservations}</h3>
            </div>
          </div>

          {/* Card 4: Mensagens Não Lidas */}
          <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-lg border border-slate-100 dark:border-slate-700 flex items-center gap-6 transition-transform hover:scale-105 duration-200">
            <div className="p-5 bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 rounded-2xl">
              <MessageSquare size={32} />
            </div>
            <div>
              <p className="text-base text-slate-500 dark:text-slate-400 font-medium mb-1">Não Lidas</p>
              <h3 className="text-4xl font-extrabold text-slate-800 dark:text-white">{unreadMessages}</h3>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}