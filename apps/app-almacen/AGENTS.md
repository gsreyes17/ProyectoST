# Contexto de app-almacen

Esta carpeta es el limite de desarrollo de Almacen. Leer este archivo, su README y `../../docs/integracion.md` antes de agregar funciones.

- Frontend independiente: `frontend/`, React/Vite, puerto de desarrollo 5175.
- Backend propio: `backend/`, Java / JDBC, puerto 5002.
- Base exclusiva: `almacen_app`. Migraciones en `database/migrations`.
- Secretos locales: `backend/.env`; solo versionar `backend/.env.example`.

## Responsabilidad

Implementar solo funciones de negocio de esta app. No editar otras aplicaciones ni importar sus frontends. La navegacion y autenticacion iniciales son una copia local para poder evolucionar esta app de manera independiente.

Antes de consultar SQL, validar la sesion y el permiso en IAM mediante HTTP. Obtener el usuario del resultado validado. No crear un login local ni copiar tablas de seguridad. El endpoint `GET /api/v1/integration/status` y el registro `integration_access` demuestran la separacion de bases.

Agregar pantallas en `frontend/src/pages`, actualizar el catalogo `backend/app.json` y registrar sus opciones/permisos en IAM por API administrativa. Agregar nuevas tablas con migraciones numeradas. No cambiar la politica MFA, expiracion ni credenciales centrales.

## Comprobacion local

Desde la raiz: `node scripts/build.mjs almacen` y `node scripts/dev.mjs almacen`. El frontend admite `npm run dev` desde su carpeta y usa proxy al backend. Para validacion integrada, coordinar el arranque global y `npm run test:integration`.

Las dependencias locales pueden declararse en el manifiesto/requirements/pom de esta app; los cambios al lockfile global y a scripts comunes requieren coordinacion. No versionar datos reales, secretos, entornos virtuales, drivers descargados ni compilados.
