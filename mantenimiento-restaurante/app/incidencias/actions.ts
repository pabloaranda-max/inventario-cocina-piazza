'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { removeStorageFiles, uploadOptionalFile, getPublicUrl } from '@/lib/storage'
import { emptyToNull, isAdminEmail, todayMX } from '@/lib/utils'
import type { FormState } from '@/lib/form-state'
import type { EstadoIncidencia, PrioridadIncidencia } from '@/lib/types'
import { notificarNuevoReporte } from '@/lib/email'
import { postSlackMessage, postSlackSeguimiento, buildImageBlocks } from '@/lib/slack'

const ESTADO_EMOJI: Record<string, string> = {
  pendiente_asignacion: '🔔',
  abierta: '📋',
  en_progreso: '🔧',
  resuelta: '✅',
  cerrada: '🔒'
}

const PRIORIDAD_EMOJI: Record<string, string> = {
  baja: '🟢', media: '🟡', alta: '🟠', urgente: '🔴'
}

const estadoTransitions: Record<EstadoIncidencia, EstadoIncidencia[]> = {
  pendiente_asignacion: ['pendiente_asignacion', 'abierta'],
  abierta: ['abierta', 'en_progreso', 'resuelta'],
  en_progreso: ['en_progreso', 'resuelta'],
  resuelta: ['resuelta', 'en_progreso', 'cerrada'],
  cerrada: ['cerrada']
}

function getZonaNombre(activo: { zona?: { nombre?: string | null } | { nombre?: string | null }[] | null } | null) {
  const zona = Array.isArray(activo?.zona) ? activo.zona[0] : activo?.zona
  return zona?.nombre ?? null
}

function getEstadoRedirectTarget(formData: FormData, fallback = '/incidencias') {
  const redirectTo = String(formData.get('redirect_to') ?? '').trim()
  return redirectTo.startsWith('/') ? redirectTo : fallback
}

function canTransitionEstado(current: EstadoIncidencia, next: EstadoIncidencia) {
  return estadoTransitions[current]?.includes(next) ?? false
}

function getIncidenciaPayload(formData: FormData) {
  const descripcion = String(formData.get('descripcion') ?? '').trim()
  if (!descripcion) return { error: 'La descripción es obligatoria.' }

  return {
    activo_id: emptyToNull(formData.get('activo_id')),
    zona_id: emptyToNull(formData.get('zona_id')),
    descripcion,
    prioridad: String(formData.get('prioridad') ?? 'media') as PrioridadIncidencia,
    reportado_por: emptyToNull(formData.get('reportado_por')),
    fecha_reporte: emptyToNull(formData.get('fecha_reporte')) ?? todayMX(),
    estado: String(formData.get('estado') ?? 'abierta') as EstadoIncidencia
  }
}

function getCapturaPayload(formData: FormData) {
  const descripcion = String(formData.get('descripcion') ?? '').trim()
  const reportado_por = String(formData.get('reportado_por') ?? '').trim()
  if (!reportado_por) return { error: 'El nombre es obligatorio.' }
  if (!descripcion) return { error: 'La descripción es obligatoria.' }

  return {
    descripcion,
    prioridad: String(formData.get('prioridad') ?? 'media') as PrioridadIncidencia,
    reportado_por,
    fecha_reporte: todayMX()
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

export async function crearIncidencia(_state: FormState, formData: FormData): Promise<FormState> {
  const payload = getCapturaPayload(formData)
  if ('error' in payload) return payload

  const supabase = await createServerSupabaseClient()

  let fotoUrl: string | null = null
  try {
    fotoUrl = await uploadOptionalFile(supabase, formData.get('foto'), 'incidencias')
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'No se pudo subir la foto.' }
  }

  const emailReportador = emptyToNull(formData.get('email_reportador'))

  const { data: rpc, error } = await supabase.rpc('reportar_incidencia', {
    p_descripcion: payload.descripcion,
    p_prioridad: payload.prioridad,
    p_reportado_por: payload.reportado_por ?? '',
    p_foto_url: fotoUrl
  })

  if (error) {
    await removeStorageFiles(supabase, [fotoUrl])
    return { error: error.message }
  }

  const ticket = (rpc as { ticket_numero: string } | null)?.ticket_numero ?? ''

  try {
    await notificarNuevoReporte({
      ticket,
      descripcion: payload.descripcion,
      prioridad: payload.prioridad,
      reportado_por: payload.reportado_por ?? 'Sin nombre',
      emailReportador: emailReportador ?? undefined
    })
  } catch {
    // notificación no crítica
  }

  try {
    const p = PRIORIDAD_EMOJI[payload.prioridad] ?? ''
    const msg = `🔔 Nueva incidencia ${ticket} — "${payload.descripcion}" ${p} ${payload.prioridad}` +
      (payload.reportado_por ? ` — Reportado por: ${payload.reportado_por}` : '')
    const signedFoto = fotoUrl ? getPublicUrl(supabase, fotoUrl) : null
    await postSlackSeguimiento(msg, buildImageBlocks(msg, signedFoto))
  } catch {
    // no crítico
  }

  revalidatePath('/')
  revalidatePath('/mapa')
  revalidatePath('/incidencias')
  redirect(`/reportar/gracias?ticket=${encodeURIComponent(ticket)}&nombre=${encodeURIComponent(payload.reportado_por ?? '')}&prioridad=${payload.prioridad}`)
}

export async function asignarIncidencia(id: string, formData: FormData) {
  const activoId = emptyToNull(formData.get('activo_id'))
  const zonaId = emptyToNull(formData.get('zona_id'))
  const zonaTexto = String(formData.get('zona_texto') ?? '').trim() || null

  const supabase = await createServerSupabaseClient()

  const [{ data: incRef }, { data: activo, error: activoError }] = await Promise.all([
    supabase.from('incidencias').select('ticket_numero,descripcion').eq('id', id).single(),
    activoId
      ? supabase.from('activos').select('id,clase,zona_id,zona:mapa_zonas(nombre)').eq('id', activoId).single()
      : Promise.resolve({ data: null, error: null })
  ])
  if (activoError) redirect(`/incidencias/${id}?flash=incidencia_error`)

  const resolvedZonaId = activo?.zona_id ?? zonaId
  const zonaNombreResult = getZonaNombre(activo) ?? (await getZonaNombreById(supabase, resolvedZonaId))
  const zonaNombre = typeof zonaNombreResult === 'string' ? zonaNombreResult : zonaTexto

  const { error } = await supabase.from('incidencias').update({
    activo_id: activoId,
    equipo_id: activo?.clase === 'equipo' ? activo.id : null,
    infraestructura_id: activo?.clase === 'infraestructura' ? activo.id : null,
    zona_id: resolvedZonaId,
    zona_nombre: zonaNombre,
    estado: 'abierta'
  }).eq('id', id)

  if (error) redirect(`/incidencias/${id}?flash=incidencia_error`)

  try {
    const ticket = (incRef as { ticket_numero: string } | null)?.ticket_numero ?? id
    const desc = (incRef as { descripcion: string } | null)?.descripcion ?? ''
    const destino = zonaNombre ?? zonaTexto ?? 'sin zona'
    await postSlackSeguimiento(`📋 Asignada ${ticket} — "${desc}" → ${destino}`)
  } catch {
    // no crítico
  }

  revalidatePath('/')
  revalidatePath('/mapa')
  revalidatePath('/incidencias')
  redirect(`/incidencias/${id}?flash=incidencia_actualizada`)
}

export async function actualizarIncidencia(
  id: string,
  _state: FormState,
  formData: FormData
): Promise<FormState> {
  const payload = getIncidenciaPayload(formData)
  if ('error' in payload) return payload

  const supabase = await createServerSupabaseClient()
  const { data: activo, error: activoError } = payload.activo_id
    ? await supabase.from('activos').select('id,clase,zona_id,zona:mapa_zonas(nombre)').eq('id', payload.activo_id).single()
    : { data: null, error: null }
  if (activoError) return { error: activoError.message }

  const zonaId = activo?.zona_id ?? payload.zona_id
  const zonaNombreResult = getZonaNombre(activo) ?? (await getZonaNombreById(supabase, zonaId))
  if (zonaNombreResult && typeof zonaNombreResult === 'object' && 'error' in zonaNombreResult) {
    return { error: zonaNombreResult.error }
  }
  const zonaNombre = typeof zonaNombreResult === 'string' ? zonaNombreResult : null

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

  const updatePayload = {
    ...payload,
    equipo_id: activo?.clase === 'equipo' ? activo.id : null,
    infraestructura_id: activo?.clase === 'infraestructura' ? activo.id : null,
    zona_id: zonaId,
    zona_nombre: zonaNombre,
    ...(fotoUrl ? { foto_url: fotoUrl } : {})
  }
  const { error } = await supabase.from('incidencias').update(updatePayload).eq('id', id)

  if (error) {
    await removeStorageFiles(supabase, [fotoUrl])
    return { error: error.message }
  }

  if (fotoUrl) await removeStorageFiles(supabase, [currentIncidencia?.foto_url])

  revalidatePath('/')
  revalidatePath('/mapa')
  revalidatePath('/incidencias')
  revalidatePath(`/incidencias/${id}`)
  redirect(`/incidencias/${id}?flash=incidencia_actualizada`)
}

export async function cambiarEstadoIncidencia(id: string, formData: FormData) {
  const estado = String(formData.get('estado') ?? 'abierta') as EstadoIncidencia
  const redirectTarget = getEstadoRedirectTarget(formData, '/incidencias')
  const supabase = await createServerSupabaseClient()
  const {
    data: { user }
  } = await supabase.auth.getUser()
  const { data: incidencia, error: incidenciaError } = await supabase
    .from('incidencias')
    .select('estado, prioridad, foto_url, activo_id, zona_id, ticket_numero, descripcion, zona_nombre')
    .eq('id', id)
    .single()

  if (incidenciaError || !incidencia) redirect(`${redirectTarget}?flash=incidencia_error`)

  if (!canTransitionEstado(incidencia.estado, estado)) {
    redirect(`${redirectTarget}?flash=incidencia_transition_error`)
  }

  if (estado === 'cerrada' && !isAdminEmail(user?.email)) {
    redirect(`${redirectTarget}?flash=incidencia_admin_error`)
  }

  let fotoUrl: string | null = null
  try {
    fotoUrl = await uploadOptionalFile(supabase, formData.get('foto'), 'incidencias')
  } catch (error) {
    redirect(`${redirectTarget}?flash=incidencia_error`)
  }

  if (
    estado === 'resuelta' &&
    (incidencia.prioridad === 'alta' || incidencia.prioridad === 'urgente') &&
    !incidencia.foto_url &&
    !fotoUrl
  ) {
    await removeStorageFiles(supabase, [fotoUrl])
    redirect(`${redirectTarget}?flash=incidencia_evidencia_error`)
  }

  const updatePayload: Partial<{
    estado: EstadoIncidencia
    fecha_resuelta: string | null
    validado_por: string | null
  }> = { estado }

  if (estado === 'resuelta') {
    updatePayload.fecha_resuelta = new Date().toISOString()
    updatePayload.validado_por = null
  }

  if (incidencia.estado === 'resuelta' && estado === 'en_progreso') {
    updatePayload.fecha_resuelta = null
    updatePayload.validado_por = null
  }

  if (estado === 'cerrada') {
    updatePayload.validado_por = user?.email ?? user?.id ?? 'usuario_autenticado'
  }

  if (fotoUrl) {
    Object.assign(updatePayload, { foto_url: fotoUrl })
  }

  const { error } = await supabase.from('incidencias').update(updatePayload).eq('id', id)

  if (error) {
    await removeStorageFiles(supabase, [fotoUrl])
    redirect(`${redirectTarget}?flash=incidencia_error`)
  }

  try {
    const emoji = ESTADO_EMOJI[estado] ?? '•'
    const ticket = (incidencia as { ticket_numero?: string }).ticket_numero ?? id
    const desc = (incidencia as { descripcion?: string }).descripcion ?? ''
    const zona = (incidencia as { zona_nombre?: string | null }).zona_nombre
    const fotoExistente = (incidencia as { foto_url?: string | null }).foto_url
    const estadoLabel: Record<string, string> = {
      pendiente_asignacion: 'Pendiente de asignación',
      abierta: 'Abierta',
      en_progreso: 'En progreso',
      resuelta: 'Resuelta',
      cerrada: 'Cerrada'
    }
    const label = estadoLabel[estado] ?? estado
    const msg = `${emoji} ${label}: ${ticket} — "${desc}"` + (zona ? ` (${zona})` : '')
    const fotoPath = fotoUrl ?? fotoExistente
    const signedFoto = fotoPath ? getPublicUrl(supabase, fotoPath) : null
    await postSlackSeguimiento(msg, buildImageBlocks(msg, signedFoto))
  } catch {
    // no crítico
  }

  revalidatePath('/')
  revalidatePath('/mapa')
  revalidatePath('/incidencias')
  revalidatePath(`/incidencias/${id}`)

  if (estado === 'resuelta' && formData.get('crear_correctivo') === 'on') {
    const params = new URLSearchParams({
      tipo: 'correctivo',
      incidencia: id
    })
    if (incidencia.activo_id) params.set('activo', incidencia.activo_id)
    if (incidencia.zona_id) params.set('zona', incidencia.zona_id)
    redirect(`/mantenimientos/nuevo?${params.toString()}`)
  }

  redirect(`${redirectTarget}?flash=incidencia_actualizada`)
}

export async function crearActivoRapido(_state: FormState, formData: FormData): Promise<FormState & { activo?: { id: string; nombre: string; area: string | null; clase: string; tipo: string } }> {
  const nombre = String(formData.get('nombre') ?? '').trim()
  const clase = String(formData.get('clase') ?? '').trim()
  const tipo = String(formData.get('tipo') ?? '').trim()
  const zona_id = String(formData.get('zona_id') ?? '').trim() || null

  if (!nombre) return { error: 'El nombre es obligatorio.' }
  if (!clase) return { error: 'La clase es obligatoria.' }
  if (!tipo) return { error: 'El tipo es obligatorio.' }
  if (!zona_id) return { error: 'Selecciona una zona para ubicar el activo.' }

  const supabase = await createServerSupabaseClient()
  const { data: zona, error: zonaError } = await supabase
    .from('mapa_zonas')
    .select('id,nivel_id,area,nombre,x,y')
    .eq('id', zona_id)
    .single()

  if (zonaError) return { error: zonaError.message }

  const resolvedArea = zona.area ?? zona.nombre ?? null
  const { data, error } = await supabase
    .from('activos')
    .insert({ nombre, clase, tipo, area: resolvedArea, zona_id, nivel_id: zona.nivel_id, x: zona.x, y: zona.y })
    .select('id, nombre, area, clase, tipo')
    .single()

  if (error) return { error: error.message }

  revalidatePath('/incidencias')
  revalidatePath('/mapa')
  revalidatePath('/activos')
  return { activo: data }
}


export async function agregarSeguimiento(
  id: string,
  _state: FormState,
  formData: FormData
): Promise<FormState> {
  const texto = String(formData.get('texto') ?? '').trim()
  if (!texto) return { error: 'El seguimiento no puede estar vacío.' }

  const supabase = await createServerSupabaseClient()
  const {
    data: { user }
  } = await supabase.auth.getUser()

  const { data: incidencia } = await supabase
    .from('incidencias')
    .select('estado')
    .eq('id', id)
    .single()

  if (incidencia?.estado !== 'en_progreso') {
    return { error: 'Solo se puede registrar seguimiento cuando la incidencia está en progreso.' }
  }

  const registrado_por =
    emptyToNull(formData.get('registrado_por')) ?? user?.email ?? null

  const { error } = await supabase.from('incidencia_seguimientos').insert({
    incidencia_id: id,
    texto,
    registrado_por
  })

  if (error) return { error: error.message }

  revalidatePath(`/incidencias/${id}`)
  return {}
}

export async function reportarResolucionSlack(id: string) {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('incidencias')
    .select('ticket_numero,descripcion,prioridad,reportado_por,fecha_reporte,fecha_resuelta,validado_por,foto_url,activo:activos(nombre,area),equipo:equipos(nombre,area),infraestructura:infraestructura(nombre,area),zona_nombre')
    .eq('id', id)
    .single()

  if (error || !data) redirect(`/incidencias/${id}?flash=incidencia_error`)

  const inc = data as unknown as {
    ticket_numero: string
    descripcion: string
    prioridad: string
    reportado_por: string | null
    fecha_reporte: string
    fecha_resuelta: string | null
    validado_por: string | null
    foto_url: string | null
    activo: { nombre: string } | { nombre: string }[] | null
    equipo: { nombre: string } | { nombre: string }[] | null
    infraestructura: { nombre: string } | { nombre: string }[] | null
    zona_nombre: string | null
  }

  function firstName(rel: { nombre: string } | { nombre: string }[] | null): string | null {
    if (!rel) return null
    return Array.isArray(rel) ? (rel[0]?.nombre ?? null) : rel.nombre
  }

  const destino = firstName(inc.activo) ?? firstName(inc.equipo) ?? firstName(inc.infraestructura) ?? inc.zona_nombre ?? 'Sin destino'

  const prioridadEmoji: Record<string, string> = {
    baja: '🟢', media: '🟡', alta: '🟠', urgente: '🔴'
  }

  const duracion = (() => {
    if (!inc.fecha_resuelta) return null
    const ms = new Date(inc.fecha_resuelta).getTime() - new Date(inc.fecha_reporte).getTime()
    const h = Math.floor(ms / 3600000)
    const d = Math.floor(h / 24)
    if (d > 0) return `${d}d ${h % 24}h`
    if (h > 0) return `${h}h`
    return 'menos de 1h'
  })()

  const blocks: object[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `✅ Incidencia resuelta: ${inc.ticket_numero}` }
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*${inc.descripcion}*` }
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Destino:*\n${destino}` },
        { type: 'mrkdwn', text: `*Prioridad:*\n${prioridadEmoji[inc.prioridad] ?? ''} ${inc.prioridad}` },
        ...(inc.reportado_por ? [{ type: 'mrkdwn', text: `*Reportado por:*\n${inc.reportado_por}` }] : []),
        ...(duracion ? [{ type: 'mrkdwn', text: `*Tiempo de resolución:*\n${duracion}` }] : []),
        ...(inc.validado_por ? [{ type: 'mrkdwn', text: `*Cerrado por:*\n${inc.validado_por}` }] : [])
      ]
    }
  ]

  if (inc.foto_url) {
    const signedFoto = getPublicUrl(supabase, inc.foto_url)
    if (signedFoto) {
      blocks.push({ type: 'image', image_url: signedFoto, alt_text: 'Evidencia' })
    }
  }

  try {
    await postSlackMessage(`✅ Incidencia resuelta: ${inc.ticket_numero} — ${inc.descripcion}`, blocks)
  } catch {
    redirect(`/incidencias/${id}?flash=incidencia_error`)
  }

  await supabase.from('incidencias').update({ reportado_slack_at: new Date().toISOString() }).eq('id', id)

  revalidatePath(`/incidencias/${id}`)
  redirect(`/incidencias/${id}?flash=incidencia_actualizada`)
}

export async function fusionarIncidencia(id: string, formData: FormData) {
  const principalId = String(formData.get('principal_id') ?? '').trim()
  if (!principalId || principalId === id) redirect(`/incidencias/${id}?flash=incidencia_error`)

  const supabase = await createServerSupabaseClient()

  const [{ data: secundaria }, { data: principal }] = await Promise.all([
    supabase.from('incidencias').select('ticket_numero,descripcion,reportado_por,estado').eq('id', id).single(),
    supabase.from('incidencias').select('id,estado,ticket_numero').eq('id', principalId).single()
  ])

  if (!secundaria || !principal) redirect(`/incidencias/${id}?flash=incidencia_error`)

  // Cerrar la secundaria y marcarla como fusionada
  const { error: updateError } = await supabase
    .from('incidencias')
    .update({ estado: 'cerrada', fusionada_en_id: principalId })
    .eq('id', id)

  if (updateError) redirect(`/incidencias/${id}?flash=incidencia_error`)

  // Agregar nota al principal
  const nota = [
    `Reporte fusionado: ${secundaria.ticket_numero}`,
    secundaria.reportado_por ? `Reportado por: ${secundaria.reportado_por}` : null,
    secundaria.descripcion !== principal.id ? `"${secundaria.descripcion}"` : null
  ].filter(Boolean).join(' — ')

  await supabase.from('incidencia_seguimientos').insert({
    incidencia_id: principalId,
    texto: nota,
    registrado_por: 'sistema'
  })

  try {
    const ticketSec = secundaria.ticket_numero
    const ticketPrin = (principal as { ticket_numero?: string }).ticket_numero ?? principalId
    await postSlackSeguimiento(`🔀 ${ticketSec} fusionada en ${ticketPrin} — "${secundaria.descripcion}"`)
  } catch {
    // no crítico
  }

  revalidatePath('/incidencias')
  revalidatePath(`/incidencias/${id}`)
  revalidatePath(`/incidencias/${principalId}`)
  redirect(`/incidencias/${principalId}?flash=incidencia_actualizada`)
}

export async function eliminarIncidencia(id: string) {
  const supabase = await createServerSupabaseClient()
  const { data, error: fetchError } = await supabase
    .from('incidencias')
    .select('foto_url')
    .eq('id', id)
    .single()

  if (fetchError) redirect(`/incidencias/${id}?flash=incidencia_error`)

  const { error } = await supabase.from('incidencias').delete().eq('id', id)
  if (error) redirect(`/incidencias/${id}?flash=incidencia_error`)

  await removeStorageFiles(supabase, [data?.foto_url])

  revalidatePath('/')
  revalidatePath('/mapa')
  revalidatePath('/incidencias')
  revalidatePath('/mantenimientos')
  redirect('/incidencias?flash=incidencia_eliminada')
}
