# Facturacion

Aplicacion independiente del ecosistema de seguridad transversal. Backend Node.js / Express; frontend React/Vite propio.

| Elemento                                 | Ubicacion               |
| ---------------------------------------- | ----------------------- |
| Interfaz y estilos                       | `frontend/src`          |
| Entrada del frontend                     | `frontend/src/main.jsx` |
| Backend y su configuracion               | `backend`               |
| Variables de ejemplo                     | `backend/.env.example`  |
| Migraciones de su base `facturacion_app` | `database/migrations`   |

## Reglas de esta app

- Implementar aqui solo funciones de esta app: no editar las otras ni importar sus frontends. La navegacion y el inicio de sesion son una copia local para que la app evolucione por separado.
- Antes de cualquier consulta SQL, validar sesion y permiso en IAM. No crear un login local, no copiar tablas de seguridad ni cambiar la politica MFA, la duracion de sesion o las credenciales centrales.
- Secretos locales en `backend/.env`; solo se versiona `backend/.env.example`. Las tablas nuevas van en migraciones numeradas de `database/migrations`.
- Las dependencias propias se declaran en el manifiesto de esta app; los cambios al lockfile raiz y a los scripts comunes se revisan en conjunto.

## Arranque

El entorno completo se instala siguiendo el [README principal](../../README.md). Desde la raiz se puede ejecutar:

```powershell
node scripts/build.mjs facturacion
node scripts/dev.mjs facturacion
```

El backend sirve su frontend compilado en http://localhost:5003. Para desarrollo con recarga, iniciar el backend y ejecutar `pnpm run dev` dentro de `frontend`; Vite usa http://localhost:5176 y reenvia `/api` a su propio backend.

## Integracion

El navegador usa una cookie HttpOnly. El backend se comunica con IAM mediante `CORE_URL`, `APP_ID` y `APP_KEY`; valida antes de consultar `DATABASE_URL`. No usa credenciales ni conexiones SQL de la transversal.

Cada pantalla muestra, en solo lectura, los registros de la tabla local `records` con un diseno propio: Comprobantes como registro con filtro por tipo y totales, Series como talonarios con el proximo numero y Reportes como estado por periodo. El backend los entrega en `GET /api/v1/demo/page` despues de autorizar el menu en IAM, y `frontend/src/pages/index.jsx` arma la vista a partir de `backend/app.json`, que define por pantalla la ruta, el codigo de permiso y las columnas. Los botones de estas vistas son de muestra: muestran un aviso de demostracion y no llaman a ningun endpoint. Una pantalla nueva sin diseno propio se muestra como tabla. Se pueden desarrollar nuevos componentes aqui sin modificar el frontend de las otras apps.

`GET /api/v1/demo/page?path=...` valida la opcion en IAM y registra el acceso en la tabla local `integration_access`. `GET /api/v1/integration/status` requiere sesion y devuelve la base/usuario SQL y los accesos propios. Los datos del diagnostico no se muestran en la interfaz.

## Identidad visual y datos de ejemplo

Esta app tiene identidad propia: sobria, tipo documento, con navegacion superior en lugar de barra lateral. Vive en `frontend/src/Demo.jsx` y `frontend/src/demo.css`; el inicio de sesion se ajusta en ese mismo CSS bajo la clase `demo-facturacion`, sin cambiar `Auth.jsx` ni el flujo de acceso. La cabecera muestra el usuario y su rol activo (`session.full_name`, `session.role_name` de `/api/v1/me`).

`database/seed-data.json` contiene registros de ejemplo por pantalla; `pnpm run demo:data` (desde la raiz) los inserta en `records` sin repetirlos. Las claves de cada registro deben coincidir con las columnas de `backend/app.json`.

## Agregar una funcion

1. Crear la pantalla/componentes en el frontend de esta carpeta.
2. Implementar su endpoint en este backend, con validacion IAM previa a las consultas.
3. Agregar su migracion SQL local si necesita tablas.
4. Incorporar la ruta/codigo al catalogo del backend y registrar el permiso/menu en IAM.
5. Aplicar tambien las reglas de negocio por usuario cuando corresponda.

No replicar contrasenas, MFA ni roles en la base local. `iam_user_id` es una referencia externa al usuario central; no se crean claves foraneas entre bases.

## Node.js

`backend/package.json` declara sus dependencias y comandos. Despues de `pnpm install --frozen-lockfile` en la raiz se puede ejecutar `pnpm run dev` desde `backend`. La conexion a su base se implementa con `pg.Pool` y consultas parametrizadas.

Ver la [arquitectura](../../docs/arquitectura.md), el [contrato IAM](../../docs/integracion.md) y la [guia de trabajo por app](../../docs/trabajo-por-app.md).
