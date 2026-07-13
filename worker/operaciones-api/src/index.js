import { mergeZoneMap, mergeCorrections, mergeManuales, mergeCompletedZones } from '../../../js/sesion-merge.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Session-Token, X-Sync-Token, X-Admin-Password, X-Admin-User',
};

// Revisores que participan en aprobaciones
const REVISORES = ['pablo', 'javier', 'matteo'];
// Mínimo de aprobaciones para que un registro pase a 'aprobado'
const MIN_APROBACIONES = 2;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ── Auth ───────────────────────────────────────────────────────────────────

async function hashPassword(password) {
  const enc = new TextEncoder().encode(password);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateToken() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function getSession(db, token) {
  if (!token) return null;
  const row = await db.prepare('SELECT s.usuario_id, s.expiry, u.nombre, u.area, u.rol FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id WHERE s.token = ?').bind(token).first();
  if (!row) return null;
  if (Date.now() > row.expiry) {
    await db.prepare('DELETE FROM sesiones WHERE token = ?').bind(token).run();
    return null;
  }
  return row; // { usuario_id, expiry, nombre, area, rol }
}

// ── Lógica de aprobaciones ─────────────────────────────────────────────────

async function recalcularEstado(db, tipo, registroId) {
  const aprobaciones = await db.prepare(
    'SELECT decision FROM aprobaciones WHERE registro_tipo = ? AND registro_id = ?'
  ).bind(tipo, registroId).all();

  const rows = aprobaciones.results;
  const enRevision = rows.filter(r => r.decision === 'en_revision').length;
  const aprobados  = rows.filter(r => r.decision === 'aprobado').length;
  const rechazados = rows.filter(r => r.decision === 'rechazado').length;

  let nuevoEstado;
  if (rechazados > 0)           nuevoEstado = 'rechazado';
  else if (enRevision > 0)      nuevoEstado = 'en_revision';
  else if (aprobados >= MIN_APROBACIONES) nuevoEstado = 'aprobado';
  else                          nuevoEstado = 'pendiente';

  const tabla = tipo === 'produccion' ? 'producciones' : 'mermas';
  await db.prepare(`UPDATE ${tabla} SET estado = ? WHERE id = ?`).bind(nuevoEstado, registroId).run();
  return nuevoEstado;
}

// ── Handlers GET ───────────────────────────────────────────────────────────

async function handleGet(db, action, session, url) {
  // Catálogos (cualquier usuario autenticado)
  if (action === 'getCatalogo') {
    const almacen = url.searchParams.get('almacen') || session.area;
    const rows = await db.prepare(
      'SELECT codigo, nombre, grupo, subgrupo, unidad FROM catalogo_articulos WHERE almacen = ? ORDER BY nombre'
    ).bind(almacen).all();
    return json(rows.results);
  }

  if (action === 'getSubrecetas') {
    const rows = await db.prepare(
      'SELECT codigo, nombre, rendimiento, unidad FROM catalogo_subrecetas ORDER BY nombre'
    ).all();
    return json(rows.results);
  }

  if (action === 'getIngredientes') {
    const codigo = url.searchParams.get('subreceta');
    if (!codigo) return json({ error: 'Falta subreceta' }, 400);
    const rows = await db.prepare(
      'SELECT ingrediente_codigo, ingrediente_nombre, cantidad, unidad FROM catalogo_ingredientes WHERE subreceta_codigo = ?'
    ).bind(codigo).all();
    return json(rows.results);
  }

  // Producciones y mermas — admin/almacen ven todo, otros solo su área
  if (action === 'getPendientes') {
    const esAdmin = ['admin', 'revisor'].includes(session.rol) || ['ADMIN', 'ALMACEN'].includes(session.area);
    const areaFiltro = esAdmin ? null : session.area;

    let prodQuery = 'SELECT p.*, u.nombre as encargado_nombre FROM producciones p JOIN usuarios u ON u.id = p.encargado_id WHERE p.estado != "cargado" AND p.estado != "rechazado"';
    let mermaQuery = 'SELECT m.*, u.nombre as encargado_nombre FROM mermas m JOIN usuarios u ON u.id = m.encargado_id WHERE m.estado != "cargado" AND m.estado != "rechazado"';

    if (areaFiltro) {
      prodQuery  += ` AND p.area = '${areaFiltro}'`;
      mermaQuery += ` AND m.area = '${areaFiltro}'`;
    }
    prodQuery  += ' ORDER BY p.fecha DESC';
    mermaQuery += ' ORDER BY m.fecha DESC';

    const [prods, mermas] = await Promise.all([
      db.prepare(prodQuery).all(),
      db.prepare(mermaQuery).all(),
    ]);

    // Cargar mise en place para cada producción
    const prodIds = prods.results.map(p => p.id);
    let miseMap = {};
    if (prodIds.length > 0) {
      const placeholders = prodIds.map(() => '?').join(',');
      const mise = await db.prepare(
        `SELECT * FROM mise_en_place WHERE produccion_id IN (${placeholders})`
      ).bind(...prodIds).all();
      for (const m of mise.results) {
        if (!miseMap[m.produccion_id]) miseMap[m.produccion_id] = [];
        miseMap[m.produccion_id].push(m);
      }
    }

    // Cargar aprobaciones
    const allIds = [...prods.results.map(p => `produccion:${p.id}`), ...mermas.results.map(m => `merma:${m.id}`)];
    let aprobMap = {};
    if (allIds.length > 0) {
      const aprobRows = await db.prepare(
        'SELECT * FROM aprobaciones WHERE registro_tipo || ":" || registro_id IN (' + allIds.map(() => '?').join(',') + ')'
      ).bind(...allIds).all();
      for (const a of aprobRows.results) {
        const key = `${a.registro_tipo}:${a.registro_id}`;
        if (!aprobMap[key]) aprobMap[key] = [];
        aprobMap[key].push(a);
      }
    }

    return json({
      producciones: prods.results.map(p => ({
        ...p,
        mise_en_place: miseMap[p.id] || [],
        aprobaciones: aprobMap[`produccion:${p.id}`] || [],
      })),
      mermas: mermas.results.map(m => ({
        ...m,
        aprobaciones: aprobMap[`merma:${m.id}`] || [],
      })),
    });
  }

  if (action === 'getUsuarios') {
    if (session.rol !== 'admin') return json({ error: 'Sin permiso' }, 403);
    const rows = await db.prepare('SELECT id, nombre, area, rol FROM usuarios ORDER BY nombre').all();
    return json(rows.results);
  }

  return json({ error: 'Acción no válida' }, 400);
}

// ── Handlers POST ──────────────────────────────────────────────────────────

async function handlePost(db, body, session, env) {
  const { action, data, id, cambios } = body;

  // ── Producciones ──
  if (action === 'addProduccion') {
    const newId_ = newId();
    await db.prepare(
      'INSERT INTO producciones (id,fecha,subreceta_codigo,subreceta_nombre,cantidad_producida,rendimiento,unidad,encargado_id,area,estado,notas,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'
    ).bind(
      newId_, data.fecha, data.subreceta_codigo, data.subreceta_nombre,
      data.cantidad_producida, data.rendimiento || null, data.unidad || '',
      session.usuario_id, session.area, 'pendiente', data.notas || '',
      Date.now()
    ).run();

    // Guardar mise en place
    if (data.mise_en_place && data.mise_en_place.length > 0) {
      for (const item of data.mise_en_place) {
        await db.prepare(
          'INSERT INTO mise_en_place (id,produccion_id,ingrediente_codigo,ingrediente_nombre,cantidad_esperada,cantidad_real,unidad) VALUES (?,?,?,?,?,?,?)'
        ).bind(
          newId(), newId_, item.ingrediente_codigo, item.ingrediente_nombre,
          item.cantidad_esperada, item.cantidad_real, item.unidad || ''
        ).run();
      }
    }
    return json({ ok: true, id: newId_ });
  }

  // ── Mermas ──
  if (action === 'addMerma') {
    const newId_ = newId();
    await db.prepare(
      'INSERT INTO mermas (id,fecha,articulo_codigo,articulo_nombre,almacen,cantidad,unidad,encargado_id,area,estado,comentario,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'
    ).bind(
      newId_, data.fecha, data.articulo_codigo, data.articulo_nombre,
      data.almacen, data.cantidad, data.unidad || '',
      session.usuario_id, session.area, 'pendiente', data.comentario || '',
      Date.now()
    ).run();
    return json({ ok: true, id: newId_ });
  }

  // ── Aprobaciones ──
  if (action === 'aprobar') {
    if (!['revisor', 'admin'].includes(session.rol)) return json({ error: 'Sin permiso para aprobar' }, 403);

    const { registro_tipo, registro_id, decision, comentario } = data;
    if (!['aprobado', 'en_revision', 'rechazado'].includes(decision)) {
      return json({ error: 'Decision inválida' }, 400);
    }
    if (decision === 'en_revision' && !comentario) {
      return json({ error: 'Comentario requerido para en_revision' }, 400);
    }

    // Upsert: si ya existe una aprobación de este revisor para este registro, actualizar
    const existing = await db.prepare(
      'SELECT id FROM aprobaciones WHERE registro_tipo = ? AND registro_id = ? AND revisor_id = ?'
    ).bind(registro_tipo, registro_id, session.usuario_id).first();

    if (existing) {
      await db.prepare(
        'UPDATE aprobaciones SET decision = ?, comentario = ?, created_at = ? WHERE id = ?'
      ).bind(decision, comentario || '', Date.now(), existing.id).run();
    } else {
      await db.prepare(
        'INSERT INTO aprobaciones (id,registro_tipo,registro_id,revisor_id,decision,comentario,created_at) VALUES (?,?,?,?,?,?,?)'
      ).bind(newId(), registro_tipo, registro_id, session.usuario_id, decision, comentario || '', Date.now()).run();
    }

    const nuevoEstado = await recalcularEstado(db, registro_tipo, registro_id);
    return json({ ok: true, estado: nuevoEstado });
  }

  // ── Marcar como cargado (solo admin, post-carga xetux) ──
  if (action === 'marcarCargado') {
    if (session.rol !== 'admin') return json({ error: 'Sin permiso' }, 403);
    const tabla = data.tipo === 'produccion' ? 'producciones' : 'mermas';
    await db.prepare(`UPDATE ${tabla} SET estado = 'cargado' WHERE id = ?`).bind(data.id).run();
    return json({ ok: true });
  }

  // ── Gestión de usuarios (solo admin) ──
  if (action === 'addUsuario') {
    if (session.rol !== 'admin') return json({ error: 'Sin permiso' }, 403);
    const hash = await hashPassword(data.password);
    const newId_ = newId();
    await db.prepare(
      'INSERT INTO usuarios (id,nombre,area,rol,password_hash) VALUES (?,?,?,?,?)'
    ).bind(newId_, data.nombre, data.area, data.rol || 'captura', hash).run();
    return json({ ok: true, id: newId_ });
  }

  if (action === 'updateUsuario') {
    if (session.rol !== 'admin') return json({ error: 'Sin permiso' }, 403);
    const updates = { ...cambios };
    if (updates.password) {
      updates.password_hash = await hashPassword(updates.password);
      delete updates.password;
    }
    const fields = Object.keys(updates).map(k => `${k}=?`).join(',');
    await db.prepare(`UPDATE usuarios SET ${fields} WHERE id=?`).bind(...Object.values(updates), id).run();
    return json({ ok: true });
  }

  if (action === 'deleteUsuario') {
    if (session.rol !== 'admin') return json({ error: 'Sin permiso' }, 403);
    await db.prepare('DELETE FROM usuarios WHERE id = ?').bind(id).run();
    return json({ ok: true });
  }

  // ── Sync catálogo (llamado desde el scraper) ──
  if (action === 'syncCatalogo') {
    if (session.rol !== 'admin') return json({ error: 'Sin permiso' }, 403);
    const { articulos, subrecetas, ingredientes } = data;
    const now = Date.now();

    if (articulos) {
      for (const a of articulos) {
        await db.prepare(
          'INSERT OR REPLACE INTO catalogo_articulos (codigo,nombre,grupo,subgrupo,unidad,almacen,updated_at) VALUES (?,?,?,?,?,?,?)'
        ).bind(a.codigo, a.nombre, a.grupo || '', a.subgrupo || '', a.unidad || '', a.almacen, now).run();
      }
    }

    if (subrecetas) {
      for (const s of subrecetas) {
        await db.prepare(
          'INSERT OR REPLACE INTO catalogo_subrecetas (codigo,nombre,rendimiento,unidad,updated_at) VALUES (?,?,?,?,?)'
        ).bind(s.codigo, s.nombre, s.rendimiento || null, s.unidad || '', now).run();
      }
    }

    if (ingredientes) {
      for (const i of ingredientes) {
        await db.prepare(
          'INSERT OR REPLACE INTO catalogo_ingredientes (id,subreceta_codigo,ingrediente_codigo,ingrediente_nombre,cantidad,unidad) VALUES (?,?,?,?,?,?)'
        ).bind(
          `${i.subreceta_codigo}:${i.ingrediente_codigo}`,
          i.subreceta_codigo, i.ingrediente_codigo, i.ingrediente_nombre,
          i.cantidad, i.unidad || ''
        ).run();
      }
    }

    return json({ ok: true });
  }

  return json({ error: 'Acción no reconocida: ' + action });
}

// ── Cron: notificación sábados + último día del mes ────────────────────────

async function enviarNotificaciones(db, env) {
  const hoy = new Date();
  const esUltimoDia = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate() === hoy.getDate();
  if (hoy.getDay() !== 6 && !esUltimoDia) return; // solo sábado o último día del mes

  const areas = ['COCINA', 'BARRA', 'SALUMERIA'];
  const canales = {
    COCINA:    env.SLACK_CANAL_COCINA,
    BARRA:     env.SLACK_CANAL_BARRA,
    SALUMERIA: env.SLACK_CANAL_SALUMERIA,
    ADMIN:     env.SLACK_CANAL_ADMIN,
  };

  const resumenAdmin = [];

  for (const area of areas) {
    const prods = await db.prepare(
      "SELECT COUNT(*) as n FROM producciones WHERE area = ? AND estado IN ('pendiente','en_revision')"
    ).bind(area).first();
    const mermas = await db.prepare(
      "SELECT COUNT(*) as n FROM mermas WHERE area = ? AND estado IN ('pendiente','en_revision')"
    ).first();

    const nProd  = prods?.n  || 0;
    const nMerma = mermas?.n || 0;
    if (nProd === 0 && nMerma === 0) continue;

    const msg = `*Revision pendiente — ${area}*\n${nProd} produccion(es) y ${nMerma} merma(s) esperan autorización.`;
    resumenAdmin.push(msg);
    await postSlack(canales[area], msg, env);
  }

  if (resumenAdmin.length > 0) {
    await postSlack(canales.ADMIN, resumenAdmin.join('\n\n'), env);
  }
}

async function postSlack(canal, texto, env) {
  if (!canal || !env.SLACK_BOT_TOKEN) return;
  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.SLACK_BOT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel: canal, text: texto }),
  });
}

// ── Inventario sync (sin auth) ─────────────────────────────────────────────

async function handleInvGet(db, url) {
  const path = url.pathname;

  if (path === '/inv/plantilla') {
    const almacen = url.searchParams.get('almacen');
    if (!almacen) return json({ error: 'Falta almacen' }, 400);
    const row = await db.prepare(
      'SELECT row_map, cantidad_col_idx, pres_map, unit_map, default_pres, raw, original_filename, template_hash, updated_at FROM inv_plantillas WHERE almacen = ?'
    ).bind(almacen).first();
    if (!row) return json({ ok: true, found: false });
    return json({
      ok: true, found: true,
      rowMap: JSON.parse(row.row_map),
      cantidadColIdx: row.cantidad_col_idx,
      presMap: row.pres_map ? JSON.parse(row.pres_map) : {},
      unitMap: row.unit_map ? JSON.parse(row.unit_map) : {},
      defaultPres: row.default_pres ? JSON.parse(row.default_pres) : {},
      raw: row.raw,
      originalFilename: row.original_filename || '',
      templateHash: row.template_hash || '',
      updatedAt: row.updated_at
    });
  }

  if (path === '/inv/sesion') {
    const almacen = url.searchParams.get('almacen');
    const fecha   = url.searchParams.get('fecha');
    if (!almacen || !fecha) return json({ error: 'Falta almacen o fecha' }, 400);
    let row;
    try {
      row = await db.prepare(
        `SELECT operario, fecha, counts, counts_by_zone, pres_choice_by_zone,
                corrections_by_zone, completed_zones, locked_zones, manuales, template_hash, updated_at,
                exported_at, exported_by, zone_config_id, zone_snapshot, operarios_by_device
         FROM inv_sesiones WHERE almacen = ? AND fecha = ?`
      ).bind(almacen, fecha).first();
    } catch (err) {
      row = await db.prepare(
        `SELECT operario, fecha, counts, counts_by_zone, pres_choice_by_zone,
                completed_zones, locked_zones, manuales, template_hash, updated_at
         FROM inv_sesiones WHERE almacen = ? AND fecha = ?`
      ).bind(almacen, fecha).first();
    }
    if (!row) return json({ ok: true, found: false });
    return json({
      ok: true, found: true,
      operario:         row.operario,
      fecha:            row.fecha,
      templateHash:     row.template_hash || '',
      countsByZone:     JSON.parse(row.counts_by_zone || '{}'),
      presChoiceByZone: JSON.parse(row.pres_choice_by_zone || '{}'),
      correctionsByZone: JSON.parse(row.corrections_by_zone || '{}'),
      completedZones:   JSON.parse(row.completed_zones || '[]'),
      lockedZones:      JSON.parse(row.locked_zones || '{}'),
      manuales:         JSON.parse(row.manuales || '[]'),
      counts:           JSON.parse(row.counts || '{}'), // legacy barra.html
      exportedAt:       row.exported_at || '',
      exportedBy:       row.exported_by || '',
      zoneConfigId:     row.zone_config_id || '',
      zoneSnapshot:     row.zone_snapshot ? JSON.parse(row.zone_snapshot) : null,
      operariosByDevice: JSON.parse(row.operarios_by_device || '{}'),
      updatedAt:        row.updated_at
    });
  }

  if (path === '/inv/zone-config') {
    const almacen = url.searchParams.get('almacen');
    if (!almacen) return json({ error: 'Falta almacen' }, 400);
    // Sin id: la config activa (la que usa inventario.html al iniciar toma).
    // Con id o all=1: para el editor de admin.
    const id = url.searchParams.get('id');
    if (url.searchParams.get('all') === '1') {
      const rows = await db.prepare(
        'SELECT id, almacen, template_hash, active, created_at, updated_at FROM inv_zone_configs WHERE almacen = ? ORDER BY updated_at DESC'
      ).bind(almacen).all();
      return json({ ok: true, configs: rows.results || [] });
    }
    const row = id
      ? await db.prepare('SELECT * FROM inv_zone_configs WHERE id = ? AND almacen = ?').bind(id, almacen).first()
      : await db.prepare('SELECT * FROM inv_zone_configs WHERE almacen = ? AND active = 1').bind(almacen).first();
    if (!row) return json({ ok: true, found: false });
    return json({
      ok: true, found: true,
      id: row.id,
      almacen: row.almacen,
      templateHash: row.template_hash || '',
      zones: JSON.parse(row.zones_json || '[]'),
      active: !!row.active,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    });
  }

  if (path === '/inv/sesiones') {
    const almacen = url.searchParams.get('almacen');
    const dias = Math.max(1, Math.min(90, parseInt(url.searchParams.get('dias') || '14', 10) || 14));
    const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const validDate = "fecha GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'";
    const where = almacen
      ? `WHERE almacen = ? AND ${validDate} AND fecha >= ?`
      : `WHERE ${validDate} AND fecha >= ?`;
    const binds = almacen ? [almacen, desde] : [desde];
    let rows;
    try {
      rows = await db.prepare(
        `SELECT almacen, operario, fecha, updated_at, exported_at, exported_by,
                counts_by_zone, corrections_by_zone, completed_zones, manuales,
                operarios_by_device
         FROM inv_sesiones ${where}
         ORDER BY fecha DESC, updated_at DESC
         LIMIT 200`
      ).bind(...binds).all();
    } catch (err) {
      rows = await db.prepare(
        `SELECT almacen, operario, fecha, updated_at,
                counts_by_zone, completed_zones, manuales
         FROM inv_sesiones ${where}
         ORDER BY fecha DESC, updated_at DESC
         LIMIT 200`
      ).bind(...binds).all();
    }
    const sesiones = (rows.results || []).map(row => {
      const cbz = JSON.parse(row.counts_by_zone || '{}');
      const cods = new Set();
      for (const zc of Object.values(cbz)) for (const cod of Object.keys(zc)) cods.add(cod);
      const completedZones = JSON.parse(row.completed_zones || '[]');
      const uniqueZones = new Set(completedZones.map(k => parseInt(k)));
      const correctionsByZone = JSON.parse(row.corrections_by_zone || '{}');
      const correctedCods = new Set();
      for (const zc of Object.values(correctionsByZone)) for (const cod of Object.keys(zc || {})) correctedCods.add(cod);
      // R9a: el tab Tomas del admin lista desde D1 — conteos de manuales y
      // nombres de operarios (R5.1) evitan otro roundtrip por sesión.
      const manualesArr = JSON.parse(row.manuales || '[]');
      const opsByDev = JSON.parse(row.operarios_by_device || '{}');
      const operarios = [...new Set(
        Object.values(opsByDev).map(o => o && o.operario).filter(Boolean)
      )];
      return {
        almacen:          row.almacen,
        operario:         row.operario,
        fecha:            row.fecha,
        updatedAt:        row.updated_at,
        exportedAt:       row.exported_at || '',
        exportedBy:       row.exported_by || '',
        articulosContados: cods.size,
        zonasCompletadas: uniqueZones.size,
        correcciones:     correctedCods.size,
        manuales:         manualesArr.filter(m => m && m.type !== 'comment').length,
        comentarios:      manualesArr.filter(m => m && m.type === 'comment').length,
        operarios
      };
    });
    return json({ ok: true, sesiones });
  }

  return json({ error: 'Ruta no encontrada' }, 404);
}

// R7: resuelve la credencial de admin. El password maestro (INV_ADMIN_PASSWORD)
// administra todo; un perfil de inv_admins solo sus almacenes. El perfil se
// identifica por nombre (X-Admin-User / adminUser) + password personal.
async function invAdminAuth(db, env, pwd, nombre) {
  if (!env.INV_ADMIN_PASSWORD) return { ok: false, error: 'Admin password no configurado', status: 500 };
  if (!pwd) return { ok: false, error: 'Sin permiso', status: 401 };
  if (pwd === env.INV_ADMIN_PASSWORD) return { ok: true, master: true, almacenes: '*' };
  if (!nombre || !nombre.trim()) return { ok: false, error: 'Sin permiso', status: 401 };
  let row;
  try {
    row = await db.prepare(
      'SELECT id, nombre, password_hash, almacenes, active FROM inv_admins WHERE nombre = ?'
    ).bind(nombre.trim()).first();
  } catch (err) {
    return { ok: false, error: 'Sin permiso', status: 401 }; // pre-migración 0007
  }
  if (!row || !row.active) return { ok: false, error: 'Sin permiso', status: 401 };
  if (await hashPassword(pwd) !== row.password_hash) return { ok: false, error: 'Sin permiso', status: 401 };
  let almacenes;
  try { almacenes = JSON.parse(row.almacenes || '[]'); } catch { almacenes = []; }
  return { ok: true, master: false, id: row.id, nombre: row.nombre, almacenes: Array.isArray(almacenes) ? almacenes : [] };
}

function almacenPermitido(auth, almacen) {
  if (!auth?.ok) return false;
  if (auth.master) return true;
  return auth.almacenes.includes(almacen);
}

async function handleInvPost(db, body, env = {}, request = null) {
  const pwd = request?.headers?.get('X-Admin-Password') || body.adminPassword || '';
  const adminUser = request?.headers?.get('X-Admin-User') || body.adminUser || '';

  // Login de admin.html: valida el password sin exponerlo en el código del repo público.
  // R7: también acepta perfiles de inv_admins y devuelve sus almacenes permitidos.
  if (body.action === 'inv_admin_check') {
    const auth = await invAdminAuth(db, env, pwd, adminUser);
    if (!auth.ok) return json({ ok: false, error: auth.status === 500 ? auth.error : 'Contraseña incorrecta' }, auth.status);
    return json({ ok: true, master: auth.master, almacenes: auth.almacenes, nombre: auth.nombre || adminUser });
  }

  // Subir/sobreescribir plantillas, defaults y preparaciones requiere admin, y desde
  // R7 el almacén de la acción debe estar permitido para el perfil.
  // (inv_sesion e inv_lock quedan sin auth a propósito: el operario no tiene credencial)
  const ADMIN_ACTIONS = ['inv_plantilla', 'inv_defaults', 'inv_zone_config_save', 'inv_zone_config_activate'];
  if (ADMIN_ACTIONS.includes(body.action)) {
    const auth = await invAdminAuth(db, env, pwd, adminUser);
    if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);
    if (!almacenPermitido(auth, body.almacen)) {
      return json({ ok: false, error: `Sin permiso para el almacén ${body.almacen || '?'}` }, 403);
    }
  }

  // Gestión de perfiles de admin: SOLO el password maestro
  if (['inv_admin_list', 'inv_admin_save', 'inv_admin_delete'].includes(body.action)) {
    const auth = await invAdminAuth(db, env, pwd, adminUser);
    if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);
    if (!auth.master) return json({ ok: false, error: 'Solo el password maestro administra perfiles' }, 403);

    if (body.action === 'inv_admin_list') {
      const rows = await db.prepare(
        'SELECT id, nombre, almacenes, active, created_at, updated_at FROM inv_admins ORDER BY nombre'
      ).all();
      return json({
        ok: true,
        admins: (rows.results || []).map(r => ({
          id: r.id, nombre: r.nombre,
          almacenes: JSON.parse(r.almacenes || '[]'),
          active: !!r.active,
          createdAt: r.created_at, updatedAt: r.updated_at
        }))
      });
    }

    if (body.action === 'inv_admin_save') {
      const { id, nombre, password, almacenes, active } = body;
      if (!nombre?.trim()) return json({ error: 'Falta nombre' }, 400);
      if (!Array.isArray(almacenes) || almacenes.some(a => typeof a !== 'string' || !a)) {
        return json({ error: 'almacenes debe ser una lista de claves de almacén' }, 400);
      }
      if (password && pwd === password) {
        return json({ error: 'El password del perfil no puede ser el maestro' }, 400);
      }
      const now = new Date().toISOString();
      if (id) {
        const existing = await db.prepare('SELECT id FROM inv_admins WHERE id = ?').bind(id).first();
        if (!existing) return json({ error: 'Perfil no encontrado' }, 404);
        const sets = ['nombre = ?', 'almacenes = ?', 'active = ?', 'updated_at = ?'];
        const binds = [nombre.trim(), JSON.stringify(almacenes), active === false ? 0 : 1, now];
        if (password) { sets.push('password_hash = ?'); binds.push(await hashPassword(password)); }
        try {
          await db.prepare(`UPDATE inv_admins SET ${sets.join(', ')} WHERE id = ?`).bind(...binds, id).run();
        } catch (err) {
          return json({ error: /UNIQUE/i.test(err.message) ? 'Ya existe un perfil con ese nombre' : err.message }, 400);
        }
        return json({ ok: true, id });
      }
      if (!password) return json({ error: 'Falta password para el perfil nuevo' }, 400);
      const newId_ = 'adm_' + newId();
      try {
        await db.prepare(
          'INSERT INTO inv_admins (id, nombre, password_hash, almacenes, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).bind(newId_, nombre.trim(), await hashPassword(password), JSON.stringify(almacenes), active === false ? 0 : 1, now, now).run();
      } catch (err) {
        return json({ error: /UNIQUE/i.test(err.message) ? 'Ya existe un perfil con ese nombre' : err.message }, 400);
      }
      return json({ ok: true, id: newId_ });
    }

    if (body.action === 'inv_admin_delete') {
      if (!body.id) return json({ error: 'Falta id' }, 400);
      await db.prepare('DELETE FROM inv_admins WHERE id = ?').bind(body.id).run();
      return json({ ok: true });
    }
  }

  if (body.action === 'inv_plantilla') {
    const { almacen, rowMap, cantidadColIdx, presMap, unitMap, raw, originalFilename, templateHash } = body;
    if (!almacen || !rowMap || cantidadColIdx == null) return json({ error: 'Datos incompletos' }, 400);
    await db.prepare(`
      INSERT INTO inv_plantillas (almacen, row_map, cantidad_col_idx, pres_map, unit_map, raw, original_filename, template_hash, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(almacen) DO UPDATE SET
        row_map = excluded.row_map,
        cantidad_col_idx = excluded.cantidad_col_idx,
        pres_map = excluded.pres_map,
        unit_map = excluded.unit_map,
        raw = excluded.raw,
        original_filename = excluded.original_filename,
        template_hash = excluded.template_hash,
        updated_at = excluded.updated_at
    `).bind(almacen, JSON.stringify(rowMap), cantidadColIdx, JSON.stringify(presMap || {}), JSON.stringify(unitMap || {}), raw || '', originalFilename || '', templateHash || '', new Date().toISOString()).run();

    // R8: almacén sin catálogo D1 (sync_d1 solo cubre Piazza) → derivarlo de la
    // plantilla. Solo si está vacío: catálogos existentes nunca se pisan.
    let catalogoDerivado = 0;
    const arts = (body.articulos || []).filter(a => a && a.codigo && a.nombre);
    if (arts.length) {
      const row = await db.prepare('SELECT COUNT(*) AS n FROM catalogo_articulos WHERE almacen = ?').bind(almacen).first();
      if (!row.n) {
        const now = new Date().toISOString();
        const stmt = db.prepare('INSERT OR REPLACE INTO catalogo_articulos (codigo,nombre,grupo,subgrupo,unidad,almacen,updated_at) VALUES (?,?,?,?,?,?,?)');
        for (let i = 0; i < arts.length; i += 50) {
          await db.batch(arts.slice(i, i + 50).map(a =>
            stmt.bind(a.codigo, a.nombre, a.grupo || '', a.subgrupo || '', a.unidad || '', almacen, now)));
        }
        catalogoDerivado = arts.length;
      }
    }
    return json({ ok: true, catalogoDerivado });
  }

  if (body.action === 'inv_defaults') {
    const { almacen, defaultPres } = body;
    if (!almacen || !defaultPres) return json({ error: 'Datos incompletos' }, 400);
    const exists = await db.prepare('SELECT almacen FROM inv_plantillas WHERE almacen = ?').bind(almacen).first();
    if (!exists) return json({ error: 'Sube la plantilla primero' }, 404);
    await db.prepare('UPDATE inv_plantillas SET default_pres = ? WHERE almacen = ?')
      .bind(JSON.stringify(defaultPres), almacen).run();
    return json({ ok: true });
  }

  if (body.action === 'inv_zone_config_save') {
    const { almacen, templateHash, zones, id } = body;
    if (!almacen || !Array.isArray(zones)) return json({ error: 'Datos incompletos' }, 400);
    for (const z of zones) {
      if (!z || typeof z.nombre !== 'string' || !z.nombre.trim() || !Array.isArray(z.items)) {
        return json({ error: 'Zona inválida: cada zona necesita nombre e items[]' }, 400);
      }
      for (const it of z.items) {
        if (!it || typeof it.cod !== 'string' || !it.cod) return json({ error: `Item sin cod en zona "${z.nombre}"` }, 400);
      }
    }
    const now = new Date().toISOString();
    if (id) {
      const existing = await db.prepare('SELECT id FROM inv_zone_configs WHERE id = ? AND almacen = ?').bind(id, almacen).first();
      if (!existing) return json({ error: 'Config no encontrada' }, 404);
      await db.prepare(
        'UPDATE inv_zone_configs SET template_hash = ?, zones_json = ?, updated_at = ? WHERE id = ?'
      ).bind(templateHash || '', JSON.stringify(zones), now, id).run();
      return json({ ok: true, id });
    }
    const newId_ = 'cfg_' + newId();
    await db.prepare(
      'INSERT INTO inv_zone_configs (id, almacen, template_hash, zones_json, active, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)'
    ).bind(newId_, almacen, templateHash || '', JSON.stringify(zones), now, now).run();
    return json({ ok: true, id: newId_ });
  }

  if (body.action === 'inv_zone_config_activate') {
    const { almacen, id, deactivate } = body;
    if (!almacen) return json({ error: 'Datos incompletos' }, 400);
    const now = new Date().toISOString();
    if (deactivate) {
      // Sin config activa el almacén vuelve al comportamiento legacy (AREA_CONFIG)
      await db.prepare('UPDATE inv_zone_configs SET active = 0, updated_at = ? WHERE almacen = ?').bind(now, almacen).run();
      return json({ ok: true });
    }
    if (!id) return json({ error: 'Datos incompletos' }, 400);
    const existing = await db.prepare('SELECT id FROM inv_zone_configs WHERE id = ? AND almacen = ?').bind(id, almacen).first();
    if (!existing) return json({ error: 'Config no encontrada' }, 404);
    await db.batch([
      db.prepare('UPDATE inv_zone_configs SET active = 0, updated_at = ? WHERE almacen = ? AND active = 1').bind(now, almacen),
      db.prepare('UPDATE inv_zone_configs SET active = 1, updated_at = ? WHERE id = ?').bind(now, id),
    ]);
    return json({ ok: true, id });
  }

  if (body.action === 'inv_sesion') {
    const { almacen, operario, fecha, countsByZone, presChoiceByZone, correctionsByZone,
            completedZones, removeCompletedZones, manuales, removeManuales, templateHash, counts,
            zoneConfigId, zoneSnapshot } = body; // counts legacy para barra.html
    if (!almacen || !operario || !fecha) return json({ error: 'Datos incompletos' }, 400);

    let existing;
    try {
      existing = await db.prepare(
        `SELECT counts, counts_by_zone, pres_choice_by_zone, corrections_by_zone, completed_zones, manuales, operarios_by_device
         FROM inv_sesiones WHERE almacen = ? AND fecha = ?`
      ).bind(almacen, fecha).first();
    } catch (err) {
      existing = await db.prepare(
        `SELECT counts, counts_by_zone, pres_choice_by_zone, completed_zones, manuales
         FROM inv_sesiones WHERE almacen = ? AND fecha = ?`
      ).bind(almacen, fecha).first();
    }

    // Reglas de merge compartidas con admin.html — ver js/sesion-merge.js
    const mergedCBZ = mergeZoneMap(JSON.parse(existing?.counts_by_zone || '{}'), countsByZone);
    const mergedPCBZ = mergeZoneMap(JSON.parse(existing?.pres_choice_by_zone || '{}'), presChoiceByZone);
    const mergedCorrections = mergeCorrections(JSON.parse(existing?.corrections_by_zone || '{}'), correctionsByZone);
    const mergedManuales = mergeManuales(JSON.parse(existing?.manuales || '[]'), manuales, removeManuales);
    const mergedZones = mergeCompletedZones(JSON.parse(existing?.completed_zones || '[]'), completedZones, removeCompletedZones);

    // Legacy counts merge (para barra.html)
    const existingCounts = JSON.parse(existing?.counts || '{}');
    const mergedCounts = counts ? { ...existingCounts, ...counts } : existingCounts;

    // Atribución (R5.1): las claves "zona:deviceId" de ESTE POST pertenecen al
    // dispositivo que envía, y `operario` es quien lo opera → acumular el mapeo.
    // (No usar completedZones: trae claves de otros dispositivos tras un merge.)
    const mergedOps = JSON.parse(existing?.operarios_by_device || '{}');
    const senderDevices = new Set();
    for (const key of [...Object.keys(countsByZone || {}), ...Object.keys(presChoiceByZone || {})]) {
      const dev = String(key).split(':')[1];
      if (dev) senderDevices.add(dev);
    }
    for (const dev of senderDevices) {
      mergedOps[dev] = { operario, at: new Date().toISOString() };
    }

    const commonBinds = [
      almacen, operario, fecha,
      JSON.stringify(mergedCounts),
      JSON.stringify(mergedCBZ),
      JSON.stringify(mergedPCBZ),
      JSON.stringify(mergedCorrections),
      JSON.stringify(mergedZones),
      JSON.stringify(mergedManuales),
      templateHash || '',
    ];
    try {
      // zone_snapshot/zone_config_id: first-write-wins — el snapshot lo congela el
      // dispositivo que INICIA la toma; los demás dispositivos nunca lo pisan.
      await db.prepare(`
        INSERT INTO inv_sesiones
          (almacen, operario, fecha, counts, counts_by_zone, pres_choice_by_zone,
           corrections_by_zone, completed_zones, locked_zones, manuales, template_hash,
           zone_config_id, zone_snapshot, operarios_by_device, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, '{}', ?, ?, ?, ?, ?, ?)
        ON CONFLICT(almacen, fecha) DO UPDATE SET
          operario           = excluded.operario,
          counts             = excluded.counts,
          counts_by_zone     = excluded.counts_by_zone,
          pres_choice_by_zone = excluded.pres_choice_by_zone,
          corrections_by_zone = excluded.corrections_by_zone,
          completed_zones    = excluded.completed_zones,
          manuales           = excluded.manuales,
          template_hash      = excluded.template_hash,
          zone_config_id     = CASE WHEN zone_config_id = '' THEN excluded.zone_config_id ELSE zone_config_id END,
          zone_snapshot      = CASE WHEN zone_snapshot  = '' THEN excluded.zone_snapshot  ELSE zone_snapshot  END,
          operarios_by_device = excluded.operarios_by_device,
          updated_at         = excluded.updated_at
      `).bind(
        ...commonBinds,
        zoneConfigId || '',
        zoneSnapshot ? JSON.stringify(zoneSnapshot) : '',
        JSON.stringify(mergedOps),
        new Date().toISOString()
      ).run();
    } catch (err) {
      // Fallback pre-migración 0005
      await db.prepare(`
        INSERT INTO inv_sesiones
          (almacen, operario, fecha, counts, counts_by_zone, pres_choice_by_zone,
           corrections_by_zone, completed_zones, locked_zones, manuales, template_hash, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, '{}', ?, ?, ?)
        ON CONFLICT(almacen, fecha) DO UPDATE SET
          operario           = excluded.operario,
          counts             = excluded.counts,
          counts_by_zone     = excluded.counts_by_zone,
          pres_choice_by_zone = excluded.pres_choice_by_zone,
          corrections_by_zone = excluded.corrections_by_zone,
          completed_zones    = excluded.completed_zones,
          manuales           = excluded.manuales,
          template_hash      = excluded.template_hash,
          updated_at         = excluded.updated_at
      `).bind(...commonBinds, new Date().toISOString()).run();
    }
    return json({ ok: true });
  }

  if (body.action === 'inv_lock') {
    const { almacen, fecha, zone_idx, device_id, operario, release } = body;
    if (!almacen || !fecha || zone_idx == null || !device_id) return json({ error: 'Datos incompletos' }, 400);
    const row = await db.prepare(
      'SELECT locked_zones FROM inv_sesiones WHERE almacen = ? AND fecha = ?'
    ).bind(almacen, fecha).first();
    if (!row) return json({ ok: false, error: 'Sesión no encontrada' });
    const locks = JSON.parse(row.locked_zones || '{}');

    // Expirar locks viejos (> 30 min)
    const now = Date.now();
    for (const [zIdx, lock] of Object.entries(locks)) {
      if (now - new Date(lock.ts).getTime() > 30 * 60 * 1000) delete locks[zIdx];
    }

    if (release) {
      if (locks[zone_idx]?.device_id === device_id) delete locks[zone_idx];
    } else {
      if (locks[zone_idx] && locks[zone_idx].device_id !== device_id) {
        return json({ ok: false, locked_by: locks[zone_idx] });
      }
      locks[zone_idx] = { device_id, operario, ts: new Date().toISOString() };
    }
    await db.prepare(
      'UPDATE inv_sesiones SET locked_zones = ?, updated_at = ? WHERE almacen = ? AND fecha = ?'
    ).bind(JSON.stringify(locks), new Date().toISOString(), almacen, fecha).run();
    return json({ ok: true, locks });
  }

  if (body.action === 'inv_export') {
    const { almacen, fecha, operario, force } = body;
    if (!almacen || !fecha || !operario) return json({ error: 'Datos incompletos' }, 400);
    const auth = await invAdminAuth(db, env, pwd, adminUser);
    if (!auth.ok) return json({ ok: false, error: auth.status === 500 ? auth.error : 'Sin permiso para exportar' }, auth.status === 500 ? 500 : 403);
    if (!almacenPermitido(auth, almacen)) {
      return json({ ok: false, error: `Sin permiso para el almacén ${almacen}` }, 403);
    }
    let row;
    try {
      row = await db.prepare(
        'SELECT exported_at, exported_by FROM inv_sesiones WHERE almacen = ? AND fecha = ?'
      ).bind(almacen, fecha).first();
    } catch (err) {
      return json({ ok: false, error: 'Falta migración inv_sesiones export_*: ' + err.message }, 500);
    }
    if (!row) return json({ error: 'Sesión no encontrada' }, 404);
    if (row.exported_at && !force) {
      return json({ ok: false, error: 'Ya exportada', exportedAt: row.exported_at, exportedBy: row.exported_by }, 409);
    }
    const now = new Date().toISOString();
    await db.prepare(
      'UPDATE inv_sesiones SET exported_at = ?, exported_by = ?, updated_at = ? WHERE almacen = ? AND fecha = ?'
    ).bind(now, operario, now, almacen, fecha).run();
    return json({ ok: true });
  }

  if (body.action === 'inv_supervisor_login') {
    const { nombre, pin } = body;
    if (!nombre?.trim() || !pin) return json({ ok: false, error: 'Faltan datos' }, 400);
    const esperada = env.INV_SUPERVISOR_PIN;
    if (!esperada || pin !== esperada) return json({ ok: false, error: 'PIN incorrecto' }, 401);
    return json({ ok: true, usuario: { nombre: nombre.trim(), rol: 'supervisor' } });
  }

  if (body.action === 'inv_delete') {
    const { almacen, fecha, operario } = body;
    if (!almacen || !fecha || !operario) return json({ error: 'Datos incompletos' }, 400);
    const auth = await invAdminAuth(db, env, pwd, adminUser);
    if (!auth.ok) return json({ ok: false, error: auth.status === 500 ? auth.error : 'Sin permiso para borrar' }, auth.status === 500 ? 500 : 403);
    if (!almacenPermitido(auth, almacen)) {
      return json({ ok: false, error: `Sin permiso para el almacén ${almacen}` }, 403);
    }
    const row = await db.prepare(
      'SELECT almacen FROM inv_sesiones WHERE almacen = ? AND fecha = ?'
    ).bind(almacen, fecha).first();
    if (!row) return json({ error: 'Sesión no encontrada' }, 404);
    await db.prepare(
      'DELETE FROM inv_sesiones WHERE almacen = ? AND fecha = ?'
    ).bind(almacen, fecha).run();
    return json({ ok: true });
  }

  return json({ error: 'Acción no válida' }, 400);
}

// ── Sync desde scraper (X-Sync-Token) ─────────────────────────────────────

async function handleSync(db, pathname, body) {
  const now = Date.now();

  if (pathname === '/sync/catalogo') {
    const { articulos = [], subrecetas = [], mise_en_place = [] } = body;

    const stmts = [];
    for (const a of articulos) {
      const cod = a.codigo || a.id_xetux;
      if (!cod) continue;
      stmts.push(db.prepare(
        'INSERT OR REPLACE INTO catalogo_articulos (codigo,nombre,grupo,subgrupo,unidad,almacen,updated_at) VALUES (?,?,?,?,?,?,?)'
      ).bind(cod, a.nombre || '', a.grupo || '', a.subgrupo || '', a.unidad || '', a.almacen || '', now));
    }
    for (const s of subrecetas) {
      const cod = s.codigo || s.id_xetux;
      if (!cod) continue;
      stmts.push(db.prepare(
        'INSERT OR REPLACE INTO catalogo_subrecetas (codigo,nombre,rendimiento,unidad,updated_at) VALUES (?,?,?,?,?)'
      ).bind(cod, s.nombre || '', s.rendimiento || null, s.unidad || '', now));
    }
    for (const m of mise_en_place) {
      const subCod = m.subreceta_id || m.subreceta_codigo;
      const ingCod = m.codigo_xetux || m.ingrediente_codigo;
      if (!subCod || !ingCod) continue;
      stmts.push(db.prepare(
        'INSERT OR REPLACE INTO catalogo_ingredientes (id,subreceta_codigo,ingrediente_codigo,ingrediente_nombre,cantidad,unidad) VALUES (?,?,?,?,?,?)'
      ).bind(`${subCod}:${ingCod}`, subCod, ingCod, m.ingrediente || m.ingrediente_nombre || '', m.cantidad_por_unidad ?? m.cantidad ?? 0, m.unidad || ''));
    }

    // D1 batch: máximo 100 stmts por llamada
    for (let i = 0; i < stmts.length; i += 100) {
      await db.batch(stmts.slice(i, i + 100));
    }
    return json({ ok: true, articulos: articulos.length, subrecetas: subrecetas.length, mise_en_place: mise_en_place.length });
  }

  return json({ error: 'Ruta sync no reconocida: ' + pathname }, 404);
}

// ── Entry point ────────────────────────────────────────────────────────────

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(enviarNotificaciones(env.DB, env));
  },

  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    const url = new URL(request.url);

    if (url.pathname.startsWith('/inv/')) {
      try {
        if (request.method === 'GET')  return await handleInvGet(env.DB, url);
        if (request.method === 'POST') return await handleInvPost(env.DB, await request.json(), env, request);
        return new Response('Method not allowed', { status: 405, headers: CORS });
      } catch (err) {
        return json({ error: err.message }, 500);
      }
    }

    if (url.pathname === '/articulos' && request.method === 'GET') {
      const almacen = url.searchParams.get('almacen');
      if (!almacen) return json({ error: 'Falta almacen' }, 400);
      try {
        const rows = await env.DB.prepare(
          'SELECT codigo, nombre, grupo, subgrupo, unidad FROM catalogo_articulos WHERE almacen = ? ORDER BY nombre'
        ).bind(almacen).all();
        return json({ articulos: rows.results });
      } catch (err) {
        return json({ error: err.message }, 500);
      }
    }

    if (url.pathname.startsWith('/sync/') && request.method === 'POST') {
      const syncToken = request.headers.get('X-Sync-Token') || '';
      if (!env.SYNC_TOKEN || syncToken !== env.SYNC_TOKEN)
        return json({ error: 'Token inválido' }, 401);
      try {
        return await handleSync(env.DB, url.pathname, await request.json());
      } catch (err) {
        return json({ error: err.message }, 500);
      }
    }

    const action = url.searchParams.get('action');

    try {
      // ── Login (sin auth) ──
      if (request.method === 'POST') {
        const body = await request.json();

        if (body.action === 'login') {
          const { nombre, password } = body;
          const hash = await hashPassword(password);
          const usuario = await env.DB.prepare(
            'SELECT * FROM usuarios WHERE nombre = ? AND password_hash = ?'
          ).bind(nombre, hash).first();
          if (!usuario) return json({ error: 'Usuario o contraseña incorrectos' }, 401);
          const token = generateToken();
          const expiry = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 días
          await env.DB.prepare('INSERT INTO sesiones (token,usuario_id,expiry) VALUES (?,?,?)').bind(token, usuario.id, expiry).run();
          return json({ ok: true, token, usuario: { id: usuario.id, nombre: usuario.nombre, area: usuario.area, rol: usuario.rol } });
        }

        // Auth para el resto
        const token = request.headers.get('X-Session-Token') || '';
        const session = await getSession(env.DB, token);
        if (!session) return json({ error: 'Sesión inválida o expirada' }, 401);

        return json(await handlePost(env.DB, body, session, env));
      }

      // Auth para GETs
      const token = request.headers.get('X-Session-Token') || '';
      const session = await getSession(env.DB, token);
      if (!session) return json({ error: 'Sesión inválida o expirada' }, 401);

      if (request.method === 'GET') {
        return json(await handleGet(env.DB, action, session, url));
      }

      return new Response('Method not allowed', { status: 405, headers: CORS });

    } catch (err) {
      return json({ error: err.message }, 500);
    }
  },
};
