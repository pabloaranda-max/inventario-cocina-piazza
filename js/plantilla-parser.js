// js/plantilla-parser.js — módulo puro, sin DOM (spec §12 Fase 3, Slice R4).
// Única implementación de parsePlantilla/hashRaw; admin.html la expone en window.
// Requiere SheetJS: se pasa como parámetro o se toma de globalThis.XLSX.

// Parsea el xlsx real de Xetux ("Incluir presentaciones" activado). Ver spec §5:
// fila artículo = código sin _NNNN; fila presentación = PARENTCODE_NNNN con el
// factor en el nombre "(0.75 LT)". Reglas R1–R5 aplicadas al construir presMap.
export function parsePlantilla(buf, XLSX = globalThis.XLSX) {
  const wb   = XLSX.read(buf, { type:'array' });
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header:1, defval:'' });
  const norm = s => String(s??'').replace(/^﻿/,'').trim();

  const hIdx = rows.findIndex(r => r.some(h => /^c[oó]digo$/i.test(norm(h))));
  if (hIdx === -1) throw new Error('Columna "Código" no encontrada');
  const H    = rows[hIdx].map(norm);
  const iCod = H.findIndex(h => /^c[oó]digo$/i.test(h));
  const iCan = H.findIndex(h => /^cantidad$/i.test(h));
  const iUni = H.findIndex(h => /^unidad$/i.test(h));
  const iArt = H.findIndex(h => /^art[ií]culo$/i.test(h));
  if (iCan < 0) throw new Error('Columna "Cantidad" no encontrada');

  const rowMap = {}, unitMap = {}, presRaw = {};
  for (let r = hIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    const num = norm(row[0]), cod = norm(row[iCod]);
    if (!num || !cod) continue;

    const isPres = /_\d+$/.test(cod);
    if (!isPres) {
      const uni = iUni >= 0 ? norm(row[iUni]) : '';
      rowMap[cod] = r; unitMap[cod] = uni; presRaw[cod] = [];
    } else {
      const parentCod = cod.replace(/_\d+$/, '');
      if (!presRaw[parentCod]) continue;
      const nom    = iUni >= 0 ? norm(row[iUni]) : '';
      const artNom = iArt >= 0 ? norm(row[iArt]) : '';
      const m      = artNom.match(/\((\d+\.?\d*)\s+\w+\)\s*$/);
      const facVal = m ? parseFloat(m[1]) : NaN;
      if (nom && !isNaN(facVal) && facVal > 0)
        presRaw[parentCod].push({ nombre: nom, factor: facVal, uni: unitMap[parentCod] || '' });
    }
  }

  const presMap = {};
  for (const [cod, list] of Object.entries(presRaw)) {
    const uni = unitMap[cod] || '', isVW = /^(LT|KG)$/i.test(uni);
    // R1: factor 1.0 se ignora. R2: factor >10 en LT/KG = error Xetux (mL/g), se ignora.
    const filtered = list.filter(p => p.factor !== 1.0 && !(isVW && p.factor > 10));
    // R4: deduplicar por factor. R5: múltiples factores válidos se conservan todos.
    const seen = new Map();
    for (const p of filtered) if (!seen.has(p.factor)) seen.set(p.factor, p);
    const unique = [...seen.values()];
    if (unique.length) presMap[cod] = unique;
  }
  return { rowMap, cantidadColIdx: iCan, presMap, unitMap };
}

// SHA-256 truncado a 16 hex del raw base64 — versionado de plantilla (spec §5).
export async function hashRaw(raw) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('').slice(0, 16);
}
