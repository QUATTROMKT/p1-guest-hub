import { LayoutDashboard, MessageSquare, LogOut, Users, ClipboardList } from 'lucide-react';
import { getAuth, signOut } from 'firebase/auth';

interface SidebarProps {
  activePage: string;
  onNavigate: (page: string) => void;
}

export function Sidebar({ activePage, onNavigate }: SidebarProps) {
  return (
    <aside className="w-20 bg-white border-r border-slate-200 flex flex-col items-center py-6 shadow-sm z-20">
      <div className="mb-8 p-2 bg-emerald-100 rounded-xl">
        <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center text-white font-bold text-lg">
          P1
        </div>
      </div>

      <nav className="flex-1 flex flex-col gap-4 w-full px-2">
        <button
          onClick={() => onNavigate('dashboard')}
          className={`p-3 rounded-xl transition-all group flex justify-center ${activePage === 'dashboard' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-200' : 'text-slate-400 hover:bg-slate-50 hover:text-emerald-600'}`}
          title="Dashboard"
        >
          <LayoutDashboard size={24} />
        </button>

        <button
          onClick={() => onNavigate('inbox')}
          className={`p-3 rounded-xl transition-all group flex justify-center ${activePage === 'inbox' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-200' : 'text-slate-400 hover:bg-slate-50 hover:text-emerald-600'}`}
          title="Mensagens"
        >
          <MessageSquare size={24} />
        </button>

        <button
          onClick={() => onNavigate('contacts')}
          className={`p-3 rounded-xl transition-all group flex justify-center ${activePage === 'contacts' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-200' : 'text-slate-400 hover:bg-slate-50 hover:text-emerald-600'}`}
          title="Contatos"
        >
          <Users size={24} />
        </button>

        <button
          onClick={() => onNavigate('tasks')}
          className={`p-3 rounded-xl transition-all group flex justify-center ${activePage === 'tasks' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-200' : 'text-slate-400 hover:bg-slate-50 hover:text-emerald-600'}`}
          title="Tarefas"
        >
          <ClipboardList size={24} />
        </button>
      </nav>

      <button
        onClick={() => signOut(getAuth())}
        className="p-3 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors mt-auto"
        title="Sair"
      >
        <LogOut size={24} />
      </button>
    </aside>
  );
}