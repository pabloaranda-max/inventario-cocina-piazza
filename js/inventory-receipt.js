// Acuses de inventario: normalización y huella canónica compartidas por Worker/tests.
// El PDF es solo la representación; payload + hash son la evidencia auditable.

function finiteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round4(value) {
  return Number(finiteNumber(value).toFixed(4));
}

export function canonicalJson(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (typeof value === 'object') {
    return '{' + Object.keys(value)
      .filter(key => value[key] !== undefined)
      .sort()
      .map(key => JSON.stringify(key) + ':' + canonicalJson(value[key]))
      .join(',') + '}';
  }
  if (typeof value === 'number') return Number.isFinite(value) ? JSON.stringify(value) : 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  return 'null';
}

export async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(typeof value === 'string' ? value : canonicalJson(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function templateOptions(template, code, unit) {
  const explicit = template?.presMap?.[code];
  if (Array.isArray(explicit) && explicit.length) return explicit;
  const defaults = template?.defaultPres?.[unit];
  return Array.isArray(defaults) ? defaults : [];
}

function simpleFactor(template, code, unit, presChoices) {
  const selected = Number(presChoices?.[code]);
  if (Number.isFinite(selected) && selected > 0) return selected;
  const first = Number(templateOptions(template, code, unit)[0]?.factor);
  return Number.isFinite(first) && first > 0 ? first : 1;
}

function presentationName(template, code, unit, factor) {
  const option = templateOptions(template, code, unit)
    .find(item => Number(item?.factor) === Number(factor));
  if (option?.nombre) return String(option.nombre);
  return Number(factor) === 1 ? 'Unidad base / abierto' : `Factor ${factor}`;
}

export function normalizeReceiptItems({ counts = {}, presChoices = {}, catalog = {}, template = {} }) {
  return Object.keys(counts).sort().map(code => {
    const raw = counts[code];
    const catalogItem = catalog[code] || {};
    const unit = String(template?.unitMap?.[code] || catalogItem.unidad || '');
    const common = {
      code: String(code),
      name: String(catalogItem.nombre || code),
      unit,
    };

    if (Array.isArray(raw)) {
      const lines = raw.map(line => ({
        name: String(line?.n || ''),
        factor: finiteNumber(line?.f),
        quantity: finiteNumber(line?.q),
      }));
      return {
        ...common,
        mode: 'breakdown',
        lines,
        baseQuantity: round4(lines.reduce((sum, line) => sum + line.quantity * line.factor, 0)),
      };
    }

    const entered = finiteNumber(raw);
    const factor = simpleFactor(template, code, unit, presChoices);
    return {
      ...common,
      mode: 'simple',
      entered,
      factor,
      presentation: presentationName(template, code, unit, factor),
      baseQuantity: round4(entered * factor),
    };
  });
}

export function normalizeReceiptManuals(manuales = [], deviceId = '', zoneName = '') {
  return manuales
    .filter(item =>
      item &&
      item.type !== 'comment' &&
      String(item.deviceId || '') === String(deviceId) &&
      (!zoneName || String(item.zona || '') === String(zoneName))
    )
    .map(item => ({
      id: String(item.id || ''),
      name: String(item.nombre || ''),
      quantity: round4(item.cantidad),
      unit: String(item.uni || item.unidad || ''),
      entered: item.cantidadRaw == null ? null : round4(item.cantidadRaw),
      factor: item.factor == null ? null : finiteNumber(item.factor),
      presentation: String(item.presentacion || ''),
      photoAttached: !!item.foto,
      createdAt: String(item.createdAt || ''),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function buildReceiptPayload({
  eventId,
  almacen,
  fecha,
  operario,
  deviceId,
  zoneKey,
  zoneIndex,
  zoneName,
  templateHash,
  items,
  manualItems,
}) {
  return {
    schema: 'inventory-zone-receipt/v1',
    eventId: String(eventId || ''),
    almacen: String(almacen || ''),
    fecha: String(fecha || ''),
    operario: String(operario || ''),
    deviceId: String(deviceId || ''),
    zoneKey: String(zoneKey || ''),
    zoneIndex: Number(zoneIndex) || 0,
    zoneName: String(zoneName || ''),
    templateHash: String(templateHash || ''),
    items: Array.isArray(items) ? items : [],
    manualItems: Array.isArray(manualItems) ? manualItems : [],
  };
}

export async function identifyReceipt(payload) {
  const hash = await sha256Hex(canonicalJson(payload));
  return {
    id: `ACU-${String(payload.fecha || '').replace(/-/g, '')}-${hash.slice(0, 24).toUpperCase()}`,
    hash,
  };
}
