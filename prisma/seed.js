import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function upsertUser({ email, name, role, plainPassword }) {
  const passwordHash = await bcrypt.hash(plainPassword, 10);
  return prisma.user.upsert({
    where: { email },
    update: { name, role, passwordHash },
    create: { email, name, role, passwordHash }
  });
}

async function main() {
  await upsertUser({ email: 'admin@hardsoft.local', name: 'Admin Demo', role: 'admin_gerente', plainPassword: '123456' });
  await upsertUser({ email: 'operador@hardsoft.local', name: 'Operador Demo', role: 'operador', plainPassword: '123456' });
  await upsertUser({ email: 'consulta@hardsoft.local', name: 'Consulta Demo', role: 'consulta', plainPassword: '123456' });

  const tasa = await prisma.tasa.findFirst();
  if (!tasa) {
    await prisma.tasa.create({
      data: { bcv: 40.73, paralela: 41.04, fuente: 'api' }
    });
  }

  const plan = await prisma.planilla.findFirst();
  if (!plan) {
    await prisma.planilla.create({
      data: {
        correlativo: '0001',
        cliente: 'Fundación Pacífico C.A.',
        proyecto: 'Desarrollo de Z Facturación Digital',
        montoBrutoUsd: 1680.56
      }
    });
  }

  console.log('✅ Seed completado');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
