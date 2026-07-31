// js/plantilla-parser.js — módulo puro, sin DOM (spec §12 Fase 3, Slice R4).
// Única implementación de parsePlantilla/hashRaw; admin.html la expone en window.
// Requiere SheetJS: se pasa como parámetro o se toma de globalThis.XLSX.

// Correcciones operativas confirmadas para inconsistencias que ya vienen dentro
// del xlsx de Xetux. Se condicionan por código, nombre, unidad y fila fuente para
// no convertir una heurística de texto en una regla general silenciosa.
const KNOWN_XETUX_PRESENTATION_FIXES = {
  XMAT2410000317: {
    articlePattern: /\bUNLITRO\b/i,
    unitPattern: /^LT$/i,
    sourceCode: 'XMAT2410000317_2',
    presentation: { nombre: 'BOTELLA DE 1 LT', factor: 1 },
    detail: 'Xetux exporta una relación oculta de 750 ml; se usa únicamente la botella confirmada de 1 LT.'
  }
};

function unitFamily(value) {
  const v = String(value || '').trim().toUpperCase();
  if (/^(LT|LTS?|LITROS?|L|ML)$/.test(v)) return 'volume';
  if (/^(KG|KGS?|KILOGRAMOS?|K|G|GR|GRS|GRAMOS?)$/.test(v)) return 'weight';
  if (/^(PZA|PZAS|PZ|PIEZAS?|UND|UNIDADES?|U)$/.test(v)) return 'piece';
  return '';
}

// Xetux suele exportar la propia unidad base como si fuera presentación:
// "LT (1.0 LT)", "KG (1.0 KG)", etc. Esa fila no ayuda a contar y se ignora.
// Un envase nombrado ("BOTELLA DE 1 LT") sí aporta significado operativo aunque
// su factor sea 1 y debe conservarse.
function isBaseUnitOnlyPresentation(name, unit) {
  const nameFamily = unitFamily(name);
  return !!nameFamily && nameFamily === unitFamily(unit);
}

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
  const iGrp = H.findIndex(h => /^grupo$/i.test(h));
  const iSub = H.findIndex(h => /^subgrupo$/i.test(h));
  if (iCan < 0) throw new Error('Columna "Cantidad" no encontrada');

  const rowMap = {}, unitMap = {}, articleNameMap = {}, presRaw = {};
  // R8: la plantilla trae código+nombre+grupo+unidad → catálogo derivable para
  // almacenes sin catálogo D1 (el Worker solo lo usa si el almacén está vacío)
  const articulos = [];
  // R6: todo lo filtrado se REPORTA para decisión humana — nunca se autocorrige.
  // motivo: factor_1 | ml_g | duplicada | factor_ilegible | nombre_ambiguo
  const sospechosas = [];
  // Excepciones de negocio explícitamente confirmadas. Se separan de
  // `sospechosas` porque sí se aplican y deben quedar visibles en Admin.
  const correcciones = [];
  for (let r = hIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    const num = norm(row[0]), cod = norm(row[iCod]);
    if (!num || !cod) continue;

    const isPres = /_\d+$/.test(cod);
    if (!isPres) {
      const uni = iUni >= 0 ? norm(row[iUni]) : '';
      const nombre = iArt >= 0 ? norm(row[iArt]) : '';
      rowMap[cod] = r; unitMap[cod] = uni; articleNameMap[cod] = nombre; presRaw[cod] = [];
      articulos.push({
        codigo: cod,
        nombre,
        grupo:  iGrp >= 0 ? norm(row[iGrp]) : '',
        subgrupo: iSub >= 0 ? norm(row[iSub]) : '',
        unidad: uni
      });
    } else {
      const parentCod = cod.replace(/_\d+$/, '');
      if (!presRaw[parentCod]) continue;
      const nom    = iUni >= 0 ? norm(row[iUni]) : '';
      const artNom = iArt >= 0 ? norm(row[iArt]) : '';
      const m      = artNom.match(/\((\d+\.?\d*)\s+\w+\)\s*$/);
      const facVal = m ? parseFloat(m[1]) : NaN;
      if (nom && !isNaN(facVal) && facVal > 0)
        presRaw[parentCod].push({
          nombre: nom,
          factor: facVal,
          uni: unitMap[parentCod] || '',
          sourceCode: cod
        });
      else if (nom)
        sospechosas.push({ cod: parentCod, nombre: nom, factor: null, motivo: 'factor_ilegible' });
    }
  }

  const presMap = {};
  for (const [cod, list] of Object.entries(presRaw)) {
    const uni = unitMap[cod] || '', isVW = /^(LT|KG)$/i.test(uni);
    const knownFix = KNOWN_XETUX_PRESENTATION_FIXES[cod];
    if (
      knownFix &&
      knownFix.articlePattern.test(articleNameMap[cod] || '') &&
      knownFix.unitPattern.test(uni) &&
      list.some(p => p.factor === 1 && p.sourceCode === knownFix.sourceCode)
    ) {
      presMap[cod] = [{ ...knownFix.presentation, uni }];
      correcciones.push({
        cod,
        nombre: knownFix.presentation.nombre,
        factor: knownFix.presentation.factor,
        motivo: 'xetux_presentacion_fantasma',
        detalle: knownFix.detail
      });
      continue;
    }

    // R1: factor 1.0 que solo repite la unidad base se ignora; una presentación
    // nombrada se conserva. R2: factor >10 en LT/KG = error Xetux (mL/g), se ignora.
    const filtered = [];
    for (const p of list) {
      if (p.factor === 1.0 && isBaseUnitOnlyPresentation(p.nombre, uni))
        sospechosas.push({ cod, nombre: p.nombre, factor: p.factor, motivo: 'factor_1' });
      else if (isVW && p.factor > 10) sospechosas.push({ cod, nombre: p.nombre, factor: p.factor, motivo: 'ml_g' });
      else filtered.push(p);
    }
    // R4: deduplicar por factor. R5: múltiples factores válidos se conservan todos.
    const seen = new Map();
    for (const p of filtered) {
      if (seen.has(p.factor)) sospechosas.push({ cod, nombre: p.nombre, factor: p.factor, motivo: 'duplicada' });
      else seen.set(p.factor, { nombre: p.nombre, factor: p.factor, uni: p.uni });
    }
    const unique = [...seen.values()];
    // Mismo nombre con factores distintos entre las conservadas: ambiguo al elegir
    const porNombre = {};
    for (const p of unique) (porNombre[p.nombre] = porNombre[p.nombre] || []).push(p.factor);
    for (const [nom, facs] of Object.entries(porNombre)) {
      if (facs.length > 1)
        sospechosas.push({ cod, nombre: nom, factor: facs.join(' / '), motivo: 'nombre_ambiguo' });
    }
    if (unique.length) presMap[cod] = unique;
  }
  return { rowMap, cantidadColIdx: iCan, presMap, unitMap, sospechosas, correcciones, articulos };
}

// SHA-256 truncado a 16 hex del raw base64 — versionado de plantilla (spec §5).
export async function hashRaw(raw) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('').slice(0, 16);
}
