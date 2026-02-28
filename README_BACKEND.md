# Backend API v2.0 (MVP)

## Ejecutar
```bash
cd backend-api
cp .env.example .env
npm install
npm run dev
```

## Endpoints base
- GET /health
- POST /api/v1/auth/login
- GET /api/v1/me (JWT)
- GET /api/v1/planillas (JWT)
- GET /api/v1/planillas/:id (JWT)
- POST /api/v1/planillas (admin_gerente, operador)
- PUT /api/v1/planillas/:id (admin_gerente, operador)
- DELETE /api/v1/planillas/:id (solo admin_gerente)
- GET /api/v1/tasas (JWT)
- POST /api/v1/tasas (admin_gerente, operador)
- GET /api/v1/planillas/:id/pdf (placeholder 501)

## Usuarios demo
- admin@hardsoft.local / 123456
- operador@hardsoft.local / 123456
- consulta@hardsoft.local / 123456

## Prisma / Postgres (activar cuando tengas DB)
```bash
# 1) Configura DATABASE_URL en .env
# 2) Activa USE_DB=1
npx prisma generate
npx prisma migrate dev --name init
```

> Mientras `USE_DB=0`, la API corre con datos demo en memoria (sin caerse por falta de DB).
