# CRM Comercial

Aplicacion independiente del ecosistema de seguridad transversal. Backend Python / FastAPI; frontend React/Vite propio.

| Elemento                         | Ubicacion               |
| -------------------------------- | ----------------------- |
| Interfaz y estilos               | `frontend/src`          |
| Entrada del frontend             | `frontend/src/main.jsx` |
| Backend y su configuracion       | `backend`               |
| Variables de ejemplo             | `backend/.env.example`  |
| Migraciones de su base `crm_app` | `database/migrations`   |
| Contexto para otro chat          | `AGENTS.md`             |

## Arranque

El entorno completo se instala siguiendo el [README principal](../../README.md). Desde la raiz se puede ejecutar:

```powershell
node scripts/build.mjs crm
node scripts/dev.mjs crm
```

El backend sirve su frontend compilado en http://localhost:5001. Para desarrollo con recarga, iniciar el backend y ejecutar `pnpm run dev` dentro de `frontend`; Vite usa http://localhost:5174 y reenvia `/api` a su propio backend.

## Integracion

El navegador usa una cookie HttpOnly. El backend se comunica con IAM mediante `CORE_URL`, `APP_ID` y `APP_KEY`; valida antes de consultar `DATABASE_URL`. No usa credenciales ni conexiones SQL de la transversal.

Cada pantalla muestra una grilla con los registros de la tabla local `records` y los botones Nuevo, Editar, Eliminar y Exportar. `frontend/src/pages/index.jsx` las genera a partir de `backend/app.json`, que define por pantalla la ruta, el codigo de permiso, las acciones (`actions`) y las columnas (`columns`, con `protected` para las sensibles). Se pueden desarrollar nuevos componentes aqui sin modificar el frontend de las otras apps.

## Grillas, botones y columnas por rol

IAM decide que elementos tiene el rol activo y los entrega en `capabilities` (`GET /api/v1/me`):

| Capacidad | Efecto en esta app |
| --- | --- |
| `<pantalla>.ver` | Muestra la grilla (`GET /api/v1/records?path=<ruta>`) |
| `<pantalla>.crear` | Boton Nuevo (`POST /api/v1/records?path=<ruta>`) |
| `<pantalla>.editar` | Boton Editar (`PATCH /api/v1/records/:id?path=<ruta>`) |
| `<pantalla>.eliminar` | Boton Eliminar (`DELETE /api/v1/records/:id?path=<ruta>`) |
| `<pantalla>.exportar` | Boton Exportar (`GET /api/v1/records?path=<ruta>&export=1`) |
| `<pantalla>.col.<columna>` | Lee y escribe una columna protegida |

El frontend oculta lo que el rol no tiene; el backend pide la capacidad exacta a IAM en cada operacion, antes de cualquier SQL, y responde 403 si falta. Las escrituras exigen `X-CSRF-Token`. Una columna protegida sin permiso no sale del backend y conserva su valor al editar. Se asignan en el portal: Roles y permisos -> Editar.

`GET /api/v1/demo/page?path=...` valida la opcion en IAM y registra el acceso en la tabla local `integration_access`. `GET /api/v1/integration/status` requiere sesion y devuelve la base/usuario SQL y los accesos propios. Los datos del diagnostico no se muestran en la interfaz.

## Identidad visual y datos de ejemplo

Esta app tiene identidad propia: clara y redondeada, con barra lateral blanca. Vive en `frontend/src/theme.css`, que se carga despues de `demo.css`. El inicio de sesion tambien tiene diseno propio, definido al final de `frontend/src/theme.css` bajo la clase `demo-crm`; `Auth.jsx` y el flujo de acceso no cambian. Cambiarla no afecta a las otras apps ni a la seguridad. La cabecera muestra el usuario y su rol activo (`session.full_name`, `session.role_name` de `/api/v1/me`).

`database/seed-data.json` contiene registros de ejemplo por pantalla; `pnpm run demo:data` (desde la raiz) los inserta en `records` sin repetirlos. Las claves de cada registro deben coincidir con las columnas de `backend/app.json`.

## Agregar una funcion

1. Crear la pantalla/componentes en el frontend de esta carpeta.
2. Implementar su endpoint en este backend, con validacion IAM previa a las consultas. Cada boton o grilla nueva pide su propia capacidad (`<pantalla>.<accion>`).
3. Agregar su migracion SQL local si necesita tablas.
4. Incorporar la ruta/codigo al catalogo del backend y registrar el permiso/menu en IAM. Registrar tambien sus capacidades en Portal -> Grillas y botones y asignarlas a los roles.
5. Aplicar tambien las reglas de negocio por usuario cuando corresponda.

No replicar contrasenas, MFA ni roles en la base local. `iam_user_id` es una referencia externa al usuario central; no se crean claves foraneas entre bases.

## Python

Dependencias: `backend/requirements.txt`. El arranque global usa `.venv` de la raiz. Para un entorno individual, crear un `.venv` propio, instalar los requirements y ejecutar `python -m uvicorn main:app --host 127.0.0.1 --port 5001` desde `backend`.

Conexion PostgreSQL mediante [Psycopg 3](https://www.psycopg.org/psycopg3/docs/). Las consultas usan parametros, no concatenacion de datos del usuario.

Ver la [arquitectura](../../docs/arquitectura.md), el [contrato IAM](../../docs/integracion.md) y la [guia de trabajo por app](../../docs/trabajo-por-app.md).
