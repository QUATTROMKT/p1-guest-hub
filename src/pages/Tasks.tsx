import { useState, useEffect } from 'react';
import { getAuth } from 'firebase/auth'; // Import auth
import { ClipboardList, Plus, CheckCircle, Circle, Trash2, Home, User } from 'lucide-react';
import { subscribeToTasks, createTask, updateTask, deleteTask } from '../services/chatService';

interface Task {
    id: string;
    title: string;
    description?: string; // Detalhes (ex: "Toalhas x2")
    guestName?: string;
    room?: string;
    createdBy?: string; // Quem criou a tarefa
    status: 'pending' | 'done';
    createdAt: any;
}

export default function Tasks() {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [showModal, setShowModal] = useState(false);
    const [newTask, setNewTask] = useState({ title: '', guestName: '', room: '' });

    useEffect(() => {
        const unsubscribe = subscribeToTasks((data) => {
            setTasks(data as Task[]);
        });
        return () => unsubscribe();
    }, []);

    const handleCreateTask = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTask.title) return;
        const auth = getAuth();
        const agentName = auth.currentUser?.email?.split('@')[0] || "Sistema";

        await createTask({
            ...newTask,
            description: '', // Pode expandir depois
            createdBy: agentName
        });
        setShowModal(false);
        setNewTask({ title: '', guestName: '', room: '' });
    };

    const toggleStatus = async (task: Task) => {
        const newStatus = task.status === 'pending' ? 'done' : 'pending';
        await updateTask(task.id, { status: newStatus });
    };

    const handleDelete = async (taskId: string) => {
        if (window.confirm('Excluir tarefa?')) {
            await deleteTask(taskId);
        }
    }

    const pendingTasks = tasks.filter(t => t.status === 'pending');
    const doneTasks = tasks.filter(t => t.status === 'done');

    return (
        <div className="h-full bg-slate-50 dark:bg-slate-900 p-8 overflow-y-auto transition-colors duration-200">
            <div className="max-w-6xl mx-auto w-full">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                            <ClipboardList size={32} className="text-emerald-600 dark:text-emerald-400" /> Tarefas & Solicitações
                        </h1>
                        <p className="text-slate-500 dark:text-slate-400">Gerencie os pedidos dos hóspedes</p>
                    </div>
                    <button
                        onClick={() => setShowModal(true)}
                        className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-emerald-700 shadow-lg"
                    >
                        <Plus size={20} /> Nova Tarefa
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* COLUNA PENDENTES */}
                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors duration-200">
                        <h2 className="text-lg font-bold text-slate-700 dark:text-slate-200 mb-4 flex items-center gap-2">
                            <Circle size={20} className="text-orange-500" /> Pendentes ({pendingTasks.length})
                        </h2>
                        <div className="space-y-3">
                            {pendingTasks.map(task => (
                                <div key={task.id} className="p-4 bg-orange-50/50 dark:bg-orange-900/10 border border-orange-100 dark:border-orange-900/30 rounded-lg group hover:shadow-md transition-all">
                                    <div className="flex justify-between items-start">
                                        <div className="flex items-start gap-3">
                                            <button onClick={() => toggleStatus(task)} className="mt-1 text-slate-400 dark:text-slate-500 hover:text-emerald-500">
                                                <Circle size={20} />
                                            </button>
                                            <div>
                                                <h3 className="font-bold text-slate-800 dark:text-slate-200">{task.title}</h3>
                                                <div className="flex flex-col gap-1 mt-1">
                                                    {(task.guestName || task.room) && (
                                                        <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                                                            {task.guestName && <span className="flex items-center gap-1"><User size={12} /> {task.guestName}</span>}
                                                            {task.room && <span className="flex items-center gap-1"><Home size={12} /> Q. {task.room}</span>}
                                                        </div>
                                                    )}
                                                    {task.createdBy && (
                                                        <span className="text-[10px] text-slate-400 dark:text-slate-500 italic">Por: {task.createdBy}</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <button onClick={() => handleDelete(task.id)} className="text-slate-300 dark:text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {pendingTasks.length === 0 && <p className="text-slate-400 dark:text-slate-500 text-center py-8">Nenhuma tarefa pendente. Tudo limpo! ✨</p>}
                        </div>
                    </div>

                    {/* COLUNA CONCLUÍDAS */}
                    <div className="bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 opacity-80">
                        <h2 className="text-lg font-bold text-slate-700 dark:text-slate-400 mb-4 flex items-center gap-2">
                            <CheckCircle size={20} className="text-emerald-600 dark:text-emerald-500" /> Concluídas ({doneTasks.length})
                        </h2>
                        <div className="space-y-3">
                            {doneTasks.map(task => (
                                <div key={task.id} className="p-4 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-lg flex justify-between items-start opacity-75 hover:opacity-100 transition-opacity">
                                    <div className="flex items-start gap-3">
                                        <button onClick={() => toggleStatus(task)} className="mt-1 text-emerald-600 dark:text-emerald-500">
                                            <CheckCircle size={20} />
                                        </button>
                                        <div>
                                            <h3 className="font-bold text-slate-600 dark:text-slate-400 line-through decoration-slate-400">{task.title}</h3>
                                            {(task.guestName || task.room) && (
                                                <div className="flex items-center gap-3 mt-1 text-xs text-slate-400 dark:text-slate-500">
                                                    {task.guestName && <span>{task.guestName}</span>}
                                                    {task.room && <span>Q. {task.room}</span>}
                                                </div>
                                            )}
                                            {task.createdBy && <div className="text-[10px] text-slate-300 dark:text-slate-600 mt-1">Por: {task.createdBy}</div>}
                                        </div>
                                    </div>
                                    <button onClick={() => handleDelete(task.id)} className="text-slate-300 dark:text-slate-600 hover:text-red-400">
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* MODAL */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md p-6 animate-in fade-in zoom-in duration-200">
                        <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-4">Nova Solicitação</h2>
                        <form onSubmit={handleCreateTask} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">O que precisa ser feito?</label>
                                <input
                                    autoFocus
                                    type="text"
                                    required
                                    placeholder="Ex: Levar toalhas extras"
                                    className="w-full p-2 border border-slate-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white dark:bg-slate-700 text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500"
                                    value={newTask.title}
                                    onChange={e => setNewTask({ ...newTask, title: e.target.value })}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Hóspede (Opcional)</label>
                                    <input
                                        type="text"
                                        className="w-full p-2 border border-slate-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white dark:bg-slate-700 text-slate-800 dark:text-white"
                                        value={newTask.guestName}
                                        onChange={e => setNewTask({ ...newTask, guestName: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Quarto (Opcional)</label>
                                    <input
                                        type="text"
                                        placeholder="Ex: 202"
                                        className="w-full p-2 border border-slate-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white dark:bg-slate-700 text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500"
                                        value={newTask.room}
                                        onChange={e => setNewTask({ ...newTask, room: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="flex gap-3 mt-6 pt-4 border-t border-slate-100 dark:border-slate-700">
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="flex-1 py-2 text-slate-600 dark:text-slate-400 font-bold hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 py-2 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 transition-colors shadow-lg"
                                >
                                    Criar Tarefa
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
