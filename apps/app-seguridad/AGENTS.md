# Contexto de app-seguridad

Esta carpeta es el limite de desarrollo de Seguridad Transversal. Leer este archivo, su README y `../../docs/integracion.md` antes de agregar funciones.

- Frontend independiente: `frontend/`, React/Vite, puerto de desarrollo 5173.
- Backend propio: `backend/`, Node.js / Express, puerto 4000.
- Base exclusiva: `seguridad_transversal`. Migraciones en `database/migrations`.
- Secretos locales: `backend/.env`; solo versionar `backend/.env.example`.

## Responsabilidad

Administrar identidad, Argon2id, politica MFA por usuario, sesiones opacas, revocacion, roles, menus y auditoria. Conservar la compatibilidad de la API documentada. No conectar a las bases de negocio. Los cambios de contratos deben coordinarse con los otros chats.

Las pruebas de seguridad se ubican en `backend/tests` y se ejecutan con `pnpm test` desde la raiz. No reinicializar ni borrar cuentas existentes para probar.

## Comprobacion local

Desde la raiz: `node scripts/build.mjs seguridad` y `node scripts/dev.mjs seguridad`. El frontend admite `pnpm run dev` desde su carpeta y usa proxy al backend. Para validacion integrada, coordinar el arranque global y `pnpm run test:integration`.

Las dependencias locales pueden declararse en el manifiesto/requirements/pom de esta app; los cambios al lockfile global y a scripts comunes requieren coordinacion. No versionar datos reales, secretos, entornos virtuales, drivers descargados ni compilados.
