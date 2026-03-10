// ════════════════════════════════════════════════════════════════════
// ALIMENTARI B2B — Dashboard + Colores
// Pegar en Apps Script como archivo nuevo llamado "Dashboard"
// ════════════════════════════════════════════════════════════════════

var SS_ID = '18G9oj6AN6JBrl4t3Rwga1NANzpnL7LW8JFDekdZh_bw';

function _getSS() {
  return SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(SS_ID);
}

var C = {
  olive:      '#5C6B30',
  cochinilla: '#7D2B2B',
  gold:       '#C9933A',
  cream:      '#F2EDE4',
  dark:       '#2C2218',
  muted:      '#8A7F72',
  green:      '#2D6A2D',
  altRow1:    '#FDFAF5',
  altRow2:    '#F0EBE1',
};

// ─── MENÚ ────────────────────────────────────────────────────────────
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Alimentari')
    .addItem('Aplicar colores a sheets', 'aplicarColores')
    .addItem('Crear / Reiniciar Dashboard', 'initDashboard')
    .addToUi();
}

// ════════════════════════════════════════════════════════════════════
// COLORES EN SHEETS DE DATOS
// ════════════════════════════════════════════════════════════════════
function aplicarColores() {
  var ss = _getSS();
  _formatSheet(ss, 'Clientes',  HEADERS.clientes);
  _formatSheet(ss, 'Productos', HEADERS.productos);
  _formatSheet(ss, 'Pedidos',   HEADERS.pedidos);
  _condicionalPedidos(ss);
  Logger.log('Colores aplicados.');
}

function _formatSheet(ss, nombre, headers) {
  var hoja = ss.getSheetByName(nombre);
  if (!hoja) return;
  var nCols = headers.length;
  var nRows = hoja.getLastRow();

  hoja.getRange(1, 1, 1, nCols)
    .setBackground(C.olive).setFontColor(C.cream)
    .setFontWeight('bold').setFontSize(10)
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  hoja.setRowHeight(1, 28);

  if (nRows > 1) {
    hoja.getRange(2, 1, nRows - 1, nCols)
      .setBackground(C.altRow1).setFontColor(C.dark).setFontSize(9);
  }

  // Banding alternado
  var banding = hoja.getRange(1, 1, Math.max(nRows, 2), nCols);
  var bandings = hoja.getBandings();
  bandings.forEach(function(b) { b.remove(); });
  banding.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY)
    .setHeaderRowColor(C.olive)
    .setFirstRowColor(C.altRow1)
    .setSecondRowColor(C.altRow2);

  hoja.setFrozenRows(1);
  hoja.autoResizeColumns(1, nCols);
}

function _condicionalPedidos(ss) {
  var hoja = ss.getSheetByName('Pedidos');
  if (!hoja) return;
  var nRows = hoja.getLastRow();
  if (nRows < 2) return;

  hoja.clearConditionalFormatRules();
  var rules = [];

  var estadoCol = HEADERS.pedidos.indexOf('estado') + 1;
  if (estadoCol > 0) {
    var r = hoja.getRange(2, estadoCol, nRows - 1, 1);
    [
      { v: 'Recibido',   bg: '#FFF0C0', fg: '#5A4000' },
      { v: 'En proceso', bg: '#DFF0C8', fg: '#1A3800' },
      { v: 'Enviado',    bg: '#C8DEFF', fg: '#0A1E50' },
      { v: 'Entregado',  bg: '#C8ECC8', fg: '#1A4A1A' },
      { v: 'Cancelado',  bg: '#F0D0D0', fg: C.cochinilla },
    ].forEach(function(e) {
      rules.push(SpreadsheetApp.newConditionalFormatRule()
        .whenTextEqualTo(e.v).setBackground(e.bg).setFontColor(e.fg)
        .setRanges([r]).build());
    });
  }

  var facturaCol = HEADERS.pedidos.indexOf('factura') + 1;
  if (facturaCol > 0) {
    var rf = hoja.getRange(2, facturaCol, nRows - 1, 1);
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('Sin factura').setBackground('#FFE8E8').setFontColor(C.cochinilla)
      .setRanges([rf]).build());
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('Facturado').setBackground('#C8ECC8').setFontColor(C.green)
      .setRanges([rf]).build());
  }

  if (rules.length) hoja.setConditionalFormatRules(rules);
}

// ════════════════════════════════════════════════════════════════════
// DASHBOARD — usa fórmulas QUERY, sin triggers
// El dropdown de mes actualiza todo automáticamente
// ════════════════════════════════════════════════════════════════════
function initDashboard() {
  var ss  = _getSS();
  var old = ss.getSheetByName('Dashboard');
  if (old) ss.deleteSheet(old);

  var dash = ss.insertSheet('Dashboard', 0);

  // ── Título ──────────────────────────────────────────────────────
  dash.getRange('A1:G1').merge()
    .setValue('ALIMENTARI B2B')
    .setBackground(C.dark).setFontColor(C.gold)
    .setFontSize(16).setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  dash.setRowHeight(1, 44);

  // ── Fila 2: selector de mes + stats ─────────────────────────────
  dash.getRange('A2').setValue('Mes')
    .setFontWeight('bold').setFontColor(C.muted).setFontSize(9)
    .setHorizontalAlignment('center').setVerticalAlignment('bottom');

  // Lista de meses disponibles en columna oculta J
  // (QUERY trae meses distintos de Pedidos ordenados desc)
  dash.getRange('J1').setFormula(
    "=IFERROR(QUERY(Pedidos!F2:F,\"SELECT Col1 WHERE Col1 <> '' GROUP BY Col1 ORDER BY Col1 DESC\",0),\"\")"
  );

  // Dropdown con validación apuntando a esa lista
  var mesCell = dash.getRange('B2');
  mesCell.setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInRange(dash.getRange('J1:J50'), true)
      .setAllowInvalid(true)
      .build()
  ).setValue(Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM'))
   .setFontSize(12).setFontWeight('bold').setFontColor(C.olive)
   .setHorizontalAlignment('center');

  // Stats con fórmulas COUNTIF (se actualizan solos)
  [
    { col: 'C', label: 'Pedidos',      formula: '=COUNTIF(Pedidos!F:F,B2)' },
    { col: 'D', label: 'Sin facturar', formula: '=COUNTIFS(Pedidos!F:F,B2,Pedidos!J:J,"Sin factura")' },
    { col: 'E', label: 'Entregados',   formula: '=COUNTIFS(Pedidos!F:F,B2,Pedidos!H:H,"Entregado")' },
    { col: 'F', label: 'Cancelados',   formula: '=COUNTIFS(Pedidos!F:F,B2,Pedidos!H:H,"Cancelado")' },
  ].forEach(function(s) {
    dash.getRange(s.col + '2').setValue(s.label)
      .setFontWeight('bold').setFontColor(C.muted).setFontSize(9)
      .setHorizontalAlignment('center').setVerticalAlignment('bottom');
    dash.getRange(s.col + '3').setFormula(s.formula)
      .setFontSize(18).setFontWeight('bold').setFontColor(C.dark)
      .setHorizontalAlignment('center');
  });

  dash.setRowHeight(2, 20);
  dash.setRowHeight(3, 36);

  // Línea separadora
  dash.getRange('A4:G4').merge()
    .setBackground(C.olive);
  dash.setRowHeight(4, 3);

  // ── Encabezados tabla (fila 5) ───────────────────────────────────
  ['Fecha', 'Cliente ID', 'Resumen', 'Estado', 'Pago', 'Factura', 'Notas'].forEach(function(h, i) {
    dash.getRange(5, i + 1)
      .setValue(h).setBackground(C.dark).setFontColor(C.cream)
      .setFontWeight('bold').setFontSize(9).setHorizontalAlignment('center');
  });
  dash.setRowHeight(5, 24);
  dash.setFrozenRows(5);

  // ── QUERY principal (fila 6) ─────────────────────────────────────
  // Columnas Pedidos: A=id B=clienteId C=items D=resumen E=fechaPedido
  //                   F=mes G=fecha H=estado I=pago J=factura K=notas
  dash.getRange('A6').setFormula(
    '=IFERROR(' +
      'QUERY(Pedidos!A:K,' +
        '"SELECT E,B,D,H,I,J,K ' +
        'WHERE F=\'"&B2&"\' ' +
        'ORDER BY E DESC",0),' +
    '"Sin pedidos para este mes")'
  );

  // ── Formato condicional en dashboard (estado y factura) ──────────
  var rules = [];
  var rEstado  = dash.getRange('D6:D500');
  var rFactura = dash.getRange('F6:F500');

  [
    { v: 'Recibido',   bg: '#FFF0C0', fg: '#5A4000' },
    { v: 'En proceso', bg: '#DFF0C8', fg: '#1A3800' },
    { v: 'Enviado',    bg: '#C8DEFF', fg: '#0A1E50' },
    { v: 'Entregado',  bg: '#C8ECC8', fg: '#1A4A1A' },
    { v: 'Cancelado',  bg: '#F0D0D0', fg: C.cochinilla },
  ].forEach(function(e) {
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo(e.v).setBackground(e.bg).setFontColor(e.fg)
      .setBold(true)
      .setRanges([rEstado]).build());
  });

  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('Sin factura').setBackground('#FFE8E8').setFontColor(C.cochinilla)
    .setRanges([rFactura]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('Facturado').setBackground('#C8ECC8').setFontColor(C.green)
    .setRanges([rFactura]).build());

  dash.setConditionalFormatRules(rules);

  // ── Anchos de columna ────────────────────────────────────────────
  dash.setColumnWidth(1, 90);
  dash.setColumnWidth(2, 110);
  dash.setColumnWidth(3, 280);
  dash.setColumnWidth(4, 95);
  dash.setColumnWidth(5, 85);
  dash.setColumnWidth(6, 95);
  dash.setColumnWidth(7, 160);

  // Ocultar columnas auxiliares J en adelante
  dash.hideColumns(8, 5);

  Logger.log('Dashboard creado con QUERY formulas.');
}
