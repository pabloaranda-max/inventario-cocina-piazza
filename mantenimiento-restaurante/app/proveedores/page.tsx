import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { Equipo, Proveedor } from '@/lib/types'
import { FlashMessage } from '@/components/ui/flash-message'

type ProveedorConEquipos = Proveedor & {
  equipos?: Pick<Equipo, 'id' | 'nombre' | 'area'>[]
}

export default async function ProveedoresPage({
  searchParams
}: {
  searchParams: Promise<{ flash?: string }>
}) {
  const { flash } = await searchParams
  const supabase = await createServerSupabaseClient()
  const { data } = await supabase
    .from('proveedores')
    .select('*, equipos(id,nombre,area)')
    .order('nombre', { ascending: true })

  const proveedores = (data as ProveedorConEquipos[]) ?? []

  return (
    <div className="space-y-5">
      <FlashMessage code={flash} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Proveedores</h1>
          <p className="brand-hint text-sm">Contactos externos de servicio y repuestos.</p>
        </div>
        <Link
          href="/proveedores/nuevo"
          className="brand-button rounded-md px-4 py-2 text-sm font-medium"
        >
          Nuevo proveedor
        </Link>
      </div>

      {proveedores.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {proveedores.map((proveedor) => (
            <article key={proveedor.id} className="brand-card rounded-lg p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">{proveedor.nombre}</h2>
                  <p className="brand-hint mt-1 text-sm">
                    {proveedor.especialidad ?? 'Sin especialidad'}
                  </p>
                  <div className="brand-hint mt-3 space-y-1 text-sm">
                    <ContactLine
                      label="Principal"
                      contact={proveedor.contacto}
                      role={proveedor.puesto_contacto}
                      phone={proveedor.telefono}
                    />
                    <ContactLine
                      label="Secundario"
                      contact={proveedor.contacto_secundario}
                      role={proveedor.puesto_contacto_secundario}
                      phone={proveedor.telefono_secundario}
                    />
                  </div>
                </div>
                <Link
                  href={`/proveedores/${proveedor.id}/editar`}
                  className="brand-button-muted rounded-md px-3 py-2 text-sm font-medium"
                >
                  Editar
                </Link>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <div className="flex-1">
                  <h3 className="brand-label">Equipos relacionados</h3>
                  {proveedor.equipos?.length ? (
                    <ul className="brand-hint mt-2 space-y-1 text-sm">
                      {proveedor.equipos.map((equipo) => (
                        <li key={equipo.id}>
                          <Link href={`/equipos/${equipo.id}`} className="hover:underline text-[color:var(--brand-green)] dark:text-[color:var(--brand-bone)]">
                            {equipo.nombre}
                          </Link>
                          {equipo.area ? ` · ${equipo.area}` : ''}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="brand-hint mt-2 text-sm">Sin equipos vinculados.</p>
                  )}
                </div>
                <Link
                  href={`/cotizaciones?proveedor=${proveedor.id}`}
                  className="brand-button-muted rounded-md px-3 py-1.5 text-xs font-medium"
                >
                  Ver cotizaciones
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="brand-card rounded-lg p-6 text-sm brand-hint">
          No hay proveedores registrados.
        </div>
      )}
    </div>
  )
}

function ContactLine({
  label,
  contact,
  role,
  phone
}: {
  label: string
  contact?: string | null
  role?: string | null
  phone?: string | null
}) {
  if (!contact && !role && !phone) return null

  return (
    <p>
      {label}: {contact ?? 'Sin nombre'}
      {role ? ` · ${role}` : ''}
      {phone ? ` · ${phone}` : ''}
    </p>
  )
}
