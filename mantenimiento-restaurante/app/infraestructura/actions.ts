'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { emptyToNull } from '@/lib/utils'
import { removeStorageFiles, uploadOptionalFile } from '@/lib/storage'
import type { FormState } from '@/lib/form-state'
import type { CriticidadInfraestructura, EstadoInfraestructura } from '@/lib/types'

type InfraestructuraPayload = {
  nombre: string
  tipo: string
  area: string | null
  nivel_id: string | null
  x: number | null
  y: number | null
  estado: EstadoInfraestructura
  criticidad: CriticidadInfraestructura
  descripcion_ubicacion: string | null
  notas: string | null
  proveedor_id: string | null
  fecha_ultima_revision: string | null
  fecha_proxima_revision: string | null
  foto_url?: string | null
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

function parsePercent(value: FormDataEntryValue | null) {
  const raw = emptyToNull(value)
  if (!raw) return null
  const parsed = Number(raw)
  if (Number.isNaN(parsed)) return NaN
  return Number(Math.min(100, Math.max(0, parsed)).toFixed(3))
}

function getPayload(formData: FormData): InfraestructuraPayload | FormState {
  const nombre = String(formData.get('nombre') ?? '').trim()
  const tipo = String(formData.get('tipo') ?? '').trim()
  if (!nombre) return { error: 'El nombre es obligatorio.' }
  if (!tipo) return { error: 'El tipo es obligatorio.' }

  const nivelId = emptyToNull(formData.get('nivel_id'))
  const x = parsePercent(formData.get('x'))
  const y = parsePercent(formData.get('y'))

  if (Number.isNaN(x) || Number.isNaN(y)) {
    return { error: 'Las coordenadas del mapa deben ser números entre 0 y 100.' }
  }

  if ((nivelId && (x === null || y === null)) || (!nivelId && (x !== null || y !== null))) {
    return { error: 'Para ubicar en mapa selecciona lámina, X y Y.' }
  }

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
    tipo,
    area: emptyToNull(formData.get('area')),
    nivel_id: nivelId,
    x,
    y,
    estado: String(formData.get('estado') ?? 'operativo') as EstadoInfraestructura,
    criticidad: String(formData.get('criticidad') ?? 'media') as CriticidadInfraestructura,
    descripcion_ubicacion: emptyToNull(formData.get('descripcion_ubicacion')),
    notas: emptyToNull(formData.get('notas')),
    proveedor_id: emptyToNull(formData.get('proveedor_id')),
    fecha_ultima_revision: emptyToNull(formData.get('fecha_ultima_revision')),
    fecha_proxima_revision: emptyToNull(formData.get('fecha_proxima_revision')),
    limpieza_intervalo_dias: limpiezaIntervalo,
    limpieza_tipo: limpiezaTipo,
    limpieza_proveedor_id: limpiezaEnabled && limpiezaTipo === 'contratado' ? emptyToNull(formData.get('limpieza_proveedor_id')) : null,
    fecha_ultima_limpieza: fechaUltimaLimpieza,
    fecha_proxima_limpieza: fechaProximaLimpieza,
  }
}

async function upsertAreaIfNeeded(area: string | null) {
  if (!area) return null
  const supabase = await createServerSupabaseClient()
  return supabase.from('areas').upsert({ nombre: area }, { onConflict: 'nombre' })
}

export async function crearInfraestructura(_state: FormState, formData: FormData): Promise<FormState> {
  const payload = getPayload(formData)
  if (!('nombre' in payload)) return payload

  const supabase = await createServerSupabaseClient()
  let fotoUrl: string | null = null

  try {
    fotoUrl = await uploadOptionalFile(supabase, formData.get('foto'), 'infraestructura')
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'No se pudo subir la foto.' }
  }

  const { data, error } = await supabase
    .from('activos')
    .insert({
      clase: 'infraestructura',
      nombre: payload.nombre,
      tipo: payload.tipo,
      area: payload.area,
      estado: payload.estado,
      criticidad: payload.criticidad,
      proveedor_id: payload.proveedor_id,
      nivel_id: payload.nivel_id,
      x: payload.x,
      y: payload.y,
      foto_url: fotoUrl,
      notas: payload.notas,
      fecha_ultima_revision: payload.fecha_ultima_revision,
      fecha_proxima_revision: payload.fecha_proxima_revision,
      limpieza_intervalo_dias: payload.limpieza_intervalo_dias,
      limpieza_tipo: payload.limpieza_tipo,
      limpieza_proveedor_id: payload.limpieza_proveedor_id,
      fecha_ultima_limpieza: payload.fecha_ultima_limpieza,
      fecha_proxima_limpieza: payload.fecha_proxima_limpieza,
    })
    .select('id')
    .single()

  if (error) {
    await removeStorageFiles(supabase, [fotoUrl])
    return { error: error.message }
  }

  const {
    limpieza_intervalo_dias: _a,
    limpieza_tipo: _b,
    limpieza_proveedor_id: _c,
    fecha_ultima_limpieza: _d,
    fecha_proxima_limpieza: _e,
    ...infraPayload
  } = payload
  const { error: infraestructuraError } = await supabase
    .from('infraestructura')
    .insert({ id: data.id, ...infraPayload, foto_url: fotoUrl })

  if (infraestructuraError) {
    await removeStorageFiles(supabase, [fotoUrl])
    await supabase.from('activos').delete().eq('id', data.id)
    return { error: infraestructuraError.message }
  }

  const { error: detalleError } = await supabase
    .from('infraestructura_detalle')
    .insert({ activo_id: data.id, descripcion_ubicacion: payload.descripcion_ubicacion })

  if (detalleError) return { error: detalleError.message }

  const areaResult = await upsertAreaIfNeeded(payload.area)
  if (areaResult?.error) return { error: areaResult.error.message }

  revalidatePath('/infraestructura')
  revalidatePath('/')
  revalidatePath('/mapa')
  redirect(`/infraestructura/${data.id}?flash=infraestructura_creada`)
}

export async function actualizarInfraestructura(
  id: string,
  _state: FormState,
  formData: FormData
): Promise<FormState> {
  const payload = getPayload(formData)
  if (!('nombre' in payload)) return payload

  const supabase = await createServerSupabaseClient()
  const { data: current, error: currentError } = await supabase
    .from('infraestructura')
    .select('foto_url')
    .eq('id', id)
    .single()

  if (currentError) return { error: currentError.message }

  let fotoUrl: string | null = null
  try {
    fotoUrl = await uploadOptionalFile(supabase, formData.get('foto'), 'infraestructura')
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'No se pudo subir la foto.' }
  }

  const {
    limpieza_intervalo_dias: _a,
    limpieza_tipo: _b,
    limpieza_proveedor_id: _c,
    fecha_ultima_limpieza: _d,
    fecha_proxima_limpieza: _e,
    ...infraUpdatePayload
  } = payload
  if (fotoUrl) infraUpdatePayload.foto_url = fotoUrl

  const { error: activoError } = await supabase
    .from('activos')
    .update({
      nombre: payload.nombre,
      tipo: payload.tipo,
      area: payload.area,
      estado: payload.estado,
      criticidad: payload.criticidad,
      proveedor_id: payload.proveedor_id,
      nivel_id: payload.nivel_id,
      x: payload.x,
      y: payload.y,
      ...(fotoUrl ? { foto_url: fotoUrl } : {}),
      notas: payload.notas,
      fecha_ultima_revision: payload.fecha_ultima_revision,
      fecha_proxima_revision: payload.fecha_proxima_revision,
      limpieza_intervalo_dias: payload.limpieza_intervalo_dias,
      limpieza_tipo: payload.limpieza_tipo,
      limpieza_proveedor_id: payload.limpieza_proveedor_id,
      fecha_ultima_limpieza: payload.fecha_ultima_limpieza,
      fecha_proxima_limpieza: payload.fecha_proxima_limpieza,
    })
    .eq('id', id)

  if (activoError) {
    await removeStorageFiles(supabase, [fotoUrl])
    return { error: activoError.message }
  }

  const { error } = await supabase.from('infraestructura').update(infraUpdatePayload).eq('id', id)

  if (error) {
    await removeStorageFiles(supabase, [fotoUrl])
    return { error: error.message }
  }

  const { error: detalleError } = await supabase
    .from('infraestructura_detalle')
    .upsert({ activo_id: id, descripcion_ubicacion: payload.descripcion_ubicacion })

  if (detalleError) return { error: detalleError.message }

  if (fotoUrl) await removeStorageFiles(supabase, [current?.foto_url])

  const areaResult = await upsertAreaIfNeeded(payload.area)
  if (areaResult?.error) return { error: areaResult.error.message }

  revalidatePath('/infraestructura')
  revalidatePath('/')
  revalidatePath(`/infraestructura/${id}`)
  revalidatePath('/mapa')
  redirect(`/infraestructura/${id}?flash=infraestructura_actualizada`)
}
