import { LayoutDashboard, MessageSquare, LogOut, Users, ClipboardList, Moon, Sun, BarChart3 } from 'lucide-react';
import { getAuth, signOut } from 'firebase/auth';
import { hasReportsAccess, getAgentName } from '../utils/authUtils';

interface SidebarProps {
  activePage: string;
  onNavigate: (page: string) => void;
  theme: string;
  onToggleTheme: () => void;
}

export function Sidebar({ activePage, onNavigate, theme, onToggleTheme }: SidebarProps) {
  const auth = getAuth();
  const agentName = auth.currentUser ? getAgentName(auth.currentUser) : '';
  const firstName = agentName.split(' ')[0];

  return (
    <aside className="w-20 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col items-center py-6 shadow-sm z-20 transition-colors duration-200">
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

        {hasReportsAccess(getAuth().currentUser) && (
          <button
            onClick={() => onNavigate('reports')}
            className={`p-3 rounded-xl transition-all group flex justify-center ${activePage === 'reports' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-200' : 'text-slate-400 hover:bg-slate-50 hover:text-emerald-600'}`}
            title="Relatórios"
          >
            <BarChart3 size={24} />
          </button>
        )}
      </nav>

      <div className="mt-auto flex flex-col items-center gap-4 mb-4">
        {firstName && (
          <div className="flex flex-col items-center mb-2">
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider truncate max-w-[60px] text-center" title={agentName}>
              {firstName}
            </span>
          </div>
        )}
        <button
          onClick={onToggleTheme}
          className="p-3 text-slate-400 hover:text-emerald-600 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-colors"
          title={theme === 'dark' ? 'Modo Claro' : 'Modo Escuro'}
        >
          {theme === 'dark' ? <Sun size={24} /> : <Moon size={24} />}
        </button>

        <button
          onClick={() => signOut(getAuth())}
          className="p-3 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors"
          title="Sair"
        >
          <LogOut size={24} />
        </button>
      </div>
    </aside>
  );
}