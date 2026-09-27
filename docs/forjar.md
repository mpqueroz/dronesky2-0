# Forjar: guardado en la nube

La app guarda siempre en el teléfono. Si la persona crea una cuenta (correo y clave),
además guarda en Firestore y puede usar sus datos en otro teléfono.

## Configuración en Firebase (una sola vez)

1. **Authentication** → Comenzar → Método de acceso → **Correo electrónico/contraseña** → Habilitar.
2. **Firestore Database** → Crear base de datos (modo producción, ubicación
   `southamerica-west1` o la más cercana). Si ya existe, sigue al paso 3.
3. **Firestore Database → Reglas**: agrega el bloque de `docs/forjar-firestore.rules`
   (desde `match /forjar/{uid}` hasta su llave de cierre) dentro de
   `match /databases/{database}/documents { ... }`, sin borrar las reglas que ya hay. Publicar.
4. **Cuentas**: en este proyecto la creación de cuentas desde las páginas está desactivada
   (protege el panel del sitio). Crea la cuenta de cada persona en **Authentication → Usuarios →
   Agregar usuario**; luego la persona toca "Entrar" en Forjar.
5. **Configuración del proyecto → Tus apps**: debe existir una app web. Si no hay ninguna,
   agrega una (ícono `</>`). No hace falta copiar nada: el sitio lee la configuración solo.

## Cómo funciona

- Cada cambio se guarda al instante en el teléfono y se sube a la nube casi al tiro.
- Sin internet, los cambios quedan en espera y se suben al volver la conexión.
- Al crear la cuenta, lo que ya estaba anotado en el teléfono se sube a la cuenta.
- Al cerrar sesión los datos se borran del teléfono (quedan en la cuenta).
