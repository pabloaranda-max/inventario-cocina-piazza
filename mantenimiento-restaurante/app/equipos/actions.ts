'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { emptyToNull } from '@/lib/utils'
import { removeStorageFiles, uploadOptionalFile } from '@/lib/storage'
import type { FormState } from '@/lib/form-state'
import type { EstadoEquipo } from '@/lib/types'
import {
  buildMultipleDefinedValue,
  buildSingleDefinedValue,
  equipoCategorias
} from '@/lib/defined-options'

type EquipoPayload = {
  nombre: string
  area: string | null
  categoria: string | null
  marca: string | null
  modelo: string | null
  numero_serie: string | null
  estado: EstadoEquipo
  proveedor_id: string | null
  fecha_ultimo_mantenimiento: string | null
  fecha_proximo_mantenimiento: string | null
  notas: string | null
  foto_url?: string | null
  foto_placa_url?: string | null
  limpieza_intervalo_dias: number | null
  limpieza_tipo: 'interno' | 'contratado' | null
  limpieza_proveedor_id: string | null
  fecha_ultima_limpieza: string | null
  fecha_proxima_limpieza: string | null
}

function addDays(dateString: string, days: number) {
  const date = new Date(`${dateString}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function getEquipoPayload(formData: FormData, validAreas: string[]): EquipoPayload | FormState {
  const nombre = String(formData.get('nombre') ?? '').trim()
  if (!nombre) return { error: 'El nombre es obligatorio.' }

  const area = buildSingleDefinedValue({
    value: formData.get('area'),
    other: formData.get('area_otro'),
    options: validAreas,
    fieldLabel: 'el área'
  })
  if (typeof area === 'object' && area && 'error' in area) return area

  const categoria = buildMultipleDefinedValue({
    values: formData.getAll('categoria'),
    other: formData.get('categoria_otro'),
    options: equipoCategorias,
    fieldLabel: 'la categoría'
  })
  if (typeof categoria === 'object' && categoria && 'error' in categoria) return categoria

  const limpiezaEnabled = formData.get('limpieza_enabled') === 'on'
  const limpiezaIntervaloRaw = emptyToNull(formData.get('limpieza_intervalo_dias'))
  const limpiezaIntervalo = limpiezaEnabled && limpiezaIntervaloRaw ? Number(limpiezaIntervaloRaw) : null
  if (limpiezaEnabled && (!limpiezaIntervalo || Number.isNaN(limpiezaIntervalo) || limpiezaIntervalo <= 0)) {
    return { error: 'Selecciona un intervalo válido para la limpieza profunda.' }
  }

  const limpiezaTipoRaw = String(formData.get('limpieza_tipo') ?? 'interno')
  const limpiezaTipo = limpiezaEnabled ? (limpiezaTipoRaw === 'contratado' ? 'contratado' : 'interno') as 'interno' | 'contratado' : null
  const fechaUltimaLimpieza = limpiezaEnabled ? emptyToNull(formData.get('fecha_ultima_limpieza')) : null
  const fechaProximaLimpieza = limpiezaEnabled
    ? emptyToNull(formData.get('fecha_proxima_limpieza')) ??
      (fechaUltimaLimpieza && limpiezaIntervalo ? addDays(fechaUltimaLimpieza, limpiezaIntervalo) : null)
    : null

  if (limpiezaEnabled && !fechaProximaLimpieza) {
    return { error: 'Selecciona la próxima fecha de limpieza profunda.' }
  }

  return {
    nombre,
    area,
    categoria,
    marca: emptyToNull(formData.get('marca')),
    modelo: emptyToNull(formData.get('modelo')),
    numero_serie: emptyToNull(formData.get('numero_serie')),
    estado: String(formData.get('estado') ?? 'operativo') as EstadoEquipo,
    proveedor_id: emptyToNull(formData.get('proveedor_id')),
    fecha_ultimo_mantenimiento: emptyToNull(formData.get('fecha_ultimo_mantenimiento')),
    fecha_proximo_mantenimiento: emptyToNull(formData.get('fecha_proximo_mantenimiento')),
    notas: emptyToNull(formData.get('notas')),
    limpieza_intervalo_dias: limpiezaIntervalo,
    limpieza_tipo: limpiezaTipo,
    limpieza_proveedor_id: limpiezaEnabled && limpiezaTipo === 'contratado' ? emptyToNull(formData.get('limpieza_proveedor_id')) : null,
    fecha_ultima_limpieza: fechaUltimaLimpieza,
    fecha_proxima_limpieza: fechaProximaLimpieza,
  }
}

export async function crearEquipo(_state: FormState, formData: FormData): Promise<FormState> {
  const supabase = await createServerSupabaseClient()
  const { data: areasData } = await supabase.from('areas').select('nombre')
  const validAreas = (areasData ?? []).map((a) => a.nombre)
  const payload = getEquipoPayload(formData, validAreas)
  if (!('nombre' in payload)) return payload

  const fotoUrl = await uploadOptionalFile(supabase, formData.get('foto'), 'equipos')
  const fotoPlacaUrl = await uploadOptionalFile(
    supabase,
    formData.get('foto_placa'),
    'equipos/placas'
  )

  const { data, error } = await supabase
    .from('activos')
    .insert({
      clase: 'equipo',
      nombre: payload.nombre,
      tipo: payload.categoria ?? 'Equipo',
      area: payload.area,
      estado: payload.estado,
      criticidad: 'media',
      proveedor_id: payload.proveedor_id,
      foto_url: fotoUrl,
      notas: payload.notas,
      fecha_ultima_revision: payload.fecha_ultimo_mantenimiento,
      fecha_proxima_revision: payload.fecha_proximo_mantenimiento,
      limpieza_intervalo_dias: payload.limpieza_intervalo_dias,
      limpieza_tipo: payload.limpieza_tipo,
      limpieza_proveedor_id: payload.limpieza_proveedor_id,
      fecha_ultima_limpieza: payload.fecha_ultima_limpieza,
      fecha_proxima_limpieza: payload.fecha_proxima_limpieza,
    })
    .select('id')
    .single()

  if (error) {
    await removeStorageFiles(supabase, [fotoUrl, fotoPlacaUrl])
    return { error: error.message }
  }

  const {
    limpieza_intervalo_dias: _a,
    limpieza_tipo: _b,
    limpieza_proveedor_id: _c,
    fecha_ultima_limpieza: _d,
    fecha_proxima_limpieza: _e,
    ...equipoPayload
  } = payload
  const { error: equipoError } = await supabase.from('equipos').insert({
    id: data.id,
    ...equipoPayload,
    foto_url: fotoUrl,
    foto_placa_url: fotoPlacaUrl
  })

  if (equipoError) {
    await removeStorageFiles(supabase, [fotoUrl, fotoPlacaUrl])
    await supabase.from('activos').delete().eq('id', data.id)
    return { error: equipoError.message }
  }

  const { error: detalleError } = await supabase.from('equipos_detalle').insert({
    activo_id: data.id,
    categoria: payload.categoria,
    marca: payload.marca,
    modelo: payload.modelo,
    numero_serie: payload.numero_serie,
    foto_placa_url: fotoPlacaUrl
  })

  if (detalleError) return { error: detalleError.message }

  if (payload.area) {
    const { error: areaError } = await supabase.from('areas').upsert({ nombre: payload.area }, { onConflict: 'nombre' })
    if (areaError) return { error: areaError.message }
  }

  revalidatePath('/equipos')
  revalidatePath('/')
  revalidatePath('/mapa')
  redirect(`/equipos/${data.id}?flash=equipo_creado`)
}

export async function actualizarEquipo(
  id: string,
  _state: FormState,
  formData: FormData
): Promise<FormState> {
  const supabase = await createServerSupabaseClient()
  const { data: areasData } = await supabase.from('areas').select('nombre')
  const validAreas = (areasData ?? []).map((a) => a.nombre)
  const payload = getEquipoPayload(formData, validAreas)
  if (!('nombre' in payload)) return payload

  const { data: currentEquipo, error: currentError } = await supabase
    .from('equipos')
    .select('foto_url, foto_placa_url')
    .eq('id', id)
    .single()

  if (currentError) return { error: currentError.message }

  let fotoUrl: string | null = null
  let fotoPlacaUrl: string | null = null

  try {
    fotoUrl = await uploadOptionalFile(supabase, formData.get('foto'), 'equipos')
    fotoPlacaUrl = await uploadOptionalFile(supabase, formData.get('foto_placa'), 'equipos/placas')
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'No se pudieron subir las fotos.' }
  }

  const {
    limpieza_intervalo_dias: _a,
    limpieza_tipo: _b,
    limpieza_proveedor_id: _c,
    fecha_ultima_limpieza: _d,
    fecha_proxima_limpieza: _e,
    ...equipoUpdatePayload
  } = payload
  if (fotoUrl) equipoUpdatePayload.foto_url = fotoUrl
  if (fotoPlacaUrl) equipoUpdatePayload.foto_placa_url = fotoPlacaUrl

  const { error: activoError } = await supabase
    .from('activos')
    .update({
      nombre: payload.nombre,
      tipo: payload.categoria ?? 'Equipo',
      area: payload.area,
      estado: payload.estado,
      proveedor_id: payload.proveedor_id,
      ...(fotoUrl ? { foto_url: fotoUrl } : {}),
      notas: payload.notas,
      fecha_ultima_revision: payload.fecha_ultimo_mantenimiento,
      fecha_proxima_revision: payload.fecha_proximo_mantenimiento,
      limpieza_intervalo_dias: payload.limpieza_intervalo_dias,
      limpieza_tipo: payload.limpieza_tipo,
      limpieza_proveedor_id: payload.limpieza_proveedor_id,
      fecha_ultima_limpieza: payload.fecha_ultima_limpieza,
      fecha_proxima_limpieza: payload.fecha_proxima_limpieza,
    })
    .eq('id', id)

  if (activoError) {
    await removeStorageFiles(supabase, [fotoUrl, fotoPlacaUrl])
    return { error: activoError.message }
  }

  const { error } = await supabase.from('equipos').update(equipoUpdatePayload).eq('id', id)

  if (error) {
    await removeStorageFiles(supabase, [fotoUrl, fotoPlacaUrl])
    return { error: error.message }
  }

  const { error: detalleError } = await supabase
    .from('equipos_detalle')
    .upsert({
      activo_id: id,
      categoria: payload.categoria,
      marca: payload.marca,
      modelo: payload.modelo,
      numero_serie: payload.numero_serie,
      ...(fotoPlacaUrl ? { foto_placa_url: fotoPlacaUrl } : {})
    })

  if (detalleError) return { error: detalleError.message }

  if (payload.area) {
    const { error: areaError } = await supabase.from('areas').upsert({ nombre: payload.area }, { onConflict: 'nombre' })
    if (areaError) return { error: areaError.message }
  }

  await removeStorageFiles(supabase, [
    fotoUrl ? currentEquipo?.foto_url : null,
    fotoPlacaUrl ? currentEquipo?.foto_placa_url : null
  ])

  revalidatePath('/equipos')
  revalidatePath('/')
  revalidatePath(`/equipos/${id}`)
  revalidatePath('/mapa')
  redirect(`/equipos/${id}?flash=equipo_actualizado`)
}
