'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { removeStorageFiles, uploadOptionalFile } from '@/lib/storage'
import { emptyToNull } from '@/lib/utils'
import type { FormState } from '@/lib/form-state'
import type { EstadoIncidencia, PrioridadIncidencia } from '@/lib/types'

function getIncidenciaPayload(formData: FormData) {
  const descripcion = String(formData.get('descripcion') ?? '').trim()
  if (!descripcion) return { error: 'La descripción es obligatoria.' }

  return {
    equipo_id: emptyToNull(formData.get('equipo_id')),
    descripcion,
    prioridad: String(formData.get('prioridad') ?? 'media') as PrioridadIncidencia,
    reportado_por: emptyToNull(formData.get('reportado_por')),
    fecha_reporte: emptyToNull(formData.get('fecha_reporte')) ?? new Date().toISOString().slice(0, 10),
    estado: String(formData.get('estado') ?? 'abierta') as EstadoIncidencia
  }
}

export async function crearIncidencia(_state: FormState, formData: FormData): Promise<FormState> {
  const payload = getIncidenciaPayload(formData)
  if ('error' in payload) return payload

  const supabase = await createServerSupabaseClient()
  const fotoUrl = await uploadOptionalFile(supabase, formData.get('foto'), 'incidencias')

  const { error } = await supabase.from('incidencias').insert({
    ...payload,
    foto_url: fotoUrl,
    estado: 'abierta'
  })

  if (error) return { error: error.message }

  revalidatePath('/')
  revalidatePath('/incidencias')
  redirect('/incidencias?flash=incidencia_creada')
}

export async function actualizarIncidencia(
  id: string,
  _state: FormState,
  formData: FormData
): Promise<FormState> {
  const payload = getIncidenciaPayload(formData)
  if ('error' in payload) return payload

  const supabase = await createServerSupabaseClient()
  const { data: currentIncidencia, error: currentError } = await supabase
    .from('incidencias')
    .select('foto_url')
    .eq('id', id)
    .single()

  if (currentError) return { error: currentError.message }

  let fotoUrl: string | null = null
  try {
    fotoUrl = await uploadOptionalFile(supabase, formData.get('foto'), 'incidencias')
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'No se pudo subir la foto.' }
  }

  const updatePayload = fotoUrl ? { ...payload, foto_url: fotoUrl } : payload
  const { error } = await supabase.from('incidencias').update(updatePayload).eq('id', id)

  if (error) {
    await removeStorageFiles(supabase, [fotoUrl])
    return { error: error.message }
  }

  if (fotoUrl) await removeStorageFiles(supabase, [currentIncidencia?.foto_url])

  revalidatePath('/')
  revalidatePath('/incidencias')
  revalidatePath(`/incidencias/${id}`)
  redirect(`/incidencias/${id}?flash=incidencia_actualizada`)
}

export async function cambiarEstadoIncidencia(id: string, formData: FormData) {
  const estado = String(formData.get('estado') ?? 'abierta') as EstadoIncidencia
  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.from('incidencias').update({ estado }).eq('id', id)

  if (error) redirect('/incidencias?flash=incidencia_error')

  revalidatePath('/')
  revalidatePath('/incidencias')
  redirect('/incidencias?flash=incidencia_actualizada')
}
