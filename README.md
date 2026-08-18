# Mantenimiento_Miraflores

Plataforma de mantenimiento del restaurant: tus compañeros cargan tareas
con un nivel de urgencia (semáforo 🔴🟡🟢), vos las gestionás desde un
panel, y todo queda guardado con fecha, fotos y tiempo de resolución en
una Google Sheet — sin pagar hosting ni mantener un servidor.

## Cómo está armado

```
tifon/
├── Code.gs          → backend: rutas, guarda/lee datos, sube fotos, manda mails
├── Formulario.html  → página pública para cargar tareas (sin login)
├── Panel.html        → tu panel de gestión (tablero Pendiente / En proceso / Resuelto)
├── Styles.html       → estilos compartidos por las dos páginas
└── appsscript.json   → configuración del proyecto
```

No hace falta crear la Google Sheet ni la carpeta de Drive a mano: la
primera vez que alguien usa el sistema, `Code.gs` las crea solo
(`Mantenimiento_Miraflores_DB` y `Mantenimiento_Miraflores_Fotos`) y
guarda sus IDs para reusarlas siempre. Las vas a encontrar en la raíz
de tu Google Drive.

## Puesta en marcha (10 minutos)

1. **Creá el proyecto**: andá a [script.google.com](https://script.google.com) → *Nuevo proyecto*.
2. Ponele de nombre **Mantenimiento_Miraflores** (arriba a la izquierda, donde dice "Proyecto sin título").
3. Borrá el archivo `Code.gs` que viene vacío y pegá el contenido de este `Code.gs`.
4. Creá 3 archivos HTML nuevos (ícono ➕ → HTML) llamados exactamente
   `Formulario`, `Panel` y `Styles`, y pegá el contenido correspondiente
   de cada archivo de esta carpeta.
5. En `Code.gs`, cambiá la línea:
   ```js
   const MAIL_AVISOS = 'tu-mail@gmail.com';
   ```
   por tu mail real, para recibir el aviso cuando entra algo urgente.
6. Abrí `appsscript.json` desde el ícono de engranaje ⚙️ → *Mostrar archivo
   "appsscript.json" en el editor* y pegá el contenido de este repo ahí.
7. **Desplegar** → *Nueva implementación* → tipo **Aplicación web**.
   - "Ejecutar como": **Yo (tu cuenta)**
   - "Quién tiene acceso": **Cualquier usuario**
   - Dale a *Implementar* y **autorizá los permisos** (te va a pedir
     acceso a Sheets, Drive y Gmail — son los tres servicios que usa).
8. Te va a dar una URL como
   `https://script.google.com/macros/s/AKfycb.../exec`. Esa es la base:
   - **Para tus compañeros** (cargar tareas): compartí esa URL tal cual.
   - **Para vos** (el panel): agregá `?page=panel` al final.

   Guardá el link del panel en tus favoritos / pantalla de inicio del
   celular — es tu app de trabajo.

> Cada vez que edites el código después de la primera vez, tenés que
> hacer *Implementar → Administrar implementaciones → ✏️ editar →
> Nueva versión* para que los cambios se vean en la URL pública (si no,
> sigue sirviendo la versión vieja).

## Cómo se usa en el día a día

- **El personal** entra al link del formulario (podés pegarlo en el
  grupo de WhatsApp del restaurant, o poner un cartel con QR en la
  cocina) y carga: qué pasa, dónde, la urgencia, y opcionalmente una
  foto. Eso genera un ticket (ej. `M-260818-143210`).
- Si marcan **urgente**, te llega un mail al toque.
- **Vos** entrás al panel cuando podés (los martes/miércoles, o cuando
  te avisan algo urgente en el medio de la semana) y ves las tres
  columnas: Pendiente, En proceso, Resuelto.
- Tocás una tarjeta para ver el detalle, marcarla "en proceso", y
  cuando la termines la marcás "resuelto" agregando notas de qué
  hiciste y, si querés, una foto de cómo quedó. Ahí se calcula solo
  cuánto tardó en resolverse.
- La columna **Resuelto** funciona como tu historial: todo lo que
  hiciste, con fecha, tiempo que llevó y notas — ideal para mostrarle
  al dueño el trabajo hecho, o para acordarte de la próxima vez que
  pase algo parecido.

## Ideas para más adelante

- **WhatsApp en vez de mail**: ya dejé preparada la función
  `enviarAvisoUrgente_()` en `Code.gs` con la nota de cómo conectarla a
  [CallMeBot](https://www.callmebot.com/blog/free-api-whatsapp-messages/)
  (gratis, un solo request) o a la API de WhatsApp Business vía Twilio,
  cuando quieras dar el salto.
- **QR en la cocina**: generar un código QR con la URL del formulario
  (con [qr-code-generator.com](https://www.qr-code-generator.com/) o
  similar) y pegarlo en un lugar visible, para que sea aún más rápido
  cargar una tarea desde el celular.
- **Gráfico de repetición**: como todo queda en la Google Sheet, en
  cualquier momento podés armar una tabla dinámica ahí mismo para ver,
  por ejemplo, qué ubicación genera más tareas (¿siempre se rompe algo
  en el mismo lugar? capaz hay que resolver la causa, no el síntoma).
- **Roles**: si más adelante alguien más te ayuda con el mantenimiento,
  se puede agregar un campo "Asignado a" sin mucho esfuerzo.

## Subir esto a tu repo `tifon`

Este proyecto ya viene listo como carpeta para versionar con git. Para
subirlo a tu repo existente:

```bash
cd tifon
git init
git add .
git commit -m "Mantenimiento_Miraflores: formulario + panel + backend"
git remote add origin <URL-de-tu-repo-tifon>
git push -u origin main
```

Si preferís editar el código en tu compu y subirlo directo a Apps
Script (en vez de copiar y pegar en el navegador cada vez), Google
tiene una herramienta de línea de comandos llamada `clasp` que sincroniza
esta misma carpeta con tu proyecto de Apps Script. Si te interesa, te
armo esa parte también — es un paso extra que te ahorra el copy-paste
cada vez que cambiamos algo.
