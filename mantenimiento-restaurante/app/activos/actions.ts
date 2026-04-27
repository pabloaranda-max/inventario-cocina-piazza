'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { emptyToNull } from '@/lib/utils'
import { removeStorageFiles, uploadOptionalFile } from '@/lib/storage'
import type { FormState } from '@/lib/form-state'
import type { Activo } from '@/lib/types'

type EstadoActivoEditable = Activo['estado']

const estadosValidos = new Set<EstadoActivoEditable>([
  'operativo',
  'pendiente_revision',
  'en_reparacion',
  'requiere_revision',
  'obstruido',
  'con_fuga',
  'sin_acceso',
  'fuera_de_servicio'
])

const criticidadesValidas = new Set<Activo['criticidad']>(['baja', 'media', 'alta', 'critica'])

export async function actualizarUbicacionActivo(
  id: string,
  _state: FormState,
  formData: FormData
): Promise<FormState> {
  const zonaId = emptyToNull(formData.get('zona_id'))
  const clearLocation = formData.get('quitar_ubicacion') === 'on'

  if (!clearLocation && !zonaId) return { error: 'Selecciona una zona.' }

  const supabase = await createServerSupabaseClient()
  const { data: activo, error: activoError } = await supabase
    .from('activos')
    .select('id,clase')
    .eq('id', id)
    .single()

  if (activoError) return { error: activoError.message }

  const { data: zona, error: zonaError } = zonaId
    ? await supabase
        .from('mapa_zonas')
        .select('id,nivel_id,area,nombre,x,y')
        .eq('id', zonaId)
        .single()
    : { data: null, error: null }

  if (zonaError) return { error: zonaError.message }

  const area = clearLocation ? null : zona?.area ?? zona?.nombre ?? null
  const locationPayload = clearLocation
    ? { nivel_id: null, x: null, y: null, zona_id: null }
    : { nivel_id: zona?.nivel_id ?? null, x: zona?.x ?? null, y: zona?.y ?? null, zona_id: zonaId }
  const areaPayload = { area }

  const { error } = await supabase
    .from('activos')
    .update({ ...locationPayload, ...areaPayload })
    .eq('id', id)

  if (error) return { error: error.message }

  if (activo.clase === 'infraestructura') {
    await supabase
      .from('infraestructura')
      .update({ ...locationPayload, ...areaPayload })
      .eq('id', id)
  } else if (activo.clase === 'equipo') {
    await supabase
      .from('equipos')
      .update({ area })
      .eq('id', id)
  }

  revalidatePath('/')
  revalidatePath('/mapa')
  revalidatePath('/activos')
  revalidatePath(`/activos/${id}`)
  if (activo.clase === 'equipo') revalidatePath(`/equipos/${id}`)
  if (activo.clase === 'infraestructura') revalidatePath(`/infraestructura/${id}`)
  redirect(`/activos/${id}`)
}

export async function actualizarActivoBase(
  id: string,
  _state: FormState,
  formData: FormData
): Promise<FormState> {
  const nombre = String(formData.get('nombre') ?? '').trim()
  const tipo = String(formData.get('tipo') ?? '').trim()
  const estado = String(formData.get('estado') ?? '').trim() as EstadoActivoEditable
  const criticidad = String(formData.get('criticidad') ?? 'media').trim() as Activo['criticidad']
  const zonaId = emptyToNull(formData.get('zona_id'))
  const proveedorId = emptyToNull(formData.get('proveedor_id'))
  const notas = emptyToNull(formData.get('notas'))
  const fechaUltimaRevision = emptyToNull(formData.get('fecha_ultima_revision'))
  const fechaProximaRevision = emptyToNull(formData.get('fecha_proxima_revision'))

  if (!nombre) return { error: 'El nombre es obligatorio.' }
  if (!tipo) return { error: 'El tipo es obligatorio.' }
  if (!estadosValidos.has(estado)) return { error: 'Selecciona un estado válido.' }
  if (!criticidadesValidas.has(criticidad)) return { error: 'Selecciona una criticidad válida.' }

  const supabase = await createServerSupabaseClient()
  const { data: activo, error: activoError } = await supabase
    .from('activos')
    .select('id,clase,foto_url')
    .eq('id', id)
    .single()

  if (activoError) return { error: activoError.message }

  const { data: zona, error: zonaError } = zonaId
    ? await supabase
        .from('mapa_zonas')
        .select('id,nivel_id,area,nombre,x,y')
        .eq('id', zonaId)
        .single()
    : { data: null, error: null }

  if (zonaError) return { error: zonaError.message }

  let fotoUrl: string | null = null
  try {
    fotoUrl = await uploadOptionalFile(supabase, formData.get('foto'), 'activos')
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'No se pudo subir la foto.' }
  }

  const resolvedArea = zona ? (zona.area ?? zona.nombre ?? null) : null
  const payload = {
    nombre,
    tipo,
    estado,
    criticidad,
    zona_id: zonaId,
    nivel_id: zona?.nivel_id ?? null,
    x: zona?.x ?? null,
    y: zona?.y ?? null,
    area: resolvedArea,
    proveedor_id: proveedorId,
    notas,
    fecha_ultima_revision: fechaUltimaRevision,
    fecha_proxima_revision: fechaProximaRevision,
    ...(fotoUrl ? { foto_url: fotoUrl } : {})
  }

  const { error } = await supabase.from('activos').update(payload).eq('id', id)
  if (error) {
    await removeStorageFiles(supabase, [fotoUrl])
    return { error: error.message }
  }

  if (activo.clase === 'equipo') {
    await supabase
      .from('equipos')
      .update({
        nombre,
        area: resolvedArea,
        estado,
        proveedor_id: proveedorId,
        fecha_ultimo_mantenimiento: fechaUltimaRevision,
        fecha_proximo_mantenimiento: fechaProximaRevision,
        notas,
        ...(fotoUrl ? { foto_url: fotoUrl } : {})
      })
      .eq('id', id)
  } else if (activo.clase === 'infraestructura') {
    await supabase
      .from('infraestructura')
      .update({
        nombre,
        tipo,
        area: resolvedArea,
        nivel_id: zona?.nivel_id ?? null,
        x: zona?.x ?? null,
        y: zona?.y ?? null,
        estado,
        criticidad,
        proveedor_id: proveedorId,
        fecha_ultima_revision: fechaUltimaRevision,
        fecha_proxima_revision: fechaProximaRevision,
        notas,
        ...(fotoUrl ? { foto_url: fotoUrl } : {})
      })
      .eq('id', id)
  }

  if (fotoUrl) await removeStorageFiles(supabase, [activo.foto_url])

  revalidatePath('/')
  revalidatePath('/mapa')
  revalidatePath('/activos')
  revalidatePath(`/activos/${id}`)
  if (activo.clase === 'equipo') {
    revalidatePath('/equipos')
    revalidatePath(`/equipos/${id}`)
  }
  if (activo.clase === 'infraestructura') {
    revalidatePath('/infraestructura')
    revalidatePath(`/infraestructura/${id}`)
  }

  redirect(`/activos/${id}?flash=activo_actualizado`)
}
