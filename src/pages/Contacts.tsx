import React, { useState, useEffect } from 'react';
import { Search, Phone, MessageSquare, Trash2, Plus, Filter } from 'lucide-react';
import { subscribeToGuests, deleteGuest, createGuest, updateGuest } from '../services/chatService';

interface Guest {
    id: string; name: string; phone: string; avatar: string;
    status: string; tags: string[]; notes?: string; lastMessage?: string; lastMessageTime?: any;
    email?: string; cpf?: string;
}

interface ContactsProps {
    onNavigateChat: (guestId: string) => void;
}

export default function Contacts({ onNavigateChat }: ContactsProps) {
    const [guests, setGuests] = useState<Guest[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newContact, setNewContact] = useState({ name: '', phone: '', email: '', cpf: '' });
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        const unsubscribe = subscribeToGuests((data: any[]) => {
            setGuests(data as Guest[]);
        });
        return () => unsubscribe();
    }, []);

    const filteredGuests = guests.filter(g => {
        const matchesSearch = g.name.toLowerCase().includes(searchTerm.toLowerCase()) || g.phone.includes(searchTerm);
        const matchesStatus = statusFilter === 'all' || g.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    const handleCreateContact = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newContact.name || !newContact.phone) return alert("Nome e Telefone são obrigatórios");

        setIsLoading(true);
        try {
            await createGuest({
                ...newContact,
                avatar: `https://ui-avatars.com/api/?name=${newContact.name}&background=random`,
                tags: ['NOVO'],
                messages: []
            });
            setIsModalOpen(false);
            setNewContact({ name: '', phone: '', email: '', cpf: '' });
            alert("Contato criado com sucesso!");
        } catch (error) {
            console.error(error);
            alert("Erro ao criar contato");
        } finally {
            setIsLoading(false);
        }
    };

    const handleUpdateStatus = async (guestId: string, newStatus: string) => {
        await updateGuest(guestId, { status: newStatus });
    };

    const handleDelete = async (guest: Guest) => {
        if (window.confirm(`Excluir ${guest.name}?`)) {
            await deleteGuest(guest.id);
        }
    };

    return (
        <div className="flex h-full w-full bg-slate-50 p-8 overflow-y-auto">
            <div className="max-w-6xl mx-auto w-full">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-800">Contatos</h1>
                        <p className="text-slate-500">Gerencie sua base de hóspedes e leads</p>
                    </div>
                    <button
                        onClick={() => setIsModalOpen(true)}
                        className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-emerald-700 shadow-lg transition-all transform hover:scale-105"
                    >
                        <Plus size={20} /> Novo Contato
                    </button>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    {/* FILTROS */}
                    <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row gap-4 items-center bg-slate-50/50">
                        <div className="relative flex-1 w-full">
                            <Search className="absolute left-3 top-3 text-slate-400 w-4 h-4" />
                            <input
                                type="text"
                                placeholder="Buscar por nome ou telefone..."
                                className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <div className="flex items-center gap-2 w-full md:w-auto">
                            <Filter size={18} className="text-slate-400" />
                            <select
                                value={statusFilter}
                                onChange={e => setStatusFilter(e.target.value)}
                                className="p-2 border border-slate-200 rounded-lg bg-white text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 flex-1"
                            >
                                <option value="all">Todos os Status</option>
                                <option value="lead">Em Negociação</option>
                                <option value="reserva">Reserva Confirmada</option>
                                <option value="checkin">Hóspede na Casa</option>
                                <option value="checkout">Finalizado</option>
                            </select>
                        </div>
                    </div>

                    {/* TABELA */}
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-slate-50 text-slate-500 uppercase text-xs font-bold tracking-wider">
                                <tr>
                                    <th className="p-4">Hóspede</th>
                                    <th className="p-4">Status</th>
                                    <th className="p-4">Contato</th>
                                    <th className="p-4 hidden md:table-cell">Tags</th>
                                    <th className="p-4 text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredGuests.map(guest => (
                                    <tr key={guest.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="p-4">
                                            <div className="flex items-center gap-3">
                                                <img src={guest.avatar} className="w-10 h-10 rounded-full object-cover bg-slate-200" onError={(e) => (e.currentTarget.src = `https://ui-avatars.com/api/?name=${guest.name}&background=random`)} />
                                                <div>
                                                    <div className="font-bold text-slate-800">{guest.name}</div>
                                                    <div className="text-xs text-slate-400">CPF: {guest.cpf || '-'}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <select
                                                value={guest.status}
                                                onChange={(e) => handleUpdateStatus(guest.id, e.target.value)}
                                                className={`px-2 py-1 rounded-full text-xs font-bold border-none outline-none cursor-pointer appearance-none text-center w-full max-w-[140px]
                                                    ${guest.status === 'reserva' ? 'bg-blue-100 text-blue-700' :
                                                        guest.status === 'checkin' ? 'bg-emerald-100 text-emerald-700' :
                                                            guest.status === 'checkout' ? 'bg-slate-100 text-slate-700' :
                                                                'bg-yellow-100 text-yellow-700'}`}
                                            >
                                                <option value="lead">Em Negociação</option>
                                                <option value="reserva">Reserva Confirmada</option>
                                                <option value="checkin">Hóspede na Casa</option>
                                                <option value="checkout">Finalizado</option>
                                            </select>
                                        </td>
                                        <td className="p-4">
                                            <div className="flex flex-col text-sm">
                                                <a href={`tel:${guest.phone}`} className="flex items-center gap-1 text-slate-600 hover:text-emerald-600 font-medium">
                                                    <Phone size={14} /> {guest.phone}
                                                </a>
                                                <span className="text-xs text-slate-400">{guest.email || '-'}</span>
                                            </div>
                                        </td>
                                        <td className="p-4 hidden md:table-cell">
                                            <div className="flex flex-wrap gap-1">
                                                {guest.tags?.slice(0, 3).map(tag => (
                                                    <span key={tag} className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-[10px] font-bold border border-slate-200 uppercase">{tag}</span>
                                                ))}
                                            </div>
                                        </td>
                                        <td className="p-4 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => onNavigateChat(guest.id)}
                                                    className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                                    title="Abrir Chat"
                                                >
                                                    <MessageSquare size={18} />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(guest)}
                                                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                    title="Excluir"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {filteredGuests.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="p-8 text-center text-slate-400">
                                            Nenhum contato encontrado.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className="p-4 border-t border-slate-100 bg-slate-50 text-xs text-slate-400 text-center">
                        Exibindo {filteredGuests.length} de {guests.length} contatos
                    </div>
                </div>
            </div>

            {/* MODAL NOVO CONTATO */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-in fade-in zoom-in duration-200">
                        <h2 className="text-xl font-bold text-slate-800 mb-4">Novo Contato</h2>
                        <form onSubmit={handleCreateContact} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-600 mb-1">Nome Completo</label>
                                <input
                                    type="text"
                                    required
                                    className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                    value={newContact.name}
                                    onChange={e => setNewContact({ ...newContact, name: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-600 mb-1">Telefone (Whatsapp)</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="5511999999999"
                                    className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                    value={newContact.phone}
                                    onChange={e => setNewContact({ ...newContact, phone: e.target.value })}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-600 mb-1">Email (Opcional)</label>
                                    <input
                                        type="email"
                                        className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                        value={newContact.email}
                                        onChange={e => setNewContact({ ...newContact, email: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-600 mb-1">CPF (Opcional)</label>
                                    <input
                                        type="text"
                                        className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                        value={newContact.cpf}
                                        onChange={e => setNewContact({ ...newContact, cpf: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="flex gap-3 mt-6 pt-4 border-t border-slate-100">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="flex-1 py-2 text-slate-600 font-bold hover:bg-slate-100 rounded-lg transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    className="flex-1 py-2 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 transition-colors shadow-lg disabled:opacity-50"
                                >
                                    {isLoading ? 'Salvando...' : 'Salvar Contato'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
