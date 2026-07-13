// ============================================================
//  INVENTARIO — LIBRO DE EXCEPCIONES POR CENTRO (R9b)
//
//  UN MISMO Code.js para ambos centros, desplegado como DOS
//  proyectos Apps Script independientes (Piazza Pasticcio y
//  Universal de Hamburguesas). Sustituye a scripts/universal/
//  y a los 6 scripts por almacén de Piazza, cuyos Sheets quedan
//  como histórico congelado.
//
//  A Sheets solo viajan EXCEPCIONES: ítems manuales (con foto)
//  y artículos catalogados con observación. La toma íntegra vive
//  en D1 (admin) y el conteo oficial en Xetux (export XLSX).
//
//  INSTALACIÓN (una visita al editor por centro):
//  1. clasp create/push desde scripts/centro/
//     (.clasp.piazza.json / .clasp.uh.json guardan cada scriptId;
//      copiar el que toque a .clasp.json antes de push)
//  2. Abrir el editor (clasp open) → ejecutar setupPiazza() o
//     setupUH() → autorizar. Crea Spreadsheet + carpeta de fotos
//     y guarda IDs y CENTRO en Script Properties.
//  3. Implementar → Aplicación web (Ejecutar como: Yo · Acceso:
//     Cualquier persona) → copiar URL → SCRIPT_CENTRO en admin.html
// ============================================================

// ── CONFIGURACIÓN ──────────────────────────────────────────
// Todo en Script Properties (los escribe setup); nada hardcodeado
const _props = PropertiesService.getScriptProperties();
const SPREADSHEET_ID  = _props.getProperty('SPREADSHEET_ID');
const DRIVE_FOLDER_ID = _props.getProperty('DRIVE_FOLDER_ID');
const CENTRO          = _props.getProperty('CENTRO') || '?';
const SHEET_MAESTRA   = 'MAESTRA';

const CENTRO_NOMBRES = {
  PIAZZA: 'Piazza Pasticcio',
  UH:     'Universal de Hamburguesas'
};

function setupPiazza() { _setupCentro('PIAZZA'); }
function setupUH()     { _setupCentro('UH'); }

/**
 * Ejecutar UNA VEZ desde el editor (dispara la autorización).
 * Crea el Spreadsheet de excepciones y la carpeta de fotos si no
 * existen y guarda sus IDs en Script Properties. Reejecutar es
 * inofensivo.
 */
function _setupCentro(centro) {
  const nombre = CENTRO_NOMBRES[centro];
  _props.setProperty('CENTRO', centro);
  let ssId = _props.getProperty('SPREADSHEET_ID');
  if (!ssId) {
    const ss = SpreadsheetApp.create('Inventario Excepciones · ' + nombre);
    ssId = ss.getId();
    _props.setProperty('SPREADSHEET_ID', ssId);
  }
  let folderId = _props.getProperty('DRIVE_FOLDER_ID');
  if (!folderId) {
    const folder = DriveApp.createFolder('Inventario Excepciones — fotos · ' + nombre);
    folderId = folder.getId();
    _props.setProperty('DRIVE_FOLDER_ID', folderId);
  }
  Logger.log('CENTRO=' + centro);
  Logger.log('SPREADSHEET_ID=' + ssId);
  Logger.log('DRIVE_FOLDER_ID=' + folderId);
  Logger.log('Listo. Ahora: Implementar → Aplicación web → copiar URL.');
}
// ───────────────────────────────────────────────────────────

// ── CABECERAS ───────────────────────────────────────────────
// Miniatura inline en MAESTRA: ya no hay pestañas de detalle.
const HEADERS_MAESTRA = [
  'Timestamp', 'Fecha', 'Operario', 'Área', 'Almacén',
  'Código', 'Nombre', 'Unidad', 'Cantidad', 'Catalogado',
  'Descripción', 'URL Foto', 'Observación', 'Miniatura'
];
// Columnas que procesarNotas agrega a la derecha de MAESTRA
const COL_NOTA_ADMIN = 15; // 'Nota Admin', 16 'Corrección', 17 'Admin'
// ───────────────────────────────────────────────────────────

/**
 * POST desde admin.html (export). Apps Script no soporta CORS en
 * doPost, pero GitHub Pages lo llama con mode:'no-cors' +
 * Content-Type text/plain (workaround estándar).
 */
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const resultado = payload.action === 'guardarNotas'
      ? procesarNotas(payload)
      : procesarInventario(payload);
    return jsonResponse({ ok: true, resultado });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

/**
 * GET: ping para pruebas + resumen de filas (verificación de deploys).
 */
function doGet(e) {
  const action = e && e.parameter ? e.parameter.action : null;
  if (action === 'resumen') {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const maestra = ss.getSheetByName(SHEET_MAESTRA);
    const notas   = ss.getSheetByName('NOTAS');
    return jsonResponse({
      ok: true, centro: CENTRO,
      filasMaestra: maestra ? Math.max(0, maestra.getLastRow() - 1) : 0,
      filasNotas:   notas   ? Math.max(0, notas.getLastRow() - 1)   : 0,
      pestanas:     ss.getSheets().map(h => h.getName())
    });
  }
  return jsonResponse({ ok: true, centro: CENTRO, mensaje: 'Apps Script activo (excepciones R9b)' });
}

// ── PROCESAMIENTO PRINCIPAL ─────────────────────────────────
/**
 * v2 (R9b): recibe SOLO excepciones — manuales completos y
 * catalogados con observación. Escribe únicamente MAESTRA (con
 * miniatura inline para fotos); NO crea pestañas de detalle.
 * Filtra defensivamente por si llama un cliente viejo con la
 * toma completa.
 */
function procesarInventario(payload) {
  const ss        = SpreadsheetApp.openById(SPREADSHEET_ID);
  const timestamp = Utilities.formatDate(new Date(), 'America/Mexico_City', "yyyy-MM-dd'T'HH:mm:ss");
  const { operario, area, fecha, almacen } = payload;

  const maestra = obtenerOCrearHoja(ss, SHEET_MAESTRA, HEADERS_MAESTRA);

  // Catalogados: solo los que traen observación (la excepción)
  const filasCatalogados = (payload.productos || [])
    .filter(p => p && p.observacion)
    .map(p => [
      timestamp, fecha, operario, area, almacen,
      p.codigo, p.nombre, p.unidad, p.cantidad, 'SÍ',
      '', '', p.observacion, ''
    ]);

  // Manuales: siempre son excepción; foto → Drive + miniatura inline
  const manuales = (payload.manuales || []).filter(m => m && m.type !== 'comment');
  let carpetaFotos = null;
  const filasManuales = manuales.map(m => {
    let urlFoto = '', miniatura = '';
    if (m.foto_base64) {
      try {
        if (!carpetaFotos) carpetaFotos = obtenerOCrearCarpeta(fecha);
        const { url, id } = subirFotoDrive(m.foto_base64, m.nombre, carpetaFotos);
        urlFoto   = url;
        miniatura = `=IMAGE("https://drive.google.com/thumbnail?id=${id}&sz=w120")`;
      } catch (err) {
        urlFoto = 'Error al subir foto: ' + err.message;
      }
    }
    return [
      timestamp, fecha, operario, area, almacen,
      'MANUAL', m.nombre, m.unidad, m.cantidad, 'NO',
      m.descripcion || '', urlFoto, m.observacion || '', miniatura
    ];
  });

  const filas = [...filasCatalogados, ...filasManuales];
  if (filas.length > 0) {
    maestra.getRange(
      maestra.getLastRow() + 1, 1,
      filas.length, HEADERS_MAESTRA.length
    ).setValues(filas);
    resaltarCorrecciones(maestra, maestra.getLastRow() - filas.length + 1, filas, HEADERS_MAESTRA.indexOf('Observación'));
  }

  return {
    centro: CENTRO,
    catalogadosConObservacion: filasCatalogados.length,
    manuales: filasManuales.length
  };
}

// ── HELPERS ─────────────────────────────────────────────────

function resaltarCorrecciones(hoja, startRow, filas, obsIdx) {
  if (obsIdx < 0 || startRow < 2) return;
  filas.forEach((fila, i) => {
    if (fila[obsIdx]) hoja.getRange(startRow + i, 1, 1, fila.length).setBackground('#fef3c7');
  });
}

function obtenerOCrearHoja(ss, nombre, headers) {
  let hoja = ss.getSheetByName(nombre);
  if (!hoja) hoja = ss.insertSheet(nombre);
  hoja.getRange(1, 1, 1, headers.length).setValues([headers]);
  hoja.setFrozenRows(1);
  hoja.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  return hoja;
}

/**
 * Carpeta de Drive para las fotos del día:
 * [Carpeta raíz] / Inventarios / YYYY-MM-DD
 */
function obtenerOCrearCarpeta(fecha) {
  const raiz = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  const itInv = raiz.getFoldersByName('Inventarios');
  const carpetaInv = itInv.hasNext() ? itInv.next() : raiz.createFolder('Inventarios');
  const itFecha = carpetaInv.getFoldersByName(fecha);
  return itFecha.hasNext() ? itFecha.next() : carpetaInv.createFolder(fecha);
}

/**
 * Sube una foto base64 a Drive y devuelve { url, id }.
 * Acepta base64 con o sin prefijo data:image/...;base64,
 */
function subirFotoDrive(base64, nombreProducto, carpeta) {
  const data = base64.includes(',') ? base64.split(',')[1] : base64;
  const blob = Utilities.newBlob(
    Utilities.base64Decode(data),
    'image/jpeg',
    `${nombreProducto.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.jpg`
  );
  const archivo = carpeta.createFile(blob);
  archivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { url: archivo.getUrl(), id: archivo.getId() };
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── NOTAS Y CORRECCIONES ADMIN ────────────────────────────────
// NOTAS es parte del libro de excepciones. El update de filas en
// MAESTRA solo aplica si la fila existe (en v2 la mayoría de los
// artículos no viajan a Sheets).

const HEADERS_NOTAS = [
  'Fecha Nota', 'Admin', 'Almacén', 'Área', 'Operario', 'Fecha Toma', 'Timestamp Toma',
  'Código Ítem', 'Nombre Ítem', 'Cant. Original', 'Cant. Corregida', 'Nota Ítem', 'Nota General'
];

function procesarNotas(payload) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const { admin, fechaNota, toma, notaGeneral, correcciones } = payload;

  const hojaNotas = obtenerOCrearHoja(ss, 'NOTAS', HEADERS_NOTAS);

  if (correcciones && correcciones.length > 0) {
    const filas = correcciones.map(c => [
      fechaNota, admin,
      toma.almacen, toma.area, toma.operario, toma.fecha, toma.timestamp,
      c.codigo || '', c.nombre || '',
      c.cantOriginal || '', c.cantCorregida || '',
      c.nota || '', notaGeneral || ''
    ]);
    hojaNotas.getRange(hojaNotas.getLastRow() + 1, 1, filas.length, HEADERS_NOTAS.length).setValues(filas);
  } else {
    hojaNotas.getRange(hojaNotas.getLastRow() + 1, 1, 1, HEADERS_NOTAS.length).setValues([[
      fechaNota, admin,
      toma.almacen, toma.area, toma.operario, toma.fecha, toma.timestamp,
      '', '', '', '', '', notaGeneral || ''
    ]]);
  }

  // Actualizar MAESTRA solo donde la fila exista (código + timestamp)
  const maestra = ss.getSheetByName(SHEET_MAESTRA);
  let actualizadas = 0;
  if (maestra && correcciones && correcciones.length > 0) {
    const numRows = maestra.getLastRow() - 1;
    if (numRows > 0) {
      if (maestra.getRange(1, COL_NOTA_ADMIN).getValue() !== 'Nota Admin') {
        maestra.getRange(1, COL_NOTA_ADMIN).setValue('Nota Admin');
        maestra.getRange(1, COL_NOTA_ADMIN + 1).setValue('Corrección');
        maestra.getRange(1, COL_NOTA_ADMIN + 2).setValue('Admin');
        maestra.getRange(1, COL_NOTA_ADMIN, 1, 3).setFontWeight('bold');
      }
      const data = maestra.getRange(2, 1, numRows, 6).getValues();
      correcciones.forEach(c => {
        for (let i = 0; i < data.length; i++) {
          const ts = data[i][0] instanceof Date ? data[i][0].toISOString() : String(data[i][0]);
          const codigo = String(data[i][5]);
          if (ts === toma.timestamp && codigo === (c.codigo || '')) {
            const rowNum = i + 2;
            maestra.getRange(rowNum, COL_NOTA_ADMIN).setValue(c.nota || notaGeneral || '');
            maestra.getRange(rowNum, COL_NOTA_ADMIN + 1).setValue(c.cantCorregida || '');
            maestra.getRange(rowNum, COL_NOTA_ADMIN + 2).setValue(admin);
            actualizadas++;
          }
        }
      });
    }
  }

  return { notas: correcciones ? correcciones.length : 0, filasMaestraActualizadas: actualizadas };
}
