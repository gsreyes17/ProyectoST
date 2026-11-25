# ProyectoST — Seguridad transversal y aplicaciones independientes

Monorepo con cuatro aplicaciones y cuatro bases de datos PostgreSQL 17. La transversal administra la identidad y los permisos; CRM, Almacén y Facturación tienen frontend, backend y persistencia propios.

La transversal decide por rol qué **menús** (familias y pantallas) ve cada usuario en cada aplicación. Las demos arman su navegación con lo que IAM autoriza: una pantalla sin permiso no aparece en el menú y su URL responde 403. Cada pantalla autorizada muestra los registros de su propia base con un diseño acorde a su función (tarjetas de clientes, tablero de oportunidades, inventario con nivel de stock, registro de comprobantes, etc.). Sus botones (Nuevo, Exportar, Emitir…) son de muestra: indican la intención de la función, avisan que son de demostración y no modifican datos.

**Matriz de permisos** (portal) muestra qué pantallas tiene cada rol: roles en columnas; familias y pantallas en filas. Pulsar el nombre de un rol abre su edición. Los cambios se aplican en la siguiente petición, sin cerrar la sesión del usuario.

## Trazabilidad

El portal registra tres cosas, en tablas de solo anexado (la aplicación puede escribir en ellas, pero no modificarlas ni borrarlas):

| Sección del portal   | Tabla           | Qué guarda                                                                                                       |
| -------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------- |
| Auditoría            | `audit_events`  | Ingresos, fallos de doble factor, cierres, revocaciones y cambios administrativos                                |
| Historial de cambios | `admin_changes` | Cada alta o edición de usuarios, roles, menús y aplicaciones, con su estado **anterior y nuevo** y quién lo hizo |
| Accesos a pantallas  | `access_log`    | Cada pantalla que una aplicación solicita, con usuario, rol y si se **permitió o denegó**                        |

Usuarios, roles y menús tienen además un botón «Ver historial» con los cambios de ese registro. El historial guarda nombres legibles (por ejemplo, las pantallas del rol), nunca contraseñas, secretos MFA ni claves.

Cada demo tiene identidad visual propia, como si la hubiera construido otro equipo: CRM es claro y redondeado con barra lateral, Almacén es oscuro, denso y monoespaciado, y Facturación usa navegación superior con estilo de documento. El inicio de sesión también cambia de disposición (formulario a la izquierda en CRM, tarjeta centrada en Almacén, formulario a la derecha en Facturación), sobre el mismo flujo de contraseña y doble factor de IAM. Las tres muestran en la cabecera el usuario y su **rol activo**, del que depende el menú.

## Aplicaciones

| Aplicación            | Carpeta                | Backend           | Dirección             | Base propia             |
| --------------------- | ---------------------- | ----------------- | --------------------- | ----------------------- |
| Seguridad Transversal | `apps/app-seguridad`   | Node.js / Express | http://localhost:4000 | `seguridad_transversal` |
| CRM Comercial         | `apps/app-crm`         | Python / FastAPI  | http://localhost:5001 | `crm_app`               |
| Almacén               | `apps/app-almacen`     | Java / JDBC       | http://localhost:5002 | `almacen_app`           |
| Facturación           | `apps/app-facturacion` | Node.js / Express | http://localhost:5003 | `facturacion_app`       |

```text
ProyectoST/
├── apps/
│   ├── app-seguridad/
│   ├── app-crm/
│   ├── app-almacen/
│   └── app-facturacion/
│       # Cada app contiene:
│       # frontend/   Fuentes React, páginas, estilos y build independiente
│       # backend/    Servidor, dependencias y .env privado
│       # database/   Migraciones SQL y permisos de su base
│       # README.md   Comandos y responsabilidad de la app
├── database/          SQL de provisión y verificación de aislamiento
├── scripts/           Instalación, arranque y comprobaciones del ecosistema
├── docs/              Arquitectura, integración, exposición y trabajo por app
├── .env.example       Configuración administrativa de instalación
└── package.json       Workspaces y comandos globales
```

## Abrir en este equipo

Las cuatro bases, sus roles SQL y las migraciones ya están creados. Se conservaron los usuarios y la configuración de la instalación anterior.

```powershell
pnpm run dev
```

También puedes abrir `Iniciar.cmd`. Visita el portal en http://localhost:4000. Las credenciales locales iniciales están en `.local/admin-inicial.txt` y las de las demos en `.local/usuarios-demo.txt`; no se incluyen en el repositorio. Si esas contraseñas fueron cambiadas desde el panel, usa las nuevas.

La empresa es **Zentra** y las cuentas usan el dominio `@zentra.com` (`COMPANY_NAME` y `ALLOWED_EMAIL_DOMAINS` en `apps/app-seguridad/backend/.env`). El administrador accede al portal; `pnpm run demo:users` deja cuentas para revisar la vista de cada rol:

| Cuenta           | CRM                                              | Almacén        | Facturación    |
| ---------------- | ------------------------------------------------ | -------------- | -------------- |
| `operador@`      | Usuario normal                                   | Usuario normal | Usuario normal |
| `supervisor@`    | Administrador                                    | Administrador  | Administrador  |
| `ana.torres@`    | Usuario normal                                   | —              | —              |
| `luis.ramos@`    | Administrador                                    | —              | —              |
| `carla.mendoza@` | —                                                | Usuario normal | —              |
| `jorge.salas@`   | —                                                | Administrador  | —              |
| `patricia.vega@` | —                                                | —              | Usuario normal |
| `miguel.castro@` | —                                                | —              | Administrador  |
| `rosa.diaz@`     | Analista                                         | Analista       | Analista       |
| `sofia.quispe@`  | Administrador **o** Analista (elige al ingresar) | Administrador  | Administrador  |

El script crea también el rol **Analista** en cada app, con solo su pantalla de reportes, si todavía no existe. Las cuentas nuevas no exigen doble factor, para revisar las vistas rápido; operador y supervisor sí lo exigen al crearse. La política MFA se cambia por usuario con el interruptor de la columna «Doble factor» en Usuarios (o en Editar → Exigir doble factor); el botón «Exigir doble factor a todos» la activa para todas las cuentas que aún no la tienen. Cada cambio pide confirmación, cierra las sesiones del usuario y queda en la auditoría y el historial. El script es repetible: no cambia contraseñas ni permisos de cuentas existentes.

## Instalación reproducible desde un clon

Requisitos: Node.js 22.13 o posterior, pnpm 11.18.0, PostgreSQL 17, Python 3.11 o posterior y JDK 21 o posterior (`java` y `javac` en PATH). Google Chrome solo es necesario para las pruebas de navegador. El arranque global de Java no requiere Maven.

La versión de pnpm está fijada en `package.json`; debe estar disponible en PATH antes de instalar. Consulta la [instalación oficial de pnpm](https://pnpm.io/installation) si tu equipo aún no lo tiene. Ejecuta la instalación desde la raíz: `pnpm-workspace.yaml` incluye los cuatro frontends y los dos backends Node. `pnpm-lock.yaml` es el único lockfile del proyecto.

```powershell
pnpm install --frozen-lockfile
pnpm run env:init
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r apps/app-crm/backend/requirements.txt
pnpm run java:setup
```

`env:init` crea un `.env` privado por backend y genera contraseñas/claves aleatorias. Si encuentra una configuración anterior, la conserva y traslada la configuración de seguridad a su nueva ubicación. El `.env` raíz queda reservado a la instalación de PostgreSQL.

Completa `POSTGRES_ADMIN_HOST`, `POSTGRES_ADMIN_PORT`, `POSTGRES_ADMIN_USER` y `POSTGRES_ADMIN_PASSWORD` en el `.env` raíz y ejecuta:

```powershell
pnpm run db:setup
pnpm run db:seed
pnpm run admin:create
pnpm run demo:users
pnpm run demo:data
pnpm run build
pnpm run dev
```

`demo:data` llena las grillas con registros de ejemplo: lee `apps/app-*/database/seed-data.json` y escribe en la base de cada app con su propio usuario de ejecución. No repite registros ya cargados.

Los comandos son repetibles: no borran bases, no reinician usuarios ni cambian contraseñas de roles existentes. Si una base ya tiene otro propietario o existe una incompatibilidad de configuración, se informa y se conserva. Después de instalar puedes vaciar la contraseña administrativa del `.env` raíz.

El primer ingreso de una cuenta con MFA exigido requiere escanear el QR, confirmar el código y guardar sus códigos de recuperación. No se generan autenticadores de prueba permanentes ni contraseñas fijas compartidas.

## Desarrollar una app sin cambiar las otras

Ejemplo CRM, desde la raíz:

```powershell
node scripts/build.mjs crm
node scripts/dev.mjs crm
pnpm --filter @proyectost/crm-frontend dev
```

Los dos últimos comandos se ejecutan en terminales distintas. El frontend de desarrollo usa http://localhost:5174 y el backend http://localhost:5001. IAM debe estar ejecutándose; puedes iniciarlo aparte con `node scripts/dev.mjs seguridad`.

Los frontends de desarrollo usan los puertos 5173 (Seguridad), 5174 (CRM), 5175 (Almacén) y 5176 (Facturación). Los backends sirven su propio `frontend/dist` al ejecutar el ecosistema compilado. `pnpm run build` compila los cuatro; `node scripts/build.mjs <app>` compila solo el indicado.

Cada persona o equipo puede trabajar en su carpeta guiándose por su README. Las fuentes no se comparten; la instalación pnpm y el lockfile raíz se coordinan mediante workspaces. Usa ramas/copias de trabajo distintas para evitar cambios simultáneos sobre un mismo archivo.

Para agregar una dependencia utiliza el paquete que la necesita, por ejemplo `pnpm --filter @proyectost/crm-frontend add <paquete>`; para herramientas globales del proyecto utiliza `pnpm add -Dw <paquete>`. Versiona los cambios al manifiesto correspondiente y a `pnpm-lock.yaml`. Los scripts de instalación de dependencias nativas están autorizados explícitamente para Argon2 y esbuild en `pnpm-workspace.yaml`.

## Reglas de desarrollo

1. Autenticar y autorizar en la API transversal antes de leer o escribir datos de negocio.
2. Cada aplicación usa solo su `backend/.env` y su base. No consulta SQL de la transversal ni copia contraseñas, MFA o roles a las bases de negocio.
3. El usuario se obtiene de la sesión validada por IAM. `iam_user_id` es una referencia externa; no hay claves foráneas entre bases.
4. Todo endpoint nuevo conserva cookies HttpOnly, protección CSRF y validación en su backend.
5. Las demos se mantienen sencillas: título, menús, usuario y rol activo, cierre de sesión y, por pantalla, una vista de solo lectura de sus registros. Sus botones son de muestra: avisan que son de demostración y no llaman a ningún endpoint.
6. No versionar `.env`, `.local`, credenciales iniciales, volcados, dependencias ni compilados.

Cada frontend tiene fuentes y compilación propias y no importa código de otra aplicación; los estilos se copiaron como punto de partida y cada app puede cambiarlos. Para trabajar en una app usa una rama propia y limita los cambios a su carpeta `apps/app-*`. Los cambios a `scripts/`, `database/`, el manifiesto o lockfile raíz y los contratos de IAM afectan a todas las apps: revísalos en conjunto. Comprueba los cambios de interfaz compilando la app y, si tocan seguridad o integración, ejecuta también las pruebas correspondientes. No borres ni reinicies bases con datos existentes para probar.

## Cómo se demuestra la integración de bases

1. El backend cliente valida sesión y permiso en la transversal mediante HTTP.
2. Solo si se autoriza consulta su base y registra el acceso a la página en `integration_access`.
3. La misma respuesta autorizada entrega los registros de la pantalla, leídos de la tabla local `records`.
4. El ID del usuario central se guarda como referencia externa, sin consultas SQL ni claves foráneas entre bases.
5. Cada usuario de ejecución SQL tiene CONNECT solo a su propia base entre las cuatro del proyecto.

`GET /api/v1/integration/status` requiere una sesión de esa app y devuelve el nombre de su base, su usuario SQL y el número de accesos propios. El endpoint sirve para inspeccionar la integración; no agrega información técnica a la interfaz.

## Pruebas

Con los cuatro servicios iniciados:

```powershell
pnpm test
pnpm run test:integration
pnpm run test:browser
```

- `pnpm test`: 31 comprobaciones de contraseñas, MFA configurable, sesiones, permisos, historial de cambios, registro de pantallas, aislamiento entre aplicaciones y límites de autenticación. Usa y elimina un esquema temporal, sin modificar las cuentas reales.
- `test:integration`: comprueba las cuatro conexiones propias y el rechazo de las otras doce combinaciones; verifica por HTTP que IAM autoriza antes de escribir en cada base y que la pantalla autorizada trae sus registros (requiere `pnpm run demo:data`). Usa y limpia una cuenta temporal.
- `test:browser`: recorre el panel y las tres apps, los tres inicios de sesión, MFA, menús, matriz de permisos, historial de cambios, accesos a pantallas, usuario y rol en la cabecera, grilla de solo lectura, sidebar móvil y cierre/revocación; limpia cuentas y registros locales de prueba. Capturas en `.local/screenshots`.

## Compartir en un repositorio

Versionar fuentes, `pnpm-lock.yaml`, los `.env.example`, la documentación y los scripts SQL. `.gitignore` excluye `.env`, `.local`, credenciales iniciales, dependencias, entornos virtuales, JAR/clases descargados, compilados y volcados. Cada instalación genera sus propios secretos y cuentas iniciales.

No se incluyen datos reales, contraseñas de PostgreSQL, sesiones ni secretos MFA en los SQL. Los scripts de estructura están en cada `database/migrations`; la provisión y verificación globales están en `database/`. La carpeta `apps/app-almacen/backend/.local` se reconstruye con `java:setup` y el arranque Java.

Este trabajo deja el proyecto preparado para versionarlo. No se ha publicado en ningún servicio remoto. En un repositorio nuevo puedes usar `git init`, revisar `git status` y añadir las fuentes antes de configurar tu remoto.

## Documentación de contexto

- [Arquitectura y separación de datos](docs/arquitectura.md)
- [Contrato de integración IAM](docs/integracion.md)
- [Trabajo por app y contexto para otros chats](docs/trabajo-por-app.md)
- [Guías locales: DBeaver y autorización de interfaz](docs/local/README.md)
- [Instalación y scripts SQL](database/README.md)
- [Presentación: relato, puntos fuertes y preguntas frecuentes](docs/presentacion.md)
- [Guion de exposición paso a paso](docs/demostracion.md)
- [Contexto de Seguridad](apps/app-seguridad/README.md)
- [Contexto de CRM](apps/app-crm/README.md)
- [Contexto de Almacén](apps/app-almacen/README.md)
- [Contexto de Facturación](apps/app-facturacion/README.md)

Tras actualizar una instalación existente ejecuta `pnpm run db:migrate`, `pnpm run demo:data` y `pnpm run build`: las migraciones crean la tabla `records` de cada demo, retiran las tablas de grillas y botones de una versión anterior (`004-remove-capabilities.sql`) y crean el historial de cambios y el registro de pantallas (`005-audit-history.sql`).

La aplicación central conserva Argon2id, TOTP configurable por usuario, sesiones opacas con duración por rol, revocación, RBAC por menús, auditoría, historial de cambios y registro de pantallas. Los módulos nuevos deben validar también sus propias reglas de negocio. La ejecución preparada es local; un despliegue compartido requiere configurar HTTPS, orígenes/proxy y políticas operativas.
