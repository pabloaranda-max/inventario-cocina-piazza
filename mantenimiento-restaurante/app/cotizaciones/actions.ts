'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { uploadOptionalFile, removeStorageFiles } from '@/lib/storage'
import { emptyToNull, todayMX } from '@/lib/utils'
import type { FormState } from '@/lib/form-state'
import type { EstadoCotizacion } from '@/lib/types'

const estadosValidos: EstadoCotizacion[] = ['pendiente_revision', 'aprobada', 'rechazada']

type CotizacionPayload = {
  activo_id: string | null
  proveedor_id: string | null
  incidencia_id: string | null
  mantenimiento_id: string | null
  monto: number | null
  estado: EstadoCotizacion
  fecha_emision: string
  fecha_vencimiento: string | null
  notas: string | null
}

function isPayload(p: CotizacionPayload | FormState): p is CotizacionPayload {
  return 'estado' in p && estadosValidos.includes((p as CotizacionPayload).estado)
}

function getPayload(formData: FormData): CotizacionPayload | FormState {
  const estado = String(formData.get('estado') ?? 'pendiente_revision') as EstadoCotizacion
  if (!estadosValidos.includes(estado)) return { error: 'Estado no válido.' }

  const montoRaw = emptyToNull(formData.get('monto'))
  const monto = montoRaw ? Number(montoRaw) : null
  if (monto !== null && Number.isNaN(monto)) return { error: 'El monto debe ser numérico.' }

  const fechaEmision = emptyToNull(formData.get('fecha_emision')) ?? todayMX()

  return {
    activo_id: emptyToNull(formData.get('activo_id')),
    proveedor_id: emptyToNull(formData.get('proveedor_id')),
    incidencia_id: emptyToNull(formData.get('incidencia_id')),
    mantenimiento_id: emptyToNull(formData.get('mantenimiento_id')),
    monto,
    estado,
    fecha_emision: fechaEmision,
    fecha_vencimiento: emptyToNull(formData.get('fecha_vencimiento')),
    notas: emptyToNull(formData.get('notas')),
  }
}

export async function cambiarEstadoCotizacion(id: string, estado: EstadoCotizacion) {
  if (!estadosValidos.includes(estado)) return
  const supabase = await createServerSupabaseClient()
  await supabase.from('cotizaciones').update({ estado }).eq('id', id)
  revalidatePath('/cotizaciones')
  revalidatePath(`/cotizaciones/${id}`)
}

export async function crearCotizacion(_state: FormState, formData: FormData): Promise<FormState> {
  const payload = getPayload(formData)
  if (!isPayload(payload)) return payload

  const supabase = await createServerSupabaseClient()

  let archivoUrl: string | null = null
  try {
    archivoUrl = await uploadOptionalFile(supabase, formData.get('archivo'), 'cotizaciones')
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'No se pudo subir el archivo.' }
  }

  const { data, error } = await supabase
    .from('cotizaciones')
    .insert({ ...payload, archivo_url: archivoUrl })
    .select('id')
    .single()

  if (error) {
    await removeStorageFiles(supabase, [archivoUrl])
    return { error: error.message }
  }

  revalidatePath('/cotizaciones')
  if (payload.activo_id) revalidatePath(`/activos/${payload.activo_id}`)
  if (payload.incidencia_id) revalidatePath(`/incidencias/${payload.incidencia_id}`)
  if (payload.mantenimiento_id) revalidatePath(`/mantenimientos/${payload.mantenimiento_id}`)
  if (payload.proveedor_id) revalidatePath(`/proveedores/${payload.proveedor_id}`)
  redirect(`/cotizaciones/${data.id}?flash=cotizacion_creada`)
}

export async function actualizarCotizacion(
  id: string,
  _state: FormState,
  formData: FormData
): Promise<FormState> {
  const payload = getPayload(formData)
  if (!isPayload(payload)) return payload

  const supabase = await createServerSupabaseClient()

  const { data: current, error: currentError } = await supabase
    .from('cotizaciones')
    .select('archivo_url, activo_id, incidencia_id, mantenimiento_id, proveedor_id')
    .eq('id', id)
    .single()

  if (currentError) return { error: currentError.message }

  let archivoUrl = current.archivo_url as string | null
  const reemplazarArchivo = formData.get('reemplazar_archivo') === 'on'

  if (reemplazarArchivo) {
    try {
      const nuevo = await uploadOptionalFile(supabase, formData.get('archivo'), 'cotizaciones')
      if (nuevo) {
        await removeStorageFiles(supabase, [archivoUrl])
        archivoUrl = nuevo
      }
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'No se pudo subir el archivo.' }
    }
  }

  const { error } = await supabase
    .from('cotizaciones')
    .update({ ...payload, archivo_url: archivoUrl })
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/cotizaciones')
  revalidatePath(`/cotizaciones/${id}`)
  if (current.activo_id) revalidatePath(`/activos/${current.activo_id}`)
  if (payload.activo_id) revalidatePath(`/activos/${payload.activo_id}`)
  if (current.incidencia_id) revalidatePath(`/incidencias/${current.incidencia_id}`)
  if (payload.incidencia_id) revalidatePath(`/incidencias/${payload.incidencia_id}`)
  if (current.mantenimiento_id) revalidatePath(`/mantenimientos/${current.mantenimiento_id}`)
  if (payload.mantenimiento_id) revalidatePath(`/mantenimientos/${payload.mantenimiento_id}`)
  if (current.proveedor_id) revalidatePath(`/proveedores/${current.proveedor_id}`)
  if (payload.proveedor_id) revalidatePath(`/proveedores/${payload.proveedor_id}`)
  redirect(`/cotizaciones/${id}?flash=cotizacion_actualizada`)
}

export async function eliminarCotizacion(id: string) {
  const supabase = await createServerSupabaseClient()

  const { data, error: fetchError } = await supabase
    .from('cotizaciones')
    .select('archivo_url, activo_id, incidencia_id, mantenimiento_id, proveedor_id')
    .eq('id', id)
    .single()

  if (fetchError) redirect(`/cotizaciones/${id}?flash=cotizacion_error`)

  const { error } = await supabase.from('cotizaciones').delete().eq('id', id)
  if (error) redirect(`/cotizaciones/${id}?flash=cotizacion_error`)

  await removeStorageFiles(supabase, [data?.archivo_url as string | null])

  revalidatePath('/cotizaciones')
  if (data?.activo_id) revalidatePath(`/activos/${data.activo_id}`)
  if (data?.incidencia_id) revalidatePath(`/incidencias/${data.incidencia_id}`)
  if (data?.mantenimiento_id) revalidatePath(`/mantenimientos/${data.mantenimiento_id}`)
  if (data?.proveedor_id) revalidatePath(`/proveedores/${data.proveedor_id}`)
  redirect('/cotizaciones?flash=cotizacion_eliminada')
}
