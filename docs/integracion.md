# Integración y separación de datos

## Responsabilidades

| Componente                 | Responsabilidad                                                                                                         |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Core                       | Contraseña, MFA, usuario, habilitaciones, roles, menús, duración y revocación de sesión                                 |
| Backend cliente            | Cookie local, credencial privada de aplicación, protección CSRF y comprobación de permiso antes de servir páginas/datos |
| Base de negocio, si existe | Clientes, productos, comprobantes y relaciones de negocio; accesible solo por su propio backend                         |

Cada aplicación conecta a su propia base PostgreSQL: `seguridad_transversal`, `crm_app`, `almacen_app` y `facturacion_app`. Los runtimes SQL no pueden conectar a las otras tres bases. Las demos mantienen sus páginas vacías y registran únicamente accesos autorizados en su tabla local `integration_access`, como demostración de persistencia independiente.

## Contrato básico

El backend utiliza `X-App-Id` y `X-App-Key`, recibidos al registrar la aplicación. En el entorno local `db:seed` configura `APP_ID` y `APP_KEY` en el `.env` privado de cada backend. Cada runtime lee solo la configuración de su propia carpeta.

1. `POST /api/v1/auth/login-step1` con `{ email, password }` devuelve un desafío de MFA cuando se exige. Si el administrador lo desactivó para ese usuario, devuelve directamente `AUTHENTICATED` con un rol único, o `ROLE_REQUIRED` si hay varios.
2. `ENROLL_REQUIRED`: `POST /api/v1/auth/mfa/enroll` con `{ challenge }` devuelve QR y clave manual. Confirmar con `POST /api/v1/auth/mfa/confirm` y `{ challenge, code }`.
3. `MFA_REQUIRED`: `POST /api/v1/auth/login-step2` con `{ challenge, code }`. Se acepta TOTP o recuperación.
4. Si se devuelve `ROLE_REQUIRED`, usar la prueba `selection` en `POST /api/v1/auth/select-role` con `{ selection, role_id }`.
5. `AUTHENTICATED` devuelve `sessionToken`, `expires_at` y `role_name` al backend. Este pone el token en una cookie `HttpOnly` y lo retira de la respuesta JSON del navegador.
6. `GET /api/v1/me` devuelve identidad, rol, vencimiento, `session.mfa_required` (política), `session.mfa_verified` (segundo factor realizado en esa sesión) y árbol de menús. Los adaptadores agregan una prueba CSRF local sin exponer la sesión.
7. Antes de servir una página o datos, llamar a `POST /api/v1/auth/introspect` con `{ permission: 'crm.clientes' }` y `Authorization: Bearer <sesión>`.
8. `POST /api/v1/auth/logout` revoca la sesión central; el cliente elimina la cookie.

Ejemplo exclusivamente del lado del servidor:

```javascript
const response = await fetch(`${coreUrl}/api/v1/auth/introspect`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-App-Id": String(appId),
    "X-App-Key": appKey,
    Authorization: `Bearer ${tokenObtenidoDeLaCookie}`,
  },
  body: JSON.stringify({ permission: "crm.clientes" }),
  signal: AbortSignal.timeout(5000),
});
if (!response.ok) {
  // Denegar la operación; no consultar ni entregar los datos protegidos.
}
// Solo después de autorizar: consultar la base propia del CRM, si existe.
```

El identificador de usuario proviene de la respuesta validada del Core. Si la aplicación conserva perfiles locales, vincularlos con ese identificador estable; no aceptar un usuario arbitrario enviado por el navegador ni enlazar cuentas automáticamente por coincidencia de correo.

## Rutas existentes en las demos

| Aplicación  | Código de permiso          | Ruta             |
| ----------- | -------------------------- | ---------------- |
| CRM         | `crm.clientes`             | `/clientes`      |
| CRM         | `crm.oportunidades`        | `/oportunidades` |
| CRM         | `crm.reportes`             | `/reportes`      |
| Almacén     | `almacen.productos`        | `/productos`     |
| Almacén     | `almacen.movimientos`      | `/movimientos`   |
| Almacén     | `almacen.reportes`         | `/reportes`      |
| Facturación | `facturacion.comprobantes` | `/comprobantes`  |
| Facturación | `facturacion.series`       | `/series`        |
| Facturación | `facturacion.reportes`     | `/reportes`      |

Cada backend tiene el catálogo de rutas y códigos. Los nombres, grupos, orden y asignaciones se administran en el portal. Para agregar otra pantalla real se agrega primero su ruta y comprobación al backend; después se registra su opción en el Core y se asigna a los roles.

La rotación de una clave desde el panel la muestra una sola vez e invalida la anterior. Actualiza `APP_KEY` en el `.env` del backend cliente y reinícialo. Para mantener sincronizado el bootstrap local, actualiza también la variable `CRM_APP_KEY`, `ALMACEN_APP_KEY` o `FACTURACION_APP_KEY` de `apps/app-seguridad/backend/.env`. La carga inicial no sobrescribe la clave registrada en IAM ni los permisos editados.

## Persistencia independiente

- `apps/app-crm/backend/main.py`: valida IAM y usa Psycopg para insertar solo en `crm_app`.
- `apps/app-almacen/backend/src/Database.java`: usa JDBC para consultar únicamente `almacen_app` después de autorizar en `Main.java`.
- `apps/app-facturacion/backend/app.js`: valida IAM y consulta su pool `pg` conectado a `facturacion_app`.
- `GET /api/v1/demo/page?path=...`: devuelve la pantalla autorizada, el nombre de la base observado por SQL y el identificador del acceso registrado. El frontend no muestra esos metadatos.
- `GET /api/v1/integration/status`: requiere sesión y devuelve la base/rol SQL reales y los accesos del usuario actual.

Las tablas de negocio deben agregarse como migraciones en `apps/app-*/database/migrations`. `iam_user_id` es un identificador externo estable, sin claves foráneas ni acceso SQL a la base central.

## Límites deliberados

No hay inicio único entre las demos: cada una abre su propia sesión con la identidad central. El backend no debe recurrir a una contraseña local si falla el Core; eso omitiría MFA, bloqueo y duración por rol. Integrar una aplicación antigua que conserva su autenticación requiere diseñar un adaptador específico y queda fuera de este MVP.
