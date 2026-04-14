'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { FormState } from '@/lib/form-state'

export async function guardarMapaZonas(_state: FormState, formData: FormData): Promise<FormState> {
  const raw = String(formData.get('zonas') ?? '')
  if (!raw) return { error: 'No hay zonas para guardar.' }

  let zonas: Array<{ id: string; nivel_id: string; area: string; label: string; x: number; y: number }>

  try {
    zonas = JSON.parse(raw)
  } catch {
    return { error: 'No se pudo leer la configuración del mapa.' }
  }

  const payload = zonas.map((zona, index) => ({
    id: zona.id,
    nivel_id: zona.nivel_id,
    area: zona.area.trim(),
    label: zona.label.trim(),
    x: Math.min(100, Math.max(0, Number(zona.x))),
    y: Math.min(100, Math.max(0, Number(zona.y))),
    orden: index * 10,
    visible: true
  }))

  if (
    payload.some(
      (zona) => !zona.id || !zona.nivel_id || !zona.area || !zona.label || Number.isNaN(zona.x) || Number.isNaN(zona.y)
    )
  ) {
    return { error: 'Revisa nombres, áreas y posiciones antes de guardar.' }
  }

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.from('mapa_zonas').upsert(payload)

  if (error) return { error: error.message }

  revalidatePath('/mapa')
  return {}
}
