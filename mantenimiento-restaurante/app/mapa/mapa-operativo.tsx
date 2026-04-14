'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import type { Equipo, EstadoIncidencia, PrioridadIncidencia } from '@/lib/types'
import { formatDate } from '@/lib/utils'
import { StatusBadge } from '@/components/ui/status-badge'

const zonas = [
  { area: 'Hostess', label: 'Hostess', x: 9, y: 13 },
  { area: 'Porche', label: 'Porche', x: 8, y: 28 },
  { area: 'Barra', label: 'Barra', x: 84, y: 45 },
  { area: 'Salón', label: 'Salón', x: 55, y: 36 },
  { area: 'Bodega', label: 'Bodega', x: 82, y: 11 },
  { area: 'Cocina caliente', label: 'Cocina', x: 49, y: 78 },
  { area: 'Cocina fría', label: 'Cocina fría', x: 39, y: 69 },
  { area: 'Lavado', label: 'Lavado', x: 67, y: 73 },
  { area: 'Almacén', label: 'Almacén', x: 78, y: 74 },
  { area: 'Counter venta', label: 'Counter', x: 21, y: 52 }
]

export type MapaIncidencia = {
  id: string
  ticket_numero: string
  descripcion: string
  prioridad: PrioridadIncidencia
  estado: EstadoIncidencia
  equipo_id: string | null
}

export function MapaOperativo({
  equipos,
  incidencias
}: {
  equipos: Equipo[]
  incidencias: MapaIncidencia[]
}) {
  const [selectedArea, setSelectedArea] = useState<string | null>(null)

  const equiposPorArea = useMemo(() => {
    return equipos.reduce<Record<string, Equipo[]>>((acc, equipo) => {
      const area = equipo.area ?? 'Sin área'
      acc[area] = acc[area] ?? []
      acc[area].push(equipo)
      return acc
    }, {})
  }, [equipos])

  const incidenciasPorEquipo = useMemo(() => {
    return incidencias.reduce<Record<string, MapaIncidencia[]>>((acc, incidencia) => {
      if (!incidencia.equipo_id) return acc
      acc[incidencia.equipo_id] = acc[incidencia.equipo_id] ?? []
      acc[incidencia.equipo_id].push(incidencia)
      return acc
    }, {})
  }, [incidencias])

  const visibleEquipos = selectedArea
    ? equipos.filter((equipo) => (equipo.area ?? 'Sin área') === selectedArea)
    : equipos

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">Mapa operativo</h1>
          <p className="text-sm text-slate-600">Plano del restaurante con equipos por área.</p>
        </div>
        <Link
          href="/equipos/nuevo"
          className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Nuevo equipo
        </Link>
      </div>

      <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="relative">
            <Image
              src="/planos-layout-actual.png"
              alt="Plano del restaurante"
              width={1152}
              height={768}
              className="block w-full"
            />
            {zonas.map((zona) => {
              const total = equiposPorArea[zona.area]?.length ?? 0
              const active = equiposPorArea[zona.area]?.some(
                (equipo) => (incidenciasPorEquipo[equipo.id]?.length ?? 0) > 0
              )

              return (
                <button
                  key={zona.area}
                  type="button"
                  onClick={() => setSelectedArea(selectedArea === zona.area ? null : zona.area)}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-md border px-2 py-1 text-xs font-semibold shadow-sm ${
                    selectedArea === zona.area
                      ? 'border-slate-950 bg-slate-950 text-white'
                      : active
                        ? 'border-rose-300 bg-rose-50 text-rose-800'
                        : 'border-emerald-300 bg-emerald-50 text-emerald-800'
                  }`}
                  style={{ left: `${zona.x}%`, top: `${zona.y}%` }}
                >
                  {zona.label}
                  <span className="ml-1 rounded bg-white/70 px-1 text-slate-800">{total}</span>
                </button>
              )
            })}
          </div>
        </div>

        <aside className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-slate-950">{selectedArea ?? 'Todas las áreas'}</h2>
              <p className="text-sm text-slate-600">{visibleEquipos.length} equipos</p>
            </div>
            {selectedArea ? (
              <button
                type="button"
                onClick={() => setSelectedArea(null)}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 hover:bg-slate-100"
              >
                Ver todo
              </button>
            ) : null}
          </div>

          <div className="mt-4 space-y-3">
            {visibleEquipos.length ? (
              visibleEquipos.map((equipo) => {
                const equipoIncidencias = incidenciasPorEquipo[equipo.id] ?? []

                return (
                  <article key={equipo.id} className="rounded-md border border-slate-200 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge type="equipo" value={equipo.estado} />
                      {equipoIncidencias.length ? (
                        <span className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-800">
                          {equipoIncidencias.length} incidencia{equipoIncidencias.length === 1 ? '' : 's'}
                        </span>
                      ) : null}
                    </div>
                    <Link
                      href={`/equipos/${equipo.id}`}
                      className="mt-2 block font-medium text-slate-950 hover:underline"
                    >
                      {equipo.nombre}
                    </Link>
                    <p className="mt-1 text-sm text-slate-600">
                      {equipo.area ?? 'Sin área'} · {equipo.categoria ?? 'Sin categoría'}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      Próximo: {formatDate(equipo.fecha_proximo_mantenimiento)}
                    </p>
                    {equipoIncidencias.length ? (
                      <div className="mt-2 space-y-1">
                        {equipoIncidencias.slice(0, 2).map((incidencia) => (
                          <Link
                            key={incidencia.id}
                            href={`/incidencias/${incidencia.id}`}
                            className="block text-sm font-medium text-rose-800 hover:underline"
                          >
                            {incidencia.ticket_numero} · {incidencia.descripcion}
                          </Link>
                        ))}
                      </div>
                    ) : null}
                  </article>
                )
              })
            ) : (
              <p className="text-sm text-slate-500">No hay equipos en esta área.</p>
            )}
          </div>
        </aside>
      </section>
    </div>
  )
}
