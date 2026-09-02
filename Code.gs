/**
 * ============================================================
 *  MANTENIMIENTO_MIRAFLORES — Backend (Google Apps Script)
 * ============================================================
 * Esto es solo la API: recibe pedidos (GET para leer, POST para
 * escribir), guarda todo en una Google Sheet, sube fotos a Drive
 * y manda mails de aviso. El formulario y el panel (la parte
 * visual) viven aparte, en GitHub Pages, y le hablan a esta API
 * por HTTP. La Sheet y la carpeta de Drive se crean solas la
 * primera vez que se usa, no hay que configurar IDs a mano.
 */

const NOMBRE_SHEET = 'Tareas';
const NOMBRE_SHEET_PROG = 'Programadas';
const NOMBRE_DB = 'Mantenimiento_Miraflores_DB';
const NOMBRE_CARPETA_FOTOS = 'Mantenimiento_Miraflores_Fotos';

// 👉 Cambiá esto por tu mail para recibir avisos de tareas urgentes.
const MAIL_AVISOS = 'tu-mail@gmail.com';

// 👉 URL del panel en GitHub Pages, para el link que va en los mails
// de aviso. Si tu usuario/repo de GitHub es otro, ajustá esta línea.
const PANEL_URL = 'https://tifon61.github.io/Mantenimiento_Miraflores/panel.html';

const ENCABEZADOS = [
  'ID', 'Fecha Creación', 'Título', 'Descripción', 'Ubicación',
  'Urgencia', 'Estado', 'Reportado por', 'Foto Antes', 'Foto Después',
  'Fecha Inicio', 'Fecha Resolución', 'Tiempo Resolución', 'Notas Resolución'
];

const ENCABEZADOS_PROG = [
  'ID', 'Título', 'Ubicación', 'Urgencia', 'Frecuencia (días)', 'Próxima fecha', 'Última vez hecha'
];

/* ======================= ENRUTAMIENTO DE LA API ======================= */

// Pedidos GET: lecturas. Ej: .../exec?action=tareas
function doGet(e) {
  const action = e && e.parameter && e.parameter.action;
  try {
    if (action === 'tareas') return responderJSON_(obtenerTareas());
    if (action === 'programadas') return responderJSON_(obtenerProgramadas());
    return responderJSON_({ ok: true, mensaje: 'Mantenimiento_Miraflores API activa' });
  } catch (err) {
    return responderJSON_({ ok: false, error: String(err) });
  }
}

// Pedidos POST: escrituras. El cuerpo es JSON: { action: '...', data: {...} }
// Se manda con Content-Type "text/plain" desde el frontend a propósito,
// para que el navegador no dispare un preflight de CORS que Apps
// Script no sabe responder.
function doPost(e) {
  try {
    const cuerpo = JSON.parse(e.postData.contents);
    const datos = cuerpo.data || {};
    let resultado;

    switch (cuerpo.action) {
      case 'crearTarea':
        resultado = crearTarea(datos);
        break;
      case 'registrarTrabajo':
        resultado = registrarTrabajo(datos);
        break;
      case 'actualizarEstado':
        resultado = actualizarEstado(datos.id, datos.nuevoEstado, datos.notas, datos.fotoDespuesBase64);
        break;
      case 'crearProgramada':
        resultado = crearProgramada(datos);
        break;
      case 'completarProgramada':
        resultado = completarProgramada(datos.id);
        break;
      case 'eliminarProgramada':
        resultado = eliminarProgramada(datos.id);
        break;
      default:
        resultado = { ok: false, error: 'Acción desconocida: ' + cuerpo.action };
    }
    return responderJSON_(resultado);
  } catch (err) {
    return responderJSON_({ ok: false, error: String(err) });
  }
}

function responderJSON_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ======================= ACCESO A DATOS ======================= */

// Devuelve el spreadsheet que hace de base de datos, creándolo si
// es la primera vez que se usa.
function getSpreadsheet_() {
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
  return ss;
}

// Devuelve la hoja de cálculo "Tareas", creándola si es la primera
// vez que se usa.
function getDB_() {
  const ss = getSpreadsheet_();
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

// Devuelve la hoja de cálculo "Programadas" (tareas periódicas, tipo
// "limpiar canaletas cada 90 días"), creándola si es la primera vez.
function getDBProgramadas_() {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(NOMBRE_SHEET_PROG);
  if (!sheet) {
    sheet = ss.insertSheet(NOMBRE_SHEET_PROG);
    sheet.appendRow(ENCABEZADOS_PROG);
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, ENCABEZADOS_PROG.length);
  }
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

/* ============ Tareas ============ */

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

// Registra un trabajo que ya se hizo (por ejemplo, algo que encontraste
// y arreglaste vos mismo durante la visita, sin que nadie lo haya
// reportado antes). Queda guardado como una tarea ya resuelta, así
// aparece directo en el historial y en la Bitácora.
// "datos" = {titulo, ubicacion, descripcion, notas, foto}
function registrarTrabajo(datos) {
  const sheet = getDB_();
  const id = 'M-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyMMdd-HHmmss');
  const ahora = new Date();

  let urlFoto = '';
  if (datos.foto) {
    urlFoto = guardarFoto_(datos.foto, id + '_bitacora');
  }

  sheet.appendRow([
    id,
    ahora,
    datos.titulo,
    datos.descripcion || '',
    datos.ubicacion,
    'Verde',
    'Resuelto',
    'Mantenimiento',
    '',
    urlFoto,
    ahora,
    ahora,
    'Registrado en el momento',
    datos.notas || ''
  ]);

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
        'Ver en el panel: ' + PANEL_URL
    });
  } catch (err) {
    console.error('No se pudo enviar el aviso: ' + err);
  }
}

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

/* ============ Tareas periódicas (limpiar canaletas, desagües, etc.) ============ */
//
// A diferencia de las tareas normales (que reporta el personal cuando
// pasa algo), estas se cargan una sola vez con una frecuencia en días
// y el sistema calcula solo cuánto falta para la próxima. Al marcarlas
// "hecha" se reinicia el conteo automáticamente.

// Crea una tarea periódica nueva. "datos" = {titulo, ubicacion, urgencia, frecuenciaDias}
function crearProgramada(datos) {
  const sheet = getDBProgramadas_();
  const id = 'P-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyMMdd-HHmmss');
  const frecuencia = Number(datos.frecuenciaDias) || 30;
  const proxima = new Date();
  proxima.setDate(proxima.getDate() + frecuencia);

  sheet.appendRow([
    id, datos.titulo, datos.ubicacion, datos.urgencia || 'Amarillo',
    frecuencia, proxima, ''
  ]);
  return { ok: true, id: id };
}

// Devuelve las tareas periódicas con los días que faltan (o que pasaron,
// en negativo, si está vencida) para la próxima, ordenadas de la más
// urgente a la que menos apura.
function obtenerProgramadas() {
  const sheet = getDBProgramadas_();
  const datos = sheet.getDataRange().getValues();
  datos.shift();
  const hoy = new Date();

  return datos.map(fila => {
    const proxima = new Date(fila[5]);
    const diasRestantes = Math.ceil((proxima.getTime() - hoy.getTime()) / 86400000);
    return {
      id: fila[0],
      titulo: fila[1],
      ubicacion: fila[2],
      urgencia: fila[3],
      frecuenciaDias: fila[4],
      proximaFecha: proxima.toISOString(),
      ultimaVezHecha: fila[6] ? new Date(fila[6]).toISOString() : '',
      diasRestantes: diasRestantes
    };
  }).sort((a, b) => a.diasRestantes - b.diasRestantes);
}

// Marca una tarea periódica como hecha hoy: reinicia el conteo sumando
// la frecuencia desde la fecha actual.
function completarProgramada(id) {
  const sheet = getDBProgramadas_();
  const datos = sheet.getDataRange().getValues();

  for (let i = 1; i < datos.length; i++) {
    if (datos[i][0] === id) {
      const fila = i + 1;
      const ahora = new Date();
      const frecuencia = Number(datos[i][4]) || 30;
      const proxima = new Date();
      proxima.setDate(proxima.getDate() + frecuencia);

      sheet.getRange(fila, 6).setValue(proxima); // columna F: Próxima fecha
      sheet.getRange(fila, 7).setValue(ahora);   // columna G: Última vez hecha
      return { ok: true };
    }
  }
  return { ok: false, error: 'No se encontró la tarea periódica ' + id };
}

// Borra una tarea periódica (por ejemplo si se cargó por error).
function eliminarProgramada(id) {
  const sheet = getDBProgramadas_();
  const datos = sheet.getDataRange().getValues();
  for (let i = 1; i < datos.length; i++) {
    if (datos[i][0] === id) {
      sheet.deleteRow(i + 1);
      return { ok: true };
    }
  }
  return { ok: false, error: 'No se encontró la tarea periódica ' + id };
}

// Manda un mail-resumen si hay tareas periódicas vencidas. No se
// ejecuta sola: hay que activarla una vez como disparador (trigger).
//
// 👉 Para activarla: en el editor de Apps Script, abrí el reloj ⏰
// "Disparadores" del menú izquierdo → "+ Agregar disparador" → función
// "revisarProgramadas_" → origen del evento "Basado en tiempo" →
// "Temporizador de día" → elegí un horario (ej: 8 a 9 de la mañana) →
// Guardar. A partir de ahí se revisa solo todos los días.
function revisarProgramadas_() {
  const vencidas = obtenerProgramadas().filter(p => p.diasRestantes <= 0);
  if (vencidas.length === 0 || !MAIL_AVISOS) return;

  const lista = vencidas
    .map(p => '• ' + p.titulo + ' (' + p.ubicacion + ') — vencida hace ' + Math.abs(p.diasRestantes) + ' día(s)')
    .join('\n');

  MailApp.sendEmail({
    to: MAIL_AVISOS,
    subject: '🔁 Tareas periódicas de mantenimiento vencidas',
    body: 'Estas tareas de rutina ya tocan:\n\n' + lista + '\n\nVer panel: ' + PANEL_URL
  });
}
