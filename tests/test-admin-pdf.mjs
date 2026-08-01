// Datos de autoria para PDF admin: varias personas pueden aportar al mismo codigo.
import assert from 'node:assert/strict';
import {
  construirAportesPorCodigo,
  construirDatosPDFSesion,
  dispositivoDeZona,
  nombreZonaSesion,
  operarioDeZona,
} from '../js/admin-pdf.js';

const plantilla = {
  presMap: { MP1: [{ nombre: 'BOTELLA', factor: 0.75 }] },
  unitMap: { MP1: 'LT', MP2: 'KG', MP3: 'PZA' }
};
const sesion = {
  operario: 'Operario legacy',
  countsByZone: {
    '0:devA': { MP1: 2, MP2: 1 },
    '0:devB': { MP1: [{ n: 'BOTELLA', f: 0.75, q: 2 }, { n: '', f: 1, q: 0.5 }] },
    '1:devC': { MP1: 4 },
    '1:devD': { MP1: 1 },
    '2': { MP3: 7 }
  },
  presChoiceByZone: {
    '1:devC': { MP1: 1 },
    '1:devD': { MP1: 1 }
  },
  correctionsByZone: {
    _admin: {
      MP1: { qty: 12, operario: 'Auditora', nota: 'Se verifico en bascula' },
      MP9: { qty: 3, operario: 'Auditora', nota: 'Agregado por admin' }
    }
  },
  manuales: [
    { id: 'm1', nombre: 'Producto especial', cantidad: 2.5, uni: 'KG', zona: 'Camara', deviceId: 'devB' },
    { id: 'c1', type: 'comment', cod: 'MP1', texto: 'Revisar empaque' }
  ],
  zoneSnapshot: [
    { nombre: 'Barra', items: [{ cod: 'MP1', art: 'Vino de prueba', uni: 'LT' }] },
    { nombre: 'Cava', items: [] },
    { nombre: 'Bodega', items: [] }
  ],
  operariosByDevice: {
    devA: { operario: 'Ana' },
    devB: { operario: 'Luis' },
    devC: { operario: 'Ana' },
    devD: { operario: 'Ana' }
  }
};

assert.equal(dispositivoDeZona('3:abc:def'), 'abc:def');
assert.equal(nombreZonaSesion(sesion, '0:devA'), 'Barra');
assert.equal(nombreZonaSesion(sesion, '4:devA', ['A', 'B', 'C', 'D', 'Patio']), 'Patio');
assert.equal(operarioDeZona(sesion, '0:devA'), 'Ana');
assert.equal(operarioDeZona(sesion, '2'), 'Operario legacy');

const autoria = construirAportesPorCodigo(sesion, plantilla);
assert.equal(autoria.totalesContados.MP1, 8.5);
assert.deepEqual(autoria.aportesPorCodigo.MP1, [
  { operario: 'Ana', zona: 'Barra', cantidad: 1.5 },
  { operario: 'Ana', zona: 'Cava', cantidad: 5 },
  { operario: 'Luis', zona: 'Barra', cantidad: 2 }
]);

const datos = construirDatosPDFSesion({
  sesion,
  plantilla,
  articulos: { MP2: { nombre: 'Harina', unidad: 'KG' } }
});
const mp1 = datos.items.find(item => item.codigo === 'MP1');
assert.equal(mp1.nombre, 'Vino de prueba');
assert.equal(mp1.cantidadContada, 8.5);
assert.equal(mp1.cantidadFinal, 12);
assert.equal(mp1.aportes.length, 3);
assert.equal(mp1.correccion.operario, 'Auditora');

const agregado = datos.items.find(item => item.codigo === 'MP9');
assert.equal(agregado.cantidadContada, null);
assert.equal(agregado.cantidadFinal, 3);
assert.deepEqual(agregado.aportes, []);

const manual = datos.items.find(item => item.manual);
assert.equal(manual.nombre, 'Producto especial');
assert.deepEqual(manual.aportes, [{ operario: 'Luis', zona: 'Camara', cantidad: 2.5 }]);
assert.equal(datos.notaGeneral, 'MP1: Revisar empaque');
assert.deepEqual(datos.operarios, ['Ana', 'Luis', 'Operario legacy']);

console.log('✅ admin-pdf: autoria multiple y correcciones OK');
