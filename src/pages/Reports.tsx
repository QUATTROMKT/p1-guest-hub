import { useState, useEffect } from 'react';
import { subscribeToGuests, subscribeToTasks } from '../services/chatService';
import { Users, ClipboardList, TrendingUp, Award, BarChart3 } from 'lucide-react';

interface AgentStats {
    name: string;
    guestsCount: number;
    tasksCount: number;
}

export default function Reports() {
    const [stats, setStats] = useState<AgentStats[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Carregar dados de hóspedes e tarefas em paralelo
        const unsubscribeGuests = subscribeToGuests((guests: any[]) => {
            const guestMap = new Map<string, number>();

            guests.forEach(g => {
                const agent = g.createdBy || 'Sistema';
                guestMap.set(agent, (guestMap.get(agent) || 0) + 1);
            });

            // Precisamos dos dados de tarefas também, então vamos subscrever e combinar
            const unsubscribeTasks = subscribeToTasks((tasks: any[]) => {
                const taskMap = new Map<string, number>();

                tasks.forEach(t => {
                    const agent = t.createdBy || 'Sistema';
                    taskMap.set(agent, (taskMap.get(agent) || 0) + 1);
                });

                // Combinar os dados e remover "Sistema" se quiser focar apenas em humanos, 
                // mas vamos manter por enquanto para auditoria completa
                const allAgents = new Set([...guestMap.keys(), ...taskMap.keys()]);
                const combinedStats: AgentStats[] = [];

                allAgents.forEach(agent => {
                    if (agent === 'Sistema') return; // Opcional: filtrar sistema
                    combinedStats.push({
                        name: agent,
                        guestsCount: guestMap.get(agent) || 0,
                        tasksCount: taskMap.get(agent) || 0
                    });
                });

                // Ordenar por produtividade total (guests + tasks)
                combinedStats.sort((a, b) => (b.guestsCount + b.tasksCount) - (a.guestsCount + a.tasksCount));

                setStats(combinedStats);
                setLoading(false);
            });

            return () => unsubscribeTasks();
        });

        return () => unsubscribeGuests();
    }, []);

    if (loading) return <div className="p-8 flex items-center justify-center h-full"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div></div>;

    // Top 3 Campeões
    const topGuestAgent = [...stats].sort((a, b) => b.guestsCount - a.guestsCount)[0];
    const topTaskAgent = [...stats].sort((a, b) => b.tasksCount - a.tasksCount)[0];

    return (
        <div className="h-full bg-slate-50 dark:bg-slate-900 p-8 overflow-y-auto transition-colors duration-200">
            <div className="max-w-6xl mx-auto w-full">
                <div className="mb-10">
                    <h1 className="text-3xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                        <BarChart3 size={32} className="text-emerald-600 dark:text-emerald-400" /> Relatórios de Equipe
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400">Acompanhe a produtividade e o desempenho do time</p>
                </div>

                {/* DESTAQUES */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
                    {topGuestAgent && (
                        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
                            <Award className="absolute -right-4 -bottom-4 text-white/20 w-32 h-32" />
                            <div className="relative z-10">
                                <div className="flex items-center gap-2 mb-2 opacity-90"><Users size={20} /> <span className="font-bold uppercase text-xs tracking-wider">Top Atendimento</span></div>
                                <h2 className="text-3xl font-extrabold mb-1">{topGuestAgent.name}</h2>
                                <p className="text-emerald-100">{topGuestAgent.guestsCount} hóspedes cadastrados</p>
                            </div>
                        </div>
                    )}

                    {topTaskAgent && (
                        <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
                            <ClipboardList className="absolute -right-4 -bottom-4 text-white/20 w-32 h-32" />
                            <div className="relative z-10">
                                <div className="flex items-center gap-2 mb-2 opacity-90"><ClipboardList size={20} /> <span className="font-bold uppercase text-xs tracking-wider">Top Resolutivo</span></div>
                                <h2 className="text-3xl font-extrabold mb-1">{topTaskAgent.name}</h2>
                                <p className="text-blue-100">{topTaskAgent.tasksCount} tarefas criadas</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* TABELA DE DETALHES */}
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <div className="p-6 border-b border-slate-100 dark:border-slate-700">
                        <h3 className="font-bold text-lg text-slate-800 dark:text-white flex items-center gap-2">
                            <TrendingUp size={20} className="text-slate-400" /> Detalhes por Colaborador
                        </h3>
                    </div>
                    <table className="w-full text-left">
                        <thead className="bg-slate-50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 uppercase text-xs font-bold tracking-wider">
                            <tr>
                                <th className="p-4">Colaborador</th>
                                <th className="p-4 text-center">Hóspedes Atendidos</th>
                                <th className="p-4 text-center">Tarefas Criadas</th>
                                <th className="p-4 text-right">Produtividade Total</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                            {stats.map((agent, index) => (
                                <tr key={agent.name} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                                    <td className="p-4 flex items-center gap-3">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${index === 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 dark:bg-slate-700 text-slate-500'}`}>
                                            {index + 1}º
                                        </div>
                                        <span className="font-bold text-slate-700 dark:text-slate-200">{agent.name}</span>
                                    </td>
                                    <td className="p-4 text-center text-slate-600 dark:text-slate-300">{agent.guestsCount}</td>
                                    <td className="p-4 text-center text-slate-600 dark:text-slate-300">{agent.tasksCount}</td>
                                    <td className="p-4 text-right">
                                        <span className="font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-1 rounded-full text-xs">
                                            {agent.guestsCount + agent.tasksCount} ações
                                        </span>
                                    </td>
                                </tr>
                            ))}
                            {stats.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="p-8 text-center text-slate-400">
                                        Nenhum dado registrado ainda.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
