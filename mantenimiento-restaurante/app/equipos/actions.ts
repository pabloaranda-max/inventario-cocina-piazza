'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { emptyToNull } from '@/lib/utils'
import { uploadOptionalFile } from '@/lib/storage'
import type { EstadoEquipo } from '@/lib/types'

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

function getEquipoPayload(formData: FormData): EquipoPayload {
  const nombre = String(formData.get('nombre') ?? '').trim()
  if (!nombre) throw new Error('El nombre es obligatorio.')

  return {
    nombre,
    area: emptyToNull(formData.get('area')),
    categoria: emptyToNull(formData.get('categoria')),
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

export async function crearEquipo(formData: FormData) {
  const supabase = await createServerSupabaseClient()
  const payload = getEquipoPayload(formData)

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
    throw new Error(error.message)
  }

  revalidatePath('/equipos')
  redirect(`/equipos/${data.id}`)
}

export async function actualizarEquipo(id: string, formData: FormData) {
  const supabase = await createServerSupabaseClient()
  const payload = getEquipoPayload(formData)

  const fotoUrl = await uploadOptionalFile(supabase, formData.get('foto'), 'equipos')
  const fotoPlacaUrl = await uploadOptionalFile(
    supabase,
    formData.get('foto_placa'),
    'equipos/placas'
  )

  const updatePayload: EquipoPayload = { ...payload }
  if (fotoUrl) updatePayload.foto_url = fotoUrl
  if (fotoPlacaUrl) updatePayload.foto_placa_url = fotoPlacaUrl

  const { error } = await supabase.from('equipos').update(updatePayload).eq('id', id)

  if (error) {
    throw new Error(error.message)
  }

  revalidatePath('/equipos')
  revalidatePath(`/equipos/${id}`)
  redirect(`/equipos/${id}`)
}
