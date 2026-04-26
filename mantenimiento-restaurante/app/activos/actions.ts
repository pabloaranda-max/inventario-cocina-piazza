'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { emptyToNull } from '@/lib/utils'
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
        .select('id,nivel_id,area,nombre')
        .eq('id', zonaId)
        .single()
    : { data: null, error: null }

  if (zonaError) return { error: zonaError.message }

  const area = clearLocation ? null : zona?.area ?? zona?.nombre ?? null
  const locationPayload = clearLocation
    ? { nivel_id: null, x: null, y: null, zona_id: null }
    : { nivel_id: zona?.nivel_id ?? null, x: null, y: null, zona_id: zonaId }
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
  const zonaId = emptyToNull(formData.get('zona_id'))
  const notas = emptyToNull(formData.get('notas'))

  if (!nombre) return { error: 'El nombre es obligatorio.' }
  if (!tipo) return { error: 'El tipo es obligatorio.' }
  if (!estadosValidos.has(estado)) return { error: 'Selecciona un estado válido.' }

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
        .select('id,nivel_id,area,nombre')
        .eq('id', zonaId)
        .single()
    : { data: null, error: null }

  if (zonaError) return { error: zonaError.message }

  const resolvedArea = zona ? (zona.area ?? zona.nombre ?? null) : null
  const payload = {
    nombre,
    tipo,
    estado,
    zona_id: zonaId,
    nivel_id: zona?.nivel_id ?? null,
    x: null,
    y: null,
    area: resolvedArea,
    notas
  }

  const { error } = await supabase.from('activos').update(payload).eq('id', id)
  if (error) return { error: error.message }

  if (activo.clase === 'equipo') {
    await supabase
      .from('equipos')
      .update({ nombre, area: resolvedArea, estado, notas })
      .eq('id', id)
  } else if (activo.clase === 'infraestructura') {
    await supabase
      .from('infraestructura')
      .update({ nombre, tipo, area: resolvedArea, nivel_id: zona?.nivel_id ?? null, x: null, y: null, estado, notas })
      .eq('id', id)
  }

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
