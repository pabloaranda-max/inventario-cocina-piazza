#!/usr/bin/env node
// Duplica el conteo de un almacén DENTRO de la toma de otro, como rebanada nueva.
//
// Uso: node tools/duplicar-conteo-entre-almacenes.mjs \
//        <ALM_ORIGEN> <FECHA_ORIGEN> <ALM_DESTINO> <FECHA_DESTINO> [opciones]
//   --zona N         zona destino (default 0)
//   --manuales       copia también los ítems no catalogados del origen
//   --cerrar-zona    marca la rebanada como zona cerrada (ver abajo: NO por default)
//   --ejecutar       aplica; sin esto solo imprime el plan
//
// REGLA QUE HACE ESTO SEGURO — CLAVE DE REBANADA NUEVA:
// se escribe bajo `zonaIdx:DUP-<ORIGEN>-<FECHA_ORIGEN>`, una clave que no pertenece
// a ningún teléfono. mergeZoneMap (js/sesion-merge.js:9) solo REEMPLAZA la rebanada
// cuya clave viene en el POST, así que no pisa la de nadie ni la pisan los syncs que
// sigan llegando. calcularTotalesSesion (js/sesion-merge.js:73) SUMA sobre las
// rebanadas, así que el conteo duplicado se agrega al que ya había en el destino.
//
// SE COPIA LA CANTIDAD BASE, NO EL NÚMERO TECLEADO:
// el origen y el destino tienen plantillas distintas, así que el mismo código puede
// traer otro factor de presentación. Se resuelve el factor con la plantilla del ORIGEN
// (presChoiceByZone si lo eligió el operario, si no factorDefault), se suma en unidad
// base y se escribe con presChoice = 1 en el destino. Así el número que entra a los
// totales es exactamente el del origen, sin importar el presMap del destino.
//
// POR QUÉ --cerrar-zona NO ES EL DEFAULT:
// el export calcula las zonas abiertas como `zoneSnapshot.length - completedZones`
// (admin.html:1935). Marcar esta rebanada como cerrada apagaría el aviso
// "quedan N zonas sin cerrar" aunque el operario del destino siga contando.

const WORKER = 'https://operaciones-api.pablo-aranda.workers.dev';
const APP_VERSION = 2;             // R12: por debajo de MIN_APP_VERSION → 426.

const args = process.argv.slice(2);
const flag = n => args.includes(n);
const opt  = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const EJECUTAR = flag('--ejecutar');
const CON_MANUALES = flag('--manuales');
const CERRAR = flag('--cerrar-zona');
const libres = args.filter((a, i) =>
  !a.startsWith('--') && args[i - 1] !== '--zona');
const [ORIGEN, FECHA_ORIGEN, DESTINO, FECHA_DESTINO] = libres;
const ZONA = parseInt(opt('--zona', '0'), 10);

if (!ORIGEN || !FECHA_ORIGEN || !DESTINO || !FECHA_DESTINO) {
  console.error('Uso: node tools/duplicar-conteo-entre-almacenes.mjs <ALM_ORIGEN> <FECHA_ORIGEN> <ALM_DESTINO> <FECHA_DESTINO> [--zona N] [--manuales] [--cerrar-zona] [--ejecutar]');
  process.exit(1);
}
const CLAVE = `${ZONA}:DUP-${ORIGEN}-${FECHA_ORIGEN}`;
const OPERARIO = `Duplicado de ${ORIGEN} ${FECHA_ORIGEN}`;

const j = async (url, init) => {
  const r = await fetch(url, init);
  const body = await r.json();
  if (!r.ok) throw new Error(`${r.status} ${url}\n${JSON.stringify(body)}`);
  return body;
};
// Misma regla que js/sesion-merge.js: presMap explícito, luego defaultPres, si no 1.
const factorDefault = (T, cod) => {
  const e = T?.presMap?.[cod];
  if (e?.length) return e[0].factor;
  return (T?.defaultPres?.[T?.unitMap?.[cod] || ''] || [])[0]?.factor ?? 1;
};
const cantidadBase = (val, f) => Array.isArray(val)
  ? val.reduce((s, l) => s + (Number(l?.q) || 0) * (Number(l?.f) || 0), 0)
  : (Number(val) || 0) * f;

// ── 1. Las dos tomas y las dos plantillas ──────────────────────────────────
const [O, D, TO, TD] = await Promise.all([
  j(`${WORKER}/inv/sesion?almacen=${ORIGEN}&fecha=${FECHA_ORIGEN}`),
  j(`${WORKER}/inv/sesion?almacen=${DESTINO}&fecha=${FECHA_DESTINO}`),
  j(`${WORKER}/inv/plantilla?almacen=${ORIGEN}`),
  j(`${WORKER}/inv/plantilla?almacen=${DESTINO}`),
]);
if (!O.found) throw new Error(`No hay toma ${ORIGEN} ${FECHA_ORIGEN}`);
if (!D.found) throw new Error(`No hay toma ${DESTINO} ${FECHA_DESTINO}`);
// El upsert del Worker hace `template_hash = excluded.template_hash` sin CASE, así
// que un POST que lo omita lo deja en blanco. Se reenvía SIEMPRE el del destino.
const TEMPLATE_HASH = D.templateHash || TD.templateHash;
// La plantilla del destino puede haber cambiado desde que nació la toma (subir una
// plantilla nueva NO reescribe el template_hash de la sesión). A diferencia de
// cargar-conteo-papel.mjs, aquí eso NO invalida nada: se escribe cantidad base con
// presChoice = 1, así que el presMap del destino no interviene en estos números. Se
// reenvía el hash ORIGINAL de la sesión para no reescribir con qué se capturó; el
// export ya tiene su propio camino de verificación para el desfase (admin.html:1885).
if (D.templateHash && D.templateHash !== TD.templateHash) {
  console.warn(`\n⚠️  La plantilla de ${DESTINO} cambió desde que nació la toma:`);
  console.warn(`   sesión ${D.templateHash} · D1 ${TD.templateHash}`);
  console.warn(`   Se conserva el de la sesión. El export pedirá su confirmación aparte.`);
  console.warn(`   El rowMap que se valida abajo es el de la plantilla NUEVA (la que exporta).\n`);
}
if (!(D.zoneSnapshot || [])[ZONA]) throw new Error(`La toma destino no tiene zona ${ZONA}`);
if (D.exportedAt) {
  console.warn(`\n⚠️  La toma destino YA SE EXPORTÓ (${D.exportedAt} por ${D.exportedBy}).`);
  console.warn(`   Duplicar cambia los totales pero NO reenvía nada a Xetux.\n`);
}

console.log(`Origen   ${ORIGEN} · ${FECHA_ORIGEN} · ${O.operario}`);
console.log(`         ${Object.keys(O.countsByZone || {}).length} rebanada(s) sobre ${(O.zoneSnapshot || []).length} zona(s)`);
console.log(`Destino  ${DESTINO} · ${FECHA_DESTINO} · ${D.operario}`);
console.log(`         zona ${ZONA} "${D.zoneSnapshot[ZONA].nombre}" · plantilla ${TEMPLATE_HASH} ✓`);
console.log(`         rebanadas vivas: ${Object.entries(D.countsByZone || {})
  .map(([k, v]) => `${k} (${Object.keys(v).length})`).join(', ') || 'ninguna'}`);

// ── 2. Origen → cantidad base por código, sumando sus zonas ────────────────
const base = {}, deZona = {};
for (const [zid, zc] of Object.entries(O.countsByZone || {})) {
  const zi = parseInt(zid);
  for (const [cod, val] of Object.entries(zc || {})) {
    const f = (O.presChoiceByZone?.[zid]?.[cod]) ?? factorDefault(TO, cod);
    base[cod] = +((base[cod] || 0) + cantidadBase(val, f)).toFixed(4);
    (deZona[cod] ||= []).push(O.zoneSnapshot?.[zi]?.nombre || zid);
  }
}
const codigos = Object.keys(base);

// ── 3. ¿Sobreviven al export del destino? rowMap es lo que manda ───────────
const fuera = codigos.filter(c => TD.rowMap?.[c] === undefined);
const catDest = Object.fromEntries((D.zoneSnapshot[ZONA].items || []).map(i => [i.cod, i]));
const nombre = c => (catDest[c] || {}).art
  || Object.fromEntries((O.zoneSnapshot || []).flatMap(z => (z.items || []).map(i => [i.cod, i.art])))[c]
  || c;

const yaCapturado = {};
for (const [k, zc] of Object.entries(D.countsByZone || {})) {
  if (k === CLAVE) continue;
  const pc = (D.presChoiceByZone || {})[k] || {};
  for (const [cod, val] of Object.entries(zc || {})) {
    yaCapturado[cod] = (yaCapturado[cod] || 0) + cantidadBase(val, pc[cod] ?? factorDefault(TD, cod));
  }
}

console.log(`\n  ${'código'.padEnd(16)}${'base'.padStart(9)}${'ya en dest'.padStart(11)}${'total'.padStart(9)}  rowMap  artículo`);
for (const c of codigos) {
  const ya = yaCapturado[c];
  const tot = +((ya || 0) + base[c]).toFixed(4);
  console.log(`  ${c.padEnd(16)}${String(base[c]).padStart(9)}${String(ya === undefined ? '—' : +ya.toFixed(4)).padStart(11)}${String(tot).padStart(9)}  ${TD.rowMap?.[c] === undefined ? ' ✗ NO ' : '  sí  '}  ${nombre(c)}`);
  if (deZona[c].length > 1) console.log(`  ${''.padEnd(16)}${''.padStart(9)}   ← suma ${deZona[c].length} zonas del origen: ${deZona[c].join(' + ')}`);
}

const manuales = CON_MANUALES ? (O.manuales || []).map(m => ({
  ...m,
  id: `dup-${ORIGEN}-${FECHA_ORIGEN}-${m.id}`,
  descripcion: m.descripcion || `${m.zona || ''} (de ${ORIGEN})`.trim(),
})) : [];

console.log(`\nResumen: ${codigos.length} códigos entran en la rebanada nueva ${CLAVE}`);
console.log(`         ${codigos.filter(c => c in yaCapturado).length} ya estaban en el destino y se SUMAN`);
console.log(`         ${codigos.length - codigos.filter(c => c in yaCapturado).length} son códigos nuevos para esta toma`);
if (CON_MANUALES) console.log(`         + ${manuales.length} ítem(s) no catalogado(s) copiados`);
if (fuera.length) {
  console.log(`\n⚠️  ${fuera.length} código(s) NO están en el rowMap de ${DESTINO}:`);
  for (const c of fuera) console.log(`     ${c}  ${nombre(c)}  (${base[c]})`);
  console.log(`   El XLSX los filtra (admin.html:1962) y, si el hash de la plantilla`);
  console.log(`   cambió, admin.html:1893 BLOQUEA el export entero por ellos.`);
}
if (CERRAR) console.log(`\n⚠️  --cerrar-zona: la zona ${ZONA} contará como cerrada aunque su operario siga contando.`);

if (!EJECUTAR) {
  console.log(`\n── DRY RUN ── no se escribió nada. Añade --ejecutar para aplicarlo.`);
  process.exit(0);
}

// ── 4. Escribir ────────────────────────────────────────────────────────────
const presChoice = Object.fromEntries(codigos.map(c => [c, 1]));  // base ya resuelta
const res = await j(`${WORKER}/inv/sesion`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'inv_sesion',
    appVersion: APP_VERSION,
    almacen: DESTINO, fecha: FECHA_DESTINO, operario: OPERARIO,
    templateHash: TEMPLATE_HASH,   // obligatorio: el upsert no conserva el previo
    countsByZone:     { [CLAVE]: base },
    presChoiceByZone: { [CLAVE]: presChoice },
    ...(CERRAR ? { completedZones: [CLAVE] } : {}),
    ...(manuales.length ? { manuales } : {}),
    requestReceipt:   true,
    receiptZoneKey:   CLAVE,
    receiptZoneName:  D.zoneSnapshot[ZONA].nombre,
    receiptEventId:   `dup-${ORIGEN}-${FECHA_ORIGEN}-a-${DESTINO}-${FECHA_DESTINO}-z${ZONA}`,
  }),
});
console.log(`\nPOST /inv/sesion → ok:${res.ok} acuse:${res.receipt?.id || '—'}`);

// ── 5. Releer del Worker y confirmar que nada se pisó ──────────────────────
const V = await j(`${WORKER}/inv/sesion?almacen=${DESTINO}&fecha=${FECHA_DESTINO}`);
const nueva = V.countsByZone?.[CLAVE] || {};
console.log(`\nVerificación:`);
console.log(`  rebanadas ahora: ${Object.entries(V.countsByZone)
  .map(([k, v]) => `${k} (${Object.keys(v).length})`).join(', ')}`);
let ok = Object.keys(nueva).length === codigos.length;
console.log(`  ${CLAVE}: ${Object.keys(nueva).length}/${codigos.length} códigos ${ok ? '✓' : '✗ NO COINCIDE'}`);
for (const [k, v] of Object.entries(D.countsByZone || {})) {
  if (k === CLAVE) continue;
  const antes = Object.keys(v).length;
  const ahora = Object.keys(V.countsByZone?.[k] || {}).length;
  if (ahora < antes) ok = false;
  console.log(`  ${k}: ${antes} → ${ahora} ${ahora >= antes ? '✓ intacta' : '✗ PERDIÓ ARTÍCULOS'}`);
}
const hashOk = V.templateHash === TEMPLATE_HASH;
if (!hashOk) ok = false;
console.log(`  template_hash: ${V.templateHash || '(vacío)'} ${hashOk ? '✓' : '✗ SE PERDIÓ'}`);
console.log(`  acuses: ${(V.receipts || []).length}`);
process.exit(ok ? 0 : 1);
