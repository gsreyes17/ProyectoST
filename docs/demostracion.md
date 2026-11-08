# Guion de exposición

## Preparación

1. Inicia PostgreSQL 17 y ejecuta `pnpm run dev` en la raíz del proyecto.
2. Abre el portal en `http://localhost:4000`.
3. Usa las credenciales de `.local/admin-inicial.txt`. El primer ingreso requiere enrolar el autenticador y guardar la recuperación.
4. Si quieres dos cuentas listas para comparar, ejecuta `pnpm run demo:users` y consulta `.local/usuarios-demo.txt`. Sus autenticadores se enrolan al primer ingreso.
5. Mantén el portal y los clientes en pestañas distintas, usando siempre `localhost` para evitar confundir cookies de `localhost` y `127.0.0.1`.

## Explicación inicial

«La aplicación transversal administra la seguridad. CRM, Almacén y Facturación tienen frontend, backend y bases propios y consultan al Core mediante HTTP. En esta edición sus páginas están vacías, pero cada acceso autorizado se registra en la base local de esa app, después de validar el permiso central».

## Recorrido principal

1. **Resumen:** mostrar las aplicaciones, roles, sesiones y actividad reciente.
2. **Roles y permisos:** comparar Administrador (300 minutos) y Usuario normal (60 minutos) en CRM. Mostrar que el primero tiene tres opciones y el segundo solo Clientes.
3. **Usuarios:** crear una cuenta con correo del dominio permitido y una contraseña de al menos 12 caracteres. Habilitar CRM y asignar un rol. También puede asignarse más de un rol para mostrar la selección posterior a MFA.
4. **MFA:** con «Exigir doble factor» activo en el usuario, abrir CRM en `http://localhost:5001`, ingresar, escanear el QR y confirmar el código. Mostrar que contraseña por sí sola no produce acceso normal cuando MFA está exigido. Guardar los códigos de recuperación.
5. **Menús:** mostrar solo las opciones del rol activo. Abrir Clientes y explicar que la página existe, aunque no tiene operaciones de negocio.
6. **URL directa:** con Usuario normal, escribir `http://localhost:5001/reportes`. El backend deniega el acceso aunque se conozca la dirección.
7. **Edición de permisos:** desde el panel, asignar Reportes al rol y guardar. Volver a la ventana de CRM o recargar para actualizar los menús y abrir la opción. Retirarla y volver a pedir la página para demostrar la denegación.
8. **Edición de menús:** cambiar un nombre o su orden y actualizar la navegación. Para crear opciones utiliza el catálogo de rutas de `docs/integracion.md`; crear una opción no genera una pantalla.
9. **Tiempo configurable:** crear un rol de prueba de 1 minuto, asignarlo y entrar con él. Consultar el vencimiento desde Sesiones en el portal y comprobar que, al cumplirse, la demo solicita ingresar nuevamente. Modificar la duración de un rol cierra sus sesiones actuales y el siguiente ingreso toma el nuevo valor.
10. **Bloqueo:** desactivar la cuenta desde el panel. La siguiente petición protegida del cliente es denegada y pide ingresar otra vez.
11. **Otras tecnologías:** repetir el acceso en Almacén (Java, puerto 5002) y Facturación (Node, puerto 5003). Cada aplicación tiene su propia sesión y sus propios roles.
12. **Auditoría:** filtrar por usuario/aplicación y resultado. Mostrar eventos de ingreso, MFA, cambios y accesos denegados.
13. **Cuatro bases:** ejecutar `pnpm run test:integration` o inspeccionar `integration_access` en `crm_app`, `almacen_app` y `facturacion_app`. Mostrar que IAM autoriza primero y cada backend utiliza su propio usuario/base SQL; un acceso denegado no inserta registros locales.

## Detalles que conviene explicar

- Las demos tienen un sidebar con título, menús y cierre de sesión, un header compacto y páginas vacías. La información administrativa de usuarios, roles, MFA y vencimientos se consulta en el portal transversal. Los grupos de menús son desplegables y el sidebar se puede contraer en escritorio.

- **Ingreso rápido:** en Usuarios, editar la cuenta y desactivar «Exigir doble factor». Sus sesiones se cierran; al volver a entrar a cualquiera de las tres demos solo se solicita contraseña y, si corresponde, rol. Reactivar la opción vuelve a pedir el segundo factor. El cambio queda registrado en auditoría.

- Un código TOTP aceptado no se puede reutilizar. Al entrar consecutivamente en varias demos, espera el siguiente código del autenticador o utiliza un código de recuperación distinto.
- Si hay varios roles se elige uno después de la contraseña y, cuando se exige, del MFA. Para cambiar de rol se cierra sesión y se ingresa de nuevo.
- El administrador del portal no obtiene acceso automático a las demos: necesita habilitación y rol en cada aplicación.
- El usuario no puede concederse permisos enviando un rol diferente desde el navegador.
- Una opción visible en una pestaña antigua no concede permiso después de retirarlo: el backend comprueba cada petición.
- Para repetir la exposición no hace falta reinstalar la base ni volver a crear los usuarios.
