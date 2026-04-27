'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { removeStorageFiles, uploadOptionalFiles } from '@/lib/storage'
import { addDaysToDateInput, emptyToNull, todayMX } from '@/lib/utils'
import type { FormState } from '@/lib/form-state'
import type { EjecucionMantenimiento, TipoMantenimiento } from '@/lib/types'

type MantenimientoPayload = {
  tipo: TipoMantenimiento
  estado_ejecucion: 'planeado' | 'aplicado'
  activo_id: string | null
  incidencia_id: string | null
  zona_id: string | null
  descripcion: string
  realizado_por: string | null
  ejecucion_tipo: EjecucionMantenimiento
  requiere_material: boolean
  proveedor_id: string | null
  costo: number | null
  costo_estimado: number | null
  repuestos_notas: string | null
  fecha_realizacion: string
  proxima_fecha_sugerida: string | null
  marcar_operativo: boolean
}

const tiposMantenimiento: TipoMantenimiento[] = ['preventivo', 'correctivo', 'limpieza_profunda']
const tiposEjecucion: EjecucionMantenimiento[] = ['interno', 'externo']

function getZonaNombre(activo: { zona?: { nombre?: string | null } | { nombre?: string | null }[] | null } | null) {
  const zona = Array.isArray(activo?.zona) ? activo.zona[0] : activo?.zona
  return zona?.nombre ?? null
}

function getPayload(formData: FormData): MantenimientoPayload | FormState {
  const activoId = String(formData.get('activo_id') ?? '').trim()
  const descripcion = String(formData.get('descripcion') ?? '').trim()
  const tipo = String(formData.get('tipo') ?? 'preventivo') as TipoMantenimiento
  const ejecucionTipo = String(formData.get('ejecucion_tipo') ?? 'interno') as EjecucionMantenimiento
  const estadoEjecucionRaw = String(formData.get('estado_ejecucion') ?? 'aplicado')
  const estadoEjecucion: 'planeado' | 'aplicado' = estadoEjecucionRaw === 'planeado' ? 'planeado' : 'aplicado'

  if (!descripcion) return { error: 'La descripción es obligatoria.' }
  if (!tiposMantenimiento.includes(tipo)) return { error: 'Tipo de mantenimiento no válido.' }
  if (!tiposEjecucion.includes(ejecucionTipo)) return { error: 'Tipo de ejecución no válido.' }
  if (tipo !== 'limpieza_profunda' && !activoId) {
    return { error: 'Selecciona un activo para mantenimientos preventivos o correctivos.' }
  }

  const proveedorId = ejecucionTipo === 'externo' ? emptyToNull(formData.get('proveedor_id')) : null
  if (ejecucionTipo === 'externo' && !proveedorId) return { error: 'Selecciona un proveedor para trabajo externo.' }

  const requiereMaterial = ejecucionTipo === 'externo' || formData.get('requiere_material') === 'on'
  const costoValue = emptyToNull(formData.get('costo'))
  const costo = requiereMaterial && costoValue ? Number(costoValue) : null
  if (Number.isNaN(costo)) return { error: 'El costo debe ser numérico.' }

  const costoEstimadoValue = emptyToNull(formData.get('costo_estimado'))
  const costoEstimado = costoEstimadoValue ? Number(costoEstimadoValue) : null
  if (Number.isNaN(costoEstimado)) return { error: 'El costo estimado debe ser numérico.' }

  return {
    tipo,
    estado_ejecucion: estadoEjecucion,
    activo_id: activoId || null,
    incidencia_id: emptyToNull(formData.get('incidencia_id')),
    zona_id: emptyToNull(formData.get('zona_id')),
    descripcion,
    realizado_por: emptyToNull(formData.get('realizado_por')),
    ejecucion_tipo: ejecucionTipo,
    requiere_material: requiereMaterial,
    proveedor_id: proveedorId,
    costo,
    costo_estimado: costoEstimado,
    repuestos_notas: emptyToNull(formData.get('repuestos_notas')),
    fecha_realizacion: emptyToNull(formData.get('fecha_realizacion')) ?? todayMX(),
    proxima_fecha_sugerida: emptyToNull(formData.get('proxima_fecha_sugerida')),
    marcar_operativo: formData.get('marcar_operativo') === 'on'
  }
}

async function getActivoContext(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  activoId: string | null
) {
  if (!activoId) {
    return {
      activo: null,
      equipoId: null,
      infraestructuraId: null,
      zonaId: null,
      zonaNombre: null
    }
  }

  const { data: activo, error } = await supabase
    .from('activos')
    .select('id,clase,zona_id,zona:mapa_zonas(nombre)')
    .eq('id', activoId)
    .single()

  if (error) return { error: error.message }

  return {
    activo,
    equipoId: activo.clase === 'equipo' ? activo.id : null,
    infraestructuraId: activo.clase === 'infraestructura' ? activo.id : null,
    zonaId: activo.zona_id ?? null,
    zonaNombre: getZonaNombre(activo)
  }
}

async function getZonaNombreById(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  zonaId: string | null
) {
  if (!zonaId) return null

  const { data, error } = await supabase
    .from('mapa_zonas')
    .select('nombre')
    .eq('id', zonaId)
    .single()

  if (error) return { error: error.message }
  return data.nombre as string | null
}

async function validateIncidenciaDestino(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  payload: MantenimientoPayload,
  equipoId: string | null,
  infraestructuraId: string | null
) {
  if (!payload.incidencia_id) return null

  const { data: incidencia, error } = await supabase
    .from('incidencias')
    .select('activo_id,equipo_id,infraestructura_id,zona_id')
    .eq('id', payload.incidencia_id)
    .single()

  if (error) return error.message

  const matchesActivo = payload.activo_id && incidencia.activo_id === payload.activo_id
  const matchesEquipo = equipoId && incidencia.equipo_id === equipoId
  const matchesInfraestructura = infraestructuraId && incidencia.infraestructura_id === infraestructuraId
  const isUnassigned = !incidencia.activo_id && !incidencia.equipo_id && !incidencia.infraestructura_id
  const matchesZona = !incidencia.zona_id || !payload.zona_id || incidencia.zona_id === payload.zona_id

  if (!matchesActivo && !matchesEquipo && !matchesInfraestructura && (!isUnassigned || !matchesZona)) {
    return 'La incidencia no corresponde al destino seleccionado.'
  }

  return null
}

export async function crearMantenimiento(_state: FormState, formData: FormData): Promise<FormState> {
  const payload = getPayload(formData)
  if (!('descripcion' in payload)) return payload

  const supabase = await createServerSupabaseClient()
  const activoContext = await getActivoContext(supabase, payload.activo_id)
  if ('error' in activoContext) return { error: activoContext.error }

  const { equipoId, infraestructuraId } = activoContext
  const zonaId = activoContext.zonaId ?? payload.zona_id
  const zonaNombreResult = activoContext.zonaNombre ?? (await getZonaNombreById(supabase, zonaId))
  if (zonaNombreResult && typeof zonaNombreResult === 'object' && 'error' in zonaNombreResult) {
    return { error: zonaNombreResult.error }
  }
  const zonaNombre = typeof zonaNombreResult === 'string' ? zonaNombreResult : null

  const incidenciaError = await validateIncidenciaDestino(supabase, payload, equipoId, infraestructuraId)
  if (incidenciaError) return { error: incidenciaError }

  if (payload.estado_ejecucion === 'planeado') {
    const { data, error } = await supabase
      .from('mantenimientos')
      .insert({
        tipo: payload.tipo,
        estado_ejecucion: 'planeado',
        activo_id: payload.activo_id,
        equipo_id: equipoId,
        infraestructura_id: infraestructuraId,
        incidencia_id: payload.incidencia_id,
        zona_id: zonaId,
        zona_nombre: zonaNombre,
        descripcion: payload.descripcion,
        ejecucion_tipo: payload.ejecucion_tipo,
        requiere_material: payload.requiere_material,
        proveedor_id: payload.proveedor_id,
        costo_estimado: payload.costo_estimado,
        repuestos_notas: payload.repuestos_notas,
        fotos_urls: [],
        fecha_realizacion: payload.fecha_realizacion,
      })
      .select('id')
      .single()

    if (error) return { error: error.message }

    revalidatePath('/')
    revalidatePath('/mantenimientos')
    redirect(`/mantenimientos/${data.id}?flash=mantenimiento_creado`)
  }

  const fotosUrls: string[] = []
  try {
    fotosUrls.push(...(await uploadOptionalFiles(supabase, formData.getAll('fotos'), 'mantenimientos')))
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'No se pudieron subir las fotos.' }
  }

  const { data, error } = await supabase.rpc('registrar_mantenimiento', {
    p_tipo: payload.tipo,
    p_descripcion: payload.descripcion,
    p_equipo_id: equipoId,
    p_infraestructura_id: infraestructuraId,
    p_realizado_por: payload.realizado_por,
    p_costo: payload.costo,
    p_repuestos_notas: payload.repuestos_notas,
    p_fotos_urls: fotosUrls,
    p_fecha_realizacion: payload.fecha_realizacion,
    p_proxima_fecha_sugerida: payload.proxima_fecha_sugerida,
    p_marcar_operativo: payload.marcar_operativo,
    p_incidencia_id: payload.incidencia_id,
    p_activo_id: payload.activo_id,
    p_ejecucion_tipo: payload.ejecucion_tipo,
    p_requiere_material: payload.requiere_material,
    p_proveedor_id: payload.proveedor_id
  })

  if (error) {
    await removeStorageFiles(supabase, fotosUrls)
    return { error: error.message }
  }

  if (data) {
    await supabase
      .from('mantenimientos')
      .update({
        zona_id: zonaId,
        zona_nombre: zonaNombre,
        ejecucion_tipo: payload.ejecucion_tipo,
        requiere_material: payload.requiere_material,
        proveedor_id: payload.proveedor_id,
        costo: payload.costo
      })
      .eq('id', data)
  }

  revalidatePath('/')
  revalidatePath('/mantenimientos')
  if (equipoId) revalidatePath(`/equipos/${equipoId}`)
  if (infraestructuraId) revalidatePath(`/infraestructura/${infraestructuraId}`)
  if (payload.incidencia_id) revalidatePath(`/incidencias/${payload.incidencia_id}`)
  if (data) redirect(`/mantenimientos/${data}?flash=mantenimiento_creado`)
  redirect('/mantenimientos?flash=mantenimiento_creado')
}

export async function actualizarMantenimiento(
  id: string,
  _state: FormState,
  formData: FormData
): Promise<FormState> {
  const payload = getPayload(formData)
  if (!('descripcion' in payload)) return payload

  const supabase = await createServerSupabaseClient()
  const activoContext = await getActivoContext(supabase, payload.activo_id)
  if ('error' in activoContext) return { error: activoContext.error }

  const { equipoId, infraestructuraId } = activoContext
  const zonaId = activoContext.zonaId ?? payload.zona_id
  const zonaNombreResult = activoContext.zonaNombre ?? (await getZonaNombreById(supabase, zonaId))
  if (zonaNombreResult && typeof zonaNombreResult === 'object' && 'error' in zonaNombreResult) {
    return { error: zonaNombreResult.error }
  }
  const zonaNombre = typeof zonaNombreResult === 'string' ? zonaNombreResult : null

  const incidenciaError = await validateIncidenciaDestino(supabase, payload, equipoId, infraestructuraId)
  if (incidenciaError) return { error: incidenciaError }

  const { data: current, error: currentError } = await supabase
    .from('mantenimientos')
    .select('fotos_urls,equipo_id,infraestructura_id,incidencia_id')
    .eq('id', id)
    .single()

  if (currentError) return { error: currentError.message }

  const newFotosUrls: string[] = []
  try {
    newFotosUrls.push(...(await uploadOptionalFiles(supabase, formData.getAll('fotos'), 'mantenimientos')))
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'No se pudieron subir las fotos.' }
  }

  const fotosUrls = [...((current?.fotos_urls as string[] | null) ?? []), ...newFotosUrls]
  const { error } = await supabase
    .from('mantenimientos')
    .update({
      tipo: payload.tipo,
      activo_id: payload.activo_id,
      equipo_id: equipoId,
      infraestructura_id: infraestructuraId,
      incidencia_id: payload.incidencia_id,
      zona_id: zonaId,
      zona_nombre: zonaNombre,
      descripcion: payload.descripcion,
      realizado_por: payload.realizado_por,
      ejecucion_tipo: payload.ejecucion_tipo,
      requiere_material: payload.requiere_material,
      proveedor_id: payload.proveedor_id,
      costo: payload.costo,
      repuestos_notas: payload.repuestos_notas,
      fotos_urls: fotosUrls,
      fecha_realizacion: payload.fecha_realizacion,
      proxima_fecha_sugerida: payload.proxima_fecha_sugerida
    })
    .eq('id', id)

  if (error) {
    await removeStorageFiles(supabase, newFotosUrls)
    return { error: error.message }
  }

  if (payload.incidencia_id) {
    await supabase.from('incidencias').update({ estado: 'en_progreso' }).eq('id', payload.incidencia_id)
  }

  if (payload.tipo === 'limpieza_profunda') {
    if (payload.activo_id) {
      const { data: limpiezaActivo, error: limpiezaActivoError } = await supabase
        .from('activos')
        .select('limpieza_intervalo_dias')
        .eq('id', payload.activo_id)
        .single()

      if (limpiezaActivoError) return { error: limpiezaActivoError.message }

      const intervalo = limpiezaActivo.limpieza_intervalo_dias as number | null
      await supabase
        .from('activos')
        .update({
          fecha_ultima_limpieza: payload.fecha_realizacion,
          fecha_proxima_limpieza: intervalo ? addDaysToDateInput(payload.fecha_realizacion, intervalo) : null
        })
        .eq('id', payload.activo_id)
    }
  } else {
    if (equipoId) {
      await supabase
        .from('equipos')
        .update({
          fecha_ultimo_mantenimiento: payload.fecha_realizacion,
          fecha_proximo_mantenimiento: payload.proxima_fecha_sugerida,
          ...(payload.marcar_operativo ? { estado: 'operativo' } : {})
        })
        .eq('id', equipoId)
    }

    if (infraestructuraId) {
      await supabase
        .from('infraestructura')
        .update({
          fecha_ultima_revision: payload.fecha_realizacion,
          fecha_proxima_revision: payload.proxima_fecha_sugerida,
          ...(payload.marcar_operativo ? { estado: 'operativo' } : {})
        })
        .eq('id', infraestructuraId)
    }

    await supabase
      .from('activos')
      .update({
        fecha_ultima_revision: payload.fecha_realizacion,
        fecha_proxima_revision: payload.proxima_fecha_sugerida,
        ...(payload.marcar_operativo ? { estado: 'operativo' } : {})
      })
      .eq('id', payload.activo_id as string)
  }

  revalidatePath('/')
  revalidatePath('/mantenimientos')
  revalidatePath(`/mantenimientos/${id}`)
  if (current?.equipo_id) revalidatePath(`/equipos/${current.equipo_id}`)
  if (current?.infraestructura_id) revalidatePath(`/infraestructura/${current.infraestructura_id}`)
  if (current?.incidencia_id) revalidatePath(`/incidencias/${current.incidencia_id}`)
  if (equipoId) revalidatePath(`/equipos/${equipoId}`)
  if (infraestructuraId) revalidatePath(`/infraestructura/${infraestructuraId}`)
  if (payload.incidencia_id) revalidatePath(`/incidencias/${payload.incidencia_id}`)
  redirect(`/mantenimientos/${id}?flash=mantenimiento_actualizado`)
}

export async function aplicarMantenimiento(
  id: string,
  _state: FormState,
  formData: FormData
): Promise<FormState> {
  const supabase = await createServerSupabaseClient()

  const { data: current, error: currentError } = await supabase
    .from('mantenimientos')
    .select('activo_id,equipo_id,infraestructura_id,incidencia_id,tipo,ejecucion_tipo,requiere_material,proveedor_id')
    .eq('id', id)
    .single()

  if (currentError) return { error: currentError.message }
  if (!current) return { error: 'Mantenimiento no encontrado.' }

  const fechaRealizacion = String(formData.get('fecha_realizacion') ?? todayMX())
  const costoValue = emptyToNull(formData.get('costo'))
  const costo = costoValue ? Number(costoValue) : null
  const marcarOperativo = formData.get('marcar_operativo') === 'on'
  const proximaFechaSugerida = emptyToNull(formData.get('proxima_fecha_sugerida'))

  const { error } = await supabase
    .from('mantenimientos')
    .update({
      estado_ejecucion: 'aplicado',
      fecha_realizacion: fechaRealizacion,
      proxima_fecha_sugerida: proximaFechaSugerida,
      costo,
    })
    .eq('id', id)

  if (error) return { error: error.message }

  if (current.tipo === 'limpieza_profunda') {
    if (current.activo_id) {
      const { data: limpiezaActivo } = await supabase
        .from('activos')
        .select('limpieza_intervalo_dias')
        .eq('id', current.activo_id)
        .single()

      const intervalo = limpiezaActivo?.limpieza_intervalo_dias as number | null
      await supabase
        .from('activos')
        .update({
          fecha_ultima_limpieza: fechaRealizacion,
          fecha_proxima_limpieza: intervalo ? addDaysToDateInput(fechaRealizacion, intervalo) : null
        })
        .eq('id', current.activo_id)
    }
  } else {
    if (current.activo_id) {
      await supabase
        .from('activos')
        .update({
          fecha_ultima_revision: fechaRealizacion,
          fecha_proxima_revision: proximaFechaSugerida,
          ...(marcarOperativo ? { estado: 'operativo' } : {})
        })
        .eq('id', current.activo_id)
    }
    if (current.equipo_id) {
      await supabase
        .from('equipos')
        .update({
          fecha_ultimo_mantenimiento: fechaRealizacion,
          fecha_proximo_mantenimiento: proximaFechaSugerida,
          ...(marcarOperativo ? { estado: 'operativo' } : {})
        })
        .eq('id', current.equipo_id)
    }
    if (current.infraestructura_id) {
      await supabase
        .from('infraestructura')
        .update({
          fecha_ultima_revision: fechaRealizacion,
          fecha_proxima_revision: proximaFechaSugerida,
          ...(marcarOperativo ? { estado: 'operativo' } : {})
        })
        .eq('id', current.infraestructura_id)
    }
    if (current.incidencia_id) {
      await supabase.from('incidencias').update({ estado: 'en_progreso' }).eq('id', current.incidencia_id)
    }
  }

  revalidatePath('/')
  revalidatePath('/mantenimientos')
  revalidatePath(`/mantenimientos/${id}`)
  if (current.equipo_id) revalidatePath(`/equipos/${current.equipo_id}`)
  if (current.infraestructura_id) revalidatePath(`/infraestructura/${current.infraestructura_id}`)
  if (current.incidencia_id) revalidatePath(`/incidencias/${current.incidencia_id}`)
  redirect(`/mantenimientos/${id}?flash=mantenimiento_aplicado`)
}

export async function eliminarMantenimiento(id: string) {
  const supabase = await createServerSupabaseClient()
  const { data, error: fetchError } = await supabase
    .from('mantenimientos')
    .select('fotos_urls,equipo_id,infraestructura_id,incidencia_id')
    .eq('id', id)
    .single()

  if (fetchError) redirect(`/mantenimientos/${id}?flash=mantenimiento_error`)

  const { error } = await supabase.from('mantenimientos').delete().eq('id', id)
  if (error) redirect(`/mantenimientos/${id}?flash=mantenimiento_error`)

  await removeStorageFiles(supabase, (data?.fotos_urls as string[] | null) ?? [])

  revalidatePath('/')
  revalidatePath('/mantenimientos')
  if (data?.equipo_id) revalidatePath(`/equipos/${data.equipo_id}`)
  if (data?.infraestructura_id) revalidatePath(`/infraestructura/${data.infraestructura_id}`)
  if (data?.incidencia_id) revalidatePath(`/incidencias/${data.incidencia_id}`)
  redirect('/mantenimientos?flash=mantenimiento_eliminado')
}
