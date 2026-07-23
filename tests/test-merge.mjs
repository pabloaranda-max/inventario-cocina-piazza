// tests/test-merge.mjs — correr con: node tests/test-merge.mjs
import { mergeZoneMap, mergeCorrections, mergeManuales, mergeCompletedZones,
         factorDefault, calcularTotalesSesion,
         lineasDesglose, cantidadBase } from '../js/sesion-merge.js';
import assert from 'node:assert/strict';

// clave colaborativa "zona:device" reemplaza completo (borrar se propaga)
assert.deepEqual(
  mergeZoneMap({ '0:devA': { MP1: 3, MP2: 1 } }, { '0:devA': { MP1: 5 } }),
  { '0:devA': { MP1: 5 } });
// clave legacy sin ':' hace merge superficial
assert.deepEqual(
  mergeZoneMap({ '0': { MP1: 3, MP2: 1 } }, { '0': { MP1: 5 } }),
  { '0': { MP1: 5, MP2: 1 } });
// zona ajena no se toca; incoming vacío = sin cambios
assert.deepEqual(
  mergeZoneMap({ '0:devA': { MP1: 3 } }, { '1:devB': { MP9: 2 } }),
  { '0:devA': { MP1: 3 }, '1:devB': { MP9: 2 } });
assert.deepEqual(mergeZoneMap({ '0:devA': { MP1: 3 } }, {}), { '0:devA': { MP1: 3 } });

// correcciones: incoming gana por código, zonas se preservan
assert.deepEqual(
  mergeCorrections({ _admin: { MP1: { qty: 2 } } }, { _admin: { MP2: { qty: 9 } } }),
  { _admin: { MP1: { qty: 2 }, MP2: { qty: 9 } } });

// manuales: merge por id, incoming gana, removeIds elimina
assert.deepEqual(
  mergeManuales([{ id: 'a', n: 1 }, { id: 'b', n: 2 }], [{ id: 'b', n: 99 }], ['a']),
  [{ id: 'b', n: 99 }]);

// completedZones: unión + removals
assert.deepEqual(
  mergeCompletedZones(['0:devA', '1:devA'], ['2:devB'], ['1:devA']),
  ['0:devA', '2:devB']);

// factorDefault: presMap explícito > defaultPres por unidad > 1
const T = { presMap: { MP1: [{ nombre: 'BOTELLA', factor: 0.75 }] },
            unitMap: { MP2: 'LT', MP3: 'PZA' },
            defaultPres: { LT: [{ nombre: 'BOTELLA', factor: 0.7 }] } };
assert.equal(factorDefault(T, 'MP1'), 0.75);
assert.equal(factorDefault(T, 'MP2'), 0.7);
assert.equal(factorDefault(T, 'MP3'), 1);

// totales: suma multi-zona/dispositivo con factor elegido o default;
// corrección admin sobreescribe
const S = {
  countsByZone: { '0:devA': { MP1: 2 }, '0:devB': { MP1: 4 }, '1:devA': { MP2: 10 } },
  presChoiceByZone: { '0:devB': { MP1: 1 } },
  correctionsByZone: { _admin: { MP9: { qty: 7 } } }
};
const tot = calcularTotalesSesion(S, T);
assert.equal(tot.MP1, 2 * 0.75 + 4 * 1);   // devA factor default, devB factor elegido 1
assert.equal(tot.MP2, 10 * 0.7);            // defaultPres por unidad
assert.equal(tot.MP9, 7);                   // corrección admin

// R11 — desglose por líneas (spec §6/§15): valor polimórfico número | array
assert.equal(lineasDesglose(2.5), null);                       // legacy → null
assert.deepEqual(lineasDesglose([{ n:'B', f:0.75, q:2 }]), [{ n:'B', f:0.75, q:2 }]);
assert.equal(cantidadBase(2, 0.75), 1.5);                      // legacy aplica factor caller
// desglose: Σ q×f con factor embebido; línea f:1 = abierto en unidad base
assert.equal(cantidadBase([{ n:'BOTELLA', f:0.75, q:2 }, { n:'MAGNUM', f:1.5, q:1 },
                           { n:'', f:1, q:0.3 }], 999), 3.3);  // factorLegacy NO aplica
assert.equal(cantidadBase([], 0.75), 0);                       // array vacío = 0 (la UI lo borra)
assert.equal(cantidadBase([{ n:'B', f:0.75 }], 1), 0);         // línea sin q no truena

// sesión mixta: mismo cod como número en un dispositivo y array en otro;
// presChoice aplica SOLO al número; corrección admin sobreescribe arrays también
const Smix = {
  countsByZone: {
    '0:devA': { MP1: [{ n:'BOTELLA', f:0.75, q:2 }, { n:'', f:1, q:0.5 }] },
    '0:devB': { MP1: 4, MP2: [{ n:'CAJA', f:12, q:2 }, { n:'', f:1, q:5 }] }
  },
  presChoiceByZone: { '0:devA': { MP1: 999 }, '0:devB': { MP1: 1 } },
  correctionsByZone: { _admin: { MP2: { qty: 30 } } }
};
const totMix = calcularTotalesSesion(Smix, T);
assert.equal(totMix.MP1, (2 * 0.75 + 0.5) + 4 * 1);  // 2 + 4 — el 999 se ignoró
assert.equal(totMix.MP2, 30);                         // corrección admin pisa el 29 del array

console.log('✅ sesion-merge: 21 asserts OK');
