# Contexto del repositorio

Lee `README.md`, `docs/arquitectura.md` y el `AGENTS.md` de la aplicación asignada.

## Alcance por aplicación

- `apps/app-seguridad`: identidad, contraseña, MFA configurable, sesiones, roles, menús y auditoría. Base `seguridad_transversal`.
- `apps/app-crm`: frontend React, backend Python/FastAPI y base `crm_app`.
- `apps/app-almacen`: frontend React, backend Java/JDBC y base `almacen_app`.
- `apps/app-facturacion`: frontend React, backend Node/Express y base `facturacion_app`.

Cada frontend tiene fuentes y compilación propias. No importa código de otra aplicación. Los estilos iniciales fueron copiados como punto de partida y se pueden modificar en cada app.

Usar pnpm 11.18.0 (fijado en `package.json`). Instalar desde la raíz con `pnpm install --frozen-lockfile`. Los paquetes están definidos en `pnpm-workspace.yaml`; conservar un único `pnpm-lock.yaml`. Agregar dependencias al paquete correspondiente con `pnpm --filter <paquete> add <dependencia>` y coordinar los cambios al lockfile raíz.

## Reglas de integración

1. Autenticar y autorizar en la API transversal antes de leer/escribir datos de negocio.
2. Una aplicación solo usa su `backend/.env` y su base. No consultar SQL de la transversal ni copiar contraseñas/MFA/roles a las bases de negocio.
3. Obtener el usuario desde la sesión validada por IAM. `iam_user_id` es una referencia externa; no hay claves foráneas entre bases.
4. Conservar cookies HttpOnly, protección CSRF y validación en el backend de cada endpoint nuevo.
5. Mantener la interfaz de las demos mínima: título, menús y cierre de sesión; desarrollar funcionalidad solo dentro de la app solicitada.
6. No versionar `.env`, `.local`, credenciales iniciales, volcados, dependencias ni compilados.

## Trabajo en varios chats

Cada chat debe usar una rama/copia de trabajo y concentrarse en una carpeta `apps/app-*`. Los cambios a `scripts/`, `database/`, el manifiesto/lock raíz o los contratos IAM requieren coordinación con el trabajo principal. No editar otras apps para implementar una función local.

Comprobar los cambios de UI con la compilación de su app. Para cambios a seguridad o integración usar también las pruebas correspondientes; no borrar ni reiniciar bases con datos existentes para probar.
