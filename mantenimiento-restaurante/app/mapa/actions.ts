'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { FormState } from '@/lib/form-state'
import { todayMX } from '@/lib/utils'

export async function guardarMapaZonas(_state: FormState, formData: FormData): Promise<FormState> {
  const raw = String(formData.get('zonas') ?? '')
  if (!raw) return { error: 'No hay zonas para guardar.' }
  const rawDeletedZonaIds = String(formData.get('deleted_zona_ids') ?? '[]')

	let zonas: Array<{
	  id: string
	  nivel_id: string
	  parent_id?: string | null
	  area: string
	  label: string
	  nombre?: string
    descripcion?: string | null
    color?: string | null
	  tipo?: 'zona' | 'subzona'
	  geometry_tipo?: 'point' | 'rect' | 'polygon'
	  geometry?: {
	    x?: number
	    y?: number
	    width?: number
	    height?: number
      points?: Array<{
        x?: number
        y?: number
      }>
	  } | null
	  x: number
	  y: number
	}>
  let deletedZonaIds: string[]

  try {
    zonas = JSON.parse(raw)
    const parsedDeletedZonaIds = JSON.parse(rawDeletedZonaIds)
    deletedZonaIds = Array.isArray(parsedDeletedZonaIds)
      ? parsedDeletedZonaIds.filter((id): id is string => typeof id === 'string' && Boolean(id.trim()))
      : []
  } catch {
    return { error: 'No se pudo leer la configuración del mapa.' }
  }

  const payload = zonas.map((zona, index) => {
    let x = Math.min(100, Math.max(0, Number(zona.x)))
    let y = Math.min(100, Math.max(0, Number(zona.y)))
	  const label = zona.label.trim()
	  const area = zona.area.trim()
	  const nombre = zona.nombre?.trim() || label || area
	  const geometryTipo = zona.geometry_tipo ?? 'point'
	  const width = Math.min(100, Math.max(2, Number(zona.geometry?.width ?? 18)))
	  const height = Math.min(100, Math.max(2, Number(zona.geometry?.height ?? 12)))
    const points = Array.isArray(zona.geometry?.points)
      ? zona.geometry.points
          .map((point) => {
            if (!point) return null
            const px = Number(point.x)
            const py = Number(point.y)
            if (Number.isNaN(px) || Number.isNaN(py)) return null

            return {
              x: Math.min(100, Math.max(0, Number(px.toFixed(3)))),
              y: Math.min(100, Math.max(0, Number(py.toFixed(3))))
            }
          })
          .filter((point): point is { x: number; y: number } => point !== null)
      : []
    const polygonMetrics = points.length >= 3
      ? {
          minX: Math.min(...points.map((point) => point.x)),
          maxX: Math.max(...points.map((point) => point.x)),
          minY: Math.min(...points.map((point) => point.y)),
          maxY: Math.max(...points.map((point) => point.y))
        }
      : null

    if (polygonMetrics) {
      x = Number((((polygonMetrics.minX + polygonMetrics.maxX) / 2)).toFixed(3))
      y = Number((((polygonMetrics.minY + polygonMetrics.maxY) / 2)).toFixed(3))
    }

	  const geometry = geometryTipo === 'rect'
	    ? { x, y, width, height }
      : geometryTipo === 'polygon'
        ? { x, y, points }
	    : { x, y }

	  return {
	    id: zona.id,
	    nivel_id: zona.nivel_id,
	    parent_id: zona.parent_id ?? null,
	    area,
	    label,
	    nombre,
      descripcion: zona.descripcion?.trim() || null,
      color: zona.color?.trim() || null,
	    tipo: zona.tipo ?? 'zona',
	    geometry_tipo: geometryTipo,
	    geometry,
	    x,
	    y,
      orden: index * 10,
      visible: true
    }
  })

  if (
    payload.some(
      (zona) =>
        !zona.id ||
        !zona.nivel_id ||
        !zona.area ||
        !zona.label ||
        !zona.nombre ||
        Number.isNaN(zona.x) ||
        Number.isNaN(zona.y) ||
        (zona.geometry_tipo === 'polygon' &&
          (!Array.isArray((zona.geometry as { points?: unknown[] } | null)?.points) ||
            ((zona.geometry as { points?: unknown[] }).points?.length ?? 0) < 3))
    )
  ) {
    return { error: 'Revisa nombres, áreas y posiciones antes de guardar.' }
  }

	const supabase = await createServerSupabaseClient()
	if (deletedZonaIds.length) {
	  const { error: deleteError } = await supabase.from('mapa_zonas').update({ visible: false }).in('id', deletedZonaIds)
	  if (deleteError) return { error: deleteError.message }
	}

  if (payload.length) {
    const { error } = await supabase.from('mapa_zonas').upsert(payload)
    if (error) return { error: error.message }
  }

  const areaNames = Array.from(new Set(payload.map((z) => z.area).filter(Boolean)))
  if (areaNames.length) {
    const { error: areasError } = await supabase
      .from('areas')
      .upsert(areaNames.map((nombre) => ({ nombre })), { onConflict: 'nombre' })
    if (areasError) return { error: areasError.message }
  }

  const [
    { data: allAreas, error: allAreasError },
    { data: equipmentAreas, error: equipmentAreasError },
    { data: infrastructureAreas, error: infrastructureAreasError },
    { data: mapAreas, error: mapAreasError }
  ] = await Promise.all([
    supabase.from('areas').select('nombre'),
    supabase.from('equipos').select('area').not('area', 'is', null),
    supabase.from('infraestructura').select('area').not('area', 'is', null),
    supabase.from('mapa_zonas').select('area').not('area', 'is', null)
  ])

  if (allAreasError) return { error: allAreasError.message }
  if (equipmentAreasError) return { error: equipmentAreasError.message }
  if (infrastructureAreasError) return { error: infrastructureAreasError.message }
  if (mapAreasError) return { error: mapAreasError.message }

  const usedAreas = new Set([
    ...(equipmentAreas ?? []).map((row) => row.area).filter((area): area is string => Boolean(area)),
    ...(infrastructureAreas ?? []).map((row) => row.area).filter((area): area is string => Boolean(area)),
    ...(mapAreas ?? []).map((row) => row.area).filter((area): area is string => Boolean(area))
  ])
  const unusedAreas = (allAreas ?? [])
    .map((row) => row.nombre)
    .filter((nombre): nombre is string => Boolean(nombre) && !usedAreas.has(nombre))

  if (unusedAreas.length) {
    const { error: cleanupError } = await supabase.from('areas').delete().in('nombre', unusedAreas)
    if (cleanupError) return { error: cleanupError.message }
  }

  revalidatePath('/mapa')
  revalidatePath('/equipos')
  return { success: true }
}

export async function crearLimpiezaMapa(_state: FormState, formData: FormData): Promise<FormState> {
  const descripcion = String(formData.get('descripcion') ?? '').trim()
  const realizadoPor = String(formData.get('realizado_por') ?? '').trim() || null
  const activoId = String(formData.get('activo_id') ?? '').trim() || null
  const zonaId = String(formData.get('zona_id') ?? '').trim() || null
  const fechaRealizacion = String(formData.get('fecha_realizacion') ?? '').trim() || todayMX()

  if (!descripcion) return { error: 'La descripción es obligatoria.' }
  if (!activoId && !zonaId) return { error: 'Selecciona una zona o un activo para registrar la limpieza.' }

  const supabase = await createServerSupabaseClient()

  let zonaNombre: string | null = null

  if (zonaId) {
    const { data: zona, error: zonaError } = await supabase
      .from('mapa_zonas')
      .select('nombre')
      .eq('id', zonaId)
      .single()

    if (zonaError) return { error: zonaError.message }
    zonaNombre = zona.nombre ?? null
  }

  const { data, error } = await supabase.rpc('registrar_mantenimiento', {
    p_tipo: 'limpieza_profunda',
    p_descripcion: descripcion,
    p_equipo_id: null,
    p_infraestructura_id: null,
    p_realizado_por: realizadoPor,
    p_costo: null,
    p_repuestos_notas: null,
    p_fotos_urls: [],
    p_fecha_realizacion: fechaRealizacion,
    p_proxima_fecha_sugerida: null,
    p_marcar_operativo: false,
    p_incidencia_id: null,
    p_activo_id: activoId,
    p_ejecucion_tipo: 'interno',
    p_requiere_material: false,
    p_proveedor_id: null
  })

  if (error) return { error: error.message }

  if (data && zonaId) {
    const { error: updateError } = await supabase
      .from('mantenimientos')
      .update({
        zona_id: zonaId,
        zona_nombre: zonaNombre
      })
      .eq('id', data)

    if (updateError) return { error: updateError.message }
  }

  revalidatePath('/')
  revalidatePath('/mapa')
  revalidatePath('/mantenimientos')
  if (activoId) revalidatePath('/activos')

  return { success: true }
}
