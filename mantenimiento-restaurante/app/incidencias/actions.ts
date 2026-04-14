'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { uploadOptionalFile } from '@/lib/storage'
import { emptyToNull } from '@/lib/utils'
import type { FormState } from '@/lib/form-state'
import type { EstadoIncidencia, PrioridadIncidencia } from '@/lib/types'

export async function crearIncidencia(_state: FormState, formData: FormData): Promise<FormState> {
  const descripcion = String(formData.get('descripcion') ?? '').trim()
  if (!descripcion) return { error: 'La descripción es obligatoria.' }

  const supabase = await createServerSupabaseClient()
  const fotoUrl = await uploadOptionalFile(supabase, formData.get('foto'), 'incidencias')

  const { error } = await supabase.from('incidencias').insert({
    equipo_id: emptyToNull(formData.get('equipo_id')),
    descripcion,
    prioridad: String(formData.get('prioridad') ?? 'media') as PrioridadIncidencia,
    foto_url: fotoUrl,
    reportado_por: emptyToNull(formData.get('reportado_por')),
    fecha_reporte: emptyToNull(formData.get('fecha_reporte')) ?? new Date().toISOString().slice(0, 10),
    estado: 'abierta'
  })

  if (error) return { error: error.message }

  revalidatePath('/')
  revalidatePath('/incidencias')
  redirect('/incidencias?flash=incidencia_creada')
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
