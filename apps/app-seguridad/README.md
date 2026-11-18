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

El backend sirve su frontend compilado en http://localhost:4000. Para desarrollo con recarga, iniciar el backend y ejecutar `pnpm run dev` dentro de `frontend`; Vite usa http://localhost:5173 y reenvia `/api` a su propio backend.

## Seguridad central

Las cuentas, hashes, secretos MFA cifrados, roles, menus, capacidades, sesiones y eventos de auditoria pertenecen exclusivamente a esta aplicacion. No utiliza SQL de CRM, Almacen ni Facturacion.

`backend/src/app.js` define el contrato HTTP, `services/auth.js` implementa la autenticacion, `services/access.js` valida sesiones y permisos, y `routes/admin.js` expone la administracion. `database` contiene migraciones y carga inicial.

## Permisos por rol

- **Menus** (`menus`, `role_menus`): familias (grupos sin ruta) y pantallas. Conceden la entrada y la navegacion.
- **Capacidades** (`capabilities`, `role_capabilities`, migracion `003`): grillas (`grid`), botones (`button`) y columnas (`column`) de una pantalla. Su codigo empieza por el de la pantalla y solo son efectivas si el rol conserva esa pantalla.

Panel: **Matriz de permisos** (`frontend/src/Matrix.jsx`) compara los roles de una aplicacion contra sus pantallas y elementos, solo lectura y calculada con los catalogos ya cargados; **Grillas y botones** administra el catalogo; **Roles y permisos -> Editar** muestra el arbol familia -> pantalla -> elementos. API: `GET/POST /admin/capabilities`, `PATCH /admin/capabilities/:id`, `PUT /admin/roles/:id/capabilities` y `capability_ids` opcional en `POST/PATCH /admin/roles`. Quitar una pantalla a un rol elimina sus capacidades.

`GET /me` y `POST /auth/introspect` devuelven `capabilities`; `introspect` acepta en `permission` un codigo de pantalla o de capacidad. `backend/src/demo-catalog.js` contiene el catalogo inicial de las demos y `initialGrants`, la asignacion inicial por nombre de rol que `database/seed.js` aplica solo a capacidades recien creadas.

Los scripts globales de instalacion invocan las funciones de esta app y configuran las integraciones iniciales. Los cambios de esquema deben agregarse como una nueva migracion.

Ver la [arquitectura](../../docs/arquitectura.md), el [contrato IAM](../../docs/integracion.md) y la [guia de trabajo por app](../../docs/trabajo-por-app.md).
