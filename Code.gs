/**
 * ============================================================
 *  MANTENIMIENTO_MIRAFLORES — Backend (Google Apps Script)
 * ============================================================
 * Este archivo es el "cerebro" del sistema. No hace falta
 * base de datos externa: usa una Google Sheet como tabla de
 * datos y una carpeta de Drive para las fotos. Ambas se crean
 * solas la primera vez que alguien usa el sistema, así que no
 * hay que configurar IDs a mano.
 */

const NOMBRE_SHEET = 'Tareas';
const NOMBRE_DB = 'Mantenimiento_Miraflores_DB';
const NOMBRE_CARPETA_FOTOS = 'Mantenimiento_Miraflores_Fotos';

// 👉 Cambiá esto por tu mail para recibir avisos de tareas urgentes.
const MAIL_AVISOS = 'tu-mail@gmail.com';

const ENCABEZADOS = [
  'ID', 'Fecha Creación', 'Título', 'Descripción', 'Ubicación',
  'Urgencia', 'Estado', 'Reportado por', 'Foto Antes', 'Foto Después',
  'Fecha Inicio', 'Fecha Resolución', 'Tiempo Resolución', 'Notas Resolución'
];

/* ======================= ENRUTAMIENTO WEB ======================= */

// Se ejecuta cada vez que alguien entra a la URL del Web App.
// ?page=form  -> formulario público para cargar tareas (por defecto)
// ?page=panel -> tu panel de gestión
function doGet(e) {
  const page = (e && e.parameter && e.parameter.page) || 'form';
  const template = HtmlService.createTemplateFromFile(page === 'panel' ? 'Panel' : 'Formulario');
  return template.evaluate()
    .setTitle('Mantenimiento_Miraflores')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// Permite incluir Styles.html dentro de los otros HTML con <?!= include('Styles'); ?>
function include(nombreArchivo) {
  return HtmlService.createHtmlOutputFromFile(nombreArchivo).getContent();
}

/* ======================= ACCESO A DATOS ======================= */

// Devuelve la hoja de cálculo "Tareas", creándola (junto con el
// spreadsheet que la contiene) si es la primera vez que se usa.
function getDB_() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty('DB_ID');
  let ss;
  if (id) {
    try { ss = SpreadsheetApp.openById(id); } catch (err) { ss = null; }
  }
  if (!ss) {
    ss = SpreadsheetApp.create(NOMBRE_DB);
    props.setProperty('DB_ID', ss.getId());
  }
  let sheet = ss.getSheetByName(NOMBRE_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(NOMBRE_SHEET);
    sheet.appendRow(ENCABEZADOS);
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, ENCABEZADOS.length);
  }
  // limpia la hoja "Hoja 1" / "Sheet1" en blanco que Google crea por defecto
  ['Hoja 1', 'Sheet1'].forEach(nombre => {
    const hojaDefault = ss.getSheetByName(nombre);
    if (hojaDefault) ss.deleteSheet(hojaDefault);
  });
  return sheet;
}

// Devuelve la carpeta de Drive para las fotos, creándola si hace falta.
function getFotosFolder_() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty('FOLDER_ID');
  let folder;
  if (id) {
    try { folder = DriveApp.getFolderById(id); } catch (err) { folder = null; }
  }
  if (!folder) {
    folder = DriveApp.createFolder(NOMBRE_CARPETA_FOTOS);
    props.setProperty('FOLDER_ID', folder.getId());
  }
  return folder;
}

/* ============ API llamada desde Formulario.html ============ */

// Crea una tarea nueva. "datos" llega desde el formulario público.
function crearTarea(datos) {
  const sheet = getDB_();
  const id = 'M-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyMMdd-HHmmss');
  const fechaCreacion = new Date();

  let urlFotoAntes = '';
  if (datos.fotoAntes) {
    urlFotoAntes = guardarFoto_(datos.fotoAntes, id + '_antes');
  }

  sheet.appendRow([
    id,
    fechaCreacion,
    datos.titulo,
    datos.descripcion,
    datos.ubicacion,
    datos.urgencia,
    'Pendiente',
    datos.reportadoPor || 'Anónimo',
    urlFotoAntes,
    '', '', '', '', ''
  ]);

  if (datos.urgencia === 'Rojo') {
    enviarAvisoUrgente_(id, datos.titulo, datos.descripcion, datos.ubicacion);
  }

  return { ok: true, id: id };
}

// Convierte una imagen en base64 (data URL) a un archivo real en Drive
// y devuelve la URL para poder mostrarla después en el panel.
function guardarFoto_(base64Data, nombreBase) {
  const partes = base64Data.match(/^data:(image\/\w+);base64,(.*)$/);
  if (!partes) return '';
  const mime = partes[1];
  const bytes = Utilities.base64Decode(partes[2]);
  const blob = Utilities.newBlob(bytes, mime, nombreBase + '.' + mime.split('/')[1]);
  const folder = getFotosFolder_();
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getUrl();
}

// Manda un mail cuando entra una tarea roja. Si falla, no rompe la
// carga de la tarea (solo queda registrado en los logs de ejecución).
//
// 👉 Próximo paso (WhatsApp): cuando quieras dar el salto, esta es la
// función que hay que tocar. Lo más simple es un servicio como
// CallMeBot (gratis, un solo request) o, para algo más robusto, la
// API de WhatsApp Business a través de Twilio. En los dos casos es
// agregar un UrlFetchApp.fetch(...) acá adentro con tu número.
function enviarAvisoUrgente_(id, titulo, descripcion, ubicacion) {
  if (!MAIL_AVISOS) return;
  try {
    MailApp.sendEmail({
      to: MAIL_AVISOS,
      subject: '🔴 Tarea urgente — ' + titulo,
      body:
        'Se cargó una tarea urgente en Mantenimiento_Miraflores.\n\n' +
        'ID: ' + id + '\n' +
        'Título: ' + titulo + '\n' +
        'Ubicación: ' + ubicacion + '\n' +
        'Descripción: ' + descripcion + '\n\n' +
        'Ver en el panel: ' + ScriptApp.getService().getUrl() + '?page=panel'
    });
  } catch (err) {
    console.error('No se pudo enviar el aviso: ' + err);
  }
}

/* ============ API llamada desde Panel.html ============ */

// Devuelve todas las tareas, más nuevas primero.
function obtenerTareas() {
  const sheet = getDB_();
  const datos = sheet.getDataRange().getValues();
  datos.shift(); // saca la fila de encabezados
  return datos.map(fila => filaATarea_(fila)).reverse();
}

function filaATarea_(fila) {
  return {
    id: fila[0],
    fechaCreacion: fila[1] ? new Date(fila[1]).toISOString() : '',
    titulo: fila[2],
    descripcion: fila[3],
    ubicacion: fila[4],
    urgencia: fila[5],
    estado: fila[6],
    reportadoPor: fila[7],
    fotoAntes: fila[8],
    fotoDespues: fila[9],
    fechaInicio: fila[10] ? new Date(fila[10]).toISOString() : '',
    fechaResolucion: fila[11] ? new Date(fila[11]).toISOString() : '',
    tiempoResolucion: fila[12],
    notasResolucion: fila[13]
  };
}

// Cambia el estado de una tarea (Pendiente -> En proceso -> Resuelto),
// calcula el tiempo total que tardó en resolverse, y guarda la foto de
// después y las notas si vienen.
function actualizarEstado(id, nuevoEstado, notas, fotoDespuesBase64) {
  const sheet = getDB_();
  const datos = sheet.getDataRange().getValues();

  for (let i = 1; i < datos.length; i++) {
    if (datos[i][0] === id) {
      const fila = i + 1; // +1 porque las hojas de cálculo empiezan en 1
      const ahora = new Date();

      if (nuevoEstado === 'En proceso' && !datos[i][10]) {
        sheet.getRange(fila, 11).setValue(ahora); // columna K: Fecha Inicio
      }

      if (nuevoEstado === 'Resuelto') {
        sheet.getRange(fila, 12).setValue(ahora); // columna L: Fecha Resolución
        const creacion = datos[i][1];
        const tiempoMs = ahora.getTime() - new Date(creacion).getTime();
        sheet.getRange(fila, 13).setValue(formatearDuracion_(tiempoMs)); // columna M

        if (fotoDespuesBase64) {
          const urlFoto = guardarFoto_(fotoDespuesBase64, id + '_despues');
          sheet.getRange(fila, 10).setValue(urlFoto); // columna J: Foto Después
        }
      }

      sheet.getRange(fila, 7).setValue(nuevoEstado); // columna G: Estado
      if (notas) sheet.getRange(fila, 14).setValue(notas); // columna N: Notas

      return { ok: true };
    }
  }
  return { ok: false, error: 'No se encontró la tarea ' + id };
}

// Convierte milisegundos en algo legible: "2d 4h" o "3h 15m"
function formatearDuracion_(ms) {
  const horas = Math.floor(ms / 3600000);
  if (horas >= 24) {
    const dias = Math.floor(horas / 24);
    return dias + 'd ' + (horas % 24) + 'h';
  }
  const minutos = Math.floor((ms % 3600000) / 60000);
  return horas + 'h ' + minutos + 'm';
}
