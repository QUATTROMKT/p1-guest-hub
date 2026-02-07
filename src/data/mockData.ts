export interface Message {
  id: string;
  text: string;
  sender: 'guest' | 'agent' | 'system';
  timestamp: string;
  type: 'text' | 'template';
}

export interface Guest {
  id: string;
  name: string;
  phone: string;
  avatar: string;
  status: 'pendente' | 'resolvido' | 'atendimento';
  checkIn: string;
  checkOut: string;
  room: string;
  tags: string[];
  messages: Message[];
}

export const mockGuests: Guest[] = [
  {
    id: '1',
    name: 'Matheus Silva',
    phone: '+55 55 99638-0785',
    avatar: 'https://ui-avatars.com/api/?name=Matheus+Silva&background=0D9488&color=fff',
    status: 'pendente',
    checkIn: '24/01/2026',
    checkOut: '27/01/2026',
    room: '204 - Luxo',
    tags: ['VIP', 'Check-in Hoje'],
    messages: [
      { id: 'm1', text: 'Olá Matheus, sua reserva no P1 Hotel está confirmada!', sender: 'agent', timestamp: '10:00', type: 'template' },
      { id: 'm2', text: 'Obrigado! Vocês aceitam pet?', sender: 'guest', timestamp: '10:05', type: 'text' },
      { id: 'm3', text: 'Aceitamos sim! Temos uma taxa de R$ 50.', sender: 'agent', timestamp: '10:07', type: 'text' },
    ]
  },
  {
    id: '2',
    name: 'Ana Pereira',
    phone: '+55 51 98877-1234',
    avatar: 'https://ui-avatars.com/api/?name=Ana+Pereira&background=64748B&color=fff',
    status: 'resolvido',
    checkIn: '25/01/2026',
    checkOut: '28/01/2026',
    room: '101 - Standard',
    tags: ['Pago'],
    messages: [
      { id: 'm1', text: 'Bom dia, gostaria de adiantar meu check-in.', sender: 'guest', timestamp: '09:30', type: 'text' },
    ]
  }
];