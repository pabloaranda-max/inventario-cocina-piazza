import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ProveedorForm } from '../../proveedor-form'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { Proveedor } from '@/lib/types'

export default async function EditarProveedorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: proveedor } = await supabase
    .from('proveedores')
    .select('*')
    .eq('id', id)
    .single()

  if (!proveedor) notFound()

  return (
    <div className="space-y-5">
      <div>
        <Link href="/proveedores" className="text-sm text-slate-600 hover:text-slate-950">
          Volver a proveedores
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950">Editar proveedor</h1>
      </div>
      <ProveedorForm proveedor={proveedor as Proveedor} />
    </div>
  )
}
