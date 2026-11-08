# Propuesta técnica: Aplicación de Seguridad Transversal

> Estado de implementación actualizado: el proyecto está organizado en cuatro apps independientes con `frontend`, `backend` y `database`. Las bases son `seguridad_transversal`, `crm_app`, `almacen_app` y `facturacion_app`. La arquitectura y las instrucciones vigentes se encuentran en [README](README.md), [docs/arquitectura.md](docs/arquitectura.md) y los README/AGENTS de cada carpeta `apps/app-*`. Las secciones siguientes conservan el diseño funcional de seguridad; la estructura inicial de carpetas quedó sustituida por esta separación.

## 1. Objetivo y alcance

Construir una aplicación central de seguridad, ligera, legible y fácil de demostrar. Su función principal es administrar usuarios, aplicaciones, roles, menús, duración de sesiones y autenticación de doble factor (MFA).

CRM, Almacén y Facturación serán clientes de demostración: pocas pantallas con datos ficticios para comprobar que cada usuario ve y utiliza las opciones autorizadas para su rol. No se desarrollarán sus procesos completos de negocio.

El nombre de la empresa queda pendiente y será configurable. Esto no impide iniciar el desarrollo.

### Funciones fundamentales

- Administrar usuarios y habilitarlos en una o varias aplicaciones.
- Registrar aplicaciones y sus credenciales de integración.
- Crear, modificar y desactivar roles por aplicación.
- Crear, modificar, ordenar y desactivar menús, y asignarlos a roles.
- Configurar la duración máxima de sesión de cada rol.
- Exigir contraseña y permitir que el administrador configure por usuario si también se requiere un código TOTP.
- Mostrar menús diferentes según usuario, aplicación y rol activo.
- Denegar también en el backend el acceso a pantallas no autorizadas.
- Cerrar sesiones por vencimiento, cierre manual o revocación administrativa.
- Consultar una bitácora sencilla de accesos y cambios administrativos.

## 2. Arquitectura mínima

```text
                 APLICACIÓN TRANSVERSAL — :4000
                 Panel React + API Node.js/Express
                 PostgreSQL (solo accede el Core)
                              |
                HTTP/JSON entre servidores
                 /            |             \
        CRM — :5001     Almacén — :5002    Facturación — :5003
        Python/FastAPI Java/JDK HTTP      Node.js/Express
        Demo de menús  Demo de menús      Demo de menús
```

- Una API central y PostgreSQL; sin microservicios, Redis ni colas.
- El panel administrativo se sirve desde el Core; en desarrollo puede usar el proxy de React para mantener las peticiones en el mismo origen.
- Cada cliente tiene un backend pequeño que consulta al Core. Ningún cliente accede a las tablas de seguridad.
- El navegador se comunica con el backend de su aplicación. Las claves de integración nunca se incluyen en JavaScript ni se entregan al navegador.
- Se usan sesiones opacas almacenadas en PostgreSQL, sin JWT ni refresh tokens: facilitan vencimiento y revocación directa.
- Cada petición protegida del cliente consulta al Core para validar sesión y permiso. Si el Core no responde, se deniega la operación y se informa la indisponibilidad.
- HTTP se limita a localhost para la demostración. Un despliegue fuera de ese entorno requiere HTTPS.

## 3. Panel administrativo

| Sección | Operaciones principales |
| --- | --- |
| Usuarios | Crear, editar, activar/desactivar, asignar aplicaciones y roles, revocar sesiones y gestionar recuperación de MFA |
| Aplicaciones | Crear, editar, activar/desactivar y rotar credenciales |
| Roles | Crear, editar, activar/desactivar, asignar menús y configurar duración de sesión |
| Menús | Crear, editar, ordenar, agrupar y activar/desactivar por aplicación |
| Sesiones | Consultar sesiones vigentes, rol activo y vencimiento; revocar sesiones |
| Auditoría | Filtrar eventos por fecha, usuario, aplicación y resultado |

El panel exige contraseña y aplica la política de MFA del usuario, activada por defecto. Se registra como aplicación interna con un rol reservado de administrador del sistema. Un rol llamado «Administrador» en CRM no concede acceso administrativo al Core.

La autorización administrativa utiliza el identificador protegido del rol interno, no su nombre visible. No se permite quitar acceso al último administrador habilitado. Las operaciones sensibles de recuperación requieren reautenticación reciente y verificación de identidad documentada.

No habrá registro público: el administrador crea los usuarios. Un comando de inicialización permite crear el primer administrador con contraseña propia y enrolamiento MFA pendiente; no se distribuyen credenciales fijas.

## 4. Roles, menús y permisos

### Roles

- Cada rol pertenece a una sola aplicación.
- Un usuario puede tener varios roles, dentro de aplicaciones donde esté habilitado.
- Cada sesión tiene un único rol activo. Si solo hay uno se selecciona automáticamente; si hay varios, el usuario elige después de completar la autenticación configurada.
- Para cambiar de rol en esta versión se cierra sesión y se vuelve a ingresar, evitando mezclar permisos y tiempos.
- Se usa desactivación lógica para conservar referencias y auditoría.

### Menús

- Dos niveles: grupos y opciones hijas, suficientes para la exposición.
- Cada opción tiene nombre, icono opcional, orden, estado y código estable único por aplicación, por ejemplo `crm.clientes`.
- Los grupos no tienen ruta; las opciones apuntan a rutas locales existentes. Se rechazan URLs externas, esquemas ejecutables y relaciones entre aplicaciones distintas.
- El administrador asigna opciones a roles con una lista de selección. Los grupos aparecen solo si contienen opciones autorizadas.
- Cambiar nombre, orden o icono no modifica el código de autorización.
- Cada backend asocia sus pantallas y endpoints protegidos con el código de opción correspondiente y consulta al Core para validar el acceso.
- El permiso habilita la pantalla y la lectura de sus datos ficticios. No se agrega una matriz de operaciones de negocio que no se desarrollarán.
- El renderizado crea elementos DOM y usa `textContent`; no interpola nombres o rutas sin validar en `innerHTML`.

**Agregar un menú no crea una pantalla nueva.** La pantalla debe existir en el cliente. Las demos tendrán pocas rutas disponibles documentadas para la exposición; el panel administra su navegación y permisos.

## 5. Sesiones configurables por rol

El formulario de rol incluye `DuracionSesionMinutos`, un entero entre 1 y 1440 minutos como límite inicial del MVP.

| Rol de ejemplo | Duración configurada |
| --- | --- |
| Administrador | 300 minutos (5 horas) |
| Usuario normal | 60 minutos (1 hora) |
| Rol temporal de exposición | 1 minuto |

- El tiempo empieza al completar la autenticación configurada y activar el rol. Es duración máxima absoluta, no tiempo de inactividad.
- Navegar o recargar no extiende la sesión. Al vencer se exige otra vez contraseña y, si corresponde, MFA.
- El Core calcula y guarda `ExpiraEn`; decide usando el reloj del servidor.
- El panel transversal permite consultar el rol y el vencimiento. Las demos mantienen una interfaz mínima sin datos de sesión; el vencimiento se comprueba en el backend y cierra el acceso al cumplirse.
- Modificar la duración de un rol revoca sus sesiones activas. El siguiente ingreso toma el nuevo valor; el panel avisa este efecto antes de guardar.
- Desactivar usuario, aplicación o rol, retirar una habilitación/asignación o cambiar la contraseña revoca las sesiones afectadas.
- Cambiar los menús asignados se respeta en la siguiente petición protegida. El menú se consulta de nuevo al cargar la navegación; una opción que siga visible no concede acceso si su permiso fue retirado.
- Cerrar sesión revoca el registro central y elimina la cookie local.

Las cookies son `HttpOnly`, `SameSite=Lax` y `Secure` bajo HTTPS. Las operaciones que modifican estado tienen protección CSRF. Cada aplicación usa un nombre de cookie distinto para evitar colisiones en localhost; los puertos por sí solos no aíslan cookies. Una sesión solo es válida para su aplicación.

## 6. Contraseñas y MFA

### Contraseñas

- **Argon2id**, con salt aleatorio generado por la biblioteca y almacenamiento de la cadena completa del hash.
- Mínimo inicial: memoria de 19456 KiB (19 MiB), 2 iteraciones y paralelismo 1; ajustar después de medir en el entorno de ejecución.
- Validación de entradas y límites de intentos de contraseña/MFA por cuenta y origen. Los contadores críticos de desafíos persisten en PostgreSQL.
- Los errores de credenciales no revelan si una cuenta existe.
- Nunca registrar contraseñas, tokens, códigos OTP ni secretos MFA.

### MFA mediante TOTP configurable por usuario

Usar una aplicación autenticadora compatible con TOTP. SMS, WhatsApp y códigos por correo quedan fuera de esta versión.

El campo `mfa_required` se administra en Usuarios mediante «Exigir doble factor». Está activado por defecto, aplica a todas las aplicaciones de la cuenta y es independiente de que el autenticador ya esté enrolado (`mfa_enabled`). Desactivarlo permite entrar con contraseña y elegir rol, sin código ni QR. Cambiarlo revoca sesiones/desafíos y se audita; conserva el autenticador para una reactivación posterior. El navegador no puede decidir esta política.

Cuando la política exige MFA, el flujo es:

1. El usuario envía correo y contraseña.
2. El Core comprueba aplicación, cuenta y habilitaciones y crea un desafío temporal de hasta 5 minutos.
3. Si falta enrolar MFA, muestra un QR dentro del flujo restringido de configuración. No concede acceso normal hasta confirmar un código válido.
4. Si ya está enrolado, solicita el código del autenticador.
5. La verificación consume el desafío y, si hay varios roles, entrega una prueba distinta, breve y de un solo uso para elegir rol. Con un solo rol crea directamente la sesión.
6. El Core comprueba nuevamente la asignación y la aplicación y crea la sesión con su vencimiento.

Cuando se exige MFA, la prueba de contraseña no basta para seleccionar rol ni crear sesión. Las sesiones y pruebas de selección registran si completaron el segundo factor; no se aceptan pruebas de solo contraseña bajo una política que exige MFA. Se impide reutilizar un TOTP aceptado en su intervalo y los consumos se realizan de forma atómica.

El secreto TOTP se cifra con una clave del servidor separada de la base de datos. Un usuario con MFA exigido y sin enrolamiento queda pendiente de configurarlo, sin acceso normal. Esa situación es distinta de una política administrativamente configurada para no exigir MFA.

Se entregan códigos de recuperación de un solo uso al completar el enrolamiento y se almacenan como hashes. El administrador puede iniciar un restablecimiento de MFA tras verificar la identidad mediante un procedimiento documentado; se audita, se revocan sesiones y el próximo acceso exige nuevo enrolamiento si la política requiere MFA. Ningún endpoint permite consultar el secreto existente.

## 7. Modelo de datos propuesto

Guía para las migraciones, manteniendo las siguientes responsabilidades y reglas:

| Entidad | Responsabilidad y datos principales |
| --- | --- |
| Aplicacion | Identificador estable, nombre, descripción, plataforma, hash de credencial de integración y estado |
| Usuario | Correo normalizado único, nombres, apellidos, hash Argon2id, estado, política `mfa_required`, secreto TOTP cifrado, estado de enrolamiento y último intervalo TOTP consumido |
| UsuarioAplicacion | Habilitación de un usuario en una aplicación |
| Rol | Aplicación, nombre, descripción, duración de sesión en minutos y estado |
| UsuarioRol | Asignación de rol a un usuario habilitado en esa aplicación |
| Menu | Aplicación, código de opción, nombre, ruta local, icono, padre, orden y estado |
| RolMenu | Opciones autorizadas para un rol de la misma aplicación |
| DesafioAutenticacion | Hash del token aleatorio, usuario, aplicación, propósito/etapa, segundo factor verificado, vencimiento, intentos y consumo |
| Sesion | Hash del token aleatorio, usuario, aplicación, rol activo, segundo factor verificado, inicio, vencimiento y revocación |
| CodigoRecuperacion | Usuario, hash del código y consumo |
| EventoAuditoria | Fecha, usuario/aplicación si se conocen, tipo, resultado, IP observada y detalle mínimo sin secretos |

Documento y celular pueden ser opcionales: no son necesarios para demostrar el control de acceso.

### Integridad y persistencia

- Usar `TIMESTAMPTZ` y mostrar horarios en la zona configurada.
- Añadir claves foráneas, campos obligatorios, unicidad por aplicación, límites de duración e índices para sesiones, correo y auditoría.
- Impedir relaciones de roles, usuarios y menús entre aplicaciones distintas mediante restricciones compuestas y validaciones transaccionales.
- Impedir ciclos, grupos visibles sin hijos autorizados y más de dos niveles en menús.
- Guardar solo hashes de tokens de sesión y desafíos. Las credenciales de integración se generan con alta entropía, se muestran solo al crearlas/rotarlas y nunca se guardan en claro.
- Usar consultas parametrizadas y transacciones para consumir desafíos, crear sesiones y aplicar cambios de permisos.

## 8. Contratos API mínimos

Prefijo `/api/v1`. Los clientes llaman al Core desde su backend con `X-App-Id` y `X-App-Key`. La sesión viaja como `Authorization: Bearer <token-opaco>` entre servidores; el navegador la presenta a su backend mediante cookie.

| Grupo | Endpoints orientativos | Requisito |
| --- | --- | --- |
| Configuración | `GET /public/config` | Solo campos públicos permitidos, como nombre visible |
| Contraseña | `POST /auth/login-step1` | Aplicación autenticada; desafío si se exige MFA, o sesión/selección de rol si no se exige |
| Enrolamiento MFA | `POST /auth/mfa/enroll`, `POST /auth/mfa/confirm` | Desafío vigente limitado a enrolamiento |
| Validación MFA | `POST /auth/login-step2` | Desafío y TOTP/recuperación; devuelve sesión si hay un rol, o prueba para elegir entre varios |
| Selección de rol | `POST /auth/select-role` | Prueba posterior a la autenticación configurada; la consume y devuelve sesión, rol y vencimiento |
| Sesión | `POST /auth/introspect`, `POST /auth/logout` | Aplicación y sesión coincidentes; introspección valida estado, rol y opción solicitada |
| Navegación | `GET /navigation/menus` | Sesión vigente; devuelve árbol filtrado por rol activo |
| Usuarios | `GET/POST /admin/users`, `PATCH /admin/users/:id` | Administrador interno con sesión vigente y autenticación según su política |
| Asignaciones | `PUT /admin/users/:id/applications`, `PUT /admin/users/:id/roles` | Administrador interno; valida coherencia y revoca sesiones afectadas |
| Aplicaciones | `GET/POST /admin/applications`, `PATCH /admin/applications/:id`, `POST /admin/applications/:id/rotate-key` | Administrador interno; rotación invalida la credencial anterior |
| Roles | `GET/POST /admin/roles`, `PATCH /admin/roles/:id`, `PUT /admin/roles/:id/menus` | Administrador interno; incluye duración en minutos |
| Menús | `GET/POST /admin/menus`, `PATCH /admin/menus/:id` | Administrador interno; padre, orden, ruta y estado |
| Sesiones administrativas | `GET /admin/sessions`, `POST /admin/sessions/:id/revoke` | Administrador interno |
| Recuperación | `POST /admin/users/:id/reset-mfa`, `POST /admin/users/:id/reset-password` | Administrador interno con reautenticación reciente, procedimiento de identidad y auditoría |
| Auditoría | `GET /admin/audit` | Administrador interno; filtros y paginación |

La desactivación se realiza mediante `PATCH`, sin borrado físico. Las listas incluyen filtros y paginación. Los esquemas de entrada/salida y errores se documentarán al implementar cada módulo.

Respuestas comunes: `400` datos inválidos, `401` autenticación inválida/vencida, `403` falta de permisos, `409` conflictos y `429` exceso de intentos. El primer paso de autenticación no revela qué comprobación de credenciales falló.

## 9. Nombre y configuración de la empresa

```dotenv
COMPANY_NAME="Empresa por definir"
APP_DISPLAY_NAME="Portal de Seguridad"
ALLOWED_EMAIL_DOMAINS="empresa.test"
DISPLAY_TIME_ZONE="America/Lima"
PORT=4000
DATABASE_URL="postgresql://usuario:clave@localhost:5432/seguridad"
TOTP_ISSUER_ID="seguridad-transversal"
# Generar una clave aleatoria propia; no usar este texto como clave real.
MFA_ENCRYPTION_KEY="GENERAR_EN_LA_INSTALACION"
```

- Cambiar la marca no cambia identificadores, permisos ni cuentas existentes.
- Los dominios permitidos son una lista explícita configurable. Se valida el dominio completo del correo normalizado; no se depende de bloquear proveedores públicos conocidos.
- Cambiar dominios afecta nuevas altas y cambios de correo, sin desactivar automáticamente cuentas existentes. El administrador gestiona esas cuentas explícitamente.
- La duración de sesión se guarda en el rol y se edita desde el panel, no desde `.env`.
- El frontend recibe solo campos públicos permitidos mediante configuración del Core, nunca el entorno completo.
- `TOTP_ISSUER_ID` permanece estable al cambiar el nombre comercial para no depender de renombrar entradas ya enroladas en autenticadores.
- Entregar `.env.example` sin secretos y excluir `.env` del repositorio. Cambiar el entorno requiere reiniciar; la marca se refleja al recargar el panel.

## 10. Auditoría sencilla

Registrar accesos exitosos/fallidos, errores de MFA, selección de rol, cierres/revocaciones, denegaciones y cambios administrativos. No se promete registrar cada clic ni cada lectura de datos ficticios.

Los eventos de autenticación y administración nacen en el Core. Las comprobaciones recibidas de clientes identifican aplicación mediante credenciales y usuario mediante sesión; no aceptan identidades arbitrarias del navegador.

La primera edición registra la IP de conexión al Core; en solicitudes de las demos será la del backend cliente. No se acepta una IP arbitraria enviada por el navegador. La propagación de la IP original del visitante mediante proxies/backend de confianza se deja para un despliegue compartido.

El usuario de base de datos de la aplicación puede insertar/consultar eventos, pero no modificarlos ni borrarlos. Las migraciones usan otro usuario. Es una bitácora de solo anexado para la aplicación, sin afirmar inmutabilidad frente al administrador de la base de datos.

El panel tiene tabla paginada, filtros y contadores básicos. Basta recargar o actualizar periódicamente; no se necesitan WebSockets ni analítica avanzada.

## 11. Organización del repositorio

```text
ProyectoST/
├── core-seguridad-iam/
│   ├── src/
│   │   ├── config/
│   │   ├── routes/
│   │   ├── controllers/
│   │   ├── services/
│   │   ├── middlewares/
│   │   └── server.js
│   ├── database/
│   │   ├── migrations/
│   │   └── seeds/
│   ├── tests/
│   └── dashboard-frontend/
├── cliente-crm-python/
├── cliente-almacen-java/
├── cliente-facturacion-node/
├── docs/
│   └── demostracion.md
├── .env.example
├── .gitignore
├── docker-compose.yml
└── README.md
```

Funciones pequeñas, responsabilidades claras, validaciones explícitas y mensajes comprensibles. No se agregan capas o patrones sin una necesidad concreta.

## 12. Implementación por etapas

| Etapa | Entrega | Criterio para continuar |
| --- | --- | --- |
| 1. Base | Estructura, PostgreSQL, migraciones, configuración y primer administrador | Instalación reproducible sin secretos fijos |
| 2. Autenticación | Argon2id, política MFA por usuario, TOTP, recuperación, sesiones y selección de rol | MFA se exige según política; vencimiento y revocación correctos |
| 3. Administración | Panel de usuarios, aplicaciones, roles, menús y tiempos | Asignaciones editables desde la interfaz y límites por aplicación |
| 4. Primera demo | CRM con pocas pantallas y menús dinámicos | Menús distintos por rol y denegación de URLs no autorizadas |
| 5. Otras demos | Almacén y Facturación con el mismo contrato | Desacoplamiento demostrado entre Node, Python y Java |
| 6. Exposición | Bitácora, datos ficticios, Docker Compose, README y guion | Demostración reproducible desde instalación limpia |

Cada etapa incluye comprobaciones de comportamiento. No se fijan fechas sin validar primero el entorno y el ritmo de desarrollo.

## 13. Guion de demostración y aceptación

1. Crear un usuario desde el panel y habilitarlo para CRM.
2. Crear dos roles con distintos menús y duraciones de 300 y 60 minutos.
3. Ingresar con contraseña y mostrar que todavía no hay acceso normal.
4. Enrolar/validar el autenticador, elegir rol y consultar el rol y vencimiento desde Sesiones en el panel transversal.
5. Comparar menús de dos usuarios/roles y abrir sus pantallas autorizadas.
6. Copiar una URL de una pantalla no asignada y comprobar la denegación del backend.
7. Editar una asignación de menú y comprobar que la siguiente petición protegida respeta el cambio.
8. Configurar un rol de prueba de 1 minuto e iniciar una sesión nueva para mostrar el vencimiento real sin esperar una hora.
9. Desactivar al usuario y comprobar que la siguiente petición queda denegada en sus sesiones abiertas.
10. Comparar menús en las otras tecnologías y verificar que una sesión de CRM no sirve para Almacén.
11. Con MFA exigido, rechazar códigos incorrectos, vencidos o reutilizados y la selección de rol sin segundo factor previo. Desactivar la exigencia desde Usuarios y demostrar el acceso con contraseña; volver a activarla y comprobar que se revocan los accesos anteriores.
12. Consultar los eventos en la bitácora. Cambiar el nombre de empresa, reiniciar y recargar para verificar la marca.

Las pruebas automatizadas se concentran en MFA sin atajos, consumo único, aislamiento por aplicación, validación de roles/permisos, vencimiento según el servidor y revocación. Se complementan con el guion manual.

## 14. Fuera del alcance inicial

- Procesos reales de CRM, inventario o facturación y sus bases de datos de negocio.
- SSO, OAuth/OIDC, proveedores externos y múltiples empresas independientes.
- Permisos por campo/registro, herencia compleja de roles y generación automática de pantallas.
- SMS, WhatsApp, correo transaccional y múltiples proveedores de MFA.
- Sesiones renovables, tiempo de inactividad independiente y cambio de rol dentro de la sesión.
- Analítica avanzada, WebSockets, auditoría de cada clic y despliegue distribuido.

## 15. Referencias de seguridad

- [OWASP: almacenamiento de contraseñas y Argon2id](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
- [OWASP: MFA y recuperación](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html).
- [OWASP: autorización en cada petición](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html).
- [OWASP: gestión de sesiones](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).
