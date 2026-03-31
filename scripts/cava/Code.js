// ============================================================
//  INVENTARIO PIAZZA PASTICCIO — Apps Script Backend
//  Almacén: CAVA
// ============================================================

// ── CONFIGURACIÓN ──────────────────────────────────────────
const SPREADSHEET_ID  = '1NI6qlMAJlWqpLJgd2sDTx954LhB__WShujBbfs03iHU';
const DRIVE_FOLDER_ID = '1R8P9FcbwSdZqjbjKrgTcuym1_xbCHkup';
const SHEET_MAESTRA   = 'MAESTRA';
// ───────────────────────────────────────────────────────────

const HEADERS_MAESTRA = [
  'Timestamp', 'Fecha', 'Operario', 'Área', 'Almacén',
  'Código', 'Nombre', 'Unidad', 'Cantidad', 'Catalogado',
  'Descripción', 'URL Foto'
];

const HEADERS_RESUMEN = [
  'Timestamp', 'Fecha', 'Operario', 'Área', 'Almacén',
  'Catalogados', 'No Catalogados', 'Total', 'Hoja Detalle'
];

const HEADERS_DETALLE = [
  'Timestamp', 'Fecha', 'Operario', 'Área', 'Almacén',
  'Código', 'Nombre', 'Unidad', 'Cantidad', 'Catalogado',
  'Descripción', 'URL Foto', 'Miniatura'
];

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
    .createTextOutput(JSON.stringify({ ok: true, mensaje: 'Apps Script CAVA activo ✓' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function procesarInventario(payload) {
  const ss        = SpreadsheetApp.openById(SPREADSHEET_ID);
  const timestamp = Utilities.formatDate(new Date(), 'America/Mexico_City', "yyyy-MM-dd'T'HH:mm:ss");
  const { operario, area, fecha, almacen, productos, manuales } = payload;

  const maestra = obtenerOCrearHoja(ss, SHEET_MAESTRA, HEADERS_MAESTRA);
  const nombreDetalle = generarNombreDetalle(area, fecha);
  const detalle = obtenerOCrearHoja(ss, nombreDetalle, HEADERS_DETALLE);

  const filasCatalogados = (productos || []).map(p => [
    timestamp, fecha, operario, area, almacen,
    p.codigo, p.nombre, p.unidad, p.cantidad, 'SÍ',
    '', ''
  ]);

  const filasManualesTotales = [];
  const filasDetalleManuales = [];
  let carpetaFotos = null;

  for (const m of (manuales || [])) {
    let urlFoto   = '';
    let miniatura = '';
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
    const filaBase = [
      timestamp, fecha, operario, area, almacen,
      'MANUAL', m.nombre, m.unidad, m.cantidad, 'NO',
      m.descripcion || '', urlFoto
    ];
    filasManualesTotales.push(filaBase);
    filasDetalleManuales.push([...filaBase, miniatura]);
  }

  const todasFilasMaestra = [...filasCatalogados, ...filasManualesTotales];
  if (todasFilasMaestra.length > 0) {
    maestra.getRange(
      maestra.getLastRow() + 1, 1,
      todasFilasMaestra.length, HEADERS_MAESTRA.length
    ).setValues(todasFilasMaestra);
  }

  const todasFilasDetalle = [
    ...filasCatalogados.map(f => [...f, '']),
    ...filasDetalleManuales
  ];
  if (todasFilasDetalle.length > 0) {
    detalle.getRange(
      detalle.getLastRow() + 1, 1,
      todasFilasDetalle.length, HEADERS_DETALLE.length
    ).setValues(todasFilasDetalle);
  }

  if (detalle.getLastRow() > 1) {
    detalle.setFrozenRows(1);
    detalle.getRange(1, 1, 1, HEADERS_DETALLE.length).setFontWeight('bold');
  }

  // Actualizar hoja RESUMEN
  actualizarResumen(ss, timestamp, fecha, operario, area, almacen,
    filasCatalogados.length, filasManualesTotales.length, nombreDetalle);

  return {
    catalogados: filasCatalogados.length,
    manuales: filasManualesTotales.length,
    hoja_detalle: nombreDetalle
  };
}

function actualizarResumen(ss, timestamp, fecha, operario, area, almacen, catalogados, noCatalogados, hojaDetalle) {
  const resumen = obtenerOCrearHoja(ss, 'RESUMEN', HEADERS_RESUMEN);
  resumen.getRange(resumen.getLastRow() + 1, 1, 1, HEADERS_RESUMEN.length).setValues([[
    timestamp, fecha, operario, area, almacen,
    catalogados, noCatalogados, catalogados + noCatalogados, hojaDetalle
  ]]);
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
        if (ts === timestampParam) { maestra.deleteRow(i + 2); borradas++; }
      }
    }

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

  const maestra = ss.getSheetByName(SHEET_MAESTRA);
  if (maestra && correcciones && correcciones.length > 0) {
    const numRows = maestra.getLastRow() - 1;
    if (numRows > 0) {
      const lastCol = maestra.getLastColumn();
      if (lastCol < 13 || maestra.getRange(1, 13).getValue() !== 'Nota Admin') {
        maestra.getRange(1, 13).setValue('Nota Admin');
        maestra.getRange(1, 14).setValue('Corrección');
        maestra.getRange(1, 15).setValue('Admin');
        maestra.getRange(1, 13, 1, 3).setFontWeight('bold');
      }
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

function obtenerOCrearHoja(ss, nombre, headers) {
  let hoja = ss.getSheetByName(nombre);
  if (!hoja) {
    hoja = ss.insertSheet(nombre);
    hoja.getRange(1, 1, 1, headers.length).setValues([headers]);
    hoja.setFrozenRows(1);
    hoja.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  }
  return hoja;
}

function generarNombreDetalle(area, fecha) {
  const areaLimpia = area.replace(/[\/\\?\*\[\]]/g, '').substring(0, 30).trim();
  const fechaLimpia = fecha.replace(/-/g, '');
  const hora = Utilities.formatDate(new Date(), 'America/Mexico_City', 'HHmm');
  return `${areaLimpia}_${fechaLimpia}_${hora}`.substring(0, 100);
}

function obtenerOCrearCarpeta(fecha) {
  const raiz = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  let carpetaInv;
  const itInv = raiz.getFoldersByName('Inventarios');
  carpetaInv = itInv.hasNext() ? itInv.next() : raiz.createFolder('Inventarios');
  const itFecha = carpetaInv.getFoldersByName(fecha);
  return itFecha.hasNext() ? itFecha.next() : carpetaInv.createFolder(fecha);
}

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
