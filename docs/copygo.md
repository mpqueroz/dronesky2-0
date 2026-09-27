# CopyGo

Pasa textos, enlaces, fotos y archivos entre el celular y el PC al instante.
Se entra con la misma cuenta de Forjar (correo y clave); cada cuenta ve solo lo suyo.

- Sitio: `copygo` → copygo.web.app (carpeta `copygo/`).
- Datos: Firestore `copygo/{uid}` (ajustes) y `copygo/{uid}/items/{id}` (envíos).
- Archivos: Storage `copygo/{uid}/{id}/{nombre}` (máximo 25 MB).
- Los envíos se borran solos según el ajuste de la cuenta (por defecto 3 días) y se guardan
  como máximo los 60 más recientes. Los fijados no se borran solos.

## Configuración en Firebase (una sola vez)

1. **Hosting → Agregar otro sitio** → `copygo` (antes de aceptar el cambio en `main`).
2. **Firestore Database → Reglas**: agrega el bloque de `docs/copygo-firestore.rules`
   sin borrar las reglas que ya hay. Publicar.
3. **Storage**: si no está activado, "Comenzar". Luego **Reglas**: agrega el bloque de
   `docs/copygo-storage.rules` sin borrar lo que ya hay. Publicar.
4. Las cuentas se crean en **Authentication → Usuarios → Agregar usuario** (igual que Forjar).

## Compartir desde otras apps

En Android, después de instalar la app ("Instalar app" en el menú del navegador), aparece
"CopyGo" en el menú Compartir. En iPhone las páginas web no pueden aparecer ahí.
