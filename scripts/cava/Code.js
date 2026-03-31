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
  if (action === 'initConteo') return inicializarConteo();
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

function inicializarConteo() {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const HOJA = 'CONTEO FINAL CATALOGADOS';

  const CATALOGO = [
    ["AKELUM ASOLO PROSECCO","LT"],
    ["ALEA VIVA","LT"],
    ["ALOIS CAMPOLE AGLIANICO","LT"],
    ["ANTICAFRATTA ESSENCE ROSE","LT"],
    ["ARCESE 22 BERA VINO ESPUMOSO","LT"],
    ["ARNAUD LAMBERT SAUMUR ROUGE","B.750"],
    ["BEAUJOLAIS RAPHAEL SAINT CYR","LT"],
    ["BHILAR","LT"],
    ["BOURGOGNE GRAND AUXERROIS DOMAINE SAINTE MADELEINE","LT"],
    ["BRET BROTHERS BEAUJOLAIS-LANTIGNIE GLOU BRET","LT"],
    ["BRET BROTHERS JULIENAS LA BOTTIERE CUVEE ZEN","LT"],
    ["BUGLIONI IMPERFETTO","LT"],
    ["BUGLIONI RIPASSO IL BUGIARDO","LT"],
    ["CAVIAR KALUGA HIDRIDO","KG"],
    ["CHAMP. MONTAGNE DE REMIS","LT"],
    ["CHARDONNAY ADUANA","LT"],
    ["CHAT DU PUY","LT"],
    ["CHIANTI VAL DI MERSE PGS VINO TINTO SECO","LT"],
    ["CHIANTY VAL DI MERSE PGS VINO TINTO SECO","LT"],
    ["CHORA BIANCO","LT"],
    ["CONTRATTO MILLESIMATTO","LT"],
    ["CONTRATTO MILLESIMATTO MAGNUM","LT"],
    ["DESCENCIENTES DE CHARLES MARTINEZ","LT"],
    ["DONT PANIC  IT S CALABRIA","LT"],
    ["ERIC CHEVALIER CHEZ CARDINAL","LT"],
    ["ESENZIA IGT VIGNETI DELLE DOLOMITI","LT"],
    ["ETNA ROSSO","LT"],
    ["FATTORIA CASPRI -ROSSO DI CASPRI SANGIOVESE","LT"],
    ["FERRARI MAXIMUM BLANC DE BLANCS TRENTO DOC","LT"],
    ["FONTANA FREDDA BARBERA DALBA DOC RAIMONDA","LT"],
    ["FONTANA FREDDA TIMORASSO DERTHONA  COLLI","LT"],
    ["FRIULANO DEL POMPIERE DOC FRIULI","LT"],
    ["GUAMACCIA","LT"],
    ["HALLELUJAH","LT"],
    ["HOBO 21 MAGNUM","LT"],
    ["JURA FUMEY-CHATELIN","LT"],
    ["KRISS PINOT GRIGIO","LT"],
    ["L ' ESTRO PROSECCO TREVISO","LT"],
    ["LA BIONDA CASALVEGRI CLASI. SUPE.VALPOLICELLA","B.750"],
    ["LA CALDERA","LT"],
    ["LE BRUN SERVENAY MELODIE EN C","B.750"],
    ["LE PUY EMILIEN","B.750"],
    ["LES TROIS BOIS","B.750"],
    ["MALBEC 21 ESTACION YUMBEL","LT"],
    ["MERLOT ADONIS VST VINO TINTO SECO","LT"],
    ["MONTEPULCIANO D ABRUZZO ADONIS VST VINO TINTO SECO","LT"],
    ["MOSCATO D´ASTI","LT"],
    ["MUNJEBEL ROSSO CAMPO RE CR 17","LT"],
    ["N DOM COLLET CHABLIS","LT"],
    ["NEBBACO NERO D AVOLA CARUSO Y MINIMI","LT"],
    ["NEGRO AMARO DON PEPE PTL VINO TINTO SECO","LT"],
    ["NEGRO DI TROJA  IGP","LT"],
    ["NERO DI CASANOVA","LT"],
    ["NERO DI TROJA IGP","B.750"],
    ["NIBIO 16 CASCINA DEGLI ULIVI","LT"],
    ["NICOSIA VULKA BIANCO","B.750"],
    ["NOBILE DI MONTEPULCIANIAMO DOCG 18","LT"],
    ["ORANGE WINE","LT"],
    ["OSADIA CHARDONNAY","LT"],
    ["PALIKOS","LT"],
    ["PAVONI NEGRO MARO IGT","LT"],
    ["PINOT NERO DOLOMITI","B.750"],
    ["PRAPIAN 3 VOLTE PRESA NO 3","LT"],
    ["PUNGIROSA","PZA"],
    ["RAMI 22","LT"],
    ["REFOSCO DAL PEDUNCOLO ROSSO","LT"],
    ["RIVAROSSA","B.750"],
    ["ROERO ARNEIS","LT"],
    ["ROSSO DI MONTALCINO DOC","LT"],
    ["ROSSO DOC FRIULI ARMONICO","LT"],
    ["SARAJA VERMENTINO DI SARDEGNA","LT"],
    ["SAUVIGNON VOLPE PASINI IGT VENEZIA GIULIA","LT"],
    ["SCHIOPPETTINO 18","LT"],
    ["SINFONIA DI BIANCO","LT"],
    ["SPERI VALPOLICELLA CLASSICO","LT"],
    ["SUD QUEST GAILLAC DOMAINE DE BRIN DAMIAN BONNET","LT"],
    ["SYLVAIN PATAILLE BOURGOGNE ALIGOTE","LT"],
    ["TENUTA VALDIPIATTA NIBBIANO MONTEPULCIANO BLANCO","B.750"],
    ["TIMORASSO DERTHONA  COLLI","LT"],
    ["TOCCOMAGLIOCCO 18 L ACINO","LT"],
    ["TORRE IN PIETRA ROMA ROSSO -DOC","LT"],
    ["V R AMAI","LT"],
    ["V.B KEEP ON PUNCHING 23 TESTALONGA","LT"],
    ["V.B SP 68 BIANCO 24 ARIANNA OCCHIPINTI","LT"],
    ["V.R CONTRORA 22 CANTINA GIARDINO","LT"],
    ["V.T CLOWN OENOLOGE 19 CANTINA GIARDINO","LT"],
    ["V.T SIMPLICEMENTE  ROSSO 23 CASCINA DEGLI ILIVI","LT"],
    ["VALPOLICELLA RIPASSO CLASSICO","LT"],
    ["VB ALOIS LAGEDER PORER PINOT GRIGI","LT"],
    ["VB APUNTE BLANC DE NOIR","LT"],
    ["VB BACKTOSILENCE LUGANA BRUT OTTELLA","LT"],
    ["VB BEAUJOLAIS JEAN FOILLARD MORGON CLASS","LT"],
    ["VB BIANCOSPINO MASCHITO","LT"],
    ["VB BICO DO CABO","LT"],
    ["VB CAITI ALOIS","LT"],
    ["VB CIRO BLANCO DOC LIBRIANDI","LT"],
    ["VB ELEPHAS BIANCO LAZIO","LT"],
    ["VB ENSAMBLE BLANCO ST","LT"],
    ["VB EXILE BLANC","LT"],
    ["VB FALANGHINA DOC FEUDI DI SAN GREGORIO","LT"],
    ["VB FATTORI DANIELLI SOAVE","LT"],
    ["VB FRIULANO SCHIOPETTO","LT"],
    ["VB GABRIELLA LUGANA","LT"],
    ["VB GAVI DI GAVI FONTANA FREDA","LT"],
    ["VB GIACOMO FENOCCHIO ARNEIS ROERO BLANCO","LT"],
    ["VB GRAN BAZAN VERDE","LT"],
    ["VB IS ARUTAS CANTINA DELLE VERNACCIA","LT"],
    ["VB JULIAN HAART RIESLING","LT"],
    ["VB KUHLING GILLOT QUINTERRA RHEINHESSEN  2023","LT"],
    ["VB LAFORADADA FRISACH","LT"],
    ["VB LES TROIS BOIS CHEVALIER","LT"],
    ["VB LILLO GRILLO","LT"],
    ["VB LOUIS JADOT CHABLIS","LT"],
    ["VB MASSO VIVO","LT"],
    ["VB OCCHIPINTI BLANCO","LT"],
    ["VB PETILIA GRECO DI TUFO","LT"],
    ["VB PIERPAOLO PECORARI PINOT GRIGIO","LT"],
    ["VB PINOT GRIGIO ALOIS","B.750"],
    ["VB PUGLIA BIANCO IGT","LT"],
    ["VB RIBOLLA GIALLA PIERPAOLO","LT"],
    ["VB RIESLING TRENTINO  DOC","LT"],
    ["VB SARAJA VERMENTINO","LT"],
    ["VB SOAVE BERTANI","LT"],
    ["VB SOAVE SERECLE DOC BERTANI","LT"],
    ["VB SPECOGNA PINOT GRIGIO FRIULLI COLLI ORIENTALI","LT"],
    ["VB TENUTA DEL MORER PINOT GRIGIO ISONZO BLANCO","LT"],
    ["VB TREBIUM ANTONELI","LT"],
    ["VB TRIMBACH PINOT BLANC","LT"],
    ["VB VENERE CMG","LT"],
    ["VB VERDICCHIO ANDREA","LT"],
    ["VB VERDICCHIO DI MATELICA BISCI","LT"],
    ["VB VERMENTINO IGT BIANCO BIO","LT"],
    ["VB WEINGUT QVINTERRA","LT"],
    ["VB WIENINGER GRUNER","LT"],
    ["VD CASTELLO DI MONSANTO LA CHIMERA VINSANTO","LT"],
    ["VD MOSCATO D'ASTI PIO CESARE","LT"],
    ["VD VIN SANTO SENSI","LT"],
    ["VD VINSANTO ROCCA","LT"],
    ["VE ATEMPO ESPUMOSO","LT"],
    ["VE BELMIRO PROSECCO","LT"],
    ["VE CA DEL BOSQUE FRANCIACORTA","LT"],
    ["VE CAREZZA LAMBRUSCO","LT"],
    ["VE CAVA COLL DE DAMA","LT"],
    ["VE CHAMPAGNE CONTRASTES","LT"],
    ["VE CHAMPAGNE GAUTHEROT","LT"],
    ["VE CHAMPAGNE MARIE TASSIN PROVOCATION ROSEE","LT"],
    ["VE DUBL ESPUMANTE","LT"],
    ["VE ESSENCE SATEN","LT"],
    ["VE EXILE ROSE PETILLANT","LT"],
    ["VE FRANCIACORTA ANTICA FRATA ROSE","LT"],
    ["VE FRANCIACORTA RICCI BRUT","LT"],
    ["VE GLERA COLLI TREVIGIANI","LT"],
    ["VE LA GIOIOSA SPARKLING 0.0","LT"],
    ["VE LAMBRUSCO GRASPARROSA DOC AMABILE","LT"],
    ["VE MARSURET PROSECCO SUPERIORE SAN BOLDO","LT"],
    ["VE MIRABELLA FRANCIACORTA","LT"],
    ["VE PET NAT MOLI","LT"],
    ["VE POGGIO COSTA PROSECCO DOC ROSE BRUT","LT"],
    ["VE PROSECCO PALADIN","LT"],
    ["VE PROSECCOEXTRA DRY ORLOTTI","LT"],
    ["VE TAITTINGER BRUT RESERVE","LT"],
    ["VE VALDOBBIADENE DOC LUXURY MIONETTO","LT"],
    ["VE VAPORETTO CUVE EXTRA DRY","LT"],
    ["VINO DEL VOLTA 23 LA STOPPA","LT"],
    ["VINO ROSADO CIRO ROSADO DOC LIBRANDI","LT"],
    ["VN ARANCINO CARUSO","LT"],
    ["VN BACK TO SILENCE ORANGE","LT"],
    ["VN LUNA BLU CASPRI","LT"],
    ["VN ORANGE WINE RUBICONE","LT"],
    ["VN RIBOLLA GRAVNER","LT"],
    ["VN VITA VIVET ORANGE","LT"],
    ["VOLPI PRIMITIVO  BIO PUGLIA","LT"],
    ["VR  CALVET ROSE D' ANJOU","LT"],
    ["VR AZIENDA VITIVINICOLA CONDE IGT PREDAPPIO ROSE","LT"],
    ["VR BELVENTO VELAROSA","LT"],
    ["VR BERTAROSE CHIARETTO BERTANI","LT"],
    ["VR BORROROSA ILBORRO","LT"],
    ["VR CAMAROSA BENEVENTANO ROSA","LT"],
    ["VR FATTORIA CASPRI ROSE DI CASPRI  SANGIOVESE","LT"],
    ["VR MONTEFIORI ROSATO","LT"],
    ["VR MONTEPULCIANO STORICO DOC","LT"],
    ["VR NATURAL PILON","LT"],
    ["VR PUNGIROSA RIVERA","LT"],
    ["VR ROSALVA PIERPAOLO","LT"],
    ["VR ROSE DI CIALA","LT"],
    ["VR SHYRA ROSE COSTA ROSA","LT"],
    ["VR SUSUCARU ROSATO","LT"],
    ["VR VILLA MONTEFIORE FUSIONE","LT"],
    ["VR ZILLINGER REVOLUTION ROSE","LT"],
    ["VT  BAROLO CANNUBI CLASSICO","B.750"],
    ["VT  MINOTAURO","LT"],
    ["VT A RINA ETNA","LT"],
    ["VT ALANERA ROSSO IGT","B.750"],
    ["VT AMARONE BUGLIONI","LT"],
    ["VT ARGIANO NON CONFUNDITUR","LT"],
    ["VT BARBARESCO PIO CESARE","LT"],
    ["VT BARBERA D ASTI LA STELLA SECO","LT"],
    ["VT BARBERA D ASTI STELLA+","LT"],
    ["VT BARBERA D' ALBA CAMERANO +","LT"],
    ["VT BAROLO PIO CESARE","LT"],
    ["VT BOSCO DI MEDICI LAVARUBRA","B.750"],
    ["VT BRUNELLO DI MONTALCINO DOCG VAL DI SUGA","LT"],
    ["VT CABERNET MERLOT MCMXX 1920 MMG","LT"],
    ["VT CANNONAU DI SARDEGNA BIO MAMUTHONE","LT"],
    ["VT CASPERIUS CASPRI","LT"],
    ["VT CHIANTI CLASSICO DOCG ROCCA DELLE MACIE","LT"],
    ["VT CHIANTI DI LAMOLE","LT"],
    ["VT CUPIDO","LT"],
    ["VT D  LONNBERG CAÑADA ENCINOS","B.750"],
    ["VT DERTHONA TIMORASSO LA SPINETTA","B.750"],
    ["VT DOLCETTO FENOCCHIO","LT"],
    ["VT ELIO LANGHE","LT"],
    ["VT EMERI CHEVALIER","LT"],
    ["VT ENSAMBLE TEMPRANILLO CABERNET MERLOT","LT"],
    ["VT FAMIGLIA LOSI RISERVA CHIANTI CLASSICO","B.750"],
    ["VT FAMILI AND FRIENDS","LT"],
    ["VT FARNIO GAROFOLI","LT"],
    ["VT FAUNO","B.750"],
    ["VT FRATELLI SERIO & BATTISTA BORGOGNO BARBERA","LT"],
    ["VT GIACOMO FENOCCHIO BAROLO BUSSIA","B.750"],
    ["VT I MONILI PRIMITIVO","LT"],
    ["VT IT NEGRO AMARO TALO","LT"],
    ["VT JULIENAS DOMAINE DES CHERS","LT"],
    ["VT LA CONTESSA","B.750"],
    ["VT LA MISION","LT"],
    ["VT LA PATERNE SANZAY","LT"],
    ["VT LAFFITTE TESTON","LT"],
    ["VT LANGHE PIO CESARE","LT"],
    ["VT LE PERGOLE TORTE IGT","LT"],
    ["VT LE VOLTE DELL ORNELLAIA","LT"],
    ["VT MARGAUX DE BRANE","LT"],
    ["VT MARSALA FINE SWEET","LT"],
    ["VT MONTEPULCIANO DOC  ZACCAGNINI","LT"],
    ["VT MONTEPULCIANO GIANNI","B.750"],
    ["VT MONTEPULCIANO TRALCETTO","LT"],
    ["VT NEBBIOLO ALBA PIAMONTE","B.750"],
    ["VT NEGROAMARO RIVERA","LT"],
    ["VT PASSI DI ORMA DOC","LT"],
    ["VT PELAGRILLO BRUNELLO","LT"],
    ["VT PETRA","B.750"],
    ["VT PIES DE TIERRA","LT"],
    ["VT PIZPIRETO GARAMBULLO","LT"],
    ["VT PRIMER PASO TORO","LT"],
    ["VT PRIMITIVO DE MANDURIA DOP PAPALE ORO","LT"],
    ["VT PRIMITIVO DI MANDURIA PUMO","LT"],
    ["VT QUERCEGOBBE PETRA","LT"],
    ["VT REFOSCO PIERPAOLO","LT"],
    ["VT RHONE SUD JULIEN MUS COTES DU RHONE ROUGE","LT"],
    ["VT ROSSO DI MONTALCINO DOC VAL DI SUGA","LT"],
    ["VT ROSSO LE COSTE","LT"],
    ["VT SAIA ETNA","LT"],
    ["VT SAN FELICE DOC LIBRANDI","LT"],
    ["VT SANGIOVESE CABERNET SAUVIGNON","LT"],
    ["VT SARAJA NANNONAU","LT"],
    ["VT SEDARA DONNAFUGATA","LT"],
    ["VT SETTIMO ALOIS","LT"],
    ["VT SIRENO BELVENTO","LT"],
    ["VT SUSUCARU ROSSO","LT"],
    ["VT TARGE TRADITION SAUMUR CHAMPIGNY","LT"],
    ["VT TAURASI SAN GREGORIO","LT"],
    ["VT TERRANO 2022","LT"],
    ["VT UNLITRO AMELEIA","LT"],
    ["VT VAJRA BAROLO","B.750"],
    ["VT VAJRA LANGHE DOC NEBIOLO","B.750"],
    ["VT VAL DI MERSE","LT"],
    ["VT VUALA NERO DAVOLA CARUSO","LT"],
    ["VT ZIGGURAT LUNELLI","LT"],
    ["VT. CA' LA BIONDA VALPO.CLAS.VENETTO","B.750"],
    ["VT. N. VAJRA BARBERA DALBA","B.750"],
    ["VT. N.BODEGAS BHILAR RIOJA","B.750"],
    ["VT. TENUTA DEL MORER PINOT NOIR ISONZO","B.750"]
  ];

    const existente = ss.getSheetByName(HOJA);
    if (existente) ss.deleteSheet(existente);

    const hoja = ss.insertSheet(HOJA);

    hoja.getRange('B1').setValue('NOMBRE');
    hoja.getRange('E1').setValue('UNIDAD');
    hoja.getRange('F1').setValue('CANTIDAD TOTAL');
    hoja.getRange(1, 2, 1, 5).setFontWeight('bold');
    hoja.setFrozenRows(1);

    const nombres = CATALOGO.map(i => [i[0]]);
    const unidades = CATALOGO.map(i => [i[1]]);
    hoja.getRange(2, 2, CATALOGO.length, 1).setValues(nombres);
    hoja.getRange(2, 5, CATALOGO.length, 1).setValues(unidades);

    const formulas = CATALOGO.map((_, i) => [
      `=IFNA(SUMIF(MAESTRA!G:G,B${i+2},MAESTRA!I:I),"REVISAR")`
    ]);
    hoja.getRange(2, 6, CATALOGO.length, 1).setFormulas(formulas);
    hoja.getRange(2, 6, CATALOGO.length, 1).setNumberFormat('#,##0.00');

    ss.setActiveSheet(hoja);
    ss.moveActiveSheet(1);

    return jsonResponse({ ok: true, items: CATALOGO.length, hoja: HOJA });
  } catch(err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}
