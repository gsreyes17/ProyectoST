# Seguridad Transversal

Aplicacion independiente del ecosistema de seguridad transversal. Backend Node.js / Express; frontend React/Vite propio.

| Elemento                                       | Ubicacion               |
| ---------------------------------------------- | ----------------------- |
| Interfaz y estilos                             | `frontend/src`          |
| Entrada del frontend                           | `frontend/src/main.jsx` |
| Backend y su configuracion                     | `backend`               |
| Variables de ejemplo                           | `backend/.env.example`  |
| Migraciones de su base `seguridad_transversal` | `database/migrations`   |
| Contexto para otro chat                        | `AGENTS.md`             |

## Arranque

El entorno completo se instala siguiendo el [README principal](../../README.md). Desde la raiz se puede ejecutar:

```powershell
node scripts/build.mjs seguridad
node scripts/dev.mjs seguridad
```

El backend sirve su frontend compilado en http://localhost:4000. Para desarrollo con recarga, iniciar el backend y ejecutar `npm run dev` dentro de `frontend`; Vite usa http://localhost:5173 y reenvia `/api` a su propio backend.

## Seguridad central

Las cuentas, hashes, secretos MFA cifrados, roles, menus, sesiones y eventos de auditoria pertenecen exclusivamente a esta aplicacion. No utiliza SQL de CRM, Almacen ni Facturacion.

`backend/src/app.js` define el contrato HTTP, `services/auth.js` implementa la autenticacion, `services/access.js` valida sesiones y permisos, y `routes/admin.js` expone la administracion. `database` contiene migraciones y carga inicial.

Los scripts globales de instalacion invocan las funciones de esta app y configuran las integraciones iniciales. Los cambios de esquema deben agregarse como una nueva migracion.

Ver la [arquitectura](../../docs/arquitectura.md), el [contrato IAM](../../docs/integracion.md) y la [guia de trabajo por app](../../docs/trabajo-por-app.md).
