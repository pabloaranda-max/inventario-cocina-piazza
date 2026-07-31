import assert from 'node:assert/strict';
import {
  buildReceiptPayload,
  canonicalJson,
  identifyReceipt,
  normalizeReceiptItems,
  normalizeReceiptManuals,
} from '../js/inventory-receipt.js';

let passed = 0;
const ok = (condition, message) => {
  assert.ok(condition, message);
  passed++;
};

ok(
  canonicalJson({ z: 1, a: { y: 2, x: 3 } }) === '{"a":{"x":3,"y":2},"z":1}',
  'JSON canónico ordena objetos recursivamente',
);

const template = {
  unitMap: { A1: 'LT', B2: 'KG' },
  presMap: { A1: [{ nombre: 'BOTELLA', factor: 0.75 }] },
  defaultPres: {},
};
const items = normalizeReceiptItems({
  counts: {
    B2: [{ n: 'BOLSA', f: 2, q: 3 }, { n: '', f: 1, q: 0.5 }],
    A1: 4,
  },
  presChoices: { A1: 0.75 },
  catalog: {
    A1: { nombre: 'VINO TEST', unidad: 'LT' },
    B2: { nombre: 'QUESO TEST', unidad: 'KG' },
  },
  template,
});
ok(items.map(item => item.code).join(',') === 'A1,B2', 'artículos ordenados por código');
ok(items[0].baseQuantity === 3, 'captura simple aplica factor explícito');
ok(items[0].presentation === 'BOTELLA', 'presentación queda congelada en el acuse');
ok(items[1].baseQuantity === 6.5, 'desglose suma cantidad × factor');
ok(items[1].lines.length === 2, 'desglose conserva todas sus líneas');

const manuals = normalizeReceiptManuals([
  { id: 'm2', deviceId: 'dev-b', zona: 'Cava', nombre: 'AJENO', cantidad: 1 },
  { id: 'm1', deviceId: 'dev-a', zona: 'Cava', nombre: 'PROPIO', cantidad: 2, uni: 'PZA', foto: 'data:image/jpeg;base64,x' },
  { id: 'm3', deviceId: 'dev-a', zona: 'Barra', nombre: 'OTRA ZONA', cantidad: 3 },
  { id: 'c1', type: 'comment', deviceId: 'dev-a', zona: 'Cava', nombre: 'COMENTARIO' },
], 'dev-a', 'Cava');
ok(manuals.length === 1 && manuals[0].name === 'PROPIO', 'solo atribuye manuales del dispositivo y zona');
ok(manuals[0].photoAttached === true, 'registra que el manual tenía evidencia fotográfica');

const payload = buildReceiptPayload({
  eventId: 'evt-1',
  almacen: 'CAVA',
  fecha: '2026-07-31',
  operario: 'Ana',
  deviceId: 'dev-a',
  zoneKey: '0:dev-a',
  zoneIndex: 0,
  zoneName: 'Cava',
  templateHash: 'tpl-1',
  items,
  manualItems: manuals,
});
const first = await identifyReceipt(payload);
const reordered = await identifyReceipt(JSON.parse(JSON.stringify(payload)));
ok(first.id === reordered.id && first.hash === reordered.hash, 'mismo payload produce el mismo folio y hash');

const changed = structuredClone(payload);
changed.items[0].entered = 5;
changed.items[0].baseQuantity = 3.75;
const second = await identifyReceipt(changed);
ok(first.id !== second.id && first.hash !== second.hash, 'cambiar una cantidad produce otro acuse');
ok(/^ACU-20260731-[A-F0-9]{24}$/.test(first.id), 'folio tiene fecha y 96 bits de la huella');

console.log(`✅ inventory-receipt: ${passed} asserts OK`);
