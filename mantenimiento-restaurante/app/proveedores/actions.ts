'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { emptyToNull } from '@/lib/utils'

function getProveedorPayload(formData: FormData) {
  const nombre = String(formData.get('nombre') ?? '').trim()
  if (!nombre) throw new Error('El nombre es obligatorio.')

  return {
    nombre,
    especialidad: emptyToNull(formData.get('especialidad')),
    telefono: emptyToNull(formData.get('telefono')),
    contacto: emptyToNull(formData.get('contacto')),
    notas: emptyToNull(formData.get('notas'))
  }
}

export async function crearProveedor(formData: FormData) {
  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.from('proveedores').insert(getProveedorPayload(formData))

  if (error) throw new Error(error.message)

  revalidatePath('/proveedores')
  redirect('/proveedores')
}

export async function actualizarProveedor(id: string, formData: FormData) {
  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.from('proveedores').update(getProveedorPayload(formData)).eq('id', id)

  if (error) throw new Error(error.message)

  revalidatePath('/proveedores')
  redirect('/proveedores')
}
