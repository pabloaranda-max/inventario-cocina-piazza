#!/usr/bin/env node
// Genera el xlsx de carga masiva para Xetux a partir de:
//
// Uso: node tools/generar_carga_masiva.mjs <export-xetux.xlsx> <carpeta-salida>
// Requiere SheetJS: npm i --no-save https://cdn.sheetjs.com/xlsx-latest/xlsx-latest.tgz
// Editar ALMACEN/FECHA abajo si no es COCINA 2026-07-08.
//  - el export fresco de Xetux (documento de inventario abierto, define filas y nombre)
//  - la sesión merged de D1 (totales con los factores que vieron los operarios)
// Replica descargarXlsxInventario de admin.html pero escribe sobre el archivo NUEVO.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import * as XLSX from '../node_modules/xlsx/xlsx.mjs';
import { parsePlantilla, hashRaw } from '../js/plantilla-parser.js';
import { calcularTotalesSesion, factorDefault } from '../js/sesion-merge.js';

const SRC = process.argv[2];
const OUTDIR = process.argv[3];
const ALMACEN = 'COCINA';
const FECHA = '2026-07-08';
const WORKER = 'https://operaciones-api.pablo-aranda.workers.dev';

const bytes = readFileSync(SRC);
const rawB64 = bytes.toString('base64');
console.log('Archivo fuente:', basename(SRC));
console.log('Hash del archivo nuevo:', await hashRaw(rawB64));

// Plantilla vieja (la que usaron los operarios) y sesión merged desde el Worker
const [T, S] = await Promise.all([
  fetch(`${WORKER}/inv/plantilla?almacen=${ALMACEN}`).then(r => r.json()),
  fetch(`${WORKER}/inv/sesion?almacen=${ALMACEN}&fecha=${FECHA}`).then(r => r.json()),
]);
if (!T.found) throw new Error('Plantilla COCINA no encontrada en D1');
if (!S.found) throw new Error(`Sesión COCINA ${FECHA} no encontrada`);
console.log('Hash plantilla D1 (la contada):', T.templateHash, '| hash de la sesión:', S.templateHash);

// Totales con los factores que los operarios vieron al contar (plantilla vieja)
const totales = calcularTotalesSesion(S, T);
console.log('Artículos con total:', Object.keys(totales).length);

// Estructura del archivo NUEVO (filas y columna Cantidad pueden haber cambiado)
const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const nuevo = parsePlantilla(buf, XLSX);
console.log('Artículos en archivo nuevo:', Object.keys(nuevo.rowMap).length, '| cantidadColIdx:', nuevo.cantidadColIdx);

// Cruces y advertencias
const sinFila = Object.keys(totales).filter(cod => !(cod in nuevo.rowMap));
if (sinFila.length) {
  console.log(`\n⚠️  ${sinFila.length} códigos contados NO existen en el archivo nuevo (no se escriben):`);
  sinFila.forEach(cod => console.log(`   ${cod} = ${totales[cod]}`));
}
const difFactor = Object.keys(totales).filter(cod => {
  if (!(cod in nuevo.rowMap)) return false;
  return factorDefault(T, cod) !== factorDefault(nuevo, cod);
});
if (difFactor.length) {
  console.log(`\n⚠️  ${difFactor.length} códigos con factor default distinto entre plantilla contada y archivo nuevo:`);
  difFactor.forEach(cod => console.log(`   ${cod}: contada=${factorDefault(T, cod)} nueva=${factorDefault(nuevo, cod)}`));
}
const manuales = (S.manuales || []).filter(m => m.type !== 'comment');
if (manuales.length) {
  console.log(`\nℹ️  ${manuales.length} no catalogados (NO van en el xlsx, cargarlos a mano en Xetux):`);
  manuales.forEach(m => console.log(`   ${m.nombre} — ${m.cantidad} ${m.uni || m.unidad || ''} (zona ${m.zona || '—'})`));
}

// Escribir cantidades en el archivo NUEVO conservando estilos (igual que admin.html)
const wb = XLSX.read(buf, { type: 'array', cellStyles: true });
const ws = wb.Sheets[wb.SheetNames[0]];
let escritos = 0;
for (const [cod, qty] of Object.entries(totales)) {
  const rowIdx = nuevo.rowMap[cod];
  if (rowIdx === undefined) continue;
  ws[XLSX.utils.encode_cell({ r: rowIdx, c: nuevo.cantidadColIdx })] = { t: 'n', v: parseFloat(qty.toFixed(4)) };
  escritos++;
}
mkdirSync(OUTDIR, { recursive: true });
const out = join(OUTDIR, basename(SRC)); // mismo nombre que el export de Xetux
writeFileSync(out, Buffer.from(XLSX.write(wb, { type: 'array', bookType: 'xlsx', cellStyles: true })));
console.log(`\n✅ ${escritos} cantidades escritas → ${out}`);
