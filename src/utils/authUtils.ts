import type { User } from 'firebase/auth';

export const getAgentName = (user: User | null): string => {
    if (!user || !user.email) return "Sistema";

    const email = user.email.toLowerCase();

    // Mapeamentos Específicos
    if (email.includes('admin')) return "Gestão";
    if (email.includes('caduteste')) return "Kadu (Dev)";

    // Extração do nome pelo email (ex: danise@p1.com -> Danise)
    const namePart = email.split('@')[0];

    // Capitalizar primeira letra (ex: danise -> Danise)
    return namePart.charAt(0).toUpperCase() + namePart.slice(1);
};

export const hasReportsAccess = (user: User | null): boolean => {
    if (!user || !user.email) return false;
    const email = user.email.toLowerCase();
    return email.includes('admin') || email === 'fabricio@p1.com';
};
