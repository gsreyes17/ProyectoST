# SQL para instalar y compartir

No se incluyen volcados con cuentas reales, hashes, sesiones, claves de integración ni secretos MFA. Los scripts contienen estructura y permisos; las credenciales se generan localmente.

## Instalación recomendada

1. `pnpm run env:init`: genera `.env` raíz y un `.env` privado por backend; conserva la configuración existente.
2. Completar `POSTGRES_ADMIN_PASSWORD` en el `.env` raíz para PostgreSQL 17.
3. `pnpm run db:setup`: crea las cuatro bases y sus roles, configura el aislamiento y aplica migraciones.
4. `pnpm run db:seed`: registra aplicaciones/roles/menús iniciales y configura las credenciales de integración locales.
5. `pnpm run admin:create`: crea el primer administrador solo si no existe.

Después de instalar se puede vaciar `POSTGRES_ADMIN_PASSWORD`; migraciones posteriores usan los propietarios de cada base. No se cambia ninguna contraseña de un rol preexistente: si las credenciales locales no coinciden, corregir la configuración.

## Archivos SQL

| Archivo                                          | Uso                                                                        |
| ------------------------------------------------ | -------------------------------------------------------------------------- |
| `00-create-databases.sql`                        | Alternativa manual psql para crear las cuatro bases/roles y aislar CONNECT |
| `01-verify-isolation.sql`                        | Comprueba conexión a la base propia y denegación a las otras tres          |
| `apps/app-seguridad/database/migrations/*.sql`   | Esquema IAM, sesiones, MFA y política por usuario                          |
| `apps/app-crm/database/migrations/*.sql`         | Datos propios del CRM                                                      |
| `apps/app-almacen/database/migrations/*.sql`     | Datos propios de Almacén                                                   |
| `apps/app-facturacion/database/migrations/*.sql` | Datos propios de Facturación                                               |
| `apps/app-*/database/permissions.sql`            | Permisos de ejecución si se aplica el SQL manualmente                      |

`db:setup` ejecuta la provisión equivalente desde Node/pg con validación previa de nombres, propietarios y versión. `db:migrate` aplica únicamente migraciones pendientes y registra cada archivo en `schema_migrations`.

## Alternativa manual con psql

`00-create-databases.sql` usa metacomandos de psql (`\gexec`) y no debe ejecutarse con un cliente SQL que los desconozca ni dentro de una transacción global. Requiere estas ocho variables de psql, definidas de forma privada antes de ejecutar:

`st_owner_password`, `st_app_password`, `crm_owner_password`, `crm_runtime_password`, `almacen_owner_password`, `almacen_runtime_password`, `facturacion_owner_password`, `facturacion_runtime_password`.

Las variables deben contener contraseñas aleatorias y coincidir con las conexiones de los `.env` de cada backend. Si se utiliza un archivo privado de variables, guardarlo en `.local`, nunca en la carpeta de SQL versionada.

```powershell
# Desde una sesión psql conectada como administrador a postgres:
\i .local/variables-privadas.sql
\i database/00-create-databases.sql
\i database/01-verify-isolation.sql
```

Conectarse luego a cada base como su propietario, aplicar sus migraciones en orden y su `permissions.sql`. Las cuentas IAM iniciales se generan con `db:seed` y `admin:create`, porque sus contraseñas y claves deben producirse localmente.

No ejecutar DROP DATABASE, DROP SCHEMA ni restauraciones sobre instalaciones con datos para repetir una demostración. No es necesario reinicializar las bases: los comandos de instalación/migración son repetibles.
