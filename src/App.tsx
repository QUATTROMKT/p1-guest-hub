import { useState, useEffect } from 'react';
import { getAuth, onAuthStateChanged, type User } from 'firebase/auth';
import { Sidebar } from './components/Sidebar';
import Inbox from './pages/Inbox';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Contacts from './pages/Contacts';
import Tasks from './pages/Tasks';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Navegação
  const [currentPage, setCurrentPage] = useState('dashboard');
  // Memória: Qual hóspede deve abrir automaticamente?
  const [targetGuestId, setTargetGuestId] = useState<string | null>(null);

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
    if (guestId) setTargetGuestId(guestId);
    setCurrentPage('inbox');
  };

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
    <div className="flex h-screen w-full bg-slate-50 overflow-hidden font-sans">
      <Sidebar activePage={currentPage} onNavigate={setCurrentPage} />

      <main className="flex-1 h-full relative">
        {currentPage === 'dashboard' && (
          <Dashboard onNavigateChat={handleGoToChat} />
        )}

        {currentPage === 'inbox' && (
          <Inbox initialGuestId={targetGuestId} />
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