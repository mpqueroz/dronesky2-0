# Blog y administración de la veterinaria

Sitio `dra-garces-veterinaria`, proyecto compartido `daniel-tapia-abogado`. La carpeta `veterinaria/` se publica con el flujo existente de Hosting. El panel es `/admin.html` y tiene acceso desde el pie de página. El enlace no otorga permisos: los verifica Firestore.

## Activación antes de publicar en producción

1. En Firebase Authentication, comprobar que está habilitado Correo electrónico/Contraseña. Crear la cuenta de la doctora (o usar una existente). La página no permite registrar cuentas. Copiar su UID. No guardar contraseñas en el repositorio.
2. En Firestore crear `vetAdministradores/{UID}` con el campo booleano `active: true`. Solo concederlo a administradores reales. Para revocar acceso, cambiarlo a `false`. El navegador no puede crear ni modificar permisos.
3. Revisar las reglas actuales. Insertar el **fragmento** `docs/veterinaria-firestore.rules` dentro del bloque `match /databases/{database}/documents`, conservando los permisos de otras aplicaciones. **No sustituir todas las reglas por este fragmento.** Las reglas coincidentes se combinan con OR: un permiso amplio `match /{document=**}` puede hacer públicos los mensajes o permitir escrituras. Corregir ese permiso antes de activar esta función. Probar el acceso público y sin rol.
4. Crear los tres índices compuestos de `docs/veterinaria-firestore.indexes.json` en la consola de Firestore. Colecciones (no grupos de colecciones), mismos campos y orden. Conservar índices existentes. También se pueden crear desde los enlaces que Firebase devuelve al fallar una consulta; los índices tardan en construirse.
5. Verificar que `/__/firebase/init.json` contiene una app web de este proyecto (configuración pública). El SDK 12.19.0 coincide con la dependencia Firebase existente del repositorio. Si no hay app web, registrarla en Configuración del proyecto. No requiere copiar claves secretas a HTML.
6. Autorizar los dominios `vetdeliagarces.cl`, `www.vetdeliagarces.cl` y el dominio del sitio Hosting en Authentication > Configuración > Dominios autorizados, si faltan. Para recuperación de contraseña, usar un dominio de producción autorizado.
7. Aceptar el cambio en `main`, esperar el despliegue y probar con la cuenta habilitada. No desplegar reglas globales ni cambiar reglas de Storage para este trabajo.

## Uso

- Noticias: título, texto y enlace HTTPS opcional de una imagen. Guardar borrador o publicar. Editar, retirar o eliminar desde el panel.
- Videos: pegar un enlace público de YouTube, Shorts o Instagram. Se muestra una vista previa y después un reproductor dentro del blog. La reproducción externa debe estar permitida por el propietario; Instagram puede pedir sesión o no permitir un contenido concreto. Se conserva un enlace para abrir el video en la plataforma. No hay subida de archivos ni se necesita Storage en esta versión.
- Preguntas: visitantes envían nombre y pregunta a `vetPreguntasPrivadas`. Nadie sin rol puede leer esta colección. El nombre nunca se copia al blog. La doctora puede descartar una pregunta o editar su versión pública y responder. Un lote atómico publica ambas en `vetRespuestas` y marca la privada como respondida. Si falla, no se publica parcialmente. Retirar una respuesta la borra del blog y devuelve su original a pendientes si existe.
- Publicaciones se guardan en `vetPublicaciones`. Solo las publicadas se consultan públicamente. Listas paginadas (6 públicas, 20 en el panel).
- Borrador de pregunta local en el dispositivo. Borrador de noticia en la sesión del administrador y por UID; se elimina al guardar o cerrar sesión. Las respuestas también tienen borrador por UID en la sesión; se recupera al abrir la misma pregunta y se elimina al publicar o cerrar sesión. No borrar datos de visitantes indiscriminadamente.

## Moderación y abuso

Los permisos protegen la privacidad y reservan la publicación al administrador. El honeypot y la espera de un minuto en el cliente son medidas básicas, **no un límite contra un atacante**. La creación de preguntas acepta visitantes sin cuenta y puede recibir spam privado. Antes de anunciarlo a gran escala, evaluar App Check y un endpoint con captcha y límites del servidor; activar App Check sin configurar el cliente bloquearía esta versión. No prometer protección antispam completa.

## Comprobación después de configurar Firebase

1. Visitante: ver noticias publicadas; no ver borradores ni mensajes pendientes. Enviar una pregunta, con nombre y mensaje de prueba; refrescar y confirmar que no aparece públicamente.
2. Cuenta sin rol: no puede leer pendientes, publicar ni escribir `vetAdministradores`.
3. Administrador: crear borrador, publicar y editar noticia, retirar y eliminar. Pegar YouTube y comprobar reproductor. Probar Instagram público con reproducción externa permitida.
4. Responder una pregunta eliminando datos personales en la versión pública. Confirmar que aparecen solo pregunta y respuesta y que desaparece de pendientes. Retirar y confirmar retorno a pendientes.
5. Cerrar sesión y probar acceso privado nuevamente. Probar teléfono de 390 px y modo oscuro.

Las reglas e índices requieren activación en el proyecto real; las pruebas locales de JavaScript y HTML no certifican los permisos desplegados.

## Pruebas locales

Ejecutar `node tools/veterinaria-check.cjs` y `node --check veterinaria/admin.js` (también `comunidad.js` y `datos.js`). Las pruebas usan DOM y SDK simulados para comprobar autorización de la interfaz, borradores, URLs, separación de datos, publicación en lote y cierre de sesión. No verifican reglas reales ni la reproducción externa. La revisión con navegador quedó pendiente porque el entorno no pudo descargar Chromium.

## Navegación pública

Noticias, videos, respuestas y enlaces a secciones comparten un solo paso en el historial. Atrás cierra una noticia abierta o vuelve directamente al inicio de la página; una nueva pulsación desde el inicio permite salir normalmente. Abrir el menú no agrega pasos. La flecha translúcida aparece después de bajar 400 px y vuelve arriba sin modificar el historial, con movimiento reducido cuando el dispositivo lo solicita.

## Fichas clínicas privadas

En `admin.html`, la misma cuenta habilitada en `vetAdministradores` accede a **Fichas clínicas**. No se habilitan otras cuentas ni accesos a otras aplicaciones.

- `vetPacientes/{id}`: mascota, tutor, teléfono, dirección y antecedentes. Buscar por paciente o tutor entre las fichas cargadas (25 por página; cargar más amplía la búsqueda).
- `vetPacientes/{id}/atenciones/{id}`: fecha clínica indicada por la doctora, motivo, peso, evaluación, diagnóstico, tratamiento, vacunas/desparasitación y próximo control. Consultas separadas por paciente, 20 por página.
- `vetPacientes/{id}/cambios/{id}`: registro inmutable con versión anterior y nueva, motivo de corrección, cuenta responsable y hora del servidor. También 20 por página. La interfaz muestra la hora de `America/Santiago`, incluyendo los cambios de horario de verano. La fecha de atención se distingue de la fecha/hora en que se guardó.

Cada guardado usa una transacción: ficha/atención y registro de cambio se escriben juntos. Las reglas exigen ambos documentos, hora del servidor, UID/correo de la cuenta autenticada y versión consecutiva. No permiten borrar fichas, atenciones ni cambios; los errores se corrigen con una nueva versión y un motivo. Si otro dispositivo modificó una ficha abierta, se rechaza el guardado antiguo; volver a abrir muestra los datos actuales y permite recuperar el texto del borrador explícitamente.

Los borradores se guardan solo en la sesión de este navegador, por cuenta, paciente y registro. Se limpian al cerrar sesión. No hay datos clínicos en el blog ni archivos subidos a Storage. Los datos privados requieren las reglas activas; no utilizar almacenamiento público o modo de prueba para habilitarlos.

### Activar el guardado

1. En el proyecto `daniel-tapia-abogado`, **Firestore → Reglas**, conservar las reglas vigentes.
2. Agregar el bloque de `docs/veterinaria-fichas.rules` dentro de `match /databases/{database}/documents`, antes del bloqueo final. Usa `isVetAdmin()` y `vetText()` ya existentes; no volver a definirlas. El archivo `docs/veterinaria-firestore-completas.rules` también incluye el bloque y conserva todas las reglas del proyecto conocidas al preparar este cambio; revisar diferencias si se cambiaron reglas posteriormente.
3. Publicar las reglas. No se necesitan índices compuestos nuevos: la ficha, consultas y cambios usan ordenación de un solo campo.
4. Con una cuenta administradora, crear un paciente de prueba, registrar una atención y corregir un dato con motivo. Verificar las dos versiones, fecha y hora en **Ver historial de modificaciones**. Desde una sesión sin rol, comprobar que no se puede acceder a los registros.

### Verificación de fichas

- `node tools/veterinaria-fichas-check.cjs`: validación, versiones y fechas de Chile. Con `FIRESTORE_EMULATOR_HOST` definido y dependencias `firebase` y `@firebase/rules-unit-testing`, ejecuta además pruebas contra las reglas completas: guardado atómico, historial inmutable, acceso público denegado, cuentas sin rol denegadas y permisos ajenos conservados. Nunca ejecutar estas pruebas contra producción.
- `node tools/veterinaria-fichas-ui-check.cjs` con `linkedom`: formularios, cambio de datos, historial anterior/nuevo, conflicto entre dispositivos sin sobrescribir, recuperación de borradores, separación por paciente y limpieza al salir. DOM y transacciones simulados; no sustituyen la prueba de permisos del emulador.
