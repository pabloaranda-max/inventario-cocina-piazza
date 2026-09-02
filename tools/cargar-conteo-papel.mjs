#!/usr/bin/env node
// Carga a una toma VIVA un conteo levantado en papel, como una rebanada nueva.
//
// Uso: node tools/cargar-conteo-papel.mjs [--ejecutar]
//   Sin --ejecutar solo imprime el plan y NO escribe nada.
//
// REGLA QUE HACE ESTO SEGURO — CLAVE DE REBANADA NUEVA:
// se escribe bajo `zonaIdx:PAPEL-fecha`, una clave que no pertenece a ningún
// teléfono. mergeZoneMap (js/sesion-merge.js:9) solo REEMPLAZA la rebanada cuya
// clave viene en el POST, así que ni los syncs que sigan llegando la pisan ni
// esta pisa la de nadie. calcularTotalesSesion SUMA sobre las rebanadas, así que
// el conteo del papel se agrega al que ya estaba. Ver el incidente 2026-08-16.
//
// El desglose por artículo vive en LINEAS: cantidad tal como se dictó y el factor
// de la presentación que corresponde, para que `cantidad * factor` dé la unidad base.
//
// CARGA 2026-08-31 — Almacén de ALIMENTARI sobre la toma viva del 2026-08-30.
// El teléfono de Alonso ya tenía la zona 1 "Tienda" (66 artículos); esto entra en
// la zona 0 "Almacén", que estaba vacía. Dictado en voz por Pablo, 45 renglones
// (ver [[inventario-conteo-en-papel-se-lee-en-voz]]): la transcripción desde foto
// no es canal confiable.

const WORKER = 'https://operaciones-api.pablo-aranda.workers.dev';
const APP_VERSION = 2;             // R12: por debajo de MIN_APP_VERSION → 426.

const ALMACEN  = 'ALIMENTARI';
const FECHA    = '2026-08-30';     // la toma viva a la que se suma
const ZONA     = 0;                // zoneSnapshot[0] = "Almacén"
const CLAVE    = `${ZONA}:PAPEL-2026-08-31`;
const OPERARIO = 'Pablo (conteo en papel)';

// seccion de la hoja | dictado | cantidad | código | factor
const LINEAS = [
  ['ABARROTES',   'Café en grano perfil Pasticcio',   14,    'MP0377',         1],
  ['ABARROTES',   'Café descafeinado molido',         2,     'MP0483',         1],
  ['ABARROTES',   'Cereza Amarena',                   6,     'MP0518',         0.6],
  // KG con factor 1: aquí el "0.300" del papel SÍ es literal (a diferencia de las
  // botellas de abajo, donde un decimal significa una pieza).
  ['ABARROTES',   'Té Tierra Quemada',                0.300, 'XMAT2408000074', 1],
  ['ABARROTES',   'Té Tulsi y Jengibre',              0.300, 'XMAT2408000040', 1],
  ['ABARROTES',   'Té Earl Grey',                     0.300, 'XMAT2408000075', 1],
  ['ABARROTES',   'Azúcar moscabada individual',      100,   'MP0448',         1],
  ['ABARROTES',   'Azúcar refinada individual',       50,    'XMAT2411000383', 1],
  ['ABARROTES',   'Azúcar Stevia',                    44,    'MP0449',         1],
  ['ABARROTES',   'Leche de almendra',                2,     'MP0469',         1],

  ['BEBIDAS',     'Frico Lambrusco',                  12,    'XMAT2512001206', 1],
  ['BEBIDAS',     'Frico Frizzante',                  12,    'XMAT2512001205', 1],
  ['BEBIDAS',     'Grappa Barricata',                 2,     'XMAT2410000233', 0.7],
  // Italicus tiene dos presentaciones (.700 y .750); se mantiene .700 como el 26-ago.
  ['BEBIDAS',     'Italicus',                         1,     'MP0397',         0.7],
  ['BEBIDAS',     'Yzaguirre Dry',                    1,     'XMAT2408000002', 1],
  ['BEBIDAS',     'Agua Natural Evian',               10,    'XMAT2604001409', 1],
  ['BEBIDAS',     'Agua Mineral Evian',               6,     'XMAT2604001411', 1],

  ['WINE EXPERS', 'Belstar Blanco',                   1,     'MP0526',         0.75],
  // Sin presMap en la plantilla: su factor default es 1 LT. Se fija 0.75 a mano
  // para que "2" signifique 2 botellas, como el resto de los vinos.
  ['WINE EXPERS', 'Belstar Rosé',                     2,     'XMAT2411000434', 0.75],
  ['WINE EXPERS', 'Vaporetto Cuvé Extra Dry',         2,     'MP0528',         0.75],
  // Homónimo: Pablo eligió CASTELLO DI QUERCETO; MP0328 CHIANTI CLASSICO CEA no se cuenta.
  ['WINE EXPERS', 'Chianti Classico DOCG 2020',       3,     'XMAT2411000435', 0.75],
  ['WINE EXPERS', 'Rosé di Nere IGP 2022',            2,     'MP0532',         0.75],
  ['WINE EXPERS', 'Nere DOC 2021',                    2,     'MP0533',         0.75],
  ['WINE EXPERS', "Montepulciano d'Abruzzo",          4,     'MP0534',         0.75],
  ['WINE EXPERS', 'Soave Classico',                   2,     'MP0535',         0.75],
  // MP0536 tiene botella y magnum (1.5): se elige botella.
  ['WINE EXPERS', 'Pinot Grigio Castello',            4,     'MP0536',         0.75],
  ['WINE EXPERS', 'Morellino di Scansano DOCG 2022',  3,     'MP0538',         0.75],
  ['WINE EXPERS', 'Vermentino IGT 2022',              1,     'MP0539',         0.75],
  ['WINE EXPERS', 'Piasa IGT 2023',                   1,     'XMAT2411000422', 0.75],

  ['DOCITALIA',   'Terre del Föhn Pinot Grigio',      2,     'MP0540',         0.75],
  ['DOCITALIA',   'Terre del Föhn Chardonnay',        2,     'MP0541',         0.75],
  ['DOCITALIA',   'Valpolicella Classico Biológico',  3,     'MP0542',         0.75],
  ['DOCITALIA',   'Valpolicella Ripasso Classico',    3,     'MP0255',         0.75],
  ['DOCITALIA',   'Val di Merse',                     4,     'MP0544',         0.75],
  ['DOCITALIA',   'Rosso di Montalcino',              2,     'XMAT2503000781', 0.75],
  ['DOCITALIA',   'Casa Emma',                        2,     'MP0546',         0.75],
  ['DOCITALIA',   'Adonis',                           3,     'MP0553',         0.75],
  ['DOCITALIA',   'Valle Giardino',                   4,     'XMAT2408000061', 0.75],
  ['DOCITALIA',   'Venere',                           3,     'MP0435',         0.75],
  ['DOCITALIA',   'Marsala Fine Sweet',               2,     'MP0550',         0.75],
  ['DOCITALIA',   'Angileri Zibibbo',                 2,     'MP0551',         0.75],
  ['DOCITALIA',   'Grappa Bianca CDC',                2,     'XMAT2411000392', 0.7],
  ['DOCITALIA',   'Shyra Rosé Costa Rosa',            4,     'MP0555',         0.75],
  ['DOCITALIA',   'Cupido',                           3,     'XMAT2409000113', 0.75],
  ['DOCITALIA',   'Marco Bonfante La Stella',         2,     'XMAT2411000401', 0.75],
];

const EJECUTAR = process.argv.includes('--ejecutar');

const j = async (url, init) => {
  const r = await fetch(url, init);
  const body = await r.json();
  if (!r.ok) throw new Error(`${r.status} ${url}\n${JSON.stringify(body)}`);
  return body;
};

// ── 1. Toma viva y plantilla ───────────────────────────────────────────────
const [S, T] = await Promise.all([
  j(`${WORKER}/inv/sesion?almacen=${ALMACEN}&fecha=${FECHA}`),
  j(`${WORKER}/inv/plantilla?almacen=${ALMACEN}`),
]);
if (!S.found) throw new Error(`No hay toma ${ALMACEN} ${FECHA}`);
// El upsert del Worker hace `template_hash = excluded.template_hash` sin CASE, así
// que un POST que omita templateHash lo deja en blanco (pasó el 2026-08-26 con este
// mismo script). Se relee de la sesión si está, y SIEMPRE se reenvía más abajo.
const TEMPLATE_HASH = S.templateHash || T.templateHash;
if (S.templateHash && S.templateHash !== T.templateHash) {
  throw new Error(`La plantilla cambió desde la toma: sesión ${S.templateHash} vs D1 ${T.templateHash}. Abortado.`);
}
if (!S.templateHash) {
  console.warn(`⚠️  La sesión traía template_hash vacío; se reescribe con el de D1 (${T.templateHash}).`);
}
if (S.exportedAt) {
  console.warn(`\n⚠️  Esta toma YA SE EXPORTÓ (${S.exportedAt} por ${S.exportedBy}).`);
  console.warn(`   Cargar el papel cambia los totales pero NO reenvía nada a Xetux.\n`);
}
const zonas = S.zoneSnapshot || [];
if (!zonas[ZONA]) throw new Error(`La toma no tiene zona ${ZONA}`);
const catalogo = Object.fromEntries((zonas[ZONA].items || []).map(i => [i.cod, i]));

console.log(`Toma    ${ALMACEN} · ${FECHA} · ${S.operario}`);
console.log(`        zona ${ZONA} "${zonas[ZONA].nombre}" · plantilla ${TEMPLATE_HASH} ✓`);
console.log(`        rebanadas vivas: ${Object.entries(S.countsByZone || {})
  .map(([k, v]) => `${k} (${Object.keys(v).length})`).join(', ') || 'ninguna'}`);

// ── 2. Integridad de la hoja: N dictados = N códigos únicos ────────────────
const cods = LINEAS.map(l => l[3]);
const dupes = cods.filter((c, i) => cods.indexOf(c) !== i);
if (dupes.length) throw new Error(`Códigos repetidos en la hoja: ${[...new Set(dupes)].join(', ')}`);
const fuera = cods.filter(c => !(c in catalogo));
if (fuera.length) throw new Error(`Códigos que no existen en la zona ${ZONA}: ${fuera.join(', ')}`);
console.log(`\nHoja    ${LINEAS.length} renglones · ${new Set(cods).size} códigos únicos · todos en catálogo ✓`);

// ── 3. Plan por sección, con lo que ya estaba capturado ────────────────────
const counts = {}, presChoice = {};
const vivas = Object.entries(S.countsByZone || {}).filter(([k]) => k !== CLAVE);
const yaCapturado = {};
for (const [k, zc] of vivas) {
  const pc = (S.presChoiceByZone || {})[k] || {};
  for (const [cod, val] of Object.entries(zc)) {
    (yaCapturado[cod] ||= []).push({ k, val, f: pc[cod] });
  }
}

let seccion = null;
for (const [sec, dictado, qty, cod, factor] of LINEAS) {
  if (sec !== seccion) { seccion = sec; console.log(`\n── ${sec}`); }
  counts[cod] = qty;
  presChoice[cod] = factor;
  const it = catalogo[cod];
  const base = +(qty * factor).toFixed(4);
  const previo = yaCapturado[cod];
  const nota = previo
    ? `  ⟵ ya hay ${previo.map(p => `${p.val} en ${p.k}`).join(', ')} → SUMAN`
    : '';
  console.log(`  ${dictado.padEnd(32)} ${String(qty).padStart(6)} × ${String(factor).padEnd(5)} = ${String(base).padStart(6)} ${it.uni.padEnd(3)}  ${cod}${nota}`);
  console.log(`  ${''.padEnd(32)} ${''.padStart(6)}                          ${it.art}`);
}

const traslapes = cods.filter(c => c in yaCapturado);
console.log(`\nResumen: ${LINEAS.length} códigos entran en la rebanada nueva ${CLAVE}`);
console.log(`         ${traslapes.length} ya estaban capturados en otra rebanada y se SUMAN`);
console.log(`         ${LINEAS.length - traslapes.length} son códigos nuevos para esta toma`);

if (!EJECUTAR) {
  console.log(`\n── DRY RUN ── no se escribió nada. Añade --ejecutar para aplicarlo.`);
  process.exit(0);
}

// ── 4. Escribir ────────────────────────────────────────────────────────────
const res = await j(`${WORKER}/inv/sesion`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'inv_sesion',
    appVersion: APP_VERSION,
    almacen: ALMACEN, fecha: FECHA, operario: OPERARIO,
    templateHash: TEMPLATE_HASH,   // obligatorio: el upsert no conserva el previo
    countsByZone:     { [CLAVE]: counts },
    presChoiceByZone: { [CLAVE]: presChoice },
    completedZones:   [CLAVE],
    // Acuse: copia inmutable en inv_receipts, la única que ningún DELETE del
    // Worker toca. eventId determinista → INSERT OR IGNORE lo hace idempotente,
    // así que re-correr el cargador no emite un acuse duplicado.
    requestReceipt:   true,
    receiptZoneKey:   CLAVE,
    receiptZoneName:  zonas[ZONA].nombre,
    receiptEventId:   `papel-${ALMACEN}-${FECHA}-z${ZONA}`,
  }),
});
console.log(`\nPOST /inv/sesion → ${JSON.stringify(res)}`);

// ── 5. Releer del Worker y confirmar que nada se pisó ──────────────────────
const V = await j(`${WORKER}/inv/sesion?almacen=${ALMACEN}&fecha=${FECHA}`);
const nueva = V.countsByZone?.[CLAVE] || {};
console.log(`\nVerificación:`);
console.log(`  rebanadas ahora: ${Object.entries(V.countsByZone)
  .map(([k, v]) => `${k} (${Object.keys(v).length})`).join(', ')}`);
let ok = Object.keys(nueva).length === LINEAS.length;
console.log(`  ${CLAVE}: ${Object.keys(nueva).length}/${LINEAS.length} códigos ${ok ? '✓' : '✗ NO COINCIDE'}`);
for (const [k, v] of vivas) {
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
