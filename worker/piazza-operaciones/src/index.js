/**
 * piazza-operaciones — Cloudflare Worker
 *
 * Endpoints:
 *   POST /auth/invitacion          — genera link de invitación (admin)
 *   POST /auth/registro            — crea cuenta con token de invitación
 *   POST /auth/login               — login con nombre + PIN → sesión
 *   GET  /auth/me                  — verifica sesión activa
 *
 *   GET  /subrecetas               — lista subrecetas del área del usuario
 *   GET  /subrecetas/:id/mise      — mise en place de una subreceta
 *
 *   POST /producciones             — registra una producción
 *   GET  /producciones             — lista producciones (filtros: area, estado, fecha)
 *   POST /producciones/:id/voto    — vota autorizar o rechazar
 *   GET  /producciones/:id         — detalle de una producción
 *
 *   POST /mermas                   — registra una merma
 *   GET  /mermas                   — lista mermas (filtros: area, estado)
 *   GET  /motivos-merma            — lista de motivos predefinidos
 *
 *   GET  /admin/usuarios           — lista usuarios (admin)
 *   PATCH /admin/usuarios/:id      — activar/desactivar usuario (admin)
 *   GET  /admin/kpis               — KPIs agregados por área (admin)
 *
 *   POST /sync/inventario          — recibe snapshot de inventario del scraper
 *   POST /sync/compras             — recibe compras del día del scraper
 *   POST /sync/ventas              — recibe ventas del día del scraper
 *   POST /sync/catalogo            — recibe catálogo (artículos + subrecetas) del scraper
 *
 *   GET  /reportes/mtd             — acumulado mensual desde D1 (ventas, compras, transferencias)
 *
 *   POST /xetux/produccion-cargada — marca producción como cargada (desde cargar_xetux.py)
 *   POST /xetux/merma-cargada      — marca merma como cargada
 */

// ── Utilidades ────────────────────────────────────────────────────────────────

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function ok(data = {}, status = 200) {
  return Response.json({ ok: true, ...data }, { status });
}

function err(msg, status = 400) {
  return Response.json({ ok: false, error: msg }, { status });
}

async function hashPin(pin) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function getSession(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  const row = await env.DB.prepare(
    `SELECT s.*, u.nombre, u.area, u.rol, u.activo
     FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
     WHERE s.token = ? AND s.expires_at > datetime('now')`
  ).bind(token).first();
  if (!row || !row.activo) return null;
  return row;
}

function requireSession(session) {
  if (!session) return err('No autenticado', 401);
  return null;
}

function requireAdmin(session) {
  if (!session) return err('No autenticado', 401);
  if (session.rol !== 'admin') return err('Se requiere rol admin', 403);
  return null;
}

function requireVotante(session) {
  if (!session) return err('No autenticado', 401);
  const VOTANTES = ['admin', 'encargado'];
  if (!VOTANTES.includes(session.rol)) return err('Sin permiso para votar', 403);
  return null;
}

// ── Slack ─────────────────────────────────────────────────────────────────────

async function slackPost(env, channel, text, blocks = null) {
  if (!env.SLACK_BOT_TOKEN) return;
  const body = { channel, text };
  if (blocks) body.blocks = blocks;
  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  }).catch(() => {});
}

const CANAL_AREA = {
  COCINA:    '#reportes-cocina',
  BARRA:     '#reportes-barra',
  SALUMERIA: '#reportes-salumeria',
  CAVA:      '#reportes-almacen',
  ALIMENTARI:'#reportes-almacen',
};

// ── Router ────────────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const url  = new URL(request.url);
    const path = url.pathname.replace(/\/$/, '');
    const method = request.method;

    // CORS
    if (method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        },
      });
    }

    const cors = { 'Access-Control-Allow-Origin': '*' };

    let body = {};
    if (['POST', 'PATCH', 'PUT'].includes(method)) {
      try { body = await request.json(); } catch { body = {}; }
    }

    const session = await getSession(request, env);

    // ── AUTH ────────────────────────────────────────────────────────────────

    if (method === 'POST' && path === '/auth/invitacion') {
      const e = requireAdmin(session);
      if (e) return addCors(e, cors);
      const { area, rol = 'operario' } = body;
      if (!area) return addCors(err('area requerida'), cors);
      const token = newId() + newId();
      const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
      await env.DB.prepare(
        `INSERT INTO invitaciones (token, area, rol, created_by, expires_at)
         VALUES (?, ?, ?, ?, ?)`
      ).bind(token, area, rol, session.usuario_id, expires).run();
      return addCors(ok({ token, expires }), cors);
    }

    if (method === 'POST' && path === '/auth/registro') {
      const { token, nombre, pin } = body;
      if (!token || !nombre || !pin) return addCors(err('token, nombre y pin requeridos'), cors);
      if (!/^\d{6}$/.test(pin)) return addCors(err('PIN debe ser 6 dígitos'), cors);
      const inv = await env.DB.prepare(
        `SELECT * FROM invitaciones WHERE token = ? AND usado = 0 AND expires_at > datetime('now')`
      ).bind(token).first();
      if (!inv) return addCors(err('Invitación inválida o expirada', 404), cors);
      const id = newId();
      const pin_hash = await hashPin(pin);
      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO usuarios (id, nombre, area, rol, pin_hash) VALUES (?, ?, ?, ?, ?)`
        ).bind(id, nombre.trim(), inv.area, inv.rol, pin_hash),
        env.DB.prepare(`UPDATE invitaciones SET usado = 1 WHERE token = ?`).bind(token),
      ]);
      return addCors(ok({ id, nombre: nombre.trim(), area: inv.area, rol: inv.rol }), cors);
    }

    if (method === 'POST' && path === '/auth/login') {
      const { nombre, pin } = body;
      if (!nombre || !pin) return addCors(err('nombre y pin requeridos'), cors);
      const pin_hash = await hashPin(String(pin));
      const user = await env.DB.prepare(
        `SELECT * FROM usuarios WHERE nombre = ? AND pin_hash = ? AND activo = 1`
      ).bind(nombre.trim(), pin_hash).first();
      if (!user) return addCors(err('Nombre o PIN incorrecto', 401), cors);
      const token = newId() + newId();
      const expires = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
      await env.DB.prepare(
        `INSERT INTO sesiones (token, usuario_id, expires_at) VALUES (?, ?, ?)`
      ).bind(token, user.id, expires).run();
      return addCors(ok({ token, expires, usuario: { id: user.id, nombre: user.nombre, area: user.area, rol: user.rol } }), cors);
    }

    if (method === 'GET' && path === '/auth/me') {
      if (!session) return addCors(err('No autenticado', 401), cors);
      return addCors(ok({ usuario: { id: session.usuario_id, nombre: session.nombre, area: session.area, rol: session.rol } }), cors);
    }

    // ── USUARIOS (lista para login) ─────────────────────────────────────────

    if (method === 'GET' && path === '/usuarios') {
      const rows = await env.DB.prepare(
        `SELECT id, nombre, area FROM usuarios WHERE activo = 1 ORDER BY nombre`
      ).all();
      return addCors(ok({ usuarios: rows.results }), cors);
    }

    // ── CATÁLOGO DE ARTÍCULOS (público — usado por apps de inventario) ────────

    if (method === 'GET' && path === '/articulos') {
      const almacen = url.searchParams.get('almacen');
      let q = `SELECT id_xetux, nombre, unidad, almacen, tipo_producto FROM articulos`;
      const params = [];
      if (almacen) {
        q += ` WHERE almacen = ?`;
        params.push(almacen.toUpperCase());
      }
      q += ` ORDER BY tipo_producto, nombre`;
      const rows = await env.DB.prepare(q).bind(...params).all();
      return addCors(ok({ articulos: rows.results }), cors);
    }

    // ── SUBRECETAS ──────────────────────────────────────────────────────────

    if (method === 'GET' && path === '/subrecetas') {
      const e = requireSession(session);
      if (e) return addCors(e, cors);
      const area = url.searchParams.get('area') || session.area;
      const rows = await env.DB.prepare(
        `SELECT * FROM subrecetas WHERE area = ? AND activo = 1 ORDER BY nombre`
      ).bind(area).all();
      return addCors(ok({ subrecetas: rows.results }), cors);
    }

    const mSubrecetaMise = path.match(/^\/subrecetas\/([^/]+)\/mise$/);
    if (method === 'GET' && mSubrecetaMise) {
      const e = requireSession(session);
      if (e) return addCors(e, cors);
      const id = mSubrecetaMise[1];
      const sub = await env.DB.prepare(`SELECT * FROM subrecetas WHERE id_xetux = ?`).bind(id).first();
      if (!sub) return addCors(err('Subreceta no encontrada', 404), cors);
      const mise = await env.DB.prepare(
        `SELECT * FROM mise_en_place_catalogo WHERE subreceta_id = ? ORDER BY ingrediente`
      ).bind(id).all();
      return addCors(ok({ subreceta: sub, mise: mise.results }), cors);
    }

    // ── PRODUCCIONES ────────────────────────────────────────────────────────

    if (method === 'POST' && path === '/producciones') {
      const e = requireSession(session);
      if (e) return addCors(e, cors);
      const { subreceta_id, cantidad, fecha, hora_inicio, hora_fin, notas, mise_real } = body;
      if (!subreceta_id || !cantidad || !fecha)
        return addCors(err('subreceta_id, cantidad y fecha requeridos'), cors);
      const sub = await env.DB.prepare(
        `SELECT * FROM subrecetas WHERE id_xetux = ?`
      ).bind(subreceta_id).first();
      if (!sub) return addCors(err('Subreceta no encontrada', 404), cors);

      const id = newId();
      await env.DB.prepare(
        `INSERT INTO producciones (id, usuario_id, subreceta_id, cantidad, fecha, area, hora_inicio, hora_fin, notas)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(id, session.usuario_id, subreceta_id, cantidad, fecha, session.area,
             hora_inicio || null, hora_fin || null, notas || null).run();

      // Guardar mise en place real si se proporcionó
      if (Array.isArray(mise_real) && mise_real.length > 0) {
        const stmts = mise_real.map(m =>
          env.DB.prepare(
            `INSERT INTO mise_en_place_real
             (produccion_id, ingrediente, cantidad_esperada, cantidad_real, diferencia_pct, unidad)
             VALUES (?, ?, ?, ?, ?, ?)`
          ).bind(id, m.ingrediente, m.cantidad_esperada, m.cantidad_real,
                 (m.cantidad_real - m.cantidad_esperada) / m.cantidad_esperada, m.unidad)
        );
        await env.DB.batch(stmts);
      }

      // Notificar a Slack
      const canal = CANAL_AREA[session.area] || '#reportes-almacen';
      await slackPost(env, canal,
        `Nueva producción registrada`,
        [{
          type: 'section',
          text: { type: 'mrkdwn',
            text: `*Nueva producción — ${session.area}*\n` +
                  `*Subreceta:* ${sub.nombre}\n` +
                  `*Cantidad:* ${cantidad} ${sub.unidad}\n` +
                  `*Por:* ${session.nombre} · ${fecha}\n` +
                  `_Pendiente de autorización (2 de 3 votos)_`
          }
        }]
      );

      return addCors(ok({ id }), cors);
    }

    if (method === 'GET' && path === '/producciones') {
      const e = requireSession(session);
      if (e) return addCors(e, cors);
      const area   = url.searchParams.get('area')   || (session.rol !== 'admin' ? session.area : null);
      const estado = url.searchParams.get('estado');
      const fecha  = url.searchParams.get('fecha');
      let q = `SELECT p.*, u.nombre as encargado, s.nombre as subreceta_nombre, s.unidad
               FROM producciones p
               JOIN usuarios u ON u.id = p.usuario_id
               JOIN subrecetas s ON s.id_xetux = p.subreceta_id
               WHERE 1=1`;
      const params = [];
      if (area)   { q += ' AND p.area = ?';   params.push(area); }
      if (estado) { q += ' AND p.estado = ?'; params.push(estado); }
      if (fecha)  { q += ' AND p.fecha = ?';  params.push(fecha); }
      q += ' ORDER BY p.created_at DESC LIMIT 100';
      const rows = await env.DB.prepare(q).bind(...params).all();
      return addCors(ok({ producciones: rows.results }), cors);
    }

    const mProdId = path.match(/^\/producciones\/([^/]+)$/);
    if (method === 'GET' && mProdId) {
      const e = requireSession(session);
      if (e) return addCors(e, cors);
      const id = mProdId[1];
      const prod = await env.DB.prepare(
        `SELECT p.*, u.nombre as encargado, s.nombre as subreceta_nombre, s.unidad
         FROM producciones p
         JOIN usuarios u ON u.id = p.usuario_id
         JOIN subrecetas s ON s.id_xetux = p.subreceta_id
         WHERE p.id = ?`
      ).bind(id).first();
      if (!prod) return addCors(err('No encontrada', 404), cors);
      const mise = await env.DB.prepare(
        `SELECT * FROM mise_en_place_real WHERE produccion_id = ?`
      ).bind(id).all();
      const votos = await env.DB.prepare(
        `SELECT v.*, u.nombre FROM votos v JOIN usuarios u ON u.id = v.usuario_id WHERE v.produccion_id = ?`
      ).bind(id).all();
      return addCors(ok({ produccion: prod, mise: mise.results, votos: votos.results }), cors);
    }

    const mVoto = path.match(/^\/producciones\/([^/]+)\/voto$/);
    if (method === 'POST' && mVoto) {
      const e = requireVotante(session);
      if (e) return addCors(e, cors);
      const id = mVoto[1];
      const { voto, anotacion } = body;
      if (!['autoriza', 'rechaza'].includes(voto))
        return addCors(err('voto debe ser "autoriza" o "rechaza"'), cors);
      const prod = await env.DB.prepare(`SELECT * FROM producciones WHERE id = ?`).bind(id).first();
      if (!prod) return addCors(err('Producción no encontrada', 404), cors);
      if (prod.estado !== 'pendiente') return addCors(err(`Estado actual: ${prod.estado}`), cors);

      await env.DB.prepare(
        `INSERT OR REPLACE INTO votos (produccion_id, usuario_id, voto, anotacion) VALUES (?, ?, ?, ?)`
      ).bind(id, session.usuario_id, voto, anotacion || null).run();

      // Contar votos actuales
      const votos = await env.DB.prepare(
        `SELECT voto, COUNT(*) as n FROM votos WHERE produccion_id = ? GROUP BY voto`
      ).bind(id).all();
      const autoriza = votos.results.find(v => v.voto === 'autoriza')?.n || 0;
      const rechaza  = votos.results.find(v => v.voto === 'rechaza')?.n  || 0;

      let nuevoEstado = null;
      if (autoriza >= 2)      nuevoEstado = 'autorizado';
      else if (rechaza >= 2)  nuevoEstado = 'rechazado';

      if (nuevoEstado) {
        await env.DB.prepare(
          `UPDATE producciones SET estado = ? WHERE id = ?`
        ).bind(nuevoEstado, id).run();

        const sub = await env.DB.prepare(`SELECT nombre FROM subrecetas WHERE id_xetux = ?`)
          .bind(prod.subreceta_id).first();
        const canal = CANAL_AREA[prod.area] || '#reportes-almacen';
        const emoji = nuevoEstado === 'autorizado' ? '✅' : '❌';
        await slackPost(env, canal,
          `Producción ${nuevoEstado}`,
          [{
            type: 'section',
            text: { type: 'mrkdwn',
              text: `${emoji} *Producción ${nuevoEstado}* — ${prod.area}\n` +
                    `*Subreceta:* ${sub?.nombre}\n` +
                    `*Cantidad:* ${prod.cantidad}\n` +
                    (nuevoEstado === 'autorizado'
                      ? `_Cargando en xetux automáticamente..._`
                      : `_Rechazada. Revisar con el equipo._`)
            }
          }]
        );

        // Disparar GitHub Actions cuando se autoriza
        if (nuevoEstado === 'autorizado' && env.GITHUB_TOKEN) {
          await fetch(
            'https://api.github.com/repos/pabloaranda-max/piazza-scraper/actions/workflows/cargar_produccion.yml/dispatches',
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github+json',
                'Content-Type': 'application/json',
                'X-GitHub-Api-Version': '2022-11-28',
              },
              body: JSON.stringify({ ref: 'main', inputs: { produccion_id: id } }),
            }
          );
        }
      }

      return addCors(ok({ estado: nuevoEstado || 'pendiente', autoriza, rechaza }), cors);
    }

    // ── MERMAS ──────────────────────────────────────────────────────────────

    if (method === 'GET' && path === '/motivos-merma') {
      const rows = await env.DB.prepare(`SELECT * FROM motivos_merma ORDER BY id`).all();
      return addCors(ok({ motivos: rows.results }), cors);
    }

    if (method === 'POST' && path === '/mermas') {
      const e = requireSession(session);
      if (e) return addCors(e, cors);
      const { articulo_id, almacen, cantidad, unidad, motivo_id, motivo_texto, notas, fecha } = body;
      if (!articulo_id || !almacen || !cantidad || !fecha)
        return addCors(err('articulo_id, almacen, cantidad y fecha requeridos'), cors);
      const art = await env.DB.prepare(
        `SELECT nombre FROM articulos WHERE id_xetux = ?`
      ).bind(articulo_id).first();

      const id = newId();
      await env.DB.prepare(
        `INSERT INTO mermas (id, usuario_id, articulo_id, almacen, cantidad, unidad, motivo_id, motivo_texto, notas, fecha, area)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(id, session.usuario_id, articulo_id, almacen, cantidad,
             unidad || '', motivo_id || null, motivo_texto || null, notas || null,
             fecha, session.area).run();

      const motivo = motivo_id
        ? (await env.DB.prepare(`SELECT nombre FROM motivos_merma WHERE id = ?`).bind(motivo_id).first())?.nombre
        : (motivo_texto || '—');

      // Notificar a Slack inmediatamente
      const canal = CANAL_AREA[session.area] || '#reportes-almacen';
      await slackPost(env, canal,
        `Merma registrada`,
        [{
          type: 'section',
          text: { type: 'mrkdwn',
            text: `⚠️ *Merma registrada — ${session.area}*\n` +
                  `*Artículo:* ${art?.nombre || articulo_id}\n` +
                  `*Cantidad:* ${cantidad} ${unidad || ''}\n` +
                  `*Motivo:* ${motivo}\n` +
                  `*Por:* ${session.nombre} · ${fecha}\n` +
                  `_Cargando en xetux..._`
          }
        }]
      );
      // También notificar a almacén si no es ya el canal de almacén
      if (canal !== '#reportes-almacen') {
        await slackPost(env, '#reportes-almacen',
          `Merma registrada en ${session.area}: ${art?.nombre || articulo_id}`
        );
      }

      return addCors(ok({ id }), cors);
    }

    if (method === 'GET' && path === '/mermas') {
      const e = requireSession(session);
      if (e) return addCors(e, cors);
      const area   = url.searchParams.get('area')   || (session.rol !== 'admin' ? session.area : null);
      const estado = url.searchParams.get('estado');
      let q = `SELECT m.*, u.nombre as encargado, a.nombre as articulo_nombre, mo.nombre as motivo
               FROM mermas m
               JOIN usuarios u ON u.id = m.usuario_id
               JOIN articulos a ON a.id_xetux = m.articulo_id
               LEFT JOIN motivos_merma mo ON mo.id = m.motivo_id
               WHERE 1=1`;
      const params = [];
      if (area)   { q += ' AND m.area = ?';   params.push(area); }
      if (estado) { q += ' AND m.estado = ?'; params.push(estado); }
      q += ' ORDER BY m.created_at DESC LIMIT 100';
      const rows = await env.DB.prepare(q).bind(...params).all();
      return addCors(ok({ mermas: rows.results }), cors);
    }

    // ── ADMIN ────────────────────────────────────────────────────────────────

    if (method === 'GET' && path === '/admin/usuarios') {
      const e = requireAdmin(session);
      if (e) return addCors(e, cors);
      const rows = await env.DB.prepare(
        `SELECT id, nombre, area, rol, activo, created_at FROM usuarios ORDER BY area, nombre`
      ).all();
      return addCors(ok({ usuarios: rows.results }), cors);
    }

    const mUsuario = path.match(/^\/admin\/usuarios\/([^/]+)$/);
    if (method === 'PATCH' && mUsuario) {
      const e = requireAdmin(session);
      if (e) return addCors(e, cors);
      const { activo } = body;
      await env.DB.prepare(`UPDATE usuarios SET activo = ? WHERE id = ?`)
        .bind(activo ? 1 : 0, mUsuario[1]).run();
      return addCors(ok(), cors);
    }

    if (method === 'GET' && path === '/admin/kpis') {
      const e = requireAdmin(session);
      if (e) return addCors(e, cors);
      const [prodsPend, mermasPend, prodsMes, mermasMes] = await Promise.all([
        env.DB.prepare(`SELECT COUNT(*) as n FROM producciones WHERE estado = 'pendiente'`).first(),
        env.DB.prepare(`SELECT COUNT(*) as n FROM mermas WHERE estado = 'pendiente'`).first(),
        env.DB.prepare(
          `SELECT area, COUNT(*) as n, SUM(cantidad) as total_kg
           FROM producciones WHERE fecha >= date('now','start of month')
           GROUP BY area`
        ).all(),
        env.DB.prepare(
          `SELECT area, COUNT(*) as n FROM mermas WHERE fecha >= date('now','start of month')
           GROUP BY area`
        ).all(),
      ]);
      return addCors(ok({
        pendientes: { producciones: prodsPend.n, mermas: mermasPend.n },
        este_mes:   { producciones: prodsMes.results, mermas: mermasMes.results },
      }), cors);
    }

    // ── REPORTES MTD (llamado por slack_reportes.py) ─────────────────────────

    if (method === 'GET' && path === '/reportes/mtd') {
      if (request.headers.get('X-Sync-Token') !== env.SYNC_TOKEN)
        return addCors(err('No autorizado', 401), cors);
      const desde = url.searchParams.get('desde');
      const hasta  = url.searchParams.get('hasta');
      if (!desde || !hasta) return addCors(err('desde y hasta requeridos'), cors);

      const [ventasRows, comprasRows, transEnvRows, transRecRows] = await Promise.all([
        env.DB.prepare(
          `SELECT tipo_producto, SUM(venta_neta) as total_ventas, SUM(costo_teorico) as total_costo
           FROM ventas_diarias WHERE fecha BETWEEN ? AND ? GROUP BY tipo_producto`
        ).bind(desde, hasta).all(),
        env.DB.prepare(
          `SELECT almacen, SUM(subtotal) as total
           FROM compras_diarias WHERE fecha BETWEEN ? AND ? GROUP BY almacen`
        ).bind(desde, hasta).all(),
        env.DB.prepare(
          `SELECT almacen_origen as almacen, SUM(costo_total) as total
           FROM transferencias_diarias WHERE fecha BETWEEN ? AND ? GROUP BY almacen_origen`
        ).bind(desde, hasta).all(),
        env.DB.prepare(
          `SELECT almacen_destino as almacen, SUM(costo_total) as total
           FROM transferencias_diarias WHERE fecha BETWEEN ? AND ? GROUP BY almacen_destino`
        ).bind(desde, hasta).all(),
      ]);

      return addCors(ok({
        ventas_por_tipo:          ventasRows.results,
        compras_por_almacen:      comprasRows.results,
        transferencias_enviadas:  transEnvRows.results,
        transferencias_recibidas: transRecRows.results,
      }), cors);
    }

    // ── SYNC (llamado por sync_d1.py) ────────────────────────────────────────

    if (method === 'POST' && path === '/sync/catalogo') {
      // Requiere header X-Sync-Token para autenticar el scraper
      if (request.headers.get('X-Sync-Token') !== env.SYNC_TOKEN)
        return addCors(err('No autorizado', 401), cors);
      const { articulos = [], subrecetas = [], mise_en_place = [] } = body;

      const stmts = [];

      for (const a of articulos) {
        stmts.push(env.DB.prepare(
          `INSERT INTO articulos (id_xetux, nombre, unidad, almacen, tipo_producto, stock_actual, costo_unit, costo_total, dias_vencimiento, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
           ON CONFLICT(id_xetux) DO UPDATE SET
             nombre=excluded.nombre, unidad=excluded.unidad, almacen=excluded.almacen,
             tipo_producto=excluded.tipo_producto, stock_actual=excluded.stock_actual,
             costo_unit=excluded.costo_unit, costo_total=excluded.costo_total,
             dias_vencimiento=excluded.dias_vencimiento, updated_at=excluded.updated_at`
        ).bind(a.id_xetux, a.nombre, a.unidad, a.almacen, a.tipo_producto || null,
               a.stock_actual || 0, a.costo_unit || 0, a.costo_total || 0,
               a.dias_vencimiento || null));
      }

      for (const s of subrecetas) {
        stmts.push(env.DB.prepare(
          `INSERT INTO subrecetas (id_xetux, nombre, unidad, rendimiento, area, updated_at)
           VALUES (?, ?, ?, ?, ?, datetime('now'))
           ON CONFLICT(id_xetux) DO UPDATE SET
             nombre=excluded.nombre, unidad=excluded.unidad,
             rendimiento=excluded.rendimiento, area=excluded.area, updated_at=excluded.updated_at`
        ).bind(s.id_xetux, s.nombre, s.unidad, s.rendimiento || 1, s.area));
      }

      // Mise en place: borrar y reinsertar por subreceta (para reflejar cambios en recetas)
      const subIds = [...new Set(mise_en_place.map(m => m.subreceta_id))];
      for (const sid of subIds) {
        stmts.push(env.DB.prepare(
          `DELETE FROM mise_en_place_catalogo WHERE subreceta_id = ?`
        ).bind(sid));
      }
      for (const m of mise_en_place) {
        stmts.push(env.DB.prepare(
          `INSERT INTO mise_en_place_catalogo (subreceta_id, ingrediente, codigo_xetux, cantidad_por_unidad, unidad)
           VALUES (?, ?, ?, ?, ?)`
        ).bind(m.subreceta_id, m.ingrediente, m.codigo_xetux || null, m.cantidad_por_unidad, m.unidad));
      }

      // D1 permite máximo 100 statements por batch — dividir si es necesario
      for (let i = 0; i < stmts.length; i += 100) {
        await env.DB.batch(stmts.slice(i, i + 100));
      }

      return addCors(ok({
        articulos: articulos.length,
        subrecetas: subrecetas.length,
        mise_en_place: mise_en_place.length,
      }), cors);
    }

    if (method === 'POST' && path === '/sync/inventario') {
      if (request.headers.get('X-Sync-Token') !== env.SYNC_TOKEN)
        return addCors(err('No autorizado', 401), cors);
      const { fecha, snapshots = [] } = body;
      if (!fecha) return addCors(err('fecha requerida'), cors);

      const stmts = snapshots.map(s =>
        env.DB.prepare(
          `INSERT OR REPLACE INTO inventario_snapshots (fecha, almacen, articulo_id, stock, costo_unit)
           VALUES (?, ?, ?, ?, ?)`
        ).bind(fecha, s.almacen, s.articulo_id, s.stock, s.costo_unit || 0)
      );
      for (let i = 0; i < stmts.length; i += 100) {
        await env.DB.batch(stmts.slice(i, i + 100));
      }
      return addCors(ok({ insertados: snapshots.length }), cors);
    }

    if (method === 'POST' && path === '/sync/compras') {
      if (request.headers.get('X-Sync-Token') !== env.SYNC_TOKEN)
        return addCors(err('No autorizado', 401), cors);
      const { fecha, compras = [] } = body;
      if (!fecha) return addCors(err('fecha requerida'), cors);
      // Borrar compras del día antes de reinsertar (idempotente)
      await env.DB.prepare(`DELETE FROM compras_diarias WHERE fecha = ?`).bind(fecha).run();
      const stmts = compras.map(c =>
        env.DB.prepare(
          `INSERT INTO compras_diarias (fecha, almacen, articulo_id, nombre, cantidad, unidad, subtotal)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).bind(fecha, c.almacen, c.articulo_id, c.nombre, c.cantidad, c.unidad, c.subtotal)
      );
      for (let i = 0; i < stmts.length; i += 100) {
        await env.DB.batch(stmts.slice(i, i + 100));
      }
      return addCors(ok({ insertados: compras.length }), cors);
    }

    if (method === 'POST' && path === '/sync/ventas') {
      if (request.headers.get('X-Sync-Token') !== env.SYNC_TOKEN)
        return addCors(err('No autorizado', 401), cors);
      const { fecha, ventas = [] } = body;
      if (!fecha) return addCors(err('fecha requerida'), cors);
      await env.DB.prepare(`DELETE FROM ventas_diarias WHERE fecha = ?`).bind(fecha).run();
      const stmts = ventas.map(v =>
        env.DB.prepare(
          `INSERT INTO ventas_diarias (fecha, tipo_producto, producto, ambiente, cantidad, venta_neta, costo_teorico)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).bind(fecha, v.tipo_producto, v.producto, v.ambiente, v.cantidad, v.venta_neta, v.costo_teorico)
      );
      for (let i = 0; i < stmts.length; i += 100) {
        await env.DB.batch(stmts.slice(i, i + 100));
      }
      return addCors(ok({ insertados: ventas.length }), cors);
    }

    if (method === 'POST' && path === '/sync/transferencias') {
      if (request.headers.get('X-Sync-Token') !== env.SYNC_TOKEN)
        return addCors(err('No autorizado', 401), cors);
      const { fecha, transferencias = [] } = body;
      if (!fecha) return addCors(err('fecha requerida'), cors);
      await env.DB.prepare(`DELETE FROM transferencias_diarias WHERE fecha = ?`).bind(fecha).run();
      const stmts = transferencias.map(t =>
        env.DB.prepare(
          `INSERT INTO transferencias_diarias (fecha, almacen_origen, almacen_destino, nombre, cantidad, unidad, costo_unit, costo_total)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(fecha, t.almacen_origen, t.almacen_destino, t.nombre, t.cantidad, t.unidad, t.costo_unit, t.costo_total)
      );
      for (let i = 0; i < stmts.length; i += 100) {
        await env.DB.batch(stmts.slice(i, i + 100));
      }
      return addCors(ok({ insertados: transferencias.length }), cors);
    }

    if (method === 'POST' && path === '/sync/inventario-cerrado') {
      if (request.headers.get('X-Sync-Token') !== env.SYNC_TOKEN)
        return addCors(err('No autorizado', 401), cors);
      const { mes, almacen, articulos = [] } = body;
      if (!mes || !almacen) return addCors(err('mes y almacen requeridos'), cors);
      // Borrar y reinsertar para que sea idempotente
      await env.DB.prepare(
        `DELETE FROM inventario_cerrado_mensual WHERE mes = ? AND almacen = ?`
      ).bind(mes, almacen).run();
      const stmts = articulos.map(a =>
        env.DB.prepare(
          `INSERT INTO inventario_cerrado_mensual (mes, almacen, articulo_id, nombre, unidad, cantidad, costo_unit, costo_total)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(mes, almacen, a.articulo_id, a.nombre, a.unidad, a.cantidad, a.costo_unit, a.costo_total)
      );
      for (let i = 0; i < stmts.length; i += 100) {
        await env.DB.batch(stmts.slice(i, i + 100));
      }
      return addCors(ok({ insertados: articulos.length }), cors);
    }

    // ── XETUX CALLBACKS (desde cargar_xetux.py) ──────────────────────────────

    if (method === 'POST' && path === '/xetux/produccion-cargada') {
      if (request.headers.get('X-Sync-Token') !== env.SYNC_TOKEN)
        return addCors(err('No autorizado', 401), cors);
      const { id, exito, error_msg } = body;
      const estado = exito ? 'cargado' : 'error_carga';
      await env.DB.prepare(`UPDATE producciones SET estado = ? WHERE id = ?`).bind(estado, id).run();
      const prod = await env.DB.prepare(
        `SELECT p.*, s.nombre as sub_nombre FROM producciones p JOIN subrecetas s ON s.id_xetux = p.subreceta_id WHERE p.id = ?`
      ).bind(id).first();
      if (prod) {
        const canal = CANAL_AREA[prod.area] || '#reportes-almacen';
        const emoji = exito ? '✅' : '❌';
        await slackPost(env, canal, `Producción ${estado}`, [{
          type: 'section',
          text: { type: 'mrkdwn',
            text: `${emoji} *${prod.sub_nombre}* — ${prod.cantidad} unidades\n` +
                  (exito ? `_Cargado correctamente en xetux._` : `_Error: ${error_msg}_`)
          }
        }]);
      }
      return addCors(ok(), cors);
    }

    if (method === 'POST' && path === '/xetux/merma-cargada') {
      if (request.headers.get('X-Sync-Token') !== env.SYNC_TOKEN)
        return addCors(err('No autorizado', 401), cors);
      const { id, exito, error_msg } = body;
      const estado = exito ? 'cargado' : 'error_carga';
      await env.DB.prepare(`UPDATE mermas SET estado = ? WHERE id = ?`).bind(estado, id).run();
      return addCors(ok(), cors);
    }

    return addCors(new Response('Not found', { status: 404 }), cors);
  },
};

function addCors(response, headers) {
  const r = new Response(response.body, response);
  Object.entries(headers).forEach(([k, v]) => r.headers.set(k, v));
  return r;
}
