// Checkpoints (2026-08-16): acuses de una zona que sigue ABIERTA.
// La propiedad que este archivo protege por encima de todas: introducir el campo
// `kind` NO puede cambiar la huella de un acuse de cierre. Si cambia, todos los
// folios ya emitidos dejan de verificar y la red de seguridad del inventario se
// cae en silencio. Por eso el primer test corre contra un acuse REAL de producción.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildReceiptPayload,
  canonicalJson,
  checkpointEventId,
  identifyReceipt,
  receiptKind,
  RECEIPT_KIND_CHECKPOINT,
} from '../js/inventory-receipt.js';

let passed = 0;
const ok = (condition, message) => {
  assert.ok(condition, message);
  passed++;
};

// ── 1. Compatibilidad con lo ya emitido ────────────────────────────────────

const prod = JSON.parse(
  readFileSync(new URL('./fixtures/acuse-prod-uh-cocina.json', import.meta.url)),
);
const prodIdentity = await identifyReceipt(prod.payload);
ok(prodIdentity.id === prod.expectedId, 'acuse real de producción conserva su folio');
ok(prodIdentity.hash === prod.expectedHash, 'acuse real de producción conserva su SHA-256');
ok(receiptKind(prod.payload) === 'cierre', 'un acuse sin kind se lee como cierre');

const base = {
  eventId: 'evt-1',
  almacen: 'UH_COCINA',
  fecha: '2026-08-16',
  operario: 'DANIEL CERVANTES',
  deviceId: 'dev1',
  zoneKey: '0:dev1',
  zoneIndex: 0,
  zoneName: 'Cocina',
  templateHash: 'abc123',
  items: [{ code: 'MP0001', name: 'ACEITE', unit: 'L', mode: 'simple', entered: 2, factor: 1, presentation: 'Unidad base / abierto', baseQuantity: 2 }],
  manualItems: [],
};

const cierre = buildReceiptPayload(base);
ok(!('kind' in JSON.parse(JSON.stringify(cierre))), 'el cierre no serializa la clave kind');
ok(
  canonicalJson(cierre) === canonicalJson({ ...base, schema: 'inventory-zone-receipt/v1' }),
  'el JSON canónico de un cierre es idéntico al de antes de existir kind',
);

// ── 2. El checkpoint es distinguible y no se puede disfrazar ───────────────

const checkpoint = buildReceiptPayload({ ...base, kind: RECEIPT_KIND_CHECKPOINT });
ok(checkpoint.kind === RECEIPT_KIND_CHECKPOINT, 'el checkpoint lleva kind en el payload');
ok(receiptKind(checkpoint) === RECEIPT_KIND_CHECKPOINT, 'receiptKind reconoce el checkpoint');

const idCierre = await identifyReceipt(cierre);
const idCheckpoint = await identifyReceipt(checkpoint);
ok(
  idCheckpoint.hash !== idCierre.hash,
  'mismo contenido como checkpoint y como cierre da huellas distintas: kind está firmado',
);

const disfrazado = { ...checkpoint, kind: undefined };
const idDisfrazado = await identifyReceipt(disfrazado);
ok(
  idDisfrazado.hash !== idCheckpoint.hash,
  'quitarle el kind a un checkpoint rompe su huella (no se puede volver cierre)',
);

ok(
  buildReceiptPayload({ ...base, kind: 'cierre' }).kind === undefined,
  'solo el valor checkpoint activa el campo; cualquier otro se ignora',
);

// ── 3. Deduplicación: el eventId estable es lo que evita renglones basura ──

ok(checkpointEventId('0:dev1') === 'chk:0:dev1', 'el eventId de checkpoint es estable por zona');
ok(
  checkpointEventId('0:dev1') === checkpointEventId('0:dev1'),
  'el eventId no depende del reloj ni del azar',
);

const chkEvento = { ...base, eventId: checkpointEventId(base.zoneKey), kind: RECEIPT_KIND_CHECKPOINT };
const chk1 = await identifyReceipt(buildReceiptPayload(chkEvento));
const chk2 = await identifyReceipt(buildReceiptPayload(chkEvento));
ok(
  chk1.hash === chk2.hash && chk1.id === chk2.id,
  'dos checkpoints con el mismo contenido colapsan en el mismo folio (INSERT OR IGNORE)',
);

const chkCrecido = await identifyReceipt(buildReceiptPayload({
  ...chkEvento,
  items: [...base.items, { code: 'MP0002', name: 'AJO', unit: 'KG', mode: 'simple', entered: 1, factor: 1, presentation: 'Unidad base / abierto', baseQuantity: 1 }],
}));
ok(
  chkCrecido.hash !== chk1.hash,
  'un checkpoint con un artículo más sí produce un folio nuevo',
);

// ── 4. Zonas distintas del mismo dispositivo no se pisan ───────────────────

ok(
  checkpointEventId('0:dev1') !== checkpointEventId('1:dev1'),
  'cada zona lleva su propio hilo de checkpoints',
);

console.log(`test-checkpoint.mjs: ${passed}/${passed} asserts en verde`);
