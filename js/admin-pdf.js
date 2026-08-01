// Datos auditables para los PDF del admin.
// Mantiene separado el total final de las aportaciones originales para que una
// correccion administrativa no borre quien conto cuanto.
import { factorDefault, cantidadBase, calcularTotalesSesion } from './sesion-merge.js';

const redondear4 = valor => {
  const n = Number(valor);
  return Number.isFinite(n) ? parseFloat(n.toFixed(4)) : valor;
};

export function indiceDeZona(claveZona) {
  const indice = parseInt(String(claveZona), 10);
  return Number.isFinite(indice) ? indice : null;
}

export function dispositivoDeZona(claveZona) {
  const clave = String(claveZona || '');
  const separador = clave.indexOf(':');
  return separador >= 0 ? clave.slice(separador + 1) : '';
}

export function nombreZonaSesion(sesion, claveZona, nombresLegacy = []) {
  const indice = indiceDeZona(claveZona);
  if (indice != null && sesion?.zoneSnapshot?.[indice]?.nombre) {
    return String(sesion.zoneSnapshot[indice].nombre);
  }
  if (indice != null && nombresLegacy?.[indice]) return String(nombresLegacy[indice]);
  return indice != null ? `Zona ${indice + 1}` : String(claveZona || 'Sin zona');
}

function operarioDeDispositivo(sesion, dispositivo) {
  if (!dispositivo) return String(sesion?.operario || 'Sin atribución');
  const directo = sesion?.operariosByDevice?.[dispositivo]?.operario;
  if (directo) return String(directo);
  const acuse = (sesion?.receipts || []).slice().reverse()
    .find(r => String(r?.deviceId || '') === String(dispositivo) && r?.operario);
  if (acuse?.operario) return String(acuse.operario);
  return `Dispositivo …${String(dispositivo).slice(-5)}`;
}

export function operarioDeZona(sesion, claveZona) {
  return operarioDeDispositivo(sesion, dispositivoDeZona(claveZona));
}

function articuloEnSnapshot(sesion, codigo) {
  for (const zona of (sesion?.zoneSnapshot || [])) {
    const encontrado = (zona?.items || []).find(item => String(item?.cod || '') === String(codigo));
    if (encontrado) {
      return {
        nombre: encontrado.art || encontrado.nombre || codigo,
        unidad: encontrado.uni || encontrado.unidad || ''
      };
    }
  }
  return null;
}

export function construirAportesPorCodigo(sesion, plantilla, nombresLegacy = []) {
  const totalesContados = {};
  const gruposPorCodigo = {};

  for (const [claveZona, conteos] of Object.entries(sesion?.countsByZone || {})) {
    const operario = operarioDeZona(sesion, claveZona);
    const zona = nombreZonaSesion(sesion, claveZona, nombresLegacy);
    for (const [codigo, valor] of Object.entries(conteos || {})) {
      const factor = (sesion?.presChoiceByZone?.[claveZona]?.[codigo])
        ?? factorDefault(plantilla, codigo);
      const cantidad = cantidadBase(valor, factor);
      totalesContados[codigo] = (totalesContados[codigo] || 0) + cantidad;

      if (!gruposPorCodigo[codigo]) gruposPorCodigo[codigo] = new Map();
      const claveAporte = `${operario}\u0000${zona}`;
      const anterior = gruposPorCodigo[codigo].get(claveAporte) || { operario, zona, cantidad: 0 };
      anterior.cantidad += cantidad;
      gruposPorCodigo[codigo].set(claveAporte, anterior);
    }
  }

  const aportesPorCodigo = {};
  for (const [codigo, grupos] of Object.entries(gruposPorCodigo)) {
    aportesPorCodigo[codigo] = [...grupos.values()]
      .map(aporte => ({ ...aporte, cantidad: redondear4(aporte.cantidad) }))
      .sort((a, b) => a.operario.localeCompare(b.operario, 'es') || a.zona.localeCompare(b.zona, 'es'));
  }
  for (const codigo of Object.keys(totalesContados)) {
    totalesContados[codigo] = redondear4(totalesContados[codigo]);
  }
  return { aportesPorCodigo, totalesContados };
}

export function construirDatosPDFSesion({
  sesion,
  plantilla = {},
  articulos = {},
  nombresLegacy = []
}) {
  const { aportesPorCodigo, totalesContados } = construirAportesPorCodigo(
    sesion, plantilla, nombresLegacy
  );
  const totalesFinales = calcularTotalesSesion(sesion, plantilla);
  const correccionesAdmin = sesion?.correctionsByZone?.['_admin'] || {};
  const codigos = new Set([
    ...Object.keys(totalesContados),
    ...Object.keys(totalesFinales),
    ...Object.keys(correccionesAdmin)
  ]);

  const items = [...codigos].map(codigo => {
    const catalogo = articulos[codigo]
      || articuloEnSnapshot(sesion, codigo)
      || { nombre: codigo, unidad: plantilla?.unitMap?.[codigo] || '' };
    return {
      codigo,
      nombre: catalogo.nombre || catalogo.art || codigo,
      unidad: catalogo.unidad || catalogo.uni || plantilla?.unitMap?.[codigo] || '',
      cantidadContada: Object.prototype.hasOwnProperty.call(totalesContados, codigo)
        ? totalesContados[codigo]
        : null,
      cantidadFinal: Object.prototype.hasOwnProperty.call(totalesFinales, codigo)
        ? redondear4(totalesFinales[codigo])
        : null,
      aportes: aportesPorCodigo[codigo] || [],
      correccion: correccionesAdmin[codigo] || null,
      manual: false
    };
  }).sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'));

  for (const manual of (sesion?.manuales || []).filter(m => m && m.type !== 'comment')) {
    const dispositivo = String(manual.deviceId || '');
    const operario = operarioDeDispositivo(sesion, dispositivo);
    const cantidad = redondear4(manual.cantidad);
    items.push({
      codigo: 'NO CATALOGADO',
      nombre: manual.nombre || '—',
      unidad: manual.uni || manual.unidad || '',
      cantidadContada: cantidad,
      cantidadFinal: cantidad,
      aportes: [{ operario, zona: manual.zona || 'Sin zona', cantidad }],
      correccion: null,
      manual: true,
      manualId: manual.id || ''
    });
  }

  const correcciones = Object.entries(correccionesAdmin).map(([codigo, correccion]) => ({
    codigo,
    cantCorregida: correccion?.qty,
    nota: correccion?.nota || 'Corrección admin',
    operario: correccion?.operario || '',
    ts: correccion?.ts || ''
  }));
  const notaGeneral = (sesion?.manuales || [])
    .filter(m => m && m.type === 'comment')
    .map(c => `${c.cod || c.nombre || ''}: ${c.texto || ''}`.replace(/^: /, ''))
    .join(' · ');
  const operarios = [...new Set(
    items.flatMap(item => item.aportes || []).map(aporte => aporte.operario).filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, 'es'));
  if (!operarios.length && sesion?.operario) operarios.push(String(sesion.operario));

  return { items, correcciones, notaGeneral, operarios };
}
