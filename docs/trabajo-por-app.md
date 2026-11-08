# Desarrollo en otros chats

## Asignación sugerida

| Chat / tarea          | Carpeta                | Contexto que debe leer                    |
| --------------------- | ---------------------- | ----------------------------------------- |
| Seguridad             | `apps/app-seguridad`   | Su README, AGENTS y `docs/integracion.md` |
| Funciones CRM         | `apps/app-crm`         | Su README, AGENTS y `docs/integracion.md` |
| Funciones Almacén     | `apps/app-almacen`     | Su README, AGENTS y `docs/integracion.md` |
| Funciones Facturación | `apps/app-facturacion` | Su README, AGENTS y `docs/integracion.md` |

Usar una rama/copia de trabajo por chat y fusionar los cambios revisados. Dos chats editando simultáneamente la misma copia siguen pudiendo pisar archivos, aunque las aplicaciones estén separadas.

## Prompt inicial de ejemplo

> Trabaja en `apps/app-crm`. Lee su README y AGENTS, el AGENTS raíz y `docs/integracion.md`. Implementa [función solicitada] en su frontend y backend, con migraciones en su propia carpeta database. Conserva la autenticación y autorización centralizadas. No modifiques otras apps ni los contratos IAM; coordina los cambios a scripts o al lockfile raíz. No agregues información técnica de seguridad a las pantallas de negocio.

Sustituir la app según corresponda. La autorización para nuevas opciones debe incorporarse con los endpoints administrativos de IAM y el permiso debe validarse también en el backend de la app. Un enlace de menú por sí solo no protege una API.

## Dónde agregar código

- Frontend: componentes y pantallas en `frontend/src`, empezando por `pages/index.jsx` en las demos.
- Backend: endpoints y servicios dentro de `backend`; el catálogo de rutas inicial está en `backend/app.json`.
- SQL: nueva migración numerada en `database/migrations` y permisos de las nuevas tablas en `database/permissions.sql`; no editar una migración ya aplicada a instalaciones compartidas.
- Configuración: actualizar solo `.env.example` con nombres/valores de ejemplo; el `.env` real es privado.
- Contexto: actualizar el README de la app cuando cambien sus módulos, comandos o permisos.

## Comandos desde la raíz

```powershell
# Compilar solo una aplicación
node scripts/build.mjs crm
# Iniciar solo su backend (IAM debe estar ejecutándose para el login)
node scripts/dev.mjs crm
# Desarrollo de su frontend con recarga automática y proxy al backend
npm run dev --workspace @proyectost/crm-frontend
```

Cada workspace frontend también admite `npm run build` desde su propia carpeta. Los backends Node tienen su propio `package.json`. Python tiene `requirements.txt`; Java tiene un `pom.xml` opcional, además del runner JDK del monorepo.

## Contratos que deben permanecer estables

- Identificador central del usuario y de la aplicación.
- `X-App-Id`, `X-App-Key`, cookie HttpOnly y token de sesión solo entre servidores.
- Flujo de contraseña, política MFA, selección de rol, vencimiento y revocación.
- Endpoints IAM documentados y códigos de permisos ya usados por otros módulos.

Las reglas particulares de negocio, como propietario de un cliente o límites de una operación, se validan en la aplicación correspondiente además del permiso central.
