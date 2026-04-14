'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { emptyToNull } from '@/lib/utils'
import type { FormState } from '@/lib/form-state'
import { buildMultipleDefinedValue, proveedorEspecialidades } from '@/lib/defined-options'

function getProveedorPayload(formData: FormData): FormState | {
  nombre: string
  especialidad: string | null
  telefono: string | null
  contacto: string | null
  puesto_contacto: string | null
  telefono_secundario: string | null
  contacto_secundario: string | null
  puesto_contacto_secundario: string | null
  notas: string | null
} {
  const nombre = String(formData.get('nombre') ?? '').trim()
  if (!nombre) return { error: 'El nombre es obligatorio.' }

  const especialidad = buildMultipleDefinedValue({
    values: formData.getAll('especialidad'),
    other: formData.get('especialidad_otro'),
    options: proveedorEspecialidades,
    fieldLabel: 'la especialidad'
  })
  if (typeof especialidad === 'object' && especialidad && 'error' in especialidad) return especialidad

  return {
    nombre,
    especialidad,
    telefono: emptyToNull(formData.get('telefono')),
    contacto: emptyToNull(formData.get('contacto')),
    puesto_contacto: emptyToNull(formData.get('puesto_contacto')),
    telefono_secundario: emptyToNull(formData.get('telefono_secundario')),
    contacto_secundario: emptyToNull(formData.get('contacto_secundario')),
    puesto_contacto_secundario: emptyToNull(formData.get('puesto_contacto_secundario')),
    notas: emptyToNull(formData.get('notas'))
  }
}

export async function crearProveedor(_state: FormState, formData: FormData): Promise<FormState> {
  const supabase = await createServerSupabaseClient()
  const payload = getProveedorPayload(formData)
  if (!('nombre' in payload)) return payload

  const { error } = await supabase.from('proveedores').insert(payload)

  if (error) return { error: error.message }

  revalidatePath('/proveedores')
  redirect('/proveedores?flash=proveedor_creado')
}

export async function actualizarProveedor(
  id: string,
  _state: FormState,
  formData: FormData
): Promise<FormState> {
  const supabase = await createServerSupabaseClient()
  const payload = getProveedorPayload(formData)
  if (!('nombre' in payload)) return payload

  const { error } = await supabase.from('proveedores').update(payload).eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/proveedores')
  redirect('/proveedores?flash=proveedor_actualizado')
}
