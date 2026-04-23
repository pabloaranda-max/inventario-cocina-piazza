import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { Infraestructura } from '@/lib/types'
import { formatDate } from '@/lib/utils'
import { FlashMessage } from '@/components/ui/flash-message'
import { StatusBadge } from '@/components/ui/status-badge'

export default async function InfraestructuraPage({
  searchParams
}: {
  searchParams: Promise<{ flash?: string }>
}) {
  const { flash } = await searchParams
  const supabase = await createServerSupabaseClient()
  const { data } = await supabase
    .from('infraestructura')
    .select('*, proveedor:proveedores(*), nivel:mapa_niveles(id,nombre)')
    .order('nombre', { ascending: true })
    .limit(200)

  const infraestructura = (data as Infraestructura[]) ?? []

  return (
    <div className="space-y-5">
      <FlashMessage code={flash} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Infraestructura</h1>
          <p className="brand-hint text-sm">Registros, tableros, válvulas y puntos técnicos del inmueble.</p>
        </div>
        <Link
          href="/infraestructura/nuevo"
          className="brand-button rounded-md px-4 py-2 text-sm font-medium"
        >
          Nueva infraestructura
        </Link>
      </div>

      {infraestructura.length ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {infraestructura.map((item) => (
            <article key={item.id} className="brand-card rounded-lg p-4 hover:border-[rgba(239,169,30,0.26)]">
              <Link href={`/infraestructura/${item.id}`} className="block">
                <h2 className="font-semibold hover:underline">{item.nombre}</h2>
              </Link>
              <p className="brand-hint mt-1 text-sm">
                {item.area ?? 'Sin área'} · {item.tipo}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <StatusBadge type="infraestructura" value={item.estado} />
                <StatusBadge type="criticidad" value={item.criticidad} />
              </div>
              <p className="brand-hint mt-3 text-sm">
                Próxima revisión: {formatDate(item.fecha_proxima_revision)}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href={`/incidencias/nueva?infraestructura=${item.id}`}
                  className="rounded-md border border-[rgba(155,30,33,0.2)] bg-[rgba(155,30,33,0.08)] px-3 py-2 text-sm font-medium text-[color:var(--brand-wine)] hover:bg-[rgba(155,30,33,0.12)] dark:border-[rgba(155,30,33,0.24)] dark:bg-[rgba(155,30,33,0.18)] dark:text-[color:var(--brand-bone)]"
                >
                  Reportar
                </Link>
                <Link
                  href={`/mantenimientos/nuevo?infraestructura=${item.id}`}
                  className="rounded-md border border-[rgba(47,62,30,0.16)] bg-[rgba(47,62,30,0.08)] px-3 py-2 text-sm font-medium text-[color:var(--brand-green)] hover:bg-[rgba(47,62,30,0.12)] dark:border-[rgba(238,227,202,0.14)] dark:bg-[rgba(47,62,30,0.2)] dark:text-[color:var(--brand-bone)]"
                >
                  Mantto.
                </Link>
                <Link
                  href={`/infraestructura/${item.id}/editar`}
                  className="brand-button-muted rounded-md px-3 py-2 text-sm font-medium"
                >
                  Editar
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="brand-card rounded-lg p-6 text-sm brand-hint">
          No hay infraestructura registrada.
        </div>
      )}
    </div>
  )
}
