import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { Activo } from '@/lib/types'

export default async function ActivoDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data } = await supabase.from('activos').select('id,clase').eq('id', id).single()
  const activo = data as Pick<Activo, 'id' | 'clase'> | null

  if (activo?.clase === 'equipo') redirect(`/equipos/${id}`)
  if (activo?.clase === 'infraestructura') redirect(`/infraestructura/${id}`)

  redirect('/activos')
}
