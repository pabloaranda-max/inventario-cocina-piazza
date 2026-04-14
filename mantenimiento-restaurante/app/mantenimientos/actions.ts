'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { removeStorageFiles, uploadOptionalFiles } from '@/lib/storage'
import { emptyToNull } from '@/lib/utils'
import type { FormState } from '@/lib/form-state'
import type { TipoMantenimiento } from '@/lib/types'

export async function crearMantenimiento(_state: FormState, formData: FormData): Promise<FormState> {
  const equipoId = String(formData.get('equipo_id') ?? '').trim()
  const descripcion = String(formData.get('descripcion') ?? '').trim()
  if (!equipoId || !descripcion) return { error: 'Equipo y descripción son obligatorios.' }

  const fechaRealizacion =
    emptyToNull(formData.get('fecha_realizacion')) ?? new Date().toISOString().slice(0, 10)
  const proximaFecha = emptyToNull(formData.get('proxima_fecha_sugerida'))
  const incidenciaId = emptyToNull(formData.get('incidencia_id'))
  const costoValue = emptyToNull(formData.get('costo'))
  const fotosUrls: string[] = []

  const supabase = await createServerSupabaseClient()

  try {
    fotosUrls.push(...(await uploadOptionalFiles(supabase, formData.getAll('fotos'), 'mantenimientos')))
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'No se pudieron subir las fotos.' }
  }

  const { error } = await supabase.rpc('registrar_mantenimiento', {
    p_tipo: String(formData.get('tipo') ?? 'preventivo') as TipoMantenimiento,
    p_equipo_id: equipoId,
    p_descripcion: descripcion,
    p_realizado_por: emptyToNull(formData.get('realizado_por')),
    p_costo: costoValue ? Number(costoValue) : null,
    p_repuestos_notas: emptyToNull(formData.get('repuestos_notas')),
    p_fotos_urls: fotosUrls,
    p_fecha_realizacion: fechaRealizacion,
    p_proxima_fecha_sugerida: proximaFecha,
    p_marcar_operativo: formData.get('marcar_operativo') === 'on',
    p_incidencia_id: incidenciaId
  })

  if (error) {
    await removeStorageFiles(supabase, fotosUrls)
    return { error: error.message }
  }

  revalidatePath('/')
  revalidatePath('/mantenimientos')
  revalidatePath(`/equipos/${equipoId}`)
  if (incidenciaId) revalidatePath(`/incidencias/${incidenciaId}`)
  redirect('/mantenimientos?flash=mantenimiento_creado')
}
