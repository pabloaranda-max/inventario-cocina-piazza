// js/sesion-merge.js — módulo puro, sin DOM ni bindings (spec §12 Fase 3, Slice R4).
// Única implementación de las reglas de merge de sesiones y totales con factor.
// Lo importan: el Worker (operaciones-api, endpoint inv_sesion) y admin.html.

// Merge por zona de countsByZone / presChoiceByZone. Las claves colaborativas
// "zoneIdx:deviceId" representan el estado COMPLETO de ese dispositivo y se
// reemplazan (así borrar un input se propaga); las claves legacy sin ':' hacen
// merge superficial (spec §6-§7).
export function mergeZoneMap(existing, incoming) {
  const merged = { ...(existing || {}) };
  for (const [zid, zc] of Object.entries(incoming || {})) {
    if (String(zid).includes(':')) merged[zid] = { ...zc };
    else merged[zid] = { ...(merged[zid] || {}), ...zc };
  }
  return merged;
}

// Correcciones admin: merge superficial por zona, incoming gana por código.
export function mergeCorrections(existing, incoming) {
  const merged = { ...(existing || {}) };
  for (const [zid, corr] of Object.entries(incoming || {})) {
    merged[zid] = { ...(merged[zid] || {}), ...(corr || {}) };
  }
  return merged;
}

// Manuales: merge por id (incoming gana); removeIds elimina.
export function mergeManuales(existing, incoming, removeIds) {
  const removed = new Set(removeIds || []);
  const map = Object.fromEntries(
    (existing || []).filter(m => !removed.has(m.id)).map(m => [m.id, m]));
  for (const m of (incoming || [])) if (m.id) map[m.id] = m;
  return Object.values(map);
}

// completedZones: unión, respetando removals explícitos.
export function mergeCompletedZones(existing, incoming, removeZones) {
  const removed = new Set(removeZones || []);
  return [...new Set([
    ...(existing || []).filter(z => !removed.has(z)),
    ...(incoming || [])
  ])];
}

// Factor por defecto de un código: presMap explícito primero, luego defaultPres
// por unidad (spec §5 getPresOptions), si no 1.
export function factorDefault(T, cod) {
  const explicit = T?.presMap?.[cod];
  if (explicit?.length) return explicit[0].factor;
  const uni = T?.unitMap?.[cod] || '';
  const defaults = T?.defaultPres?.[uni];
  return defaults?.[0]?.factor ?? 1;
}

// Totales de una sesión: suma sobre zonas/dispositivos con el factor elegido
// (presChoiceByZone) o el default; correcciones admin sobreescriben (spec §9).
export function calcularTotalesSesion(S, T) {
  const totales = {};
  for (const [zid, zc] of Object.entries(S?.countsByZone || {})) {
    for (const [cod, qty] of Object.entries(zc || {})) {
      const f = (S?.presChoiceByZone?.[zid]?.[cod]) ?? factorDefault(T, cod);
      totales[cod] = (totales[cod] || 0) + qty * f;
    }
  }
  const adminCorr = S?.correctionsByZone?.['_admin'] || {};
  for (const [cod, corr] of Object.entries(adminCorr)) {
    if (corr?.qty != null) totales[cod] = corr.qty;
  }
  return totales;
}
