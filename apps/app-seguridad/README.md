# Seguridad Transversal

Aplicacion independiente del ecosistema de seguridad transversal. Backend Node.js / Express; frontend React/Vite propio.

| Elemento                                       | Ubicacion               |
| ---------------------------------------------- | ----------------------- |
| Interfaz y estilos                             | `frontend/src`          |
| Entrada del frontend                           | `frontend/src/main.jsx` |
| Backend y su configuracion                     | `backend`               |
| Variables de ejemplo                           | `backend/.env.example`  |
| Migraciones de su base `seguridad_transversal` | `database/migrations`   |

## Reglas de esta app

- Administra identidad, contraseñas Argon2id, politica MFA por usuario, sesiones opacas, revocacion, roles, menus, auditoria, historial de cambios y registro de pantallas. No conecta a las bases de negocio.
- Conservar la compatibilidad de la API documentada en `docs/integracion.md`: las tres demos dependen de ella.
- Secretos locales en `backend/.env`; solo se versiona `backend/.env.example`.
- Las pruebas estan en `backend/tests` y se ejecutan con `pnpm test` desde la raiz, sobre un esquema temporal. No reinicializar ni borrar cuentas existentes para probar.

## Arranque

El entorno completo se instala siguiendo el [README principal](../../README.md). Desde la raiz se puede ejecutar:

```powershell
node scripts/build.mjs seguridad
node scripts/dev.mjs seguridad
```

El backend sirve su frontend compilado en http://localhost:4000. Para desarrollo con recarga, iniciar el backend y ejecutar `pnpm run dev` dentro de `frontend`; Vite usa http://localhost:5173 y reenvia `/api` a su propio backend.

## Seguridad central

Las cuentas, hashes, secretos MFA cifrados, roles, menus, sesiones y eventos de auditoria pertenecen exclusivamente a esta aplicacion. No utiliza SQL de CRM, Almacen ni Facturacion.

`backend/src/app.js` define el contrato HTTP, `services/auth.js` implementa la autenticacion, `services/access.js` valida sesiones y permisos, y `routes/admin.js` expone la administracion. `database` contiene migraciones y carga inicial.

El panel incluye **Matriz de permisos** (`frontend/src/Matrix.jsx`): compara los roles de una aplicacion contra sus familias y pantallas. Es de solo lectura y se calcula con los catalogos ya cargados; el nombre de cada rol abre su edicion. La migracion `004` retira las tablas de grillas y botones de una version anterior: la autorizacion es solo por menu.

## Trazabilidad

- `audit_events`: eventos de autenticacion y administracion.
- `admin_changes` (migracion `005`): historial con el estado anterior y nuevo. Lo escribe `change()` en `routes/admin.js` para cada evento listado en `trackedEvents`; las vistas legibles salen de `snapshots`, que nunca incluyen hashes, secretos ni claves. Panel: **Historial de cambios** y boton «Ver historial» en usuarios, roles y menus (`frontend/src/History.jsx`). API: `GET /admin/changes?entity=&entity_id=&search=&from=&until=&page=`.
- `access_log` (migracion `005`): cada `auth/introspect` con `permission`, permitido o denegado. Panel: **Accesos a pantallas**. API: `GET /admin/access?search=&result=OK|DENEGADO&from=&until=&page=`.

Las tres tablas son de solo anexado para `st_app` (`database/permissions.sql` y `database/migrate.js`). Un evento administrativo nuevo debe agregarse a `trackedEvents` para entrar en el historial.

Los scripts globales de instalacion invocan las funciones de esta app y configuran las integraciones iniciales. Los cambios de esquema deben agregarse como una nueva migracion.

Ver la [arquitectura](../../docs/arquitectura.md), el [contrato IAM](../../docs/integracion.md) y la [guia de trabajo por app](../../docs/trabajo-por-app.md).
