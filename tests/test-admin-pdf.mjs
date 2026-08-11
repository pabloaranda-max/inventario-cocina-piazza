// Datos de autoria para PDF admin: varias personas pueden aportar al mismo codigo.
import assert from 'node:assert/strict';
import {
  construirAportesPorCodigo,
  construirDatosPDFSesion,
  dispositivoDeZona,
  nombreZonaSesion,
  operarioDeZona,
  unirSesionesDeAlmacen,
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

// Un almacen es UN conteo: una captura distribuida entre dos fechas deja dos
// filas en D1 y el PDF las une sin duplicar el almacen ni perder la mitad.
const tramoNoche = {
  fecha: '2026-08-09', operario: 'Alexin',
  countsByZone: { '1:devTienda': { MP1: 2, MP2: 5 } },
  presChoiceByZone: { '1:devTienda': { MP1: 1 } },
  correctionsByZone: { _admin: { MP2: { qty: 4, operario: 'Auditora' } } },
  manuales: [{ id: 'n1', nombre: 'Caja suelta', cantidad: 1, zona: 'Tienda', deviceId: 'devTienda' }],
  zoneSnapshot: [{ nombre: 'Almacén', items: [] }, { nombre: 'Tienda', items: [] }],
  operariosByDevice: { devTienda: { operario: 'Alexin' } },
  exportedAt: '2026-08-10T05:00:00.000Z', exportedBy: 'pablo'
};
const tramoManana = {
  fecha: '2026-08-10', operario: 'Pablo',
  countsByZone: { '0:devAlmacen': { MP1: 3, MP3: 7 } },
  presChoiceByZone: { '0:devAlmacen': { MP1: 1 } },
  manuales: [],
  zoneSnapshot: [{ nombre: 'Almacén', items: [] }, { nombre: 'Tienda', items: [] }],
  operariosByDevice: { devAlmacen: { operario: 'Pablo' } }
};

const unida = unirSesionesDeAlmacen([tramoManana, tramoNoche]); // desordenadas a proposito
const datosUnidos = construirDatosPDFSesion({ sesion: unida, plantilla });
assert.deepEqual(
  datosUnidos.items.filter(i => !i.manual).map(i => i.codigo).sort(),
  ['MP1', 'MP2', 'MP3']
);
const unidoMP1 = datosUnidos.items.find(item => item.codigo === 'MP1');
assert.equal(unidoMP1.cantidadContada, 5); // 2 (Tienda) + 3 (Almacén), sin pisarse
assert.deepEqual(unidoMP1.aportes, [
  { operario: 'Alexin', zona: 'Tienda', cantidad: 2 },
  { operario: 'Pablo', zona: 'Almacén', cantidad: 3 }
]);
assert.deepEqual(datosUnidos.operarios, ['Alexin', 'Pablo']);
// La correccion admin y el manual de un tramo sobreviven a la union.
assert.equal(datosUnidos.items.find(item => item.codigo === 'MP2').cantidadFinal, 4);
assert.equal(datosUnidos.items.filter(item => item.manual).length, 1);
assert.equal(unida.manuales[0]._fechaOrigen, '2026-08-09');
// exportedAt gana el tramo que sí se exportó, aunque llegue primero en la lista.
assert.equal(unida.exportedBy, 'pablo');
assert.equal(unida.tramosExportados, 1);
assert.equal(unida.xlsxCompleto, false);

// Unir un solo tramo no cambia nada: los almacenes de un día siguen igual.
assert.deepEqual(
  construirDatosPDFSesion({ sesion: unirSesionesDeAlmacen([tramoNoche]), plantilla }).items,
  construirDatosPDFSesion({ sesion: tramoNoche, plantilla }).items
);

console.log('✅ admin-pdf: captura distribuida en dos fechas se une en un almacén OK');

// Lo que el EXPORT necesita de la union y el PDF no usaba. Si algo de esto se
// pierde, el XLSX manda a Xetux como CERO lo que contó el otro tramo.
const exportA = {
  fecha: '2026-08-09', operario: 'Alexin', templateHash: 'hashViejo',
  countsByZone: { '1:devTienda': { MP1: 2 } },
  correctionsByZone: {
    '1:devTienda': { MP1: { qty: 2, operario: 'Alexin' } },
    _admin: { MP2: { qty: 9, operario: 'Auditora' } }
  },
  completedZones: ['1:devTienda'],
  lockedZones: { '1': 'devTienda' },
  zoneSnapshot: [{ nombre: 'Almacén' }, { nombre: 'Tienda' }],
  exportedAt: '2026-08-10T05:00:00.000Z', exportedBy: 'pablo'
};
const exportB = {
  fecha: '2026-08-10', operario: 'Pablo', templateHash: 'hashNuevo',
  countsByZone: { '0:devAlmacen': { MP3: 4 } },
  correctionsByZone: { '0:devAlmacen': { MP3: { qty: 4, operario: 'Pablo' } } },
  completedZones: ['0:devAlmacen'],
  lockedZones: { '0': 'devAlmacen' },
  zoneSnapshot: [{ nombre: 'Almacén' }, { nombre: 'Tienda' }]
};
const paraExport = unirSesionesDeAlmacen([exportB, exportA]);
// Las zonas cerradas de los dos tramos: sin esto el aviso de "zonas sin cerrar"
// asusta con zonas que sí se cerraron el otro día.
assert.deepEqual([...paraExport.completedZones].sort(), ['0:devAlmacen', '1:devTienda']);
assert.deepEqual(paraExport.lockedZones, { '0': 'devAlmacen', '1': 'devTienda' });
// correctionsByZone completo, no solo _admin: alimenta las observaciones a Sheets.
assert.deepEqual(Object.keys(paraExport.correctionsByZone).sort(), ['0:devAlmacen', '1:devTienda', '_admin']);
// Los dos hashes quedan a la vista para poder exigir revisión de plantilla.
assert.deepEqual(paraExport.templateHashes.sort(), ['hashNuevo', 'hashViejo']);
// Los tramos se ordenan por fecha aunque lleguen al revés, y traen su estado.
assert.deepEqual(paraExport.fechas, ['2026-08-09', '2026-08-10']);
assert.deepEqual(paraExport.tramos.map(t => `${t.fecha}:${t.operario}:${t.exportedAt ? 'exp' : 'pend'}`),
  ['2026-08-09:Alexin:exp', '2026-08-10:Pablo:pend']);

console.log('✅ admin-pdf: la unión conserva lo que el export manda a Xetux OK');
