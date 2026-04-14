'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { emptyToNull } from '@/lib/utils'
import { removeStorageFiles, uploadOptionalFile } from '@/lib/storage'
import type { FormState } from '@/lib/form-state'
import type { EstadoEquipo } from '@/lib/types'
import {
  buildMultipleDefinedValue,
  buildSingleDefinedValue,
  equipoAreas,
  equipoCategorias
} from '@/lib/defined-options'

type EquipoPayload = {
  nombre: string
  area: string | null
  categoria: string | null
  marca: string | null
  modelo: string | null
  numero_serie: string | null
  estado: EstadoEquipo
  proveedor_id: string | null
  fecha_ultimo_mantenimiento: string | null
  fecha_proximo_mantenimiento: string | null
  notas: string | null
  foto_url?: string | null
  foto_placa_url?: string | null
}

function getEquipoPayload(formData: FormData): EquipoPayload | FormState {
  const nombre = String(formData.get('nombre') ?? '').trim()
  if (!nombre) return { error: 'El nombre es obligatorio.' }

  const area = buildSingleDefinedValue({
    value: formData.get('area'),
    other: formData.get('area_otro'),
    options: equipoAreas,
    fieldLabel: 'el área'
  })
  if (typeof area === 'object' && area && 'error' in area) return area

  const categoria = buildMultipleDefinedValue({
    values: formData.getAll('categoria'),
    other: formData.get('categoria_otro'),
    options: equipoCategorias,
    fieldLabel: 'la categoría'
  })
  if (typeof categoria === 'object' && categoria && 'error' in categoria) return categoria

  return {
    nombre,
    area,
    categoria,
    marca: emptyToNull(formData.get('marca')),
    modelo: emptyToNull(formData.get('modelo')),
    numero_serie: emptyToNull(formData.get('numero_serie')),
    estado: String(formData.get('estado') ?? 'operativo') as EstadoEquipo,
    proveedor_id: emptyToNull(formData.get('proveedor_id')),
    fecha_ultimo_mantenimiento: emptyToNull(formData.get('fecha_ultimo_mantenimiento')),
    fecha_proximo_mantenimiento: emptyToNull(formData.get('fecha_proximo_mantenimiento')),
    notas: emptyToNull(formData.get('notas'))
  }
}

export async function crearEquipo(_state: FormState, formData: FormData): Promise<FormState> {
  const supabase = await createServerSupabaseClient()
  const payload = getEquipoPayload(formData)
  if (!('nombre' in payload)) return payload

  const fotoUrl = await uploadOptionalFile(supabase, formData.get('foto'), 'equipos')
  const fotoPlacaUrl = await uploadOptionalFile(
    supabase,
    formData.get('foto_placa'),
    'equipos/placas'
  )

  const { data, error } = await supabase
    .from('equipos')
    .insert({
      ...payload,
      foto_url: fotoUrl,
      foto_placa_url: fotoPlacaUrl
    })
    .select('id')
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/equipos')
  redirect(`/equipos/${data.id}?flash=equipo_creado`)
}

export async function actualizarEquipo(
  id: string,
  _state: FormState,
  formData: FormData
): Promise<FormState> {
  const supabase = await createServerSupabaseClient()
  const payload = getEquipoPayload(formData)
  if (!('nombre' in payload)) return payload

  const { data: currentEquipo, error: currentError } = await supabase
    .from('equipos')
    .select('foto_url, foto_placa_url')
    .eq('id', id)
    .single()

  if (currentError) return { error: currentError.message }

  let fotoUrl: string | null = null
  let fotoPlacaUrl: string | null = null

  try {
    fotoUrl = await uploadOptionalFile(supabase, formData.get('foto'), 'equipos')
    fotoPlacaUrl = await uploadOptionalFile(supabase, formData.get('foto_placa'), 'equipos/placas')
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'No se pudieron subir las fotos.' }
  }

  const updatePayload: EquipoPayload = { ...payload }
  if (fotoUrl) updatePayload.foto_url = fotoUrl
  if (fotoPlacaUrl) updatePayload.foto_placa_url = fotoPlacaUrl

  const { error } = await supabase.from('equipos').update(updatePayload).eq('id', id)

  if (error) {
    await removeStorageFiles(supabase, [fotoUrl, fotoPlacaUrl])
    return { error: error.message }
  }

  await removeStorageFiles(supabase, [
    fotoUrl ? currentEquipo?.foto_url : null,
    fotoPlacaUrl ? currentEquipo?.foto_placa_url : null
  ])

  revalidatePath('/equipos')
  revalidatePath(`/equipos/${id}`)
  redirect(`/equipos/${id}?flash=equipo_actualizado`)
}
