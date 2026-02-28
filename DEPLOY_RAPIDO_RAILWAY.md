# Deploy rápido (ruta corta) — Railway

Objetivo: levantar **Frontend + API** en una sola URL HTTPS (sin `file://`).

## 1) Subir repo a GitHub
Este folder debe estar en un repo:
- `backend-api/` (ya incluye Dockerfile, railway.json y `public/index.html`)

## 2) Crear proyecto en Railway
1. Entra en https://railway.app
2. **New Project** → **Deploy from GitHub repo**
3. Selecciona tu repo
4. Railway detecta `Dockerfile` y construye solo.

## 3) Variables de entorno (Railway → Variables)
Configura estas:
- `PORT=4000`
- `JWT_SECRET=...`
- `USE_DB=1`
- `DATABASE_URL=...`
- `DIRECT_URL=...`
- `CORS_ORIGINS=https://TU_DOMINIO_PUBLICO`
- `RATE_LIMIT_MAX=120`
- `RATE_LIMIT_WINDOW=1 minute`
- `API_PUBLIC_BASE=https://TU_DOMINIO_PUBLICO`
- `SUPABASE_URL=https://tgyisrwmsdnlfpbwkaep.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY=...`
- `SUPABASE_STORAGE_BUCKET=planillas-pdf`

## 4) Obtener URL pública
En Railway abre **Settings → Domains** y genera dominio público.
Ejemplo: `https://tu-app.up.railway.app`

## 5) Ajustar CORS + API_PUBLIC_BASE
Con la URL final:
- `CORS_ORIGINS=https://tu-app.up.railway.app`
- `API_PUBLIC_BASE=https://tu-app.up.railway.app`

Redeploy automático.

## 6) Validar
- `GET https://tu-app.up.railway.app/health`
- Abrir `https://tu-app.up.railway.app/` (debe cargar UI)
- Login + historial + PDF oficial

---

## Notas
- `public/index.html` ya está conectado para usar `/api/v1` en cloud.
- Si quieres dominio propio (`app.tudominio.com`), lo agregas luego en Domains.
