#!/usr/bin/env node
// Restaura en una sesión viva la captura que quedó registrada en un acuse inmutable.
//
// Uso: node tools/restaurar-acuse.mjs <FOLIO> [--clave 0:rec-xxxx] [--ejecutar]
//   Sin --ejecutar solo imprime el diagnóstico y NO escribe nada.
//
// Nace del incidente 2026-08-16 (UH_COCINA): "nueva toma" en un teléfono que ya había
// cerrado zona vuelve a sincronizar bajo la MISMA clave `zona:dispositivo`, y
// mergeZoneMap reemplaza la rebanada completa (js/sesion-merge.js:9). El acuse es la
// única copia que sobrevive — ningún DELETE del Worker toca inv_receipts.
//
// Regla que hace esto seguro con la toma VIVA: se escribe bajo una clave de rebanada
// NUEVA, nunca sobre una existente. Los syncs del teléfono solo reemplazan su propia
// clave, así que jamás pisan lo restaurado, y calcularTotalesSesion suma las rebanadas.

const WORKER = 'https://operaciones-api.pablo-aranda.workers.dev';
const APP_VERSION = 2;  // R12: por debajo de MIN_APP_VERSION el Worker responde 426.

const args = process.argv.slice(2);
const FOLIO = args.find(a => !a.startsWith('--'));
const EJECUTAR = args.includes('--ejecutar');
const CLAVE = (() => {
  const i = args.indexOf('--clave');
  return i >= 0 ? args[i + 1] : null;
})();

if (!FOLIO) {
  console.error('Falta el folio del acuse. Uso: node tools/restaurar-acuse.mjs <FOLIO> [--clave 0:rec-xxx] [--ejecutar]');
  process.exit(1);
}

const j = async (url, init) => {
  const r = await fetch(url, init);
  const body = await r.json();
  if (!r.ok) throw new Error(`${r.status} ${url}\n${JSON.stringify(body)}`);
  return body;
};

// ── 1. El acuse, y que verifique ───────────────────────────────────────────
const ac = await j(`${WORKER}/inv/receipt?id=${encodeURIComponent(FOLIO)}`);
if (!ac.found) throw new Error(`Acuse ${FOLIO} no existe`);
if (ac.verified !== true) throw new Error(`Acuse ${FOLIO} NO verifica — huella alterada. Abortado.`);
const R = ac.receipt;
const { almacen, fecha, operario, zoneIndex, zoneName } = R;

console.log(`Acuse   ${R.id}`);
console.log(`        ${almacen} · ${fecha} · zona ${zoneIndex} "${zoneName}" · ${operario}`);
console.log(`        recibido ${R.receivedAt} · ${R.items.length} artículos · verificado ✓`);

// ── 2. La sesión viva, y que la plantilla sea la misma ─────────────────────
const S = await j(`${WORKER}/inv/sesion?almacen=${almacen}&fecha=${fecha}`);
if (!S.found) throw new Error(`No hay sesión ${almacen} ${fecha}`);
if (S.templateHash !== R.templateHash) {
  throw new Error(
    `La plantilla cambió desde el conteo: acuse ${R.templateHash} vs sesión ${S.templateHash}.\n` +
    `Restaurar así movería cantidades. Abortado.`);
}
if (S.exportedAt) {
  console.warn(`\n⚠️  Esta toma YA SE EXPORTÓ (${S.exportedAt} por ${S.exportedBy}).`);
  console.warn(`   Restaurar cambia los totales pero NO reenvía nada a Xetux.\n`);
}

const claveNueva = CLAVE || `${zoneIndex}:rec-${R.id.slice(-4).toLowerCase()}`;
if (claveNueva in (S.countsByZone || {})) {
  console.log(`\nNota: la clave ${claveNueva} ya existe — se reemplaza con el mismo contenido (idempotente).`);
}
if (!claveNueva.includes(':')) throw new Error('La clave debe llevar ":" o el merge no la trata como rebanada.');

// ── 3. Reconstruir la captura ──────────────────────────────────────────────
// El acuse guarda las líneas de desglose con nombres largos {name,factor,quantity};
// countsByZone las espera cortas {n,f,q}. Copiarlas literal deja el artículo en CERO,
// porque cantidadBase multiplica q*f sobre campos inexistentes.
const counts = {};
const presChoice = {};
for (const it of R.items) {
  if (it.mode === 'breakdown') {
    counts[it.code] = it.lines.map(l => ({ n: l.name ?? '', f: l.factor, q: l.quantity }));
  } else {
    counts[it.code] = it.entered;
    // Clava el factor que el operario vio y que el acuse acredita, en vez de depender
    // del default de la plantilla (que una recarga futura podría mover).
    if (it.factor != null) presChoice[it.code] = it.factor;
  }
}

// ── 4. Comprobar la reconstrucción ANTES de mandar nada ────────────────────
const cantidadBase = (val, f) => Array.isArray(val)
  ? val.reduce((s, l) => s + (Number(l.q) || 0) * (Number(l.f) || 0), 0)
  : (Number(val) || 0) * f;

let malos = 0, totalRec = 0, totalAcuse = 0;
for (const it of R.items) {
  const f = it.mode === 'simple' ? (it.factor ?? 1) : 1;
  const b = cantidadBase(counts[it.code], f);
  totalRec += b; totalAcuse += it.baseQuantity;
  if (Math.abs(b - it.baseQuantity) > 1e-9) {
    malos++;
    console.error(`  ✗ ${it.code} reconstruye ${b} pero el acuse dice ${it.baseQuantity}`);
  }
}
if (malos) throw new Error(`${malos} artículos no reproducen su cantidad base. Abortado sin escribir.`);
console.log(`\nReconstrucción exacta: ${R.items.length}/${R.items.length} artículos, total base ${totalRec.toFixed(4)}`);

// ── 5. Diagnóstico contra lo que hay vivo ──────────────────────────────────
const vivas = Object.entries(S.countsByZone || {}).filter(([k]) => k !== claveNueva);
const codsVivos = new Set(vivas.flatMap(([, zc]) => Object.keys(zc)));
const codsAcuse = new Set(Object.keys(counts));
const soloAcuse = [...codsAcuse].filter(c => !codsVivos.has(c));
const ambos = [...codsAcuse].filter(c => codsVivos.has(c));

console.log(`\nRebanadas vivas: ${vivas.map(([k, v]) => `${k} (${Object.keys(v).length})`).join(', ') || 'ninguna'}`);
console.log(`Se restauran ${soloAcuse.length} códigos ausentes y se SUMAN ${ambos.length} traslapados.`);

if (!EJECUTAR) {
  console.log(`\n── DRY RUN ── nada se escribió. Añade --ejecutar para aplicarlo.`);
  process.exit(0);
}

// ── 6. Escribir ────────────────────────────────────────────────────────────
const res = await j(`${WORKER}/inv/sesion`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'inv_sesion',
    appVersion: APP_VERSION,
    almacen, fecha, operario,
    countsByZone:     { [claveNueva]: counts },
    presChoiceByZone: { [claveNueva]: presChoice },
    completedZones:   [claveNueva],
  }),
});
console.log(`\nPOST /inv/sesion → ${JSON.stringify(res)}`);

// ── 7. Releer y confirmar ──────────────────────────────────────────────────
const V = await j(`${WORKER}/inv/sesion?almacen=${almacen}&fecha=${fecha}`);
const rest = V.countsByZone?.[claveNueva] || {};
console.log(`\nVerificación:`);
console.log(`  rebanadas ahora: ${Object.entries(V.countsByZone).map(([k, v]) => `${k} (${Object.keys(v).length})`).join(', ')}`);
console.log(`  ${claveNueva}: ${Object.keys(rest).length} códigos ${Object.keys(rest).length === R.items.length ? '✓' : '✗ NO COINCIDE'}`);
for (const [k, v] of vivas) {
  const ahora = Object.keys(V.countsByZone?.[k] || {}).length;
  console.log(`  ${k}: ${Object.keys(v).length} → ${ahora} ${ahora >= Object.keys(v).length ? '✓ intacta' : '✗ PERDIÓ ARTÍCULOS'}`);
}
