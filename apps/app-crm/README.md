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

Las pantallas iniciales permanecen vacias y se organizan desde `frontend/src/pages/index.jsx`. Se pueden desarrollar nuevos componentes aqui sin modificar el frontend de las otras apps. `backend/app.json` define las rutas existentes y sus codigos de permiso.

`GET /api/v1/demo/page?path=...` valida la opcion en IAM y registra el acceso en la tabla local `integration_access`. `GET /api/v1/integration/status` requiere sesion y devuelve la base/usuario SQL y los accesos propios. Los datos del diagnostico no se muestran en la interfaz.

## Agregar una funcion

1. Crear la pantalla/componentes en el frontend de esta carpeta.
2. Implementar su endpoint en este backend, con validacion IAM previa a las consultas.
3. Agregar su migracion SQL local si necesita tablas.
4. Incorporar la ruta/codigo al catalogo del backend y registrar el permiso/menu en IAM.
5. Aplicar tambien las reglas de negocio por usuario cuando corresponda.

No replicar contrasenas, MFA ni roles en la base local. `iam_user_id` es una referencia externa al usuario central; no se crean claves foraneas entre bases.

## Python

Dependencias: `backend/requirements.txt`. El arranque global usa `.venv` de la raiz. Para un entorno individual, crear un `.venv` propio, instalar los requirements y ejecutar `python -m uvicorn main:app --host 127.0.0.1 --port 5001` desde `backend`.

Conexion PostgreSQL mediante [Psycopg 3](https://www.psycopg.org/psycopg3/docs/). Las consultas usan parametros, no concatenacion de datos del usuario.

Ver la [arquitectura](../../docs/arquitectura.md), el [contrato IAM](../../docs/integracion.md) y la [guia de trabajo por app](../../docs/trabajo-por-app.md).
