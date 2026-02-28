import pkg from '@prisma/client';
const { PrismaClient } = pkg;

// Activación explícita para evitar caídas si DATABASE_URL aún no está lista
const useDb = process.env.USE_DB === '1' && !!process.env.DATABASE_URL;
export const prisma = useDb ? new PrismaClient() : null;
export const dbEnabled = !!prisma;
