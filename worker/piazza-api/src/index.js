const SPREADSHEET_ID = '18G9oj6AN6JBrl4t3Rwga1NANzpnL7LW8JFDekdZh_bw';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// ── OAuth: obtiene access token desde refresh token ──────────────
async function getAccessToken(env) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: env.GOOGLE_REFRESH_TOKEN,
      grant_type:    'refresh_token',
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('No se pudo obtener access token: ' + JSON.stringify(data));
  return data.access_token;
}

// ── Sheets helpers ────────────────────────────────────────────────
async function sheetsGet(token, range) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}`;
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  const data = await res.json();
  return data.values || [];
}

async function sheetsAppend(token, range, values) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values }),
  });
  return res.json();
}

async function sheetsUpdate(token, range, values) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}?valueInputOption=RAW`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values }),
  });
  return res.json();
}

async function sheetsBatchGet(token) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values:batchGet?ranges=clientes&ranges=productos&ranges=pedidos`;
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  return res.json();
}

// ── Parsear filas a objetos ───────────────────────────────────────
function parseSheet(rows, headers) {
  if (!rows || rows.length < 2) return [];
  return rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i] ?? '');
    return obj;
  });
}

const HEADERS = {
  clientes:  ['id','nombre','contacto','tel','email','rfc','dir','dias','activo'],
  productos: ['id','nombre','cat','unidad','precio','disponible'],
  pedidos:   ['id','clienteId','items','resumen','fechaPedido','mes','fecha','estado','pago','factura','notas'],
};

// ── Handlers ──────────────────────────────────────────────────────
async function handleGetAll(token) {
  const batch = await sheetsBatchGet(token);
  const [c, p, pe] = batch.valueRanges || [];
  return {
    clientes:  parseSheet(c?.values,  HEADERS.clientes),
    productos: parseSheet(p?.values,  HEADERS.productos),
    pedidos:   parseSheet(pe?.values, HEADERS.pedidos),
  };
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

async function handlePost(token, body) {
  const { action, data, id, cambios } = body;

  if (action === 'addCliente') {
    const row = [newId(), data.nombre, data.contacto, data.tel, data.email, data.rfc, data.dir, data.dias, 'true'];
    await sheetsAppend(token, 'clientes', [row]);
    return { ok: true };
  }

  if (action === 'addProducto') {
    const row = [newId(), data.nombre, data.cat, data.unidad, data.precio, 'true'];
    await sheetsAppend(token, 'productos', [row]);
    return { ok: true };
  }

  if (action === 'addPedido') {
    const row = [newId(), data.clienteId, JSON.stringify(data.items), data.resumen,
      data.fechaPedido, data.mes, data.fecha, data.estado || 'pendiente', data.pago || '', data.factura || '', data.notas || ''];
    await sheetsAppend(token, 'pedidos', [row]);
    return { ok: true };
  }

  if (action === 'updateCliente' || action === 'deleteCliente') {
    return await updateRow(token, 'clientes', HEADERS.clientes, id, cambios, action === 'deleteCliente' ? { activo: 'false' } : cambios);
  }

  if (action === 'updateProducto' || action === 'deleteProducto') {
    return await updateRow(token, 'productos', HEADERS.productos, id, cambios, action === 'deleteProducto' ? { disponible: 'false' } : cambios);
  }

  if (action === 'updatePedido' || action === 'deletePedido') {
    return await updateRow(token, 'pedidos', HEADERS.pedidos, id, cambios, action === 'deletePedido' ? { estado: 'borrado' } : cambios);
  }

  return { error: 'Acción no reconocida: ' + action };
}

async function updateRow(token, sheet, headers, id, cambios, overrideCambios) {
  const rows = await sheetsGet(token, sheet);
  const idx = rows.findIndex((r, i) => i > 0 && r[0] === id);
  if (idx === -1) return { error: 'No encontrado: ' + id };
  const row = [...rows[idx]];
  const updates = overrideCambios || cambios;
  Object.entries(updates).forEach(([k, v]) => {
    const col = headers.indexOf(k);
    if (col !== -1) row[col] = v;
  });
  const rowNum = idx + 1;
  await sheetsUpdate(token, `${sheet}!A${rowNum}`, [row]);
  return { ok: true };
}

// ── Entry point ───────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    try {
      const token = await getAccessToken(env);

      if (request.method === 'GET') {
        const url = new URL(request.url);
        const action = url.searchParams.get('action');
        if (action === 'getAll') {
          const result = await handleGetAll(token);
          return new Response(JSON.stringify(result), {
            headers: { ...CORS, 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ error: 'Acción no válida' }), { status: 400, headers: CORS });
      }

      if (request.method === 'POST') {
        const body = await request.json();
        const result = await handlePost(token, body);
        return new Response(JSON.stringify(result), {
          headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      }

      return new Response('Method not allowed', { status: 405, headers: CORS });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }
  }
};
