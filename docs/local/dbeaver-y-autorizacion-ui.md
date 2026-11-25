# DBeaver y autorización de la interfaz

## 1. Conectar las bases desde DBeaver

Las cuatro bases son bases separadas dentro de la misma instancia local de
PostgreSQL. No se debe crear una conexión que mezcle esquemas ni usar la
conexión administrativa de PostgreSQL para ejecutar la aplicación.

### Requisitos previos

1. PostgreSQL debe estar iniciado.
2. La instalación debe haber ejecutado `pnpm run db:setup` y
   `pnpm run db:migrate`.
3. Las contraseñas se leen de los `.env` privados locales. Nunca se copian a
   esta documentación ni se guardan en un archivo versionado.

### Parámetros de conexión

En DBeaver, crear una conexión PostgreSQL independiente para cada fila:

| Base de datos | Usuario recomendado para inspección | Variable de referencia |
|---|---|---|
| `seguridad_transversal` | `st_owner` | `apps/app-seguridad/backend/.env`, `MIGRATION_DATABASE_URL` |
| `crm_app` | `crm_owner` | `apps/app-crm/backend/.env`, `MIGRATION_DATABASE_URL` |
| `almacen_app` | `almacen_owner` | `apps/app-almacen/backend/.env`, `MIGRATION_DATABASE_URL` |
| `facturacion_app` | `facturacion_owner` | `apps/app-facturacion/backend/.env`, `MIGRATION_DATABASE_URL` |

Usar estos valores:

```text
Host:     127.0.0.1
Port:     5432
Database: nombre de la fila
Username: usuario de la fila
Password: la contraseña del MIGRATION_DATABASE_URL local
```

El usuario `*_owner` permite inspeccionar el esquema completo de su propia
base. Para comprobar el principio de mínimo privilegio también se puede crear
una segunda conexión con el usuario de `DATABASE_URL`:

```text
seguridad_transversal -> st_app
crm_app               -> crm_runtime
almacen_app           -> almacen_runtime
facturacion_app       -> facturacion_runtime
```

La conexión de runtime no debe usarse para modificar tablas, cambiar
permisos ni ejecutar migraciones. Los runtimes no deben poder conectar a las
otras tres bases.

### Crear un diagrama ERD

Para cada conexión:

1. Abrir `Schemas > public > Tables`.
2. Seleccionar las tablas que se quieran explicar.
3. Clic derecho y elegir `ER Diagram` o `View Diagram`.
4. Ordenar las entidades y guardar el diagrama dentro del proyecto de
   DBeaver, no dentro del repositorio.

Actualmente se esperan estas áreas:

- `seguridad_transversal`: usuarios, aplicaciones, roles, menús, sesiones,
  desafíos MFA, códigos de recuperación y auditoría.
- `crm_app`, `almacen_app` y `facturacion_app`: inicialmente la tabla local
  `integration_access`, preparada para las futuras entidades de negocio.

Para validar el aislamiento sin modificar datos, usar el script global
[`01-verify-isolation.sql`](../../database/01-verify-isolation.sql) con una
conexión administrativa separada. No ejecutar `DROP DATABASE`, restauraciones
ni scripts de provisión desde DBeaver sobre una instalación existente.

## 2. Estado actual del control de interfaz

Actualmente IAM controla menús y páginas mediante códigos como
`crm.clientes` o `facturacion.comprobantes`. El backend de cada aplicación
vuelve a validar el permiso antes de entregar la página y antes de consultar
su base.

Eso ya protege una ruta, pero no alcanza para distinguir, por ejemplo:

- quién puede ver Clientes;
- quién puede crear, editar o eliminar un cliente;
- quién puede exportar la grilla;
- quién puede ver el margen de una oportunidad;
- quién puede ejecutar una acción masiva.

Ocultar un botón en React nunca debe considerarse autorización. El navegador
es un entorno controlado por el usuario.

## 3. Modelo recomendado para vistas, botones y grillas

### Separar navegación de capacidades

Conservar `menus` para navegación y agregar un catálogo de capacidades de
negocio por aplicación. Una capacidad representa una operación o dato
protegido, no un elemento visual:

```text
crm.clientes.view
crm.clientes.create
crm.clientes.update
crm.clientes.delete
crm.clientes.export
crm.clientes.field.credit_limit.view
crm.oportunidades.margin.view
crm.oportunidades.bulk_update
```

El formato debe permanecer estable y ser específico de la aplicación. No se
deben usar nombres de botones como `crm.boton azul`.

Una evolución del esquema central puede incluir:

```text
capabilities
  id, app_id, code, name, description, active

role_capabilities
  role_id, app_id, capability_id
```

También se puede usar una tabla de permisos única para menús y capacidades,
pero mantener un tipo explícito (`navigation` / `capability`) facilita la
administración y evita que una opción de menú otorgue operaciones por
accidente.

### Contrato IAM

El backend central debería exponer las capacidades efectivas de la sesión,
por ejemplo:

```json
{
  "permissions": ["crm.clientes.view", "crm.clientes.create"],
  "menus": []
}
```

La respuesta de `POST /api/v1/auth/introspect` debe aceptar una capacidad
concreta, igual que hoy acepta un permiso de menú:

```json
{ "permission": "crm.clientes.update" }
```

La respuesta debe ser positiva solo cuando la sesión sigue vigente, el rol y
la aplicación están activos y la capacidad está asignada. La comprobación
debe ejecutarse en cada operación protegida; no se debe confiar en una lista
guardada indefinidamente en el navegador.

### Backend de cada aplicación

Para cada endpoint de negocio:

1. Validar la sesión mediante IAM.
2. Solicitar la capacidad exacta de la operación.
3. Obtener `iam_user_id` de la respuesta validada, nunca del body enviado por
   el navegador.
4. Aplicar las reglas de negocio y de alcance de datos de la aplicación.
5. Consultar o modificar únicamente la base propia.

Ejemplos:

```text
GET    /clientes       -> crm.clientes.view
POST   /clientes       -> crm.clientes.create
PATCH  /clientes/:id   -> crm.clientes.update
DELETE /clientes/:id   -> crm.clientes.delete
GET    /clientes.csv   -> crm.clientes.export
```

La autorización debe ocurrir antes de SQL. Además, el endpoint debe impedir
que un usuario autorizado para editar modifique registros fuera de su
alcance. El permiso de rol no reemplaza reglas como propietario, sucursal,
estado del documento o separación entre compañías.

### Frontend

El frontend puede usar una utilidad común para mejorar la experiencia:

```javascript
const can = (permission) => permissions.includes(permission);

{can("crm.clientes.create") && <Button>Nuevo cliente</Button>}
{can("crm.clientes.export") && <Button>Exportar</Button>}
```

Para grillas:

- ocultar acciones que el usuario no puede ejecutar;
- ocultar o enmascarar columnas sensibles sin permiso;
- no enviar al navegador campos sensibles que no puede ver;
- ocultar acciones masivas si falta la capacidad correspondiente;
- mostrar un estado claro cuando una acción fue retirada.

Estas reglas son de presentación. El backend debe volver a validar cada acción
y devolver `403` si el permiso fue retirado mientras la pantalla estaba
abierta.

## 4. Secuencia recomendada de implementación

1. Definir el catálogo de capacidades de una sola aplicación, comenzando por
   CRM, sin cambiar todavía las otras apps.
2. Crear una migración numerada en
   `apps/app-seguridad/database/migrations`.
3. Agregar asignación de capacidades a roles en el panel administrativo,
   manteniendo la separación por `app_id`.
4. Extender el seed y el catálogo de la aplicación con capacidades iniciales.
5. Extender el contrato IAM para devolver y comprobar capacidades.
6. Implementar un endpoint de negocio real y protegerlo en backend.
7. Añadir un helper `can()` en el frontend y controlar botones, columnas y
   acciones masivas.
8. Agregar pruebas para:
   - permiso concedido y denegado;
   - acceso directo a la URL;
   - llamada directa al endpoint sin permiso;
   - retiro del permiso con una sesión abierta;
   - columna sensible no entregada;
   - reglas de alcance por usuario.

No se debe comenzar ocultando botones y dejar la autorización del endpoint
para una etapa posterior.
