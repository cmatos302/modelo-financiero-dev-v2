# Activar Postgres real (siguiente paso)

## 1) Configurar `.env`
```env
PORT=4000
JWT_SECRET=CAMBIAR_ESTE_SECRETO
USE_DB=1
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DBNAME?sslmode=require
```

## 2) Generar cliente Prisma
```bash
npm run prisma:generate
```

## 3) Ejecutar migraciones
```bash
npm run prisma:migrate
```

## 4) Cargar datos iniciales
```bash
npm run seed
```

## 5) Levantar API
```bash
npm run dev
```

## 6) Verificar
- `GET /health` debe devolver `dbEnabled: true`
- Login demo debe funcionar con usuarios seed

## Nota de seguridad
- En producción NO usar passwords demo.
- Cambiar `JWT_SECRET`.
- Rotar credenciales de DB.
