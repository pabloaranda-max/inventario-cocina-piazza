#!/usr/bin/env node
// Agrega una zona a una toma YA ABIERTA, al final de su zoneSnapshot congelado.
//
// Uso: node tools/agregar-zona-a-toma.mjs <FECHA> "<NOMBRE ZONA>" <ALM1> [ALM2 …] [--ejecutar]
//   Sin --ejecutar solo imprime el SQL y NO escribe nada.
//
// Por qué existe: `zone_snapshot` es first-write-wins en el Worker
// (`CASE WHEN zone_snapshot = '' THEN excluded.zone_snapshot ELSE zone_snapshot END`),
// así que una toma en curso NUNCA ve las zonas que el admin prepare después. El
// 2026-08-16 eso dejó a UH_COCINA contando 6 refris dentro de una sola zona.
// Esto es la feature "Agregar zona" (spec §15) hecha a mano mientras no exista.
//
// REGLA QUE HACE ESTO SEGURO — APPEND ONLY:
// la clave de conteo es POSICIONAL (`zonaIdx:deviceId`). Agregar al final no mueve
// ningún índice existente, así que todas las rebanadas ya capturadas conservan su
// significado. Insertar, reordenar o borrar las remapearía en silencio, y ni el
// acuse lo detectaría porque también guarda `zoneIndex`. Este script solo agrega.
//
// Escribe con `wrangler d1 execute --remote`; requiere sesión OAuth de Cloudflare.

import { execFileSync } from 'node:child_process';

const WORKER = 'https://operaciones-api.pablo-aranda.workers.dev';
const WRANGLER_CWD = new URL('../worker/operaciones-api/', import.meta.url).pathname;
const DB = 'operaciones-db';

const args = process.argv.slice(2);
const EJECUTAR = args.includes('--ejecutar');
const libres = args.filter(a => a !== '--ejecutar');
const [FECHA, NOMBRE, ...ALMACENES] = libres;

if (!FECHA || !NOMBRE || !ALMACENES.length) {
  console.error('Uso: node tools/agregar-zona-a-toma.mjs <FECHA> "<NOMBRE>" <ALM…> [--ejecutar]');
  process.exit(1);
}

const sql = s => `'${String(s).replace(/'/g, "''")}'`;

const planes = [];
for (const almacen of ALMACENES) {
  const r = await fetch(`${WORKER}/inv/sesion?almacen=${almacen}&fecha=${FECHA}`);
  const S = await r.json();
  if (!S.found) { console.error(`✗ ${almacen}: no hay toma el ${FECHA} — se omite`); continue; }

  const zonas = S.zoneSnapshot || [];
  if (!zonas.length) { console.error(`✗ ${almacen}: la toma no tiene zoneSnapshot — se omite`); continue; }
  if (zonas.some(z => z?.nombre === NOMBRE)) {
    console.error(`· ${almacen}: ya tiene la zona "${NOMBRE}" — se omite (idempotente)`);
    continue;
  }

  // La zona nueva ofrece el mismo catálogo que la primera: en el almacén general
  // puede aparecer cualquier artículo del almacén. Copiar sus items evita
  // depender del catálogo de D1 y garantiza la misma forma exacta.
  const base = zonas[0];
  const nueva = { nombre: NOMBRE, color: '#0f766e', items: base.items };
  const zonasNuevas = [...zonas, nueva];

  planes.push({
    almacen,
    antes: zonas.map(z => z.nombre),
    despues: zonasNuevas.map(z => z.nombre),
    indice: zonas.length,
    items: nueva.items.length,
    rebanadas: Object.fromEntries(
      Object.entries(S.countsByZone || {}).map(([k, v]) => [k, Object.keys(v).length])),
    sentencia:
      `UPDATE inv_sesiones SET zone_snapshot = ${sql(JSON.stringify(zonasNuevas))} ` +
      `WHERE almacen = ${sql(almacen)} AND fecha = ${sql(FECHA)};`,
  });
}

if (!planes.length) { console.log('\nNada que hacer.'); process.exit(0); }

console.log(`\nZona a agregar: "${NOMBRE}"   ·   toma del ${FECHA}\n`);
for (const p of planes) {
  console.log(`${p.almacen}`);
  console.log(`  antes   : ${JSON.stringify(p.antes)}`);
  console.log(`  después : ${JSON.stringify(p.despues)}   ← nueva en el índice ${p.indice}`);
  console.log(`  catálogo: ${p.items} artículos disponibles en la zona nueva`);
  console.log(`  rebanadas ya capturadas (no se tocan): ${JSON.stringify(p.rebanadas)}`);
  console.log();
}

if (!EJECUTAR) {
  console.log('── DRY RUN ── no se escribió nada. Añade --ejecutar para aplicarlo.');
  process.exit(0);
}

// Respaldo antes de escribir: el valor anterior queda impreso y recuperable.
console.log('Respaldo del zone_snapshot anterior:');
for (const p of planes) {
  console.log(`  ${p.almacen}: ${JSON.stringify(p.antes)} (${p.items} items por zona)`);
}

const lote = planes.map(p => p.sentencia).join('\n');
const out = execFileSync('npx', [
  'wrangler', 'd1', 'execute', DB, '--remote', '--json', '--command', lote,
], { cwd: WRANGLER_CWD, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const meta = JSON.parse(out.slice(out.indexOf('[')));
const cambios = meta.reduce((s, r) => s + (r?.meta?.changes || 0), 0);
console.log(`\nFilas modificadas: ${cambios} (esperadas ${planes.length})`);

// Verificación: releer del Worker, no de la escritura.
console.log('\nVerificación desde el Worker:');
let ok = true;
for (const p of planes) {
  const S = await (await fetch(`${WORKER}/inv/sesion?almacen=${p.almacen}&fecha=${FECHA}`)).json();
  const nombres = (S.zoneSnapshot || []).map(z => z.nombre);
  const rebanadas = Object.fromEntries(
    Object.entries(S.countsByZone || {}).map(([k, v]) => [k, Object.keys(v).length]));
  const zonasOk = JSON.stringify(nombres) === JSON.stringify(p.despues);
  const conteosOk = JSON.stringify(rebanadas) === JSON.stringify(p.rebanadas);
  if (!zonasOk || !conteosOk) ok = false;
  console.log(`  ${zonasOk && conteosOk ? '✓' : '✗'} ${p.almacen}: ${JSON.stringify(nombres)}`);
  console.log(`     conteos intactos: ${conteosOk ? 'sí' : 'NO — REVISAR'} ${JSON.stringify(rebanadas)}`);
}
process.exit(ok ? 0 : 1);
