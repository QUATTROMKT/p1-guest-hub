import { useState, useEffect } from 'react';
import { getAuth, onAuthStateChanged, type User } from 'firebase/auth';
import { Sidebar } from './components/Sidebar';
import Inbox from './pages/Inbox';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Contacts from './pages/Contacts';
import Tasks from './pages/Tasks';
import Reports from './pages/Reports';
import { hasReportsAccess } from './utils/authUtils';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Navegação
  const [currentPage, setCurrentPage] = useState('dashboard');
  // Memória: Qual hóspede deve abrir automaticamente?
  const [targetGuestId, setTargetGuestId] = useState<string | null>(null);

  // Tema
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Função Inteligente: Vai pro Chat JÁ selecionando o hóspede
  const handleGoToChat = (guestId?: string) => {
    setTargetGuestId(guestId || null);
    setCurrentPage('inbox');
  };

  // Limpa o targetGuestId depois que o Inbox já consumiu o valor
  const clearTargetGuest = () => {
    setTargetGuestId(null);
  };

  // Limpa o targetGuestId ao navegar para outra página
  const handleNavigate = (page: string) => {
    if (page !== 'inbox') {
      setTargetGuestId(null);
    }
    setCurrentPage(page);
  };

  // Redirecionar se tentar acessar reports sem permissão
  useEffect(() => {
    if (currentPage === 'reports' && user && !hasReportsAccess(user)) {
      setCurrentPage('dashboard');
      alert("Acesso restrito a administradores.");
    }
  }, [currentPage, user]);

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <div className="flex h-screen w-full bg-slate-50 dark:bg-slate-900 overflow-hidden font-sans transition-colors duration-200">
      <Sidebar activePage={currentPage} onNavigate={handleNavigate} theme={theme} onToggleTheme={toggleTheme} />

      <main className="flex-1 h-full relative">
        {currentPage === 'dashboard' && (
          <Dashboard />
        )}

        {currentPage === 'reports' && (
          <Reports />
        )}

        {currentPage === 'inbox' && (
          <Inbox initialGuestId={targetGuestId} onInitialGuestHandled={clearTargetGuest} />
        )}

        {currentPage === 'contacts' && (
          <Contacts onNavigateChat={handleGoToChat} />
        )}

        {currentPage === 'tasks' && (
          <Tasks />
        )}
      </main>
    </div>
  );
}

export default App;