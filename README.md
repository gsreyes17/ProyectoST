# ProyectoST — Seguridad transversal y aplicaciones independientes

Monorepo con cuatro aplicaciones y cuatro bases de datos PostgreSQL 17. La transversal administra la identidad y los permisos; CRM, Almacén y Facturación tienen frontend, backend y persistencia propios.

Las demos conservan una interfaz mínima: título, menús y cierre de sesión. Sus páginas están preparadas para agregar funciones de negocio en otros chats.

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
│       # AGENTS.md   Contexto para continuar desde otro chat
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

El usuario administrador accede al portal; operador y supervisor tienen roles en las tres demos. La política MFA se configura por usuario en Usuarios → Editar → Exigir doble factor. El administrador ya enrolado conserva su autenticador.

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
pnpm run build
pnpm run dev
```

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

Cada chat puede trabajar en su carpeta con su README y AGENTS. Las fuentes no se comparten; la instalación pnpm y el lockfile raíz se coordinan mediante workspaces. Usa ramas/copias de trabajo distintas para evitar cambios simultáneos sobre un mismo archivo.

Para agregar una dependencia utiliza el paquete que la necesita, por ejemplo `pnpm --filter @proyectost/crm-frontend add <paquete>`; para herramientas globales del proyecto utiliza `pnpm add -Dw <paquete>`. Versiona los cambios al manifiesto correspondiente y a `pnpm-lock.yaml`. Los scripts de instalación de dependencias nativas están autorizados explícitamente para Argon2 y esbuild en `pnpm-workspace.yaml`.

## Cómo se demuestra la integración de bases

1. El backend cliente valida sesión y permiso en la transversal mediante HTTP.
2. Solo si se autoriza consulta su base y registra el acceso a la página en `integration_access`.
3. El ID del usuario central se guarda como referencia externa, sin consultas SQL ni claves foráneas entre bases.
4. Cada usuario de ejecución SQL tiene CONNECT solo a su propia base entre las cuatro del proyecto.

`GET /api/v1/integration/status` requiere una sesión de esa app y devuelve el nombre de su base, su usuario SQL y el número de accesos propios. El endpoint sirve para inspeccionar la integración; no agrega información técnica a la interfaz.

## Pruebas

Con los cuatro servicios iniciados:

```powershell
pnpm test
pnpm run test:integration
pnpm run test:browser
```

- `pnpm test`: 30 comprobaciones de contraseñas, MFA configurable, sesiones, permisos, aislamiento entre aplicaciones y límites de autenticación. Usa y elimina un esquema temporal, sin modificar las cuentas reales.
- `test:integration`: comprueba las cuatro conexiones propias y el rechazo de las otras doce combinaciones; verifica por HTTP que IAM autoriza antes de escribir en cada base. Usa y limpia una cuenta temporal.
- `test:browser`: recorre el panel y las tres apps, MFA, menús, sidebar móvil, cierre/revocación y permisos; limpia cuentas y registros locales de prueba. Capturas en `.local/screenshots`.

## Compartir en un repositorio

Versionar fuentes, `pnpm-lock.yaml`, los `.env.example`, la documentación y los scripts SQL. `.gitignore` excluye `.env`, `.local`, credenciales iniciales, dependencias, entornos virtuales, JAR/clases descargados, compilados y volcados. Cada instalación genera sus propios secretos y cuentas iniciales.

No se incluyen datos reales, contraseñas de PostgreSQL, sesiones ni secretos MFA en los SQL. Los scripts de estructura están en cada `database/migrations`; la provisión y verificación globales están en `database/`. La carpeta `apps/app-almacen/backend/.local` se reconstruye con `java:setup` y el arranque Java.

Este trabajo deja el proyecto preparado para versionarlo. No se ha publicado en ningún servicio remoto. En un repositorio nuevo puedes usar `git init`, revisar `git status` y añadir las fuentes antes de configurar tu remoto.

## Documentación de contexto

- [Arquitectura y separación de datos](docs/arquitectura.md)
- [Contrato de integración IAM](docs/integracion.md)
- [Trabajo por app y contexto para otros chats](docs/trabajo-por-app.md)
- [Instalación y scripts SQL](database/README.md)
- [Guion de exposición](docs/demostracion.md)
- [Contexto de Seguridad](apps/app-seguridad/README.md)
- [Contexto de CRM](apps/app-crm/README.md)
- [Contexto de Almacén](apps/app-almacen/README.md)
- [Contexto de Facturación](apps/app-facturacion/README.md)

La aplicación central conserva Argon2id, TOTP configurable por usuario, sesiones opacas con duración por rol, revocación, RBAC y auditoría. Los módulos nuevos deben validar también sus propias reglas de negocio. La ejecución preparada es local; un despliegue compartido requiere configurar HTTPS, orígenes/proxy y políticas operativas.
