import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { Equipo, Proveedor } from '@/lib/types'

type ProveedorConEquipos = Proveedor & {
  equipos?: Pick<Equipo, 'id' | 'nombre' | 'area'>[]
}

export default async function ProveedoresPage() {
  const supabase = await createServerSupabaseClient()
  const { data } = await supabase
    .from('proveedores')
    .select('*, equipos(id,nombre,area)')
    .order('nombre', { ascending: true })

  const proveedores = (data as ProveedorConEquipos[]) ?? []

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">Proveedores</h1>
          <p className="text-sm text-slate-600">Contactos externos de servicio y repuestos.</p>
        </div>
        <Link
          href="/proveedores/nuevo"
          className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Nuevo proveedor
        </Link>
      </div>

      {proveedores.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {proveedores.map((proveedor) => (
            <article key={proveedor.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-slate-950">{proveedor.nombre}</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    {proveedor.especialidad ?? 'Sin especialidad'}
                    {proveedor.telefono ? ` · ${proveedor.telefono}` : ''}
                  </p>
                  {proveedor.contacto ? (
                    <p className="mt-1 text-sm text-slate-600">Contacto: {proveedor.contacto}</p>
                  ) : null}
                </div>
                <Link
                  href={`/proveedores/${proveedor.id}/editar`}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 hover:bg-slate-100"
                >
                  Editar
                </Link>
              </div>

              <div className="mt-4">
                <h3 className="text-sm font-medium text-slate-700">Equipos relacionados</h3>
                {proveedor.equipos?.length ? (
                  <ul className="mt-2 space-y-1 text-sm text-slate-600">
                    {proveedor.equipos.map((equipo) => (
                      <li key={equipo.id}>
                        <Link href={`/equipos/${equipo.id}`} className="hover:text-slate-950 hover:underline">
                          {equipo.nombre}
                        </Link>
                        {equipo.area ? ` · ${equipo.area}` : ''}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">Sin equipos vinculados.</p>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600">
          No hay proveedores registrados.
        </div>
      )}
    </div>
  )
}
