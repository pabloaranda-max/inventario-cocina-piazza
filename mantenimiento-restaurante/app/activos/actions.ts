'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { emptyToNull } from '@/lib/utils'
import type { FormState } from '@/lib/form-state'

function parsePercent(value: FormDataEntryValue | null) {
  const raw = emptyToNull(value)
  if (raw === null) return null
  const parsed = Number(raw)
  if (Number.isNaN(parsed)) return Number.NaN
  return Number(Math.min(100, Math.max(0, parsed)).toFixed(3))
}

export async function actualizarUbicacionActivo(
  id: string,
  _state: FormState,
  formData: FormData
): Promise<FormState> {
  const nivelId = emptyToNull(formData.get('nivel_id'))
  const zonaId = emptyToNull(formData.get('zona_id'))
  const clearLocation = formData.get('quitar_ubicacion') === 'on'
  const x = parsePercent(formData.get('x'))
  const y = parsePercent(formData.get('y'))

  if (!clearLocation && !nivelId) return { error: 'Selecciona el nivel del plano.' }
  if (!clearLocation && (x === null || y === null)) return { error: 'Haz clic en el plano para colocar el activo.' }
  if (Number.isNaN(x) || Number.isNaN(y)) return { error: 'La ubicación debe estar entre 0 y 100.' }

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
  if (zona && nivelId && zona.nivel_id !== nivelId) {
    return { error: 'La zona seleccionada no corresponde al nivel activo.' }
  }

  const area = zona?.area ?? zona?.nombre ?? null
  const locationPayload = clearLocation
    ? { nivel_id: null, x: null, y: null, zona_id: null }
    : { nivel_id: nivelId, x, y, zona_id: zonaId }
  const areaPayload = area ? { area } : {}

  const { error } = await supabase
    .from('activos')
    .update({
      ...locationPayload,
      ...areaPayload
    })
    .eq('id', id)

  if (error) return { error: error.message }

  if (activo.clase === 'infraestructura') {
    await supabase
      .from('infraestructura')
      .update({
        ...locationPayload,
        ...areaPayload
      })
      .eq('id', id)
  } else if (activo.clase === 'equipo' && area) {
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
