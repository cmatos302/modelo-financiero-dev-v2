# Rotación de secretos pendientes (producción)

## Hecho por el agente
- JWT_SECRET rotado localmente en `.env`.

## Pendiente (requiere acción en Supabase)
1. Ir a Supabase → Project Settings → Database.
2. Rotar password del usuario `postgres` (o crear nuevo usuario de app con permisos mínimos).
3. Actualizar en `.env`:
   - `DATABASE_URL`
   - `DIRECT_URL`
4. Reiniciar API y validar:
   - `GET /health`
   - login con usuarios demo

## Recomendación
- No reutilizar passwords históricas.
- Guardar secretos en secret manager (1Password, Doppler, Vault, etc.), no en documentos sueltos.
