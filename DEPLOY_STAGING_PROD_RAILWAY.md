# Staging + Producción (Railway) — mínimo viable

## Objetivo
Tener 2 servicios Railway:
- `modelo-financiero-staging`
- `modelo-financiero-production`

## Paso 1: Duplicar servicio actual
En Railway (servicio producción):
1. Settings → (menu) Duplicate Service
2. Nombre nuevo: `modelo-financiero-staging`

## Paso 2: Variables diferenciadas
### Producción
- `APP_VERSION=prod-v2`
- `CORS_ORIGINS=https://modelo-financiero-dev-v2-production.up.railway.app`
- `API_PUBLIC_BASE=https://modelo-financiero-dev-v2-production.up.railway.app`

### Staging
- `APP_VERSION=staging-v2`
- `CORS_ORIGINS=https://<dominio-staging>.up.railway.app`
- `API_PUBLIC_BASE=https://<dominio-staging>.up.railway.app`

El resto de variables puede iniciar igual (DB, Supabase, etc.)

## Paso 3: Dominio staging
En servicio staging:
- Settings → Networking → Generate Domain

## Paso 4: Flujo recomendado
1. Probar cambios en staging
2. Validar:
- /health
- /api/v1/status
- login
- historial
- PDF oficial
3. Si todo OK, aplicar a producción

## Paso 5: CI mínimo
Archivo incluido: `.github/workflows/ci.yml`
Valida en cada push/PR:
- `npm ci`
- `prisma generate`
- `node -c src/server.js`
- `docker build`
