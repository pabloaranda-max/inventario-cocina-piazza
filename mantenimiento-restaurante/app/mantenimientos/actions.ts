'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { emptyToNull } from '@/lib/utils'
import type { TipoMantenimiento } from '@/lib/types'

export async function crearMantenimiento(formData: FormData) {
  const equipoId = String(formData.get('equipo_id') ?? '').trim()
  const descripcion = String(formData.get('descripcion') ?? '').trim()
  if (!equipoId || !descripcion) throw new Error('Equipo y descripcion son obligatorios.')

  const fechaRealizacion =
    emptyToNull(formData.get('fecha_realizacion')) ?? new Date().toISOString().slice(0, 10)
  const proximaFecha = emptyToNull(formData.get('proxima_fecha_sugerida'))
  const costoValue = emptyToNull(formData.get('costo'))

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.from('mantenimientos').insert({
    tipo: String(formData.get('tipo') ?? 'preventivo') as TipoMantenimiento,
    equipo_id: equipoId,
    descripcion,
    realizado_por: emptyToNull(formData.get('realizado_por')),
    costo: costoValue ? Number(costoValue) : null,
    repuestos_notas: emptyToNull(formData.get('repuestos_notas')),
    fecha_realizacion: fechaRealizacion,
    proxima_fecha_sugerida: proximaFecha
  })

  if (error) throw new Error(error.message)

  const { error: equipoError } = await supabase
    .from('equipos')
    .update({
      fecha_ultimo_mantenimiento: fechaRealizacion,
      fecha_proximo_mantenimiento: proximaFecha
    })
    .eq('id', equipoId)

  if (equipoError) throw new Error(equipoError.message)

  revalidatePath('/')
  revalidatePath('/mantenimientos')
  revalidatePath(`/equipos/${equipoId}`)
  redirect('/mantenimientos')
}
