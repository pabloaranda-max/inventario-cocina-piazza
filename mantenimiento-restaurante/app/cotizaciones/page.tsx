import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { Cotizacion } from '@/lib/types'
import { formatDate, formatCurrency } from '@/lib/utils'
import { FlashMessage } from '@/components/ui/flash-message'
import { StatusBadge } from '@/components/ui/status-badge'

export default async function CotizacionesPage({
  searchParams
}: {
  searchParams: Promise<{ flash?: string; estado?: string; proveedor?: string }>
}) {
  const { flash, estado, proveedor } = await searchParams
  const supabase = await createServerSupabaseClient()

  let query = supabase
    .from('cotizaciones')
    .select('*, proveedor:proveedores(id,nombre), activo:activos(id,nombre,area,clase,tipo), incidencia:incidencias(id,ticket_numero,descripcion), mantenimiento:mantenimientos(id,tipo,fecha_realizacion)')
    .order('created_at', { ascending: false })

  if (estado) query = query.eq('estado', estado)
  if (proveedor) query = query.eq('proveedor_id', proveedor)

  const { data } = await query
  const cotizaciones = (data as Cotizacion[]) ?? []

  return (
    <div className="space-y-5">
      <FlashMessage code={flash} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Cotizaciones</h1>
          <p className="brand-hint text-sm">
            Cotizaciones recibidas de proveedores.
          </p>
        </div>
        <Link
          href="/cotizaciones/nueva"
          className="brand-button rounded-md px-4 py-2 text-sm font-medium"
        >
          Nueva cotización
        </Link>
      </div>

      {/* Filtros de estado */}
      <div className="flex flex-wrap gap-2">
        {[
          { value: '', label: 'Todas' },
          { value: 'pendiente_revision', label: 'Pendientes' },
          { value: 'aprobada', label: 'Aprobadas' },
          { value: 'rechazada', label: 'Rechazadas' },
        ].map((f) => (
          <Link
            key={f.value}
            href={f.value ? `/cotizaciones?estado=${f.value}` : '/cotizaciones'}
            className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
              (estado ?? '') === f.value
                ? 'border-[color:var(--brand-wine)] bg-[color:var(--brand-wine)] text-[color:var(--brand-bone)]'
                : 'border-[rgba(47,62,30,0.14)] bg-[rgba(255,253,248,0.82)] text-[color:var(--brand-green)] hover:bg-[rgba(239,169,30,0.1)] dark:border-[rgba(238,227,202,0.12)] dark:bg-[rgba(22,32,18,0.72)] dark:text-[color:var(--brand-bone)] dark:hover:bg-[rgba(239,169,30,0.12)]'
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <div className="brand-card flex flex-wrap items-center justify-between gap-2 rounded-lg px-4 py-3 text-sm brand-hint">
        <span>{cotizaciones.length} cotización{cotizaciones.length === 1 ? '' : 'es'} en esta bandeja</span>
        <span>{estado ? 'Filtrado por estado' : 'Seguimiento de revisión y vencimiento'}</span>
      </div>

      {cotizaciones.length === 0 ? (
        <div className="brand-card rounded-lg p-6 text-sm brand-hint">
          No hay cotizaciones registradas.
        </div>
      ) : (
        <div className="brand-card overflow-x-auto rounded-lg">
          <table className="min-w-[860px] w-full text-sm">
            <thead className="bg-[rgba(47,62,30,0.06)] dark:bg-[rgba(238,227,202,0.08)]">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-[color:var(--brand-green)] dark:text-[color:var(--brand-bone)]">Número</th>
                <th className="px-4 py-3 text-left font-medium text-[color:var(--brand-green)] dark:text-[color:var(--brand-bone)]">Proveedor</th>
                <th className="px-4 py-3 text-left font-medium text-[color:var(--brand-green)] dark:text-[color:var(--brand-bone)]">Referencia</th>
                <th className="px-4 py-3 text-left font-medium text-[color:var(--brand-green)] dark:text-[color:var(--brand-bone)]">Monto</th>
                <th className="px-4 py-3 text-left font-medium text-[color:var(--brand-green)] dark:text-[color:var(--brand-bone)]">Estado</th>
                <th className="px-4 py-3 text-left font-medium text-[color:var(--brand-green)] dark:text-[color:var(--brand-bone)]">Fecha</th>
                <th className="px-4 py-3 text-left font-medium text-[color:var(--brand-green)] dark:text-[color:var(--brand-bone)]">Vence</th>
                <th className="px-4 py-3 text-right font-medium text-[color:var(--brand-green)] dark:text-[color:var(--brand-bone)]">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgba(47,62,30,0.08)] dark:divide-[rgba(238,227,202,0.08)]">
              {cotizaciones.map((c) => (
                <tr key={c.id} className="bg-transparent hover:bg-[rgba(239,169,30,0.06)] dark:hover:bg-[rgba(239,169,30,0.08)]">
                  <td className="px-4 py-3">
                    <Link href={`/cotizaciones/${c.id}`} className="font-medium text-[color:var(--brand-green)] hover:underline dark:text-[color:var(--brand-bone)]">
                      {c.numero}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-[color:var(--brand-green)] dark:text-[color:var(--brand-bone)]">
                    {c.proveedor?.nombre ?? <span className="brand-hint">—</span>}
                  </td>
                  <td className="px-4 py-3 brand-hint">
                    {c.activo
                      ? <Link href={`/activos/${c.activo_id}`} className="hover:underline text-[color:var(--brand-green)] dark:text-[color:var(--brand-bone)]">{c.activo.nombre}</Link>
                      : c.incidencia
                      ? <Link href={`/incidencias/${c.incidencia_id}`} className="hover:underline text-[color:var(--brand-green)] dark:text-[color:var(--brand-bone)]">{c.incidencia.ticket_numero}</Link>
                      : c.mantenimiento
                        ? <span>{c.mantenimiento.tipo} {formatDate(c.mantenimiento.fecha_realizacion)}</span>
                        : <span className="brand-hint">—</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-[color:var(--brand-green)] dark:text-[color:var(--brand-bone)]">
                    {c.monto != null ? formatCurrency(c.monto, c.moneda) : <span className="brand-hint">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge type="cotizacion" value={c.estado} />
                  </td>
                  <td className="px-4 py-3 brand-hint">
                    {formatDate(c.fecha_emision)}
                  </td>
                  <td className="px-4 py-3 brand-hint">
                    {c.fecha_vencimiento ? formatDate(c.fecha_vencimiento) : <span className="brand-hint">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Link
                        href={`/cotizaciones/${c.id}`}
                        className="brand-button-muted rounded-md px-3 py-2 text-sm font-medium"
                      >
                        Ver
                      </Link>
                      <Link
                        href={`/cotizaciones/${c.id}/editar`}
                        className="brand-button-muted rounded-md px-3 py-2 text-sm font-medium"
                      >
                        Editar
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
