'use client'

import { useMemo, useRef, useState } from 'react'
import { useFormState } from 'react-dom'
import Image from 'next/image'
import Link from 'next/link'
import { guardarMapaZonas } from './actions'
import type { Equipo, EstadoIncidencia, MapaZona, PrioridadIncidencia } from '@/lib/types'
import { initialFormState } from '@/lib/form-state'
import { FormError } from '@/components/ui/flash-message'
import { formatDate } from '@/lib/utils'
import { StatusBadge } from '@/components/ui/status-badge'

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
  incidencias,
  zonas
}: {
  equipos: Equipo[]
  incidencias: MapaIncidencia[]
  zonas: MapaZona[]
}) {
  const [selectedArea, setSelectedArea] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [editableZonas, setEditableZonas] = useState(zonas)
  const [state, formAction] = useFormState(guardarMapaZonas, initialFormState)
  const mapRef = useRef<HTMLDivElement>(null)

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

  const areas = useMemo(() => {
    return Array.from(new Set([...equipos.map((equipo) => equipo.area ?? 'Sin área'), ...editableZonas.map((zona) => zona.area)]))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'es'))
  }, [editableZonas, equipos])

  const visibleEquipos = selectedArea
    ? equipos.filter((equipo) => (equipo.area ?? 'Sin área') === selectedArea)
    : equipos

  function moveZona(id: string, clientX: number, clientY: number) {
    const rect = mapRef.current?.getBoundingClientRect()
    if (!rect) return

    const x = ((clientX - rect.left) / rect.width) * 100
    const y = ((clientY - rect.top) / rect.height) * 100

    setEditableZonas((current) =>
      current.map((zona) =>
        zona.id === id
          ? {
              ...zona,
              x: Number(Math.min(100, Math.max(0, x)).toFixed(3)),
              y: Number(Math.min(100, Math.max(0, y)).toFixed(3))
            }
          : zona
      )
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">Mapa operativo</h1>
          <p className="text-sm text-slate-600">Plano del restaurante con equipos por área.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setEditing((value) => !value)}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100"
          >
            {editing ? 'Salir de edición' : 'Editar mapa'}
          </button>
          <Link
            href="/equipos/nuevo"
            className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Nuevo equipo
          </Link>
        </div>
      </div>

      <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div ref={mapRef} className="relative">
            <Image
              src="/planos-layout-actual.png"
              alt="Plano del restaurante"
              width={1152}
              height={768}
              className="block w-full select-none"
              priority
            />
            {editableZonas.map((zona) => {
              const total = equiposPorArea[zona.area]?.length ?? 0
              const active = equiposPorArea[zona.area]?.some(
                (equipo) => (incidenciasPorEquipo[equipo.id]?.length ?? 0) > 0
              )

              return (
                <button
                  key={zona.id}
                  type="button"
                  draggable={editing}
                  onDragEnd={(event) => moveZona(zona.id, event.clientX, event.clientY)}
                  onClick={() => {
                    if (!editing) setSelectedArea(selectedArea === zona.area ? null : zona.area)
                  }}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-md border px-2 py-1 text-xs font-semibold shadow-sm ${
                    editing
                      ? 'cursor-move border-slate-950 bg-white text-slate-950 ring-2 ring-slate-950'
                      : selectedArea === zona.area
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
          {editing ? (
            <form action={formAction} className="space-y-4">
              <div>
                <h2 className="font-semibold text-slate-950">Editar mapa</h2>
                <p className="text-sm text-slate-600">Arrastra puntos y ajusta nombre o área.</p>
              </div>
              <FormError message={state.error} />
              <input
                type="hidden"
                name="zonas"
                value={JSON.stringify(
                  editableZonas.map(({ id, area, label, x, y }) => ({ id, area, label, x, y }))
                )}
              />
              <div className="max-h-[520px] space-y-3 overflow-auto pr-1">
                {editableZonas.map((zona) => (
                  <div key={zona.id} className="rounded-md border border-slate-200 p-3">
                    <label className="block">
                      <span className="text-xs font-medium text-slate-600">Texto visible</span>
                      <input
                        value={zona.label}
                        onChange={(event) =>
                          setEditableZonas((current) =>
                            current.map((item) => (item.id === zona.id ? { ...item, label: event.target.value } : item))
                          )
                        }
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="mt-2 block">
                      <span className="text-xs font-medium text-slate-600">Área asociada</span>
                      <select
                        value={zona.area}
                        onChange={(event) =>
                          setEditableZonas((current) =>
                            current.map((item) => (item.id === zona.id ? { ...item, area: event.target.value } : item))
                          )
                        }
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      >
                        {areas.map((area) => (
                          <option key={area} value={area}>
                            {area}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p className="mt-2 text-xs text-slate-500">
                      X {zona.x.toFixed(1)}% · Y {zona.y.toFixed(1)}%
                    </p>
                  </div>
                ))}
              </div>
              <button
                type="submit"
                className="w-full rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                Guardar mapa
              </button>
            </form>
          ) : (
            <EquipoPanel
              equipos={visibleEquipos}
              selectedArea={selectedArea}
              incidenciasPorEquipo={incidenciasPorEquipo}
              onClearArea={() => setSelectedArea(null)}
            />
          )}
        </aside>
      </section>
    </div>
  )
}

function EquipoPanel({
  equipos,
  selectedArea,
  incidenciasPorEquipo,
  onClearArea
}: {
  equipos: Equipo[]
  selectedArea: string | null
  incidenciasPorEquipo: Record<string, MapaIncidencia[]>
  onClearArea: () => void
}) {
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-950">{selectedArea ?? 'Todas las áreas'}</h2>
          <p className="text-sm text-slate-600">{equipos.length} equipos</p>
        </div>
        {selectedArea ? (
          <button
            type="button"
            onClick={onClearArea}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 hover:bg-slate-100"
          >
            Ver todo
          </button>
        ) : null}
      </div>

      <div className="mt-4 space-y-3">
        {equipos.length ? (
          equipos.map((equipo) => {
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
                <Link href={`/equipos/${equipo.id}`} className="mt-2 block font-medium text-slate-950 hover:underline">
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
    </>
  )
}
