import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import dotenv from 'dotenv';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';
import fastifyStatic from '@fastify/static';
import { createClient } from '@supabase/supabase-js';
import { prisma, dbEnabled } from './db.js';

dotenv.config();

const app = Fastify({ logger: true, routerOptions: { maxParamLength: 2048 } });

const corsOrigins = (process.env.CORS_ORIGINS || '*').split(',').map(x => x.trim()).filter(Boolean);
const corsOriginHandler = corsOrigins.includes('*')
  ? true
  : (origin, cb) => {
      if (!origin || corsOrigins.includes(origin)) return cb(null, true);
      return cb(null, false);
    };

await app.register(cors, { origin: corsOriginHandler });
await app.register(rateLimit, {
  max: Number(process.env.RATE_LIMIT_MAX || 120),
  timeWindow: process.env.RATE_LIMIT_WINDOW || '1 minute'
});
await app.register(jwt, { secret: process.env.JWT_SECRET || 'dev-secret-change-me' });
await app.register(fastifyStatic, {
  root: path.join(process.cwd(), 'public'),
  prefix: '/'
});

const usersMem = [
  { id: 'u1', email: 'admin@hardsoft.local', password: '123456', role: 'admin_gerente', name: 'Admin Demo' },
  { id: 'u2', email: 'operador@hardsoft.local', password: '123456', role: 'operador', name: 'Operador Demo' },
  { id: 'u3', email: 'consulta@hardsoft.local', password: '123456', role: 'consulta', name: 'Consulta Demo' }
];

const planillasMem = [
  {
    id: 'pln_001', correlativo: '0001', fecha: new Date().toISOString(),
    cliente: 'Fundación Pacífico C.A.', proyecto: 'Desarrollo de Z Facturación Digital',
    monto_bruto_usd: 1680.56
  }
];

const tasasMem = [
  { id: 'rate_001', fecha: new Date().toISOString(), bcv: 40.73, paralela: 41.04, fuente: 'api' }
];

const canWrite = (role) => role === 'admin_gerente' || role === 'operador';
const canDeletePlanilla = (role) => role === 'admin_gerente';
const canReadAudit = (role) => role === 'admin_gerente' || role === 'operador';

const STORAGE_DIR = process.env.FILE_STORAGE_DIR || path.join(process.cwd(), 'storage', 'pdfs');
const API_PUBLIC_BASE = process.env.API_PUBLIC_BASE || `http://127.0.0.1:${process.env.PORT || 4000}`;

const SB_URL = process.env.SUPABASE_URL || '';
const SB_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SB_STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'planillas-pdf';
const sbAdmin = (SB_URL && SB_SERVICE_ROLE_KEY)
  ? createClient(SB_URL, SB_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

function ensureStorageDir() {
  if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

async function findPlanillaByIdOrCorrelativo(idOrCorrelativo) {
  if (!dbEnabled) return planillasMem.find(x => x.id === idOrCorrelativo || String(x.correlativo) === String(idOrCorrelativo)) || null;
  return prisma.planilla.findFirst({ where: { OR: [{ id: idOrCorrelativo }, { correlativo: idOrCorrelativo }] } });
}

async function buildPlanillaPdfBuffer(planilla) {
  const monto = Number(planilla.monto_bruto_usd ?? planilla.montoBrutoUsd ?? 0);
  const correlativo = String(planilla.correlativo || '').padStart(4, '0');
  const fecha = new Date(planilla.fecha || Date.now()).toLocaleString('es-VE');

  const doc = new PDFDocument({ size: 'A4', margin: 48 });
  const chunks = [];
  doc.on('data', chunk => chunks.push(chunk));
  const pdfBufferPromise = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  doc.fontSize(18).text('MAM HARDSOFT NETWORK TECHNOLOGY C.A.', { align: 'center' });
  doc.moveDown(0.2);
  doc.fontSize(14).text('Planilla de Consultoría (Oficial)', { align: 'center' });
  doc.moveDown(1.2);
  doc.fontSize(11);
  doc.text(`Correlativo: ${correlativo}`);
  doc.text(`Fecha: ${fecha}`);
  doc.text(`Cliente: ${planilla.cliente || '-'}`);
  doc.text(`Proyecto: ${planilla.proyecto || '-'}`);
  doc.moveDown(0.8);
  doc.fontSize(12).text(`Monto bruto (USD): ${monto.toFixed(2)}`);
  doc.moveDown(1.2);
  doc.fontSize(9).fillColor('#555').text('Documento generado por API (server-side PDF).', { align: 'left' });
  doc.end();

  const buffer = await pdfBufferPromise;
  return { buffer, correlativo };
}

async function publishPdfToCloudOrLocal({ buffer, fileName }) {
  if (sbAdmin) {
    const storagePath = `planillas/${fileName}`;
    const up = await sbAdmin.storage.from(SB_STORAGE_BUCKET).upload(storagePath, buffer, {
      contentType: 'application/pdf',
      upsert: true
    });
    if (up.error) throw new Error(`Supabase storage upload error: ${up.error.message}`);

    const signed = await sbAdmin.storage.from(SB_STORAGE_BUCKET).createSignedUrl(storagePath, 60 * 60 * 24);
    if (signed.error || !signed.data?.signedUrl) {
      throw new Error(`Supabase signed url error: ${signed.error?.message || 'sin url'}`);
    }
    return {
      mode: 'supabase',
      storagePath,
      signedUrl: signed.data.signedUrl,
      expiresIn: '24h'
    };
  }

  ensureStorageDir();
  const filePath = path.join(STORAGE_DIR, fileName);
  fs.writeFileSync(filePath, buffer);
  const token = app.jwt.sign({ type: 'file_pdf', fileName }, { expiresIn: '24h' });
  return {
    mode: 'local',
    filePath,
    signedUrl: `${API_PUBLIC_BASE}/api/v1/files/pdf/${token}`,
    expiresIn: '24h'
  };
}

function getRequestMeta(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = forwarded || req.ip || req.socket?.remoteAddress || null;
  const userAgent = String(req.headers['user-agent'] || '').trim() || null;
  return { ip, userAgent };
}

async function auditLog({ req, recurso, recursoId = null, accion, beforeJson = null, afterJson = null, planillaId = null, tasaId = null }) {
  if (!dbEnabled || !prisma || !req?.user?.sub) return;
  try {
    const { ip, userAgent } = getRequestMeta(req);
    await prisma.auditLog.create({
      data: {
        userId: req.user.sub,
        recurso,
        recursoId,
        accion,
        beforeJson,
        afterJson,
        ip,
        userAgent,
        planillaId,
        tasaId
      }
    });
  } catch (e) {
    req.log?.warn({ err: e }, 'No se pudo registrar auditoría');
  }
}

async function findUserByEmail(email) {
  if (!dbEnabled) return usersMem.find(u => u.email === email) || null;
  return prisma.user.findUnique({ where: { email } });
}

app.get('/health', async () => ({ ok: true, service: 'gestion-financiera-api-v2', dbEnabled }));
app.get('/', async (_req, reply) => reply.sendFile('index.html'));

app.post('/api/v1/auth/login', async (req, reply) => {
  const schema = z.object({ email: z.string().email(), password: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return reply.code(422).send({ error: 'Payload inválido' });

  const { email, password } = parsed.data;
  const user = await findUserByEmail(email);
  if (!user) return reply.code(401).send({ error: 'Credenciales inválidas' });

  const passwordOk = dbEnabled
    ? await bcrypt.compare(password, user.passwordHash)
    : (user.password === password);
  if (!passwordOk) return reply.code(401).send({ error: 'Credenciales inválidas' });

  const access_token = app.jwt.sign({ sub: user.id, role: user.role, email: user.email }, { expiresIn: '30d' });
  const refresh_token = app.jwt.sign({ sub: user.id, type: 'refresh' }, { expiresIn: '7d' });

  return {
    access_token,
    refresh_token,
    user: { id: user.id, email: user.email, role: user.role, name: user.name }
  };
});

app.post('/api/v1/auth/refresh', async (req, reply) => {
  const schema = z.object({ refresh_token: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return reply.code(422).send({ error: 'Payload inválido' });

  try {
    const payload = await app.jwt.verify(parsed.data.refresh_token);
    if (payload?.type !== 'refresh' || !payload?.sub) {
      return reply.code(401).send({ error: 'Refresh token inválido' });
    }

    let user = null;
    if (!dbEnabled) user = usersMem.find(u => u.id === payload.sub) || null;
    else user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) return reply.code(401).send({ error: 'Usuario no encontrado' });

    const access_token = app.jwt.sign({ sub: user.id, role: user.role, email: user.email }, { expiresIn: '30d' });
    const refresh_token = app.jwt.sign({ sub: user.id, type: 'refresh' }, { expiresIn: '7d' });

    return {
      access_token,
      refresh_token,
      user: { id: user.id, email: user.email, role: user.role, name: user.name }
    };
  } catch {
    return reply.code(401).send({ error: 'Refresh token inválido o expirado' });
  }
});

app.post('/api/v1/auth/logout', async (_req, reply) => {
  return reply.code(204).send();
});

app.decorate('auth', async (req, reply) => {
  try {
    await req.jwtVerify();
  } catch {
    return reply.code(401).send({ error: 'No autenticado' });
  }
});

app.decorate('mustWrite', async (req, reply) => {
  const role = req.user?.role;
  if (!canWrite(role)) return reply.code(403).send({ error: 'Sin permisos para escribir' });
});

app.decorate('mustDeletePlanilla', async (req, reply) => {
  const role = req.user?.role;
  if (!canDeletePlanilla(role)) return reply.code(403).send({ error: 'Sin permisos para eliminar planillas' });
});

app.decorate('mustReadAudit', async (req, reply) => {
  const role = req.user?.role;
  if (!canReadAudit(role)) return reply.code(403).send({ error: 'Sin permisos para ver auditoría' });
});

app.get('/api/v1/me', { preHandler: [app.auth] }, async (req) => ({ user: req.user }));

app.get('/api/v1/planillas', { preHandler: [app.auth] }, async (req) => {
  const querySchema = z.object({
    cliente: z.string().optional(),
    proyecto: z.string().optional(),
    page: z.coerce.number().optional().default(1),
    limit: z.coerce.number().optional().default(20)
  });
  const q = querySchema.parse(req.query || {});

  if (!dbEnabled) {
    let items = [...planillasMem];
    if (q.cliente) items = items.filter(x => (x.cliente || '').toLowerCase().includes(q.cliente.toLowerCase()));
    if (q.proyecto) items = items.filter(x => (x.proyecto || '').toLowerCase().includes(q.proyecto.toLowerCase()));
    const start = (q.page - 1) * q.limit;
    const paged = items.slice(start, start + q.limit);
    return { items: paged, total: items.length, page: q.page, limit: q.limit };
  }

  const where = {
    ...(q.cliente ? { cliente: { contains: q.cliente, mode: 'insensitive' } } : {}),
    ...(q.proyecto ? { proyecto: { contains: q.proyecto, mode: 'insensitive' } } : {})
  };
  const [total, rows] = await Promise.all([
    prisma.planilla.count({ where }),
    prisma.planilla.findMany({
      where,
      orderBy: { fecha: 'desc' },
      skip: (q.page - 1) * q.limit,
      take: q.limit
    })
  ]);
  const items = rows.map(r => ({
    id: r.id,
    correlativo: r.correlativo,
    fecha: r.fecha,
    cliente: r.cliente,
    proyecto: r.proyecto,
    monto_bruto_usd: Number(r.montoBrutoUsd)
  }));
  return { items, total, page: q.page, limit: q.limit };
});

app.get('/api/v1/planillas/:id', { preHandler: [app.auth] }, async (req, reply) => {
  if (!dbEnabled) {
    const p = planillasMem.find(x => x.id === req.params.id);
    if (!p) return reply.code(404).send({ error: 'No encontrado' });
    return p;
  }

  const p = await prisma.planilla.findUnique({ where: { id: req.params.id } });
  if (!p) return reply.code(404).send({ error: 'No encontrado' });
  return {
    id: p.id,
    correlativo: p.correlativo,
    fecha: p.fecha,
    cliente: p.cliente,
    proyecto: p.proyecto,
    monto_bruto_usd: Number(p.montoBrutoUsd)
  };
});

app.post('/api/v1/planillas', { preHandler: [app.auth, app.mustWrite] }, async (req, reply) => {
  const schema = z.object({ cliente: z.string().min(1), proyecto: z.string().min(1), monto_bruto_usd: z.number().nonnegative() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return reply.code(422).send({ error: 'Payload inválido' });

  if (!dbEnabled) {
    const id = `pln_${String(planillasMem.length + 1).padStart(3, '0')}`;
    const correlativo = String(planillasMem.length + 1).padStart(4, '0');
    const item = { id, correlativo, fecha: new Date().toISOString(), ...parsed.data };
    planillasMem.push(item);
    return reply.code(201).send(item);
  }

  const count = await prisma.planilla.count();
  const correlativo = String(count + 1).padStart(4, '0');
  const created = await prisma.planilla.create({
    data: {
      correlativo,
      cliente: parsed.data.cliente,
      proyecto: parsed.data.proyecto,
      montoBrutoUsd: parsed.data.monto_bruto_usd
    }
  });

  await auditLog({
    req,
    recurso: 'planilla',
    recursoId: created.id,
    accion: 'create',
    afterJson: {
      id: created.id,
      correlativo: created.correlativo,
      cliente: created.cliente,
      proyecto: created.proyecto,
      monto_bruto_usd: Number(created.montoBrutoUsd)
    },
    planillaId: created.id
  });

  return reply.code(201).send({
    id: created.id,
    correlativo: created.correlativo,
    fecha: created.fecha,
    cliente: created.cliente,
    proyecto: created.proyecto,
    monto_bruto_usd: Number(created.montoBrutoUsd)
  });
});

app.put('/api/v1/planillas/:id', { preHandler: [app.auth, app.mustWrite] }, async (req, reply) => {
  const schema = z.object({ cliente: z.string().min(1).optional(), proyecto: z.string().min(1).optional(), monto_bruto_usd: z.number().nonnegative().optional() });
  const parsed = schema.safeParse(req.body || {});
  if (!parsed.success) return reply.code(422).send({ error: 'Payload inválido' });

  if (!dbEnabled) {
    const idx = planillasMem.findIndex(x => x.id === req.params.id);
    if (idx < 0) return reply.code(404).send({ error: 'No encontrado' });
    planillasMem[idx] = { ...planillasMem[idx], ...parsed.data };
    return planillasMem[idx];
  }

  const exists = await prisma.planilla.findUnique({ where: { id: req.params.id } });
  if (!exists) return reply.code(404).send({ error: 'No encontrado' });

  const updated = await prisma.planilla.update({
    where: { id: req.params.id },
    data: {
      ...(parsed.data.cliente ? { cliente: parsed.data.cliente } : {}),
      ...(parsed.data.proyecto ? { proyecto: parsed.data.proyecto } : {}),
      ...(typeof parsed.data.monto_bruto_usd === 'number' ? { montoBrutoUsd: parsed.data.monto_bruto_usd } : {})
    }
  });

  await auditLog({
    req,
    recurso: 'planilla',
    recursoId: updated.id,
    accion: 'update',
    beforeJson: {
      id: exists.id,
      correlativo: exists.correlativo,
      cliente: exists.cliente,
      proyecto: exists.proyecto,
      monto_bruto_usd: Number(exists.montoBrutoUsd)
    },
    afterJson: {
      id: updated.id,
      correlativo: updated.correlativo,
      cliente: updated.cliente,
      proyecto: updated.proyecto,
      monto_bruto_usd: Number(updated.montoBrutoUsd)
    },
    planillaId: updated.id
  });

  return {
    id: updated.id,
    correlativo: updated.correlativo,
    fecha: updated.fecha,
    cliente: updated.cliente,
    proyecto: updated.proyecto,
    monto_bruto_usd: Number(updated.montoBrutoUsd)
  };
});

app.delete('/api/v1/planillas/:id', { preHandler: [app.auth, app.mustDeletePlanilla] }, async (req, reply) => {
  if (!dbEnabled) {
    const idx = planillasMem.findIndex(x => x.id === req.params.id);
    if (idx < 0) return reply.code(404).send({ error: 'No encontrado' });
    planillasMem.splice(idx, 1);
    return reply.code(204).send();
  }

  const exists = await prisma.planilla.findUnique({ where: { id: req.params.id } });
  if (!exists) return reply.code(404).send({ error: 'No encontrado' });

  await prisma.planilla.delete({ where: { id: req.params.id } });

  await auditLog({
    req,
    recurso: 'planilla',
    recursoId: exists.id,
    accion: 'delete',
    beforeJson: {
      id: exists.id,
      correlativo: exists.correlativo,
      cliente: exists.cliente,
      proyecto: exists.proyecto,
      monto_bruto_usd: Number(exists.montoBrutoUsd)
    },
    planillaId: exists.id
  });

  return reply.code(204).send();
});

app.get('/api/v1/tasas', { preHandler: [app.auth] }, async () => {
  if (!dbEnabled) return { items: tasasMem, total: tasasMem.length };
  const rows = await prisma.tasa.findMany({ orderBy: { fecha: 'desc' }, take: 200 });
  return {
    items: rows.map(r => ({ id: r.id, fecha: r.fecha, bcv: Number(r.bcv), paralela: Number(r.paralela), fuente: r.fuente })),
    total: rows.length
  };
});

app.post('/api/v1/tasas', { preHandler: [app.auth, app.mustWrite] }, async (req, reply) => {
  const schema = z.object({ bcv: z.number().positive(), paralela: z.number().positive(), fuente: z.string().default('manual') });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return reply.code(422).send({ error: 'Payload inválido' });

  if (!dbEnabled) {
    const id = `rate_${String(tasasMem.length + 1).padStart(3, '0')}`;
    const row = { id, fecha: new Date().toISOString(), ...parsed.data };
    tasasMem.push(row);
    return reply.code(201).send(row);
  }

  const created = await prisma.tasa.create({ data: parsed.data });

  await auditLog({
    req,
    recurso: 'tasa',
    recursoId: created.id,
    accion: 'create',
    afterJson: {
      id: created.id,
      fecha: created.fecha,
      bcv: Number(created.bcv),
      paralela: Number(created.paralela),
      fuente: created.fuente
    },
    tasaId: created.id
  });

  return reply.code(201).send({ id: created.id, fecha: created.fecha, bcv: Number(created.bcv), paralela: Number(created.paralela), fuente: created.fuente });
});


app.put('/api/v1/tasas/:id', { preHandler: [app.auth, app.mustWrite] }, async (req, reply) => {
  const schema = z.object({ bcv: z.number().positive().optional(), paralela: z.number().positive().optional(), fuente: z.string().optional() });
  const parsed = schema.safeParse(req.body || {});
  if (!parsed.success) return reply.code(422).send({ error: 'Payload inválido' });

  if (!dbEnabled) {
    const idx = tasasMem.findIndex(x => x.id === req.params.id);
    if (idx < 0) return reply.code(404).send({ error: 'No encontrado' });
    tasasMem[idx] = { ...tasasMem[idx], ...parsed.data };
    return tasasMem[idx];
  }

  const exists = await prisma.tasa.findUnique({ where: { id: req.params.id } });
  if (!exists) return reply.code(404).send({ error: 'No encontrado' });

  const updated = await prisma.tasa.update({
    where: { id: req.params.id },
    data: {
      ...(typeof parsed.data.bcv === 'number' ? { bcv: parsed.data.bcv } : {}),
      ...(typeof parsed.data.paralela === 'number' ? { paralela: parsed.data.paralela } : {}),
      ...(parsed.data.fuente ? { fuente: parsed.data.fuente } : {})
    }
  });

  await auditLog({
    req,
    recurso: 'tasa',
    recursoId: updated.id,
    accion: 'update',
    beforeJson: { id: exists.id, fecha: exists.fecha, bcv: Number(exists.bcv), paralela: Number(exists.paralela), fuente: exists.fuente },
    afterJson: { id: updated.id, fecha: updated.fecha, bcv: Number(updated.bcv), paralela: Number(updated.paralela), fuente: updated.fuente },
    tasaId: updated.id
  });

  return { id: updated.id, fecha: updated.fecha, bcv: Number(updated.bcv), paralela: Number(updated.paralela), fuente: updated.fuente };
});

app.delete('/api/v1/tasas/:id', { preHandler: [app.auth, app.mustWrite] }, async (req, reply) => {
  if (!dbEnabled) {
    const idx = tasasMem.findIndex(x => x.id === req.params.id);
    if (idx < 0) return reply.code(404).send({ error: 'No encontrado' });
    tasasMem.splice(idx, 1);
    return reply.code(204).send();
  }

  const exists = await prisma.tasa.findUnique({ where: { id: req.params.id } });
  if (!exists) return reply.code(404).send({ error: 'No encontrado' });

  await prisma.tasa.delete({ where: { id: req.params.id } });

  await auditLog({
    req,
    recurso: 'tasa',
    recursoId: exists.id,
    accion: 'delete',
    beforeJson: { id: exists.id, fecha: exists.fecha, bcv: Number(exists.bcv), paralela: Number(exists.paralela), fuente: exists.fuente },
    afterJson: null,
    tasaId: exists.id
  });

  return reply.code(204).send();
});

app.get('/api/v1/auditoria', { preHandler: [app.auth, app.mustReadAudit] }, async (req) => {
  if (!dbEnabled) return { items: [], total: 0 };

  const schema = z.object({
    recurso: z.string().optional(),
    accion: z.string().optional(),
    user_id: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    limit: z.coerce.number().optional().default(100)
  });
  const q = schema.parse(req.query || {});
  const take = Math.min(Math.max(q.limit, 1), 500);

  const where = {
    ...(q.recurso ? { recurso: q.recurso } : {}),
    ...(q.accion ? { accion: q.accion } : {}),
    ...(q.user_id ? { userId: q.user_id } : {}),
    ...(q.from || q.to
      ? {
          createdAt: {
            ...(q.from ? { gte: new Date(`${q.from}T00:00:00`) } : {}),
            ...(q.to ? { lte: new Date(`${q.to}T23:59:59`) } : {})
          }
        }
      : {})
  };

  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take,
    include: {
      user: {
        select: { id: true, email: true, name: true, role: true }
      }
    }
  });

  return {
    items: rows.map(r => ({
      id: r.id,
      createdAt: r.createdAt,
      recurso: r.recurso,
      recursoId: r.recursoId,
      accion: r.accion,
      ip: r.ip,
      userAgent: r.userAgent,
      user: r.user,
      beforeJson: r.beforeJson,
      afterJson: r.afterJson
    })),
    total: rows.length
  };
});

app.get('/api/v1/planillas/:id/pdf', { preHandler: [app.auth] }, async (req, reply) => {
  const p = await findPlanillaByIdOrCorrelativo(req.params.id);
  if (!p) return reply.code(404).send({ error: 'Planilla no encontrada' });

  const { buffer, correlativo } = await buildPlanillaPdfBuffer(p);

  reply
    .header('Content-Type', 'application/pdf')
    .header('Content-Disposition', `inline; filename=planilla_${correlativo}.pdf`)
    .send(buffer);
});

app.post('/api/v1/planillas/:id/pdf/publish', { preHandler: [app.auth, app.mustWrite] }, async (req, reply) => {
  const p = await findPlanillaByIdOrCorrelativo(req.params.id);
  if (!p) return reply.code(404).send({ error: 'Planilla no encontrada' });

  const { buffer, correlativo } = await buildPlanillaPdfBuffer(p);
  const fileName = `planilla_${correlativo}_${Date.now()}.pdf`;
  const published = await publishPdfToCloudOrLocal({ buffer, fileName });

  await auditLog({
    req,
    recurso: 'pdf',
    recursoId: fileName,
    accion: 'publish',
    afterJson: { fileName, correlativo, storageMode: published.mode, signedUrlExpiresIn: published.expiresIn },
    planillaId: p.id || null
  });

  return { fileName, signedUrl: published.signedUrl, expiresIn: published.expiresIn, storageMode: published.mode };
});

app.get('/api/v1/files/pdf/:token', async (req, reply) => {
  try {
    const payload = await app.jwt.verify(req.params.token);
    if (payload?.type !== 'file_pdf' || !payload?.fileName) return reply.code(401).send({ error: 'Token inválido' });

    const safeName = path.basename(String(payload.fileName));
    const filePath = path.join(STORAGE_DIR, safeName);
    if (!fs.existsSync(filePath)) return reply.code(404).send({ error: 'Archivo no encontrado' });

    const data = fs.readFileSync(filePath);
    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `inline; filename=${safeName}`)
      .send(data);
  } catch {
    return reply.code(401).send({ error: 'Token inválido o expirado' });
  }
});

const port = Number(process.env.PORT || 4000);
app.listen({ port, host: '0.0.0.0' })
  .then(() => app.log.info(`API v2 escuchando en :${port}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
