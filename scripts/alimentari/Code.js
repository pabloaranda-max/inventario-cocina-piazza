// ============================================================
//  INVENTARIO PIAZZA PASTICCIO — Apps Script Backend
//  Versión 1.0 | Feb 2026
//  
//  INSTRUCCIONES DE INSTALACIÓN:
//  1. Ve a script.google.com → Nuevo proyecto
//  2. Pega todo este código
//  3. Cambia SPREADSHEET_ID y DRIVE_FOLDER_ID abajo
//  4. Guardar → Implementar → Nueva implementación
//     · Tipo: Aplicación web
//     · Ejecutar como: Yo (tu cuenta)
//     · Quién tiene acceso: Cualquier persona
//  5. Autorizar y copiar la URL generada → va en el HTML
// ============================================================

// ── CONFIGURACIÓN ──────────────────────────────────────────
const SPREADSHEET_ID  = '1Vo2WbDJtYdyFwdpwR4Nx7i4DwQJZXKH8sldWcCEaF-I';
const DRIVE_FOLDER_ID = '1Tmfk2aXyyQnGY-4kSf_DBGHpDMqEYXN7';
const SHEET_MAESTRA   = 'MAESTRA';
// ───────────────────────────────────────────────────────────

// ── CABECERAS ───────────────────────────────────────────────
const HEADERS_MAESTRA = [
  'Timestamp', 'Fecha', 'Operario', 'Área', 'Almacén',
  'Código', 'Nombre', 'Unidad', 'Cantidad', 'Catalogado',
  'Descripción', 'URL Foto', 'Observación', 'Estado Export'
];

const HEADERS_DETALLE = [
  'Timestamp', 'Fecha', 'Operario', 'Área', 'Almacén',
  'Código', 'Nombre', 'Unidad', 'Cantidad', 'Catalogado',
  'Descripción', 'URL Foto', 'Observación', 'Miniatura', 'Estado Export'
];
// ───────────────────────────────────────────────────────────

/**
 * Punto de entrada para solicitudes POST desde el HTML.
 * Apps Script no soporta CORS en doPost, pero GitHub Pages
 * puede llamarlo sin problemas con mode: 'no-cors' +
 * Content-Type text/plain (workaround estándar).
 */
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const action = payload.action;
    let resultado;
    if (action === 'guardarNotas') {
      resultado = procesarNotas(payload);
    } else {
      resultado = procesarInventario(payload);
    }
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, resultado }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * También acepta GET para pruebas desde el navegador.
 */
function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, mensaje: 'Apps Script activo ✓' }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── PROCESAMIENTO PRINCIPAL ─────────────────────────────────
function procesarInventario(payload) {
  const ss        = SpreadsheetApp.openById(SPREADSHEET_ID);
  const timestamp = Utilities.formatDate(new Date(), 'America/Mexico_City', "yyyy-MM-dd'T'HH:mm:ss");
  const { operario, area, fecha, almacen, productos, manuales } = payload;

  // 1. Asegurar que existe la pestaña MAESTRA
  const maestra = obtenerOCrearHoja(ss, SHEET_MAESTRA, HEADERS_MAESTRA);

  // 2. Crear pestaña de detalle para este envío
  bloquearExportacionesPrevias(ss, maestra, area, fecha, almacen);
  const nombreDetalle = generarNombreDetalle(area, fecha);
  const detalle = obtenerOCrearHoja(ss, nombreDetalle, HEADERS_DETALLE);

  // 3. Preparar carpeta de Drive para las fotos de hoy
  const carpetaFotos = obtenerOCrearCarpeta(fecha);

  // 4. Filas de productos catalogados
  const filasCatalogados = (productos || []).map(p => [
    timestamp, fecha, operario, area, almacen,
    p.codigo, p.nombre, p.unidad, p.cantidad, 'SÍ',
    '', '', p.observacion || '', 'ACTUAL'
  ]);

  // 5. Filas de ítems manuales (con foto)
  const filasManualesTotales = [];
  const filasDetalleManuales = [];

  for (const m of (manuales || [])) {
    let urlFoto    = '';
    let miniatura  = '';

    if (m.foto_base64) {
      try {
        const { url, id } = subirFotoDrive(m.foto_base64, m.nombre, carpetaFotos);
        urlFoto   = url;
        miniatura = `=IMAGE("https://drive.google.com/thumbnail?id=${id}&sz=w120")`;
      } catch (err) {
        urlFoto = 'Error al subir foto: ' + err.message;
      }
    }

    const filaBase = [
      timestamp, fecha, operario, area, almacen,
      'MANUAL', m.nombre, m.unidad, m.cantidad, 'NO',
      m.descripcion || '', urlFoto, m.observacion || '', 'ACTUAL'
    ];

    filasManualesTotales.push(filaBase);
    filasDetalleManuales.push([...filaBase.slice(0, -1), miniatura, filaBase[filaBase.length - 1]]);
  }

  // 6. Escribir en MAESTRA (sin miniatura — columna Drive URL es suficiente)
  const todasFilasMaestra = [...filasCatalogados, ...filasManualesTotales];
  if (todasFilasMaestra.length > 0) {
    maestra.getRange(
      maestra.getLastRow() + 1, 1,
      todasFilasMaestra.length, HEADERS_MAESTRA.length
    ).setValues(todasFilasMaestra);
    resaltarCorrecciones(maestra, maestra.getLastRow() - todasFilasMaestra.length + 1, todasFilasMaestra, HEADERS_MAESTRA.indexOf('Observación'));
  }

  // 7. Escribir en pestaña de detalle (con miniatura en col 13)
  const todasFilasDetalle = [
    ...filasCatalogados.map(f => [...f.slice(0, -1), '', f[f.length - 1]]), // catalogados no tienen miniatura
    ...filasDetalleManuales
  ];
  if (todasFilasDetalle.length > 0) {
    detalle.getRange(
      detalle.getLastRow() + 1, 1,
      todasFilasDetalle.length, HEADERS_DETALLE.length
    ).setValues(todasFilasDetalle);
    resaltarCorrecciones(detalle, detalle.getLastRow() - todasFilasDetalle.length + 1, todasFilasDetalle, HEADERS_DETALLE.indexOf('Observación'));
  }

  // 8. Autoformat básico en detalle (congelar primera fila, bold headers)
  if (detalle.getLastRow() > 1) {
    detalle.setFrozenRows(1);
    detalle.getRange(1, 1, 1, HEADERS_DETALLE.length).setFontWeight('bold');
  }

  return {
    catalogados: filasCatalogados.length,
    manuales: filasManualesTotales.length,
    hoja_detalle: nombreDetalle
  };
}

// ── HELPERS ─────────────────────────────────────────────────

/**
 * Obtiene una hoja existente o la crea con cabeceras.
 */
function resaltarCorrecciones(hoja, startRow, filas, obsIdx) {
  if (obsIdx < 0 || startRow < 2) return;
  filas.forEach((fila, i) => {
    if (fila[obsIdx]) hoja.getRange(startRow + i, 1, 1, fila.length).setBackground('#fef3c7');
  });
}

function obtenerOCrearHoja(ss, nombre, headers) {
  let hoja = ss.getSheetByName(nombre);
  if (!hoja) {
    hoja = ss.insertSheet(nombre);
    hoja.getRange(1, 1, 1, headers.length).setValues([headers]);
    hoja.setFrozenRows(1);
    hoja.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  }
  hoja.getRange(1, 1, 1, headers.length).setValues([headers]);
  hoja.setFrozenRows(1);
  hoja.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  return hoja;
}

function bloquearExportacionesPrevias(ss, maestra, area, fecha, almacen) {
  const estadoCol = HEADERS_MAESTRA.indexOf('Estado Export') + 1;
  if (estadoCol <= 0 || !maestra || maestra.getLastRow() <= 1) return;
  const lastRow = maestra.getLastRow();
  const data = maestra.getRange(2, 1, lastRow - 1, HEADERS_MAESTRA.length).getValues();
  const detalles = new Set();
  data.forEach((row, i) => {
    if (String(row[1]) === String(fecha) && String(row[3]) === String(area) && String(row[4]) === String(almacen)) {
      maestra.getRange(i + 2, estadoCol).setValue('REFERENCIA');
      const ts = row[0] instanceof Date ? row[0] : new Date(row[0]);
      if (!isNaN(ts.getTime())) {
        detalles.add(nombreDetalleDesdeTimestamp(area, fecha, ts, 'HHmm'));
        detalles.add(nombreDetalleDesdeTimestamp(area, fecha, ts, 'HHmmss'));
      }
    }
  });
  detalles.forEach(nombre => protegerHojaReferencia(ss.getSheetByName(nombre)));
}

function protegerHojaReferencia(hoja) {
  if (!hoja) return;
  hoja.setTabColor('#9ca3af');
  const protections = hoja.getProtections(SpreadsheetApp.ProtectionType.SHEET);
  if (!protections.length) {
    const protection = hoja.protect().setDescription('Referencia bloqueada por re-export de inventario');
    protection.setWarningOnly(false);
  }
}

/**
 * Genera nombre de pestaña de detalle: AREA_YYYYMMDD_HHMM
 * Limita a 100 chars (límite de Sheets) y reemplaza caracteres inválidos.
 */
function generarNombreDetalle(area, fecha) {
  return nombreDetalleDesdeTimestamp(area, fecha, new Date(), 'HHmmss');
}

function nombreDetalleDesdeTimestamp(area, fecha, date, pattern) {
  const areaLimpia = area.replace(/[\/\\?\*\[\]]/g, '').substring(0, 30).trim();
  const fechaLimpia = fecha.replace(/-/g, '');
  const hora = Utilities.formatDate(date, 'America/Mexico_City', pattern);
  return `${areaLimpia}_${fechaLimpia}_${hora}`.substring(0, 100);
}

/**
 * Obtiene o crea la carpeta de Drive para las fotos del día.
 * Estructura: [Carpeta raíz] / Inventarios / YYYY-MM-DD
 */
function obtenerOCrearCarpeta(fecha) {
  const raiz = DriveApp.getFolderById(DRIVE_FOLDER_ID);

  // Subcarpeta "Inventarios"
  let carpetaInv;
  const itInv = raiz.getFoldersByName('Inventarios');
  carpetaInv = itInv.hasNext() ? itInv.next() : raiz.createFolder('Inventarios');

  // Subcarpeta por fecha
  const itFecha = carpetaInv.getFoldersByName(fecha);
  return itFecha.hasNext() ? itFecha.next() : carpetaInv.createFolder(fecha);
}

/**
 * Sube una foto en base64 a Drive y devuelve { url, id }.
 * El base64 puede venir con o sin el prefijo data:image/...;base64,
 */
function subirFotoDrive(base64, nombreProducto, carpeta) {
  // Quitar prefijo si existe
  const data = base64.includes(',') ? base64.split(',')[1] : base64;

  const blob = Utilities.newBlob(
    Utilities.base64Decode(data),
    'image/jpeg',
    `${nombreProducto.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.jpg`
  );

  const archivo = carpeta.createFile(blob);
  archivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return {
    url: archivo.getUrl(),
    id:  archivo.getId()
  };
}


// ── NUEVAS FUNCIONES ADMIN ────────────────────────────────
// Reemplaza doGet completo y agrega estas funciones al final

function doGet(e) {
  const action = e.parameter ? e.parameter.action : null;
  if (action === 'listar')  return listarTomas();
  if (action === 'detalle') return detalleToma(e.parameter.timestamp);
  if (action === 'borrar')  return borrarToma(
    e.parameter.timestamp,
    e.parameter.area,
    e.parameter.fecha
  );
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, mensaje: 'Apps Script activo ✓' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function listarTomas() {
  try {
    const ss      = SpreadsheetApp.openById(SPREADSHEET_ID);
    const maestra = ss.getSheetByName(SHEET_MAESTRA);
    if (!maestra || maestra.getLastRow() <= 1)
      return jsonResponse({ ok: true, tomas: [] });

    const numRows = maestra.getLastRow() - 1;
    const data    = maestra.getRange(2, 1, numRows, 10).getValues();
    const map     = {};

    data.forEach(row => {
      const ts    = row[0] instanceof Date ? row[0].toISOString() : String(row[0]);
      const fecha = row[1] instanceof Date
        ? Utilities.formatDate(row[1], 'America/Mexico_City', 'yyyy-MM-dd')
        : String(row[1]);
      if (!map[ts]) {
        map[ts] = { timestamp: ts, fecha, operario: row[2], area: row[3], almacen: row[4], items: 0, tiene_manuales: false };
      }
      map[ts].items++;
      if (row[9] === 'NO') map[ts].tiene_manuales = true;
    });

    const tomas = Object.values(map)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, 100);

    return jsonResponse({ ok: true, tomas });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

function borrarToma(timestampParam, area, fecha) {
  try {
    const ss      = SpreadsheetApp.openById(SPREADSHEET_ID);
    const maestra = ss.getSheetByName(SHEET_MAESTRA);
    let borradas  = 0;

    if (maestra && maestra.getLastRow() > 1) {
      const numRows = maestra.getLastRow() - 1;
      const data    = maestra.getRange(2, 1, numRows, 3).getValues();
      for (let i = data.length - 1; i >= 0; i--) {
        const ts = data[i][0] instanceof Date ? data[i][0].toISOString() : String(data[i][0]);
        const op = data[i][2];
        if (ts === timestampParam) { maestra.deleteRow(i + 2); borradas++; }
      }
    }

    // Eliminar hoja de detalle
    try {
      const areaLimpia  = area.replace(/[\/\\?\*\[\]]/g, '').substring(0, 30).trim();
      const fechaLimpia = fecha.replace(/-/g, '');
      const hora        = Utilities.formatDate(new Date(timestampParam), 'America/Mexico_City', 'HHmm');
      const nombre      = `${areaLimpia}_${fechaLimpia}_${hora}`.substring(0, 100);
      const detalle     = ss.getSheetByName(nombre);
      if (detalle) ss.deleteSheet(detalle);
    } catch(e) {}

    return jsonResponse({ ok: true, borradas });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── DETALLE DE TOMA ───────────────────────────────────────────

function detalleToma(timestamp) {
  try {
    const ss      = SpreadsheetApp.openById(SPREADSHEET_ID);
    const maestra = ss.getSheetByName(SHEET_MAESTRA);
    if (!maestra || maestra.getLastRow() <= 1)
      return jsonResponse({ ok: true, items: [] });

    const numRows = maestra.getLastRow() - 1;
    const data    = maestra.getRange(2, 1, numRows, 10).getValues();
    const items   = [];

    data.forEach(row => {
      const ts = row[0] instanceof Date ? row[0].toISOString() : String(row[0]);
      if (ts === timestamp) {
        items.push({
          codigo:     String(row[5]),
          nombre:     String(row[6]),
          unidad:     String(row[7]),
          cantidad:   row[8],
          catalogado: String(row[9])
        });
      }
    });

    return jsonResponse({ ok: true, items });
  } catch(err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

// ── NOTAS Y CORRECCIONES ADMIN ────────────────────────────────

const HEADERS_NOTAS = [
  'Fecha Nota', 'Admin', 'Almacén', 'Área', 'Operario', 'Fecha Toma', 'Timestamp Toma',
  'Código Ítem', 'Nombre Ítem', 'Cant. Original', 'Cant. Corregida', 'Nota Ítem', 'Nota General'
];

function procesarNotas(payload) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const { admin, fechaNota, toma, notaGeneral, correcciones } = payload;

  // 1. Escribir en hoja NOTAS
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
    // Solo nota general, sin correcciones de ítem
    hojaNotas.getRange(hojaNotas.getLastRow() + 1, 1, 1, HEADERS_NOTAS.length).setValues([[
      fechaNota, admin,
      toma.almacen, toma.area, toma.operario, toma.fecha, toma.timestamp,
      '', '', '', '', '', notaGeneral || ''
    ]]);
  }

  // 2. Actualizar columnas en MAESTRA para las correcciones (por código + timestamp)
  const maestra = ss.getSheetByName(SHEET_MAESTRA);
  if (maestra && correcciones && correcciones.length > 0) {
    const numRows = maestra.getLastRow() - 1;
    if (numRows > 0) {
      // Agregar cabeceras si aún no existen
      const lastCol = maestra.getLastColumn();
      if (lastCol < 13 || maestra.getRange(1, 13).getValue() !== 'Nota Admin') {
        maestra.getRange(1, 13).setValue('Nota Admin');
        maestra.getRange(1, 14).setValue('Corrección');
        maestra.getRange(1, 15).setValue('Admin');
        maestra.getRange(1, 13, 1, 3).setFontWeight('bold');
      }
      // Leer cols: Timestamp(1), Fecha(2), ..., Código(6)
      const data = maestra.getRange(2, 1, numRows, 6).getValues();
      correcciones.forEach(c => {
        for (let i = 0; i < data.length; i++) {
          const ts = data[i][0] instanceof Date ? data[i][0].toISOString() : String(data[i][0]);
          const codigo = String(data[i][5]);
          if (ts === toma.timestamp && codigo === (c.codigo || '')) {
            const rowNum = i + 2;
            maestra.getRange(rowNum, 13).setValue(c.nota || notaGeneral || '');
            maestra.getRange(rowNum, 14).setValue(c.cantCorregida || '');
            maestra.getRange(rowNum, 15).setValue(admin);
          }
        }
      });
    }
  }

  return { notas: correcciones ? correcciones.length : 0 };
}
