  const SPREADSHEET_ID = '18G9oj6AN6JBrl4t3Rwga1NANzpnL7LW8JFDekdZh_bw';

  // ── Acceso autorizado ─────────────────────────────────────────
  // ADMIN: pablo.aranda@piazza-pasticcio.com
  const EMAILS_AUTORIZADOS = [
    'pablo.aranda@piazza-pasticcio.com',
    'sofia.acuna@gruppo-pasticcio.com',
    'ale.1804h@gmail.com',
    'tortortiz@gmail.com',
    'pbloaranda@gmail.com',
    // 'admon@...completar dominio'
  ];

  const HOJA_CLIENTES  = 'clientes';
  const HOJA_PRODUCTOS = 'productos';
  const HOJA_PEDIDOS   = 'pedidos';

  const HEADERS = {
    clientes:  ['id','nombre','contacto','tel','email','rfc','dir','dias','activo'],
    productos: ['id','nombre','cat','unidad','precio','disponible'],
    pedidos:  ['id','clienteId','items','resumen','fechaPedido','mes',
  'fecha','estado','pago','factura','notas']
  };

  // ── Sirve la app con verificación de acceso ──────────────────
  function doGet(e) {
    // API endpoint para lectura desde GitHub Pages (sin sesión)
    if (e && e.parameter && e.parameter.action === 'getAll') {
      const data = serverGetAll();
      return ContentService.createTextOutput(JSON.stringify(data))
        .setMimeType(ContentService.MimeType.JSON);
    }
    const email = Session.getActiveUser().getEmail();
    if (!EMAILS_AUTORIZADOS.includes(email)) {
      return HtmlService.createHtmlOutput(
        '<div style="font-family:sans-serif;text-align:center;padding:60px">' +
        '<h2>Acceso no autorizado</h2>' +
        '<p>Tu cuenta <strong>' + email + '</strong> no tiene acceso a esta aplicación.</p>' +
        '<p>Contacta a pablo.aranda@piazza-pasticcio.com</p>' +
        '</div>'
      ).setTitle('Acceso restringido');
    }
    return HtmlService.createHtmlOutputFromFile('Index')
      .setTitle('Alimentari – Pedidos B2B')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  function doPost(e) {
    try {
      const data = JSON.parse(e.postData.contents);
      let result;
      if (data.action === 'addCliente')     result = serverAddCliente(data.data);
      if (data.action === 'deleteCliente')  result = serverDeleteCliente(data.id);
      if (data.action === 'addProducto')    result = serverAddProducto(data.data);
      if (data.action === 'updateProducto') result = serverUpdateProducto(data.id, data.cambios);
      if (data.action === 'deleteProducto') result = serverDeleteProducto(data.id);
      if (data.action === 'addPedido')      result = serverAddPedido(data.data);
      if (data.action === 'updatePedido')   result = serverUpdatePedido(data.id, data.cambios);
      if (data.action === 'deletePedido')   result = serverDeletePedido(data.id);
      return ContentService.createTextOutput(JSON.stringify(result || { ok: true }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ error: err.message }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // ── Init hojas ───────────────────────────────────────────────
  function initSheets() {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    Object.entries(HEADERS).forEach(([nombre, cols]) => {
      let hoja = ss.getSheetByName(nombre);
      if (!hoja) {
        hoja = ss.insertSheet(nombre);
        hoja.getRange(1, 1, 1, cols.length).setValues([cols]);
        hoja.setFrozenRows(1);
        hoja.getRange(1, 1, 1, cols.length)
            .setBackground('#1A1612')
            .setFontColor('#F5F0E8')
            .setFontWeight('bold');
      }
    });
  }

  // ── Helpers ──────────────────────────────────────────────────
  function getHoja(nombreHoja) {
    const ss   = SpreadsheetApp.openById(SPREADSHEET_ID);
    const hoja = ss.getSheetByName(nombreHoja);
    if (!hoja) return [];
    const data = hoja.getDataRange().getValues();
    if (data.length <= 1) return [];
    const headers = data[0];
    return data.slice(1).map(row => {
      const obj = {};
      headers.forEach((h, i) => {
        let val = row[i];
        if (val instanceof Date) val = val.toISOString().slice(0,
  10);
        if (h) obj[h] = val;
      });
      if (nombreHoja === HOJA_PEDIDOS && obj.items) {
        try { obj.items = JSON.parse(obj.items); } catch(e) {
  obj.items = []; }
      }
      return obj;
    });
  }

  function appendRow(nombreHoja, dato) {
    const ss      = SpreadsheetApp.openById(SPREADSHEET_ID);
    const hoja    = ss.getSheetByName(nombreHoja);
    const headers = HEADERS[nombreHoja];
    const fila    = headers.map(h => {
      if (h === 'items') return JSON.stringify(dato[h] || []);
      return dato[h] !== undefined ? dato[h] : '';
    });
    hoja.appendRow(fila);
    return { ok: true };
  }

  
  function updateRow(nombreHoja, id, cambios) {                                                                                                                                                                
    const ss      = SpreadsheetApp.openById(SPREADSHEET_ID);
    const hoja    = ss.getSheetByName(nombreHoja);                                                                                                                                                             
    const data    = hoja.getDataRange().getValues();        
    const headers = data[0];
    const idIdx   = headers.indexOf('id');
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][idIdx]).trim() === String(id).trim()) {
        Object.entries(cambios).forEach(([campo, valor]) => {
          const colIdx = headers.indexOf(campo);
          if (colIdx >= 0) {
            hoja.getRange(i + 1, colIdx + 1).setValue(
              campo === 'items' ? JSON.stringify(valor) : valor
            );
          }
        });
        return { ok: true };
      }
    }
    return { ok: false, error: 'No encontrado' };
  }

  function deleteRow(nombreHoja, id) {
    const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    const hoja  = ss.getSheetByName(nombreHoja);
    const data  = hoja.getDataRange().getValues();
    const idIdx = data[0].indexOf('id');
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][idIdx]).trim() === String(id).trim()) {
        hoja.deleteRow(i + 1);
        return { ok: true };
      }
    }
    return { ok: false };
  }
  // ── Funciones del servidor ───────────────────────────────────
  function serverGetAll() {
    return {
      clientes:  getHoja(HOJA_CLIENTES),
      productos: getHoja(HOJA_PRODUCTOS),
      pedidos:   getHoja(HOJA_PEDIDOS)
    };
  }

  function serverAddCliente(data)            { data.activo = '1'; return appendRow(HOJA_CLIENTES, data); }
  function serverDeleteCliente(id)           { return updateRow(HOJA_CLIENTES, id, { activo: '0' }); }
  function serverAddProducto(data)           { return appendRow(HOJA_PRODUCTOS, data); }
  function serverUpdateProducto(id, cambios) { return updateRow(HOJA_PRODUCTOS, id, cambios); }
  function serverDeleteProducto(id)          { return updateRow(HOJA_PRODUCTOS, id, { disponible: 0 }); }
  function serverAddPedido(data)             { return appendRow(HOJA_PEDIDOS, data); }
  function serverUpdatePedido(id, cambios)   { return updateRow(HOJA_PEDIDOS, id, cambios); }
  function serverDeletePedido(id)            { return updateRow(HOJA_PEDIDOS, id, { estado: 'Cancelado' }); }

  function testGetAll() { Logger.log(JSON.stringify(serverGetAll())); }
  
  