# Presentación: Seguridad Transversal

Guía para exponer el proyecto en 12–15 minutos. Cada sección es una lámina: **qué decir** y **qué mostrar**. El paso a paso detallado de la demo está en [demostracion.md](demostracion.md); aquí está el relato.

| Bloque                                    | Tiempo | Peso        |
| ----------------------------------------- | ------ | ----------- |
| 1. El problema y la idea                  | 1 min  |             |
| 2. Arquitectura en una lámina             | 2 min  |             |
| 3. Autenticación y doble factor           | 4 min  | **Central** |
| 4. Roles que muestran o bloquean vistas   | 5 min  | **Central** |
| 5. Sesiones y auditoría                   | 1 min  |             |
| 6. Cierre                                 | 1 min  |             |

## Antes de empezar

```powershell
pnpm run dev
```

- Portal en http://localhost:4000 con la sesión de administrador ya iniciada (credenciales en `.local/admin-inicial.txt`).
- Dos ventanas de CRM (http://localhost:5001), una normal y una de incógnito: en una entra «operador» y en la otra «supervisor» (`.local/usuarios-demo.txt`). Así se comparan dos roles lado a lado.
- El autenticador del teléfono a la mano. Si las cuentas demo no existen: `pnpm run demo:users`. Para llenar las grillas: `pnpm run demo:data`.
- Usar siempre `localhost`, no `127.0.0.1`, para no mezclar cookies.

---

## 1. El problema y la idea

**Qué decir**

> Una empresa tiene varias aplicaciones hechas por equipos distintos, en tecnologías distintas. Si cada una implementa su propio login, sus contraseñas y sus permisos, hay tantas políticas de seguridad como aplicaciones, y basta que una sea débil.
>
> Nuestra propuesta: **una sola aplicación de seguridad** decide quién entra y qué puede ver. Las demás no guardan contraseñas ni roles; preguntan.

**Qué mostrar:** las tres apps abiertas en pestañas. Se ven distintas a propósito (CRM claro, Almacén oscuro, Facturación tipo documento) y hasta su pantalla de acceso es diferente. Lo único que comparten es quién decide el acceso.

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

| Paso | Acción                                                                                      | Qué se demuestra                                   |
| ---- | ------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| 1    | Entrar a CRM con correo y contraseña                                                        | La contraseña no basta: pide el código             |
| 2    | Escribir un código incorrecto                                                               | Se rechaza y cuenta como intento                   |
| 3    | Escribir el código del autenticador                                                         | Recién ahora hay sesión                            |
| 4    | Cerrar sesión, entrar a Almacén e intentar **el mismo código**                              | Un código usado no vuelve a servir                 |
| 5    | Portal → Usuarios → Editar → desactivar «Exigir doble factor»                               | La sesión abierta del usuario se cierra sola       |
| 6    | Volver a entrar: ya no pide código. Reactivar la opción                                     | La política es central y se aplica a las tres apps |

**Frase de cierre del bloque**

> El doble factor no lo programó ni el equipo de CRM, ni el de Almacén, ni el de Facturación. Lo heredaron.

---

## 4. Roles que muestran o bloquean vistas (bloque central)

**Idea a transmitir:** el rol decide qué ve el usuario, a cuatro niveles, y el bloqueo es real: ocurre en el servidor.

### Qué decir

Un usuario entra a cada aplicación con **un rol activo**. Ese rol define:

| Nivel               | Ejemplo en CRM                        | Si el rol no lo tiene                          |
| ------------------- | ------------------------------------- | ---------------------------------------------- |
| **Familia de menú** | Grupo «Gestión»                       | El grupo no aparece                            |
| **Pantalla**        | Clientes, Oportunidades, Reportes     | No está en el menú y la URL directa da 403     |
| **Grilla**          | Listado de clientes                   | La pantalla abre, pero sin los datos           |
| **Botón**           | Nuevo, Editar, Eliminar, Exportar     | El botón no se dibuja y la operación da 403    |
| **Columna**         | «Límite de crédito»                   | El dato **no sale del servidor**               |

Dos puntos que conviene decir en voz alta:

- **Ocultar un botón no es seguridad.** El navegador lo controla el usuario. Por eso cada backend pregunta a la aplicación de seguridad antes de cada operación, y si el permiso falta responde 403 sin tocar su base de datos.
- **Los cambios son inmediatos.** No hay que cerrar sesión: el permiso se consulta en cada petición.

### Qué mostrar

**a) Dos roles, la misma pantalla.** Las dos ventanas de CRM en Clientes, lado a lado. La cabecera indica el rol de cada una.

| Ventana                    | Menú            | Botones                              | Columna «Límite de crédito» |
| -------------------------- | --------------- | ------------------------------------ | --------------------------- |
| operador (Usuario normal)  | Solo Clientes   | Nuevo                                | No                          |
| supervisor (Administrador) | Tres pantallas  | Nuevo, Editar, Eliminar, Exportar    | Sí                          |

**b) La matriz.** Portal → **Matriz de permisos** → CRM. Es la lámina que resume el proyecto: roles en columnas, pantallas y botones en filas.

**c) Cambiar un permiso en vivo.** Portal → Roles y permisos → Editar «Usuario normal». Marcar «Botón Exportar» y «Columna Límite de crédito». Guardar. Recargar la ventana del operador: aparecen el botón y la columna, **sin que cierre sesión**.

**d) El bloqueo es del servidor.** Dos pruebas rápidas:

1. Con el operador, escribir a mano `http://localhost:5001/reportes`. Resultado: «Acceso no disponible». Conocer la dirección no alcanza.
2. Dejar abierta la pantalla del operador con el botón Nuevo visible. Desde el portal, quitarle «Botón Nuevo». **Sin recargar**, pulsar Nuevo y Guardar. Resultado: el servidor lo rechaza y el botón desaparece.

**e) Quitar la grilla.** Desmarcar «Ver grilla»: la pantalla sigue en el menú, pero ya no entrega los datos.

**f) Tres tecnologías, la misma regla.** Abrir Almacén (Java) y Facturación (Node) con el mismo usuario: mismo comportamiento, otro diseño, otro lenguaje.

**Frase de cierre del bloque**

> El administrador marca una casilla en un solo lugar, y tres aplicaciones escritas en tres lenguajes obedecen en la siguiente petición.

---

## 5. Sesiones y auditoría

**Qué decir**

- La duración de la sesión es **por rol** (por ejemplo 5 horas para un administrador, 1 hora para un usuario). Es un máximo absoluto: navegar no la renueva.
- El administrador puede cerrar la sesión de cualquier usuario al instante. Desactivar un usuario, un rol o una aplicación también corta el acceso en la siguiente petición.
- Todo queda registrado: ingresos, fallos de doble factor, accesos denegados y cambios de permisos. La aplicación puede escribir en la bitácora, pero no modificarla ni borrarla.

**Qué mostrar:** Portal → **Sesiones** (revocar la del operador) y Portal → **Auditoría**, filtrando por «Denegados»: ahí están los intentos bloqueados durante la demo.

## 6. Cierre

**Qué decir**

> Tres ideas para llevarse:
>
> 1. **La seguridad se construye una vez.** Contraseñas, doble factor y sesiones están en un solo lugar; las aplicaciones de negocio las heredan.
> 2. **El rol gobierna la vista completa:** menús, pantallas, grillas, botones y columnas, administrados desde un panel y aplicados al instante.
> 3. **El bloqueo es real.** No se esconde un botón: el servidor niega la operación y lo deja registrado.

**Alcance honesto, por si preguntan**

- El permiso es por rol. No hay reglas por registro («solo mis clientes», «solo mi sucursal»); eso se añadiría en cada aplicación.
- No hay inicio único entre apps: cada una abre su propia sesión con la misma identidad.
- Las apps de negocio son demostraciones sencillas, con una tabla genérica de registros; el objetivo es mostrar la seguridad, no el negocio.
- Corre en local por HTTP. Publicarlo requiere HTTPS y configuración de despliegue.

## Preguntas frecuentes

| Pregunta                                                   | Respuesta corta                                                                                                                              |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| ¿Y si alguien llama directamente a la API de CRM?          | Necesita una sesión válida y el permiso exacto. Sin ellos recibe 401 o 403 antes de cualquier consulta a la base.                             |
| ¿Qué pasa si se cae la aplicación de seguridad?            | Las apps deniegan el acceso. Se prefiere no entrar a entrar sin verificar.                                                                    |
| ¿Por qué no JWT?                                           | Las sesiones se guardan en el servidor (solo su hash). Así se pueden revocar al instante, que es justo lo que se muestra en la demo.          |
| ¿Un administrador de CRM administra la seguridad?          | No. El rol de administrador del portal es otro, reservado, y no se obtiene desde una app de negocio.                                          |
| ¿Si pierdo el teléfono?                                    | Se usan los códigos de recuperación. Si tampoco se tienen, el administrador restablece el doble factor tras verificar la identidad.           |
| ¿Cuesta integrar una aplicación nueva?                     | Registrarla en el portal, guardar su credencial y hacer que su backend consulte el permiso antes de cada operación. Ver [integracion.md](integracion.md). |
| ¿Cómo se comprueba que funciona?                           | `pnpm test` (31 pruebas de seguridad), `pnpm run test:integration` y `pnpm run test:browser`, que recorre todo lo mostrado.                   |
