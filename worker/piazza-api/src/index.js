const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Session-Token',
};

const SPREADSHEET_ID = '18G9oj6AN6JBrl4t3Rwga1NANzpnL7LW8JFDekdZh_bw';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ── Auth: verifica Google ID token ────────────────────────────────
async function verifyGoogleToken(token) {
  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${token}`);
  if (!res.ok) return null;
  const data = await res.json();
  if (data.error) return null;
  return data; // { email, name, ... }
}

async function getUsuario(db, email) {
  const row = await db.prepare('SELECT * FROM usuarios WHERE email = ?').bind(email).first();
  return row || null;
}

function generateToken() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function createSession(db, email) {
  const token = generateToken();
  const expiry = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 días
  await db.prepare('INSERT INTO sessions (token, email, expiry) VALUES (?, ?, ?)').bind(token, email, expiry).run();
  return token;
}

async function getSessionEmail(db, token) {
  if (!token) return null;
  const row = await db.prepare('SELECT email, expiry FROM sessions WHERE token = ?').bind(token).first();
  if (!row) return null;
  if (Date.now() > row.expiry) {
    await db.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
    return null;
  }
  return row.email;
}

// ── Sheets OAuth2: obtiene access token con refresh token ─────────
async function getSheetsToken(env) {
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

// ── Sync D1 → Sheets ──────────────────────────────────────────────
async function syncToSheets(db, env) {
  const token = await getSheetsToken(env);

  const [clientes, productos, pedidos] = await Promise.all([
    db.prepare('SELECT * FROM clientes').all(),
    db.prepare('SELECT * FROM productos').all(),
    db.prepare('SELECT * FROM pedidos').all(),
  ]);

  const sheets = [
    {
      range: 'clientes!A1',
      values: [
        ['id','nombre','contacto','tel','email','rfc','dir','dias','activo'],
        ...clientes.results.map(r => [r.id, r.nombre, r.contacto, r.tel, r.email, r.rfc, r.dir, r.dias, r.activo ? 'true' : 'false']),
      ],
    },
    {
      range: 'productos!A1',
      values: [
        ['id','nombre','cat','unidad','precio','disponible'],
        ...productos.results.map(r => [r.id, r.nombre, r.cat, r.unidad, r.precio, r.disponible]),
      ],
    },
    {
      range: 'pedidos!A1',
      values: [
        ['id','clienteId','items','resumen','fechaPedido','mes','fecha','estado','pago','factura','notas'],
        ...pedidos.results.map(r => [r.id, r.clienteId, r.items, r.resumen, r.fechaPedido, r.mes, r.fecha, r.estado, r.pago, r.factura, r.notas]),
      ],
    },
  ];

  // Limpiar y reescribir cada hoja
  for (const sheet of sheets) {
    const sheetName = sheet.range.split('!')[0];

    // Limpiar hoja
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${sheetName}!A1:Z10000:clear`,
      { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
    );

    // Escribir datos
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${sheet.range}?valueInputOption=RAW`,
      {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: sheet.values }),
      }
    );
  }

  return { ok: true, clientes: clientes.results.length, productos: productos.results.length, pedidos: pedidos.results.length };
}

// ── Handlers GET ──────────────────────────────────────────────────
async function handleGetAll(db) {
  const [clientes, productos, pedidos] = await Promise.all([
    db.prepare('SELECT * FROM clientes').all(),
    db.prepare('SELECT * FROM productos').all(),
    db.prepare('SELECT * FROM pedidos').all(),
  ]);
  return {
    clientes:  clientes.results.map(r => ({ ...r, activo: r.activo ? 'true' : 'false' })),
    productos: productos.results,
    pedidos:   pedidos.results,
  };
}

// ── Handlers POST ─────────────────────────────────────────────────
async function handlePost(db, body, env) {
  const { action, data, id, cambios } = body;

  // ── Sync manual ──
  if (action === 'syncSheets') {
    return syncToSheets(db, env);
  }

  // ── Clientes ──
  if (action === 'addCliente') {
    const newId_ = newId();
    await db.prepare(
      'INSERT INTO clientes (id,nombre,contacto,tel,email,rfc,dir,dias,activo,tipo,estatus_prospecto,interes) VALUES (?,?,?,?,?,?,?,?,1,?,?,?)'
    ).bind(newId_, data.nombre, data.contacto||'', data.tel||'', data.email||'',
            data.rfc||'', data.dir||'', data.dias||'',
            data.tipo||'cliente', data.estatus_prospecto||'', data.interes||'').run();
    return { ok: true, id: newId_ };
  }

  if (action === 'updateCliente') {
    const fields = Object.keys(cambios).map(k => `${k}=?`).join(',');
    const vals = Object.values(cambios);
    await db.prepare(`UPDATE clientes SET ${fields} WHERE id=?`).bind(...vals, id).run();
    return { ok: true };
  }

  if (action === 'deleteCliente') {
    await db.prepare('UPDATE clientes SET activo=0 WHERE id=?').bind(id).run();
    return { ok: true };
  }

  // ── Productos ──
  if (action === 'addProducto') {
    const newId_ = newId();
    await db.prepare(
      'INSERT INTO productos (id,nombre,cat,unidad,precio,disponible) VALUES (?,?,?,?,?,?)'
    ).bind(newId_, data.nombre, data.cat||'', data.unidad||'', data.precio||'', 'true').run();
    return { ok: true, id: newId_ };
  }

  if (action === 'updateProducto') {
    const fields = Object.keys(cambios).map(k => `${k}=?`).join(',');
    const vals = Object.values(cambios);
    await db.prepare(`UPDATE productos SET ${fields} WHERE id=?`).bind(...vals, id).run();
    return { ok: true };
  }

  if (action === 'deleteProducto') {
    await db.prepare("UPDATE productos SET disponible='borrado' WHERE id=?").bind(id).run();
    return { ok: true };
  }

  // ── Pedidos ──
  if (action === 'addPedido') {
    const newId_ = newId();
    const items = typeof data.items === 'string' ? data.items : JSON.stringify(data.items);
    await db.prepare(
      'INSERT INTO pedidos (id,clienteId,items,resumen,fechaPedido,mes,fecha,estado,pago,factura,notas) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
    ).bind(newId_, data.clienteId, items, data.resumen||'', data.fechaPedido||'',
            data.mes||'', data.fecha||'', data.estado||'pendiente',
            data.pago||'', data.factura||'', data.notas||'').run();
    return { ok: true, id: newId_ };
  }

  if (action === 'updatePedido') {
    const updates = { ...cambios };
    if (updates.items && typeof updates.items !== 'string') {
      updates.items = JSON.stringify(updates.items);
    }
    const fields = Object.keys(updates).map(k => `${k}=?`).join(',');
    const vals = Object.values(updates);
    await db.prepare(`UPDATE pedidos SET ${fields} WHERE id=?`).bind(...vals, id).run();
    return { ok: true };
  }

  if (action === 'deletePedido') {
    await db.prepare("UPDATE pedidos SET estado='Cancelado' WHERE id=?").bind(id).run();
    return { ok: true };
  }

  // ── Usuarios ──
  if (action === 'addUsuario') {
    await db.prepare(
      'INSERT OR IGNORE INTO usuarios (email,nombre,rol) VALUES (?,?,?)'
    ).bind(data.email, data.nombre||'', data.rol||'usuario').run();
    return { ok: true };
  }

  if (action === 'deleteUsuario') {
    await db.prepare('DELETE FROM usuarios WHERE email=?').bind(id).run();
    return { ok: true };
  }

  return { error: 'Acción no reconocida: ' + action };
}

// ── Entry point ───────────────────────────────────────────────────
export default {
  // Cron diario: dispara sync automático a las 6am UTC (1am Ciudad de México)
  async scheduled(event, env, ctx) {
    ctx.waitUntil(syncToSheets(env.DB, env));
  },

  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    const url = new URL(request.url);
    const action = url.searchParams.get('action');

    try {
      // ── Login: antes del middleware de auth ──
      if (request.method === 'POST') {
        const body = await request.json();
        if (body.action === 'login') {
          const googleUser = await verifyGoogleToken(body.idToken);
          if (!googleUser) return json({ error: 'Token inválido' }, 401);
          const usuario = await getUsuario(env.DB, googleUser.email);
          if (!usuario) return json({ error: 'Acceso denegado' }, 403);
          const sessionToken = await createSession(env.DB, googleUser.email);
          return json({ ok: true, sessionToken, usuario: { ...usuario, nombre: googleUser.name } });
        }

        // ── Auth para el resto de POSTs ──
        const sessionToken = request.headers.get('X-Session-Token') || '';
        const email = await getSessionEmail(env.DB, sessionToken);
        if (!email) return json({ error: 'Sesión inválida o expirada' }, 401);
        const usuario = await getUsuario(env.DB, email);
        if (!usuario) return json({ error: 'Acceso denegado' }, 403);

        return json(await handlePost(env.DB, body, env));
      }

      // ── Auth para GETs ──
      const sessionToken = request.headers.get('X-Session-Token') || '';
      const email = await getSessionEmail(env.DB, sessionToken);
      if (!email) return json({ error: 'Sesión inválida o expirada' }, 401);
      const usuario = await getUsuario(env.DB, email);
      if (!usuario) return json({ error: 'Acceso denegado' }, 403);

      if (request.method === 'GET') {
        if (action === 'getAll') return json(await handleGetAll(env.DB));
        if (action === 'getUsuarios') {
          const rows = await env.DB.prepare('SELECT email,nombre,rol FROM usuarios').all();
          return json(rows.results);
        }
        return json({ error: 'Acción no válida' }, 400);
      }

      return new Response('Method not allowed', { status: 405, headers: CORS });

    } catch (err) {
      return json({ error: err.message }, 500);
    }
  }
};
