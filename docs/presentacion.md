# Presentación: Seguridad Transversal

Guía para exponer el proyecto en 12–15 minutos. Cada sección es una lámina: **qué decir** y **qué mostrar**. El paso a paso detallado de la demo está en [demostracion.md](demostracion.md); aquí está el relato.

| Bloque                                  | Tiempo | Peso        |
| --------------------------------------- | ------ | ----------- |
| 1. El problema y la idea                | 1 min  |             |
| 2. Arquitectura en una lámina           | 2 min  |             |
| 3. Autenticación y doble factor         | 4 min  | **Central** |
| 4. Roles que muestran o bloquean vistas | 5 min  | **Central** |
| 5. Sesiones y trazabilidad              | 2 min  |             |
| 6. Cierre                               | 1 min  |             |

## Antes de empezar

```powershell
pnpm run dev
```

- Portal en http://localhost:4000 con la sesión de administrador ya iniciada (credenciales en `.local/admin-inicial.txt`).
- Dos ventanas de CRM (http://localhost:5001), una normal y una de incógnito: en una entra «operador» y en la otra «supervisor» (`.local/usuarios-demo.txt`). Así se comparan dos roles lado a lado. Para un tercer rol, `rosa.diaz@zentra.com` entra como Analista (solo Reportes) y `sofia.quispe@zentra.com` muestra la elección de rol al ingresar.
- El autenticador del teléfono a la mano. Si las cuentas demo no existen: `pnpm run demo:users`. Para llenar las grillas: `pnpm run demo:data`.
- Usar siempre `localhost`, no `127.0.0.1`, para no mezclar cookies.

---

## 1. El problema y la idea

**Qué decir**

> Una empresa tiene varias aplicaciones hechas por equipos distintos, en tecnologías distintas. Si cada una implementa su propio login, sus contraseñas y sus permisos, hay tantas políticas de seguridad como aplicaciones, y basta que una sea débil.
>
> Nuestra propuesta: **una sola aplicación de seguridad** decide quién entra y qué puede ver. Las demás no guardan contraseñas ni roles; preguntan.

**Qué mostrar:** las tres apps abiertas en pestañas. Se ven distintas a propósito (CRM claro, Almacén oscuro, Facturación tipo documento) y hasta su pantalla de acceso cambia de disposición. Lo único que comparten es quién decide el acceso.

## 2. Arquitectura en una lámina

**Qué decir**

- Cuatro aplicaciones, cuatro bases de datos, tres lenguajes de backend: Seguridad (Node), CRM (Python), Almacén (Java) y Facturación (Node).
- Las apps de negocio **no acceden a la base de seguridad**. Hablan con ella por HTTP, de servidor a servidor, con una credencial propia de cada aplicación.
- El navegador nunca ve esa credencial ni el token de sesión: solo recibe una cookie `HttpOnly`.
- Si la aplicación de seguridad no responde, la app de negocio **deniega**. No existe un «login local de respaldo» que salte el doble factor.

**Qué mostrar:** el diagrama de [arquitectura.md](arquitectura.md).

```text
Navegador ──cookie──> Backend de la app ──HTTP + credencial──> Seguridad Transversal
                           │                                         │
                      su propia base                        usuarios, roles, permisos
```

---

## 3. Autenticación y doble factor (bloque central)

**Idea a transmitir:** la contraseña sola no da acceso. Y nada de esto vive en las apps de negocio.

### Qué decir

1. **Contraseña.** Se guarda con Argon2id; nunca en claro ni con un hash rápido. El mensaje de error no revela si la cuenta existe.
2. **Segundo factor (TOTP).** Código de 6 dígitos que cambia cada 30 segundos, generado por Google Authenticator, Microsoft Authenticator o cualquier app compatible. El secreto se guarda cifrado (AES-256-GCM) con una clave que no está en la base de datos.
3. **Primer ingreso.** El usuario escanea un QR, confirma un código y recibe 8 códigos de recuperación de un solo uso. Hasta confirmar, no tiene acceso.
4. **Protecciones del flujo:**
   - El desafío entre contraseña y código vence a los 5 minutos y se bloquea tras 5 intentos fallidos.
   - Un código ya aceptado no se puede reutilizar, aunque siga dentro de sus 30 segundos.
   - Hay límite de intentos por cuenta y por origen.
5. **Política por usuario.** El administrador decide, usuario por usuario, si se exige doble factor. Cambiarlo cierra las sesiones de ese usuario y queda en auditoría. El navegador no puede cambiar esa política.

### Qué mostrar

| Paso | Acción                                                         | Qué se demuestra                                   |
| ---- | -------------------------------------------------------------- | -------------------------------------------------- |
| 1    | Entrar a CRM con correo y contraseña                           | La contraseña no basta: pide el código             |
| 2    | Escribir un código incorrecto                                  | Se rechaza y cuenta como intento                   |
| 3    | Escribir el código del autenticador                            | Recién ahora hay sesión                            |
| 4    | Cerrar sesión, entrar a Almacén e intentar **el mismo código** | Un código usado no vuelve a servir                 |
| 5    | Portal → Usuarios → Editar → desactivar «Exigir doble factor»  | La sesión abierta del usuario se cierra sola       |
| 6    | Volver a entrar: ya no pide código. Reactivar la opción        | La política es central y se aplica a las tres apps |

**Frase de cierre del bloque**

> El doble factor no lo programó ni el equipo de CRM, ni el de Almacén, ni el de Facturación. Lo heredaron.

---

## 4. Roles que muestran o bloquean vistas (bloque central)

**Idea a transmitir:** el rol decide qué pantallas ve el usuario en cada aplicación, y el bloqueo es real: ocurre en el servidor.

### Qué decir

Un usuario entra a cada aplicación con **un rol activo**, que la cabecera de la app muestra. Ese rol define su menú:

| Nivel               | Ejemplo en CRM                    | Si el rol no lo tiene                                            |
| ------------------- | --------------------------------- | ---------------------------------------------------------------- |
| **Familia de menú** | Grupo «Gestión»                   | El grupo no aparece                                              |
| **Pantalla**        | Clientes, Oportunidades, Reportes | No está en el menú, la URL directa da 403 y sus datos no se leen |

Tres puntos que conviene decir en voz alta:

- **Las apps no deciden su menú.** Lo piden a la aplicación de seguridad al cargar y lo dibujan tal cual llega.
- **Ocultar una opción no es seguridad.** El navegador lo controla el usuario. Por eso, al abrir una pantalla, el backend vuelve a preguntar a la aplicación de seguridad; si el permiso falta responde 403 y no consulta su base de datos.
- **Los cambios son inmediatos.** No hay que cerrar sesión: el permiso se consulta en cada petición.

### Qué mostrar

**a) Dos roles, la misma aplicación.** Las dos ventanas de CRM lado a lado. La cabecera indica el rol de cada una.

| Ventana                    | Menú                               |
| -------------------------- | ---------------------------------- |
| operador (Usuario normal)  | Solo Clientes                      |
| supervisor (Administrador) | Clientes, Oportunidades y Reportes |

**b) La matriz.** Portal → **Matriz de permisos** → CRM. Es la lámina que resume el proyecto: roles en columnas, familias y pantallas en filas.

**c) Cambiar un permiso en vivo.** Portal → Roles y permisos → Editar «Usuario normal». Marcar «Reportes comerciales». Guardar. Volver a la ventana del operador: aparece la opción en el menú, **sin que cierre sesión**. Abrirla: la grilla muestra los datos.

**d) El bloqueo es del servidor.** Dos pruebas rápidas:

1. Quitar de nuevo «Reportes comerciales» y, con el operador, escribir a mano `http://localhost:5001/reportes`. Resultado: «Acceso no disponible». Conocer la dirección no alcanza.
2. Con una pestaña antigua donde la opción siga visible, pulsarla. El servidor la rechaza igual: el menú viejo no concede permiso.

**e) Tres tecnologías, la misma regla.** Abrir Almacén (Java) y Facturación (Node) con el mismo usuario: mismo comportamiento, otro diseño, otro lenguaje.

**Frase de cierre del bloque**

> El administrador marca una casilla en un solo lugar, y tres aplicaciones escritas en tres lenguajes obedecen en la siguiente petición.

---

## 5. Sesiones y trazabilidad

**Qué decir**

- La duración de la sesión es **por rol** (por ejemplo 5 horas para un administrador, 1 hora para un usuario). Es un máximo absoluto: navegar no la renueva.
- El administrador puede cerrar la sesión de cualquier usuario al instante. Desactivar un usuario, un rol o una aplicación también corta el acceso en la siguiente petición.
- Todo queda registrado, en tres niveles:
  - **Auditoría:** ingresos, fallos de doble factor, cierres y revocaciones.
  - **Historial de cambios:** qué cambió en usuarios, roles y menús, con el valor anterior y el nuevo, y quién lo hizo.
  - **Accesos a pantallas:** cada pantalla que alguien abrió, o intentó abrir, en cualquiera de las tres aplicaciones.
- La aplicación puede escribir en esos registros, pero no modificarlos ni borrarlos: ni siquiera un error del sistema puede reescribir la historia.

**Qué mostrar:**

1. Portal → **Sesiones**: revocar la del operador.
2. Portal → **Historial de cambios**: el permiso que se cambió en vivo en el bloque 4 aparece con «+ Reportes comerciales» y luego «− Reportes comerciales». En Roles, «Ver historial» muestra lo mismo para un solo rol.
3. Portal → **Accesos a pantallas**, filtrando por «Denegados»: la URL directa que se intentó en el bloque 4.

**Frase de cierre del bloque**

> No solo sabemos quién entró: sabemos qué vio, qué intentó ver y quién cambió sus permisos.

## 6. Cierre

**Qué decir**

> Tres ideas para llevarse:
>
> 1. **La seguridad se construye una vez.** Contraseñas, doble factor y sesiones están en un solo lugar; las aplicaciones de negocio las heredan.
> 2. **El rol gobierna la navegación:** familias de menú y pantallas, administradas desde un panel y aplicadas al instante en tres aplicaciones.
> 3. **El bloqueo es real.** No basta con esconder una opción: el servidor niega la pantalla y lo deja registrado.

**Alcance honesto, por si preguntan**

- El permiso es por pantalla. No se controlan botones ni columnas sueltas, ni reglas por registro («solo mis clientes»); eso se añadiría en cada aplicación.
- No hay inicio único entre apps: cada una abre su propia sesión con la misma identidad.
- Las apps de negocio son demostraciones sencillas: grillas de solo lectura sobre una tabla genérica de registros; el objetivo es mostrar la seguridad, no el negocio.
- Corre en local por HTTP. Publicarlo requiere HTTPS y configuración de despliegue.

## Preguntas frecuentes

| Pregunta                                          | Respuesta corta                                                                                                                                                   |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ¿Y si alguien llama directamente a la API de CRM? | Necesita una sesión válida y el permiso de esa pantalla. Sin ellos recibe 401 o 403 antes de cualquier consulta a la base.                                        |
| ¿Qué pasa si se cae la aplicación de seguridad?   | Las apps deniegan el acceso. Se prefiere no entrar a entrar sin verificar.                                                                                        |
| ¿Por qué no JWT?                                  | Las sesiones se guardan en el servidor (solo su hash). Así se pueden revocar al instante, que es justo lo que se muestra en la demo.                              |
| ¿Un administrador de CRM administra la seguridad? | No. El rol de administrador del portal es otro, reservado, y no se obtiene desde una app de negocio.                                                              |
| ¿Si pierdo el teléfono?                           | Se usan los códigos de recuperación. Si tampoco se tienen, el administrador restablece el doble factor tras verificar la identidad.                               |
| ¿Cuesta integrar una aplicación nueva?            | Registrarla en el portal, guardar su credencial y hacer que su backend consulte el permiso antes de entregar cada pantalla. Ver [integracion.md](integracion.md). |
| ¿Cómo se comprueba que funciona?                  | `pnpm test` (31 pruebas de seguridad), `pnpm run test:integration` y `pnpm run test:browser`, que recorre todo lo mostrado.                                       |
