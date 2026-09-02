#!/usr/bin/env node
// Une la toma de BARRA_AMICI del 2026-08-25 (Daniel) a la del 2026-08-22 (César),
// y promueve a la plantilla nueva los no catalogados que ya tienen código.
//
// Uso: node tools/unir-tomas-amici.mjs [--ejecutar]
//
// POR QUÉ SE PUEDE UNIR: las dos sesiones traen el MISMO templateHash
// (5b682b6a3dc010ed), el mismo zoneConfigId y el mismo zoneSnapshot. Las claves
// de rebanada son POSICIONALES (`zonaIdx:deviceId`), así que sólo significan lo
// mismo en las dos si el snapshot de zonas es idéntico. Verificado abajo, y aborta
// si no lo es. Las fechas no son contiguas (22 vs 25), así que
// agruparFechasEnConteos() del admin NO las junta sola: hay que moverlas.
//
// LOS TRASLAPES NO SE BORRAN. 8 códigos los midieron los dos. En vez de reescribir
// la rebanada de César (que la reemplazaría entera — mergeZoneMap, sesion-merge.js:9)
// se fija el total con una corrección `_admin`, que `calcularTotalesSesion` aplica
// por encima de la suma. Las dos capturas siguen visibles y la decisión queda firmada.

const WORKER = 'https://operaciones-api.pablo-aranda.workers.dev';
const APP_VERSION = 2;
const ALMACEN = 'BARRA_AMICI';
const DESTINO = '2026-08-22';   // toma de César, donde vive el grueso
const ORIGEN  = '2026-08-25';   // toma de Daniel, que se mueve
const ADMIN   = 'Pablo';
const TS      = new Date().toISOString();
const K_DANIEL = '0:mt9h8cowtjaaal5stko';
const K_PROMO  = '0:PROMO-2026-08-26';

// Traslapes: se conserva la medición de Daniel (la más reciente). qty va en unidad
// BASE, que es lo que `calcularTotalesSesion` escribe tal cual sobre el total.
const TRASLAPES = [
  ['XMAT2412000618', 0.56,  'LICOR GRAN BASSANO VERMUT BLANCO'],
  ['XMAT2412000619', 0.35,  'LICOR GRAN BASSANO VERMUT TINTO'],
  ['XMAT2607001502', 0.45,  'SAK NAMI JUNMAI'],
  ['XMAT2606001489', 2.175, 'VR USA BAREFOOT PINK MOSCATO'],
  ['XMAT2608001523', 0.56,  'GIN ENGINE'],
  ['XMAT2410000355', 0.75,  'LICOR DE VIOLETTA'],
  ['XMAT2606001468', 0.45,  'MEZ CREYENTE TOBALA'],
  ['XMAT2608001524', 0.7,   'TEQ RESERVA DE LA FAMILIA CRITALINO PX'],
];

// No catalogados que la plantilla nueva YA trae. Se capturan como 1 botella y el
// factor lo pone la presentación de la plantilla — que es justo lo que faltaba:
// Daniel los subió como "1 L" y no todos son de litro.
const PROMOVER = [
  ['XMAT2608001545', 1, 'mt9h8cowtjaaal5stko-mt9inaeo-cmca', 'Tequila Tapatio 110'],
  ['XMAT2608001552', 1, 'mt9h8cowtjaaal5stko-mt9io2v6-d7jg', 'Don Fulano reposado'],
  ['XMAT2608001548', 1, 'mt9h8cowtjaaal5stko-mt9j7k5r-jmh0', 'Mezcal Derrumbes Durango'],
  ['XMAT2608001556', 1, 'mt9h8cowtjaaal5stko-mt9j87uu-qbpu', 'Derrumbes michoacan'],
  ['XMAT2608001551', 1, 'mt9h8cowtjaaal5stko-mt9j8vlv-1mb9', 'Espina negra jabali'],
  ['XMAT2608001547', 1, 'mt9h8cowtjaaal5stko-mt9jb4ic-o7fg', 'Tequileño reposado gran reserva'],
  ['XMAT2608001553', 1, 'mt9h8cowtjaaal5stko-mt9jbwie-isfo', 'Tequileño still strenght'],
  ['XMAT2608001550', 1, 'mt5dyg7vpr5zlxo7qwf-mt5gm1d7-5w16', 'TEQ. Macurichos (de César)'],
];

// Los tres Dos Deus de Daniel duplican los de César, que ya traen presentación.
// Se conserva la captura de César y se descartan las de Daniel.
const DUPES_DANIEL = {
  'mt9h8cowtjaaal5stko-mt9jhkhg-ga0a': 'Dos Deus Red = Vermuth Dos Deus Rosso (César)',
  'mt9h8cowtjaaal5stko-mt9jhvvv-noyw': 'Dos Deus white = Vermuth Dosdeus Blanc. (César)',
  'mt9h8cowtjaaal5stko-mt9ji97n-h7p2': 'Dos Deus somke = Vermuth dos deus Smoked Red (César)',
};

// 750 ml tecleados como cantidad, con factor 0.75 encima → 562.5. Son 1 botella.
const CORRIGE_562 = {
  'mt5dyg7vpr5zlxo7qwf-mt5fygue-y1r5': 'Vermuth dos deus Smoked Red',
  'mt5dyg7vpr5zlxo7qwf-mt5fzrc9-xnwm': 'Vermuth Dos Deus Rosso',
};

const EJECUTAR = process.argv.includes('--ejecutar');
const j = async (u, i) => { const r = await fetch(u, i); const b = await r.json();
  if (!r.ok) throw new Error(`${r.status} ${u}\n${JSON.stringify(b)}`); return b; };

const [A, B, T] = await Promise.all([
  j(`${WORKER}/inv/sesion?almacen=${ALMACEN}&fecha=${DESTINO}`),
  j(`${WORKER}/inv/sesion?almacen=${ALMACEN}&fecha=${ORIGEN}`),
  j(`${WORKER}/inv/plantilla?almacen=${ALMACEN}`),
]);
if (!A.found || !B.found) throw new Error('Falta alguna de las dos tomas');
if (A.exportedAt || B.exportedAt) throw new Error('Alguna toma ya se exportó. Abortado.');

// ── Guarda dura: las claves posicionales sólo significan lo mismo si el snapshot
// de zonas es idéntico. Sin esto, mover una rebanada la remapea en silencio.
const firma = S => JSON.stringify((S.zoneSnapshot || []).map(z => [z.nombre, (z.items || []).length]));
if (firma(A) !== firma(B)) throw new Error(`zoneSnapshot distinto:\n  ${DESTINO}: ${firma(A)}\n  ${ORIGEN}: ${firma(B)}`);
if (A.templateHash !== B.templateHash) throw new Error(`templateHash distinto: ${A.templateHash} vs ${B.templateHash}`);
const TEMPLATE_HASH = A.templateHash;   // el upsert NO conserva el previo: hay que reenviarlo

console.log(`Destino ${ALMACEN} ${DESTINO} (${A.operario})`);
console.log(`Origen  ${ALMACEN} ${ORIGEN} (${B.operario})`);
console.log(`        zoneSnapshot idéntico ✓ · templateHash ${TEMPLATE_HASH} ✓`);
console.log(`        plantilla viva en D1: ${T.templateHash} (${Object.keys(T.rowMap).length} artículos)`);
if (T.templateHash !== TEMPLATE_HASH) {
  console.log(`        ⚠️  la plantilla cambió DESPUÉS del conteo — por eso hay códigos que promover`);
}

const counts = B.countsByZone[K_DANIEL];
console.log(`\n1. Rebanada de Daniel ${K_DANIEL}: ${Object.keys(counts).length} códigos → se copia tal cual`);

console.log(`\n2. Traslapes fijados con corrección _admin (se conserva la medición de Daniel):`);
const corr = {};
for (const [cod, qty, nom] of TRASLAPES) {
  corr[cod] = { qty, operario: ADMIN, ts: TS, nota: 'Recuento: César y Daniel midieron la misma botella. Se conserva la del 25.' };
  console.log(`   ${cod.padEnd(18)} → ${String(qty).padStart(6)}   ${nom}`);
}

console.log(`\n3. No catalogados promovidos a la plantilla nueva (rebanada ${K_PROMO}):`);
const promo = {}, promoPres = {}, quitar = [];
for (const [cod, q, id, nom] of PROMOVER) {
  const p = T.presMap[cod];
  if (!p?.length) throw new Error(`${cod} no tiene presentación en la plantilla nueva`);
  promo[cod] = q; promoPres[cod] = p[0].factor; quitar.push(id);
  console.log(`   ${nom.padEnd(34)} → ${cod} · ${q} × ${p[0].factor} = ${+(q * p[0].factor).toFixed(4)} ${T.unitMap[cod]}  (${p[0].nombre})`);
}

console.log(`\n4. No catalogados de Daniel que se mueven (siguen sin código):`);
const manuales = [];
for (const m of (B.manuales || [])) {
  if (quitar.includes(m.id)) continue;
  if (m.id in DUPES_DANIEL) { console.log(`   · descartado — ${DUPES_DANIEL[m.id]}`); quitar.push(m.id); continue; }
  manuales.push(m);
  console.log(`   ${m.nombre.padEnd(34)} ${m.cantidad} ${m.uni}`);
}

console.log(`\n5. Correcciones a los no catalogados de César:`);
for (const m of (A.manuales || [])) {
  if (m.id in CORRIGE_562) {
    manuales.push({ ...m, cantidad: 0.75, cantidadRaw: 1, factor: 0.75, presentacion: 'Botella 750 ml', updatedAt: TS });
    console.log(`   ${m.nombre.padEnd(34)} ${m.cantidad} → 0.75`);
  }
}

console.log(`\nResumen: rebanadas ${Object.keys(A.countsByZone).length} → ${Object.keys(A.countsByZone).length + 2}`);
console.log(`         ${TRASLAPES.length} correcciones · ${PROMOVER.length} promovidos · ${manuales.length} no catalogados escritos · ${quitar.length} retirados`);

if (!EJECUTAR) { console.log(`\n── DRY RUN ── no se escribió nada. Añade --ejecutar para aplicarlo.`); process.exit(0); }

const res = await j(`${WORKER}/inv/sesion`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'inv_sesion', appVersion: APP_VERSION,
    almacen: ALMACEN, fecha: DESTINO, operario: `${ADMIN} (unión de tomas)`,
    templateHash: TEMPLATE_HASH,
    countsByZone:     { [K_DANIEL]: counts, [K_PROMO]: promo },
    presChoiceByZone: { [K_DANIEL]: B.presChoiceByZone?.[K_DANIEL] || {}, [K_PROMO]: promoPres },
    correctionsByZone: { '_admin': corr },
    manuales,
    removeManuales: quitar,
  }),
});
console.log(`\nPOST /inv/sesion → ${JSON.stringify(res).slice(0, 200)}`);

const V = await j(`${WORKER}/inv/sesion?almacen=${ALMACEN}&fecha=${DESTINO}`);
let ok = true;
console.log(`\nVerificación:`);
console.log(`  rebanadas: ${Object.entries(V.countsByZone).map(([k, v]) => `${k} (${Object.keys(v).length})`).join(', ')}`);
for (const [k, v] of Object.entries(A.countsByZone)) {
  const ahora = Object.keys(V.countsByZone?.[k] || {}).length;
  if (ahora < Object.keys(v).length) ok = false;
  console.log(`  ${k}: ${Object.keys(v).length} → ${ahora} ${ahora >= Object.keys(v).length ? '✓ intacta' : '✗ PERDIÓ'}`);
}
const nc = Object.keys(V.correctionsByZone?._admin || {}).length;
if (nc !== TRASLAPES.length) ok = false;
console.log(`  correcciones _admin: ${nc}/${TRASLAPES.length} ${nc === TRASLAPES.length ? '✓' : '✗'}`);
const hashOk = V.templateHash === TEMPLATE_HASH;
if (!hashOk) ok = false;
console.log(`  template_hash: ${V.templateHash || '(vacío)'} ${hashOk ? '✓' : '✗ SE PERDIÓ'}`);
console.log(`  no catalogados: ${(V.manuales || []).length}`);
for (const m of (V.manuales || [])) console.log(`     ${m.nombre} — ${m.cantidad} ${m.uni}`);
process.exit(ok ? 0 : 1);
