# Proyecto

Repositorio con tres sitios de Firebase Hosting del proyecto `daniel-tapia-abogado`
(ver `firebase.json`). Se publican solos con GitHub Actions al aceptar cambios en `main`;
cada pull request deja un enlace de vista previa.

- `public/` → sitio `dronesky2-0` (página DroneSky).
- `forjar/` → sitio `forjar-personal` (app Forjar: comidas, pesas y medidas).
  - `forjar/firebase-sdk.js` es generado: se reconstruye con `npm install && npm run build`
    en `tools/firebase-sdk/`. No editarlo a mano.
  - Datos en Firestore: `forjar/{uid}` y `forjar/{uid}/dias/{AAAA-MM-DD}`. Las reglas están en
    `docs/forjar-firestore.rules` y se publican a mano en la consola (el proyecto tiene un solo
    archivo de reglas; no reemplazar las existentes). Configuración: `docs/forjar.md`.
- `portapapeles/` → sitio `portapapeles-md` (Mi Portapapeles: texto y archivos entre dispositivos).
  - Usa Firestore y Storage con reglas en `docs/portapapeles-*.rules`. Configuración: `docs/portapapeles.md`.
  - `portapapeles/firebase-sdk.js` también es generado desde `tools/firebase-sdk/`.
- Las cuentas se crean en la consola (Authentication → Usuarios): el proyecto no permite crear
  cuentas desde las páginas.

# Convenciones (pedidas por el dueño; aplicar en todas las páginas y apps)

- Textos de la interfaz, commits y documentación en español de Chile, simples y sin tecnicismos.
- **Botón atrás**: nunca debe sacar al usuario de la página. Debe retroceder dentro de la app
  (cerrar la hoja o ventana abierta, volver a la pestaña o pantalla anterior) y, en la pantalla
  inicial, pedir confirmación ("Presiona atrás otra vez para salir"). Ver la sección
  "Botón atrás" en `forjar/index.html` como ejemplo.
- Los datos del usuario no se deben perder: guardado local inmediato y, si hay cuenta, en la nube.
- Pensado primero para celular (ancho 390 px), con modo oscuro.
