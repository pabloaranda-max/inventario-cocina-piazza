'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useMemo, useRef, useState } from 'react'
import { useFormState } from 'react-dom'
import { actualizarUbicacionActivo } from '../../actions'
import { initialFormState } from '@/lib/form-state'
import { FormError } from '@/components/ui/flash-message'
import type { Activo, MapaNivel, MapaZona } from '@/lib/types'

type UbicacionActivo = Pick<Activo, 'id' | 'nombre' | 'tipo' | 'area' | 'clase' | 'nivel_id' | 'x' | 'y' | 'zona_id'>

export function UbicacionActivoForm({
  activo,
  niveles,
  zonas
}: {
  activo: UbicacionActivo
  niveles: MapaNivel[]
  zonas: MapaZona[]
}) {
  const defaultNivelId = activo.nivel_id ?? niveles[0]?.id ?? ''
  const [nivelId, setNivelId] = useState(defaultNivelId)
  const [x, setX] = useState<number | null>(activo.x)
  const [y, setY] = useState<number | null>(activo.y)
  const [zonaId, setZonaId] = useState(activo.zona_id ?? '')
  const [dragging, setDragging] = useState(false)
  const [zoom, setZoom] = useState(1)
  const mapRef = useRef<HTMLDivElement>(null)
  const action = actualizarUbicacionActivo.bind(null, activo.id)
  const [state, formAction] = useFormState(action, initialFormState)

  const selectedNivel = niveles.find((nivel) => nivel.id === nivelId) ?? niveles[0]
  const zonasNivel = useMemo(
    () => zonas.filter((zona) => zona.nivel_id === selectedNivel?.id),
    [zonas, selectedNivel?.id]
  )
  const selectedZona = zonas.find((zona) => zona.id === zonaId)
  const zoomPercent = Math.round(zoom * 100)

  function updateZoom(nextZoom: number) {
    setZoom(Number(Math.min(2.5, Math.max(1, nextZoom)).toFixed(2)))
  }

  function placeFromPointer(clientX: number, clientY: number) {
    const rect = mapRef.current?.getBoundingClientRect()
    if (!rect) return

    const nextX = ((clientX - rect.left) / rect.width) * 100
    const nextY = ((clientY - rect.top) / rect.height) * 100
    setX(Number(Math.min(100, Math.max(0, nextX)).toFixed(3)))
    setY(Number(Math.min(100, Math.max(0, nextY)).toFixed(3)))
  }

  return (
    <form action={formAction} className="space-y-5">
      <FormError message={state.error} />
      <input type="hidden" name="nivel_id" value={nivelId} />
      <input type="hidden" name="x" value={x ?? ''} />
      <input type="hidden" name="y" value={y ?? ''} />
      <input type="hidden" name="zona_id" value={zonaId} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="brand-hint">
            {activo.area ?? 'Sin zona'} · {activo.tipo}
          </p>
          <h2 className="text-xl font-semibold text-[color:var(--brand-ink)]">{activo.nombre}</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/activos/${activo.id}`} className="brand-button-muted">
            Cancelar
          </Link>
          <button type="submit" className="brand-button">
            Guardar ubicación
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <section className="brand-card overflow-hidden">
          <div className="flex gap-2 overflow-x-auto border-b border-[color:color-mix(in_srgb,var(--brand-olive)_12%,transparent)] p-3">
            {niveles.map((nivel) => (
              <button
                key={nivel.id}
                type="button"
                onClick={() => {
                  setNivelId(nivel.id)
                  setZonaId('')
                  setX(null)
                  setY(null)
                }}
                className={`shrink-0 rounded-md border px-3 py-2 text-sm font-medium ${
                  selectedNivel?.id === nivel.id
                    ? 'border-[color:var(--brand-wine)] bg-[color:var(--brand-wine)] text-[color:var(--brand-bone)]'
                    : 'border-[color:color-mix(in_srgb,var(--brand-olive)_22%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-bone)_76%,white)] text-[color:var(--brand-olive)] hover:bg-[color:color-mix(in_srgb,var(--brand-bone)_92%,white)]'
                }`}
              >
                {nivel.nombre}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[color:color-mix(in_srgb,var(--brand-olive)_12%,transparent)] p-3">
            <span className="text-sm font-medium text-[color:var(--brand-olive)]">Zoom {zoomPercent}%</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => updateZoom(zoom - 0.25)}
                className="brand-button-muted px-3 py-1.5 disabled:opacity-40"
                disabled={zoom <= 1}
              >
                -
              </button>
              <button
                type="button"
                onClick={() => updateZoom(1)}
                className="brand-button-muted px-3 py-1.5"
              >
                100%
              </button>
              <button
                type="button"
                onClick={() => updateZoom(zoom + 0.25)}
                className="brand-button-muted px-3 py-1.5 disabled:opacity-40"
                disabled={zoom >= 2.5}
              >
                +
              </button>
            </div>
          </div>

          <div className="max-h-[72vh] overflow-auto">
            <div
              ref={mapRef}
              className="relative min-w-full cursor-crosshair touch-none"
              style={{ width: `${zoom * 100}%` }}
              onClick={(event) => placeFromPointer(event.clientX, event.clientY)}
              onPointerMove={(event) => {
                if (dragging) placeFromPointer(event.clientX, event.clientY)
              }}
              onPointerUp={() => setDragging(false)}
              onPointerCancel={() => setDragging(false)}
            >
              {selectedNivel ? (
                <Image
                  src={selectedNivel.imagen_url}
                  alt={selectedNivel.nombre}
                  width={1366}
                  height={768}
                  className="block w-full select-none"
                  priority
                />
              ) : (
                <div className="flex h-96 items-center justify-center bg-[color:color-mix(in_srgb,var(--brand-bone)_86%,white)] text-sm text-[color:var(--brand-muted)]">
                  Sin planos cargados.
                </div>
              )}

              {zonasNivel.map((zona) => (
                <button
                  key={zona.id}
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    setZonaId(zona.id)
                  }}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-md border px-2 py-1 text-xs font-semibold shadow-sm ${
                    zonaId === zona.id
                      ? 'border-[color:var(--brand-wine)] bg-[color:var(--brand-wine)] text-[color:var(--brand-bone)]'
                      : zona.tipo === 'subzona'
                        ? 'border-[color:color-mix(in_srgb,var(--brand-olive)_28%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-olive)_12%,white)] text-[color:var(--brand-olive)] hover:bg-[color:color-mix(in_srgb,var(--brand-olive)_18%,white)]'
                        : 'border-[color:color-mix(in_srgb,var(--brand-olive)_18%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-bone)_76%,white)] text-[color:var(--brand-olive)] hover:bg-[color:color-mix(in_srgb,var(--brand-bone)_92%,white)]'
                  }`}
                  style={{ left: `${zona.x}%`, top: `${zona.y}%` }}
                >
                  {zona.label}
                </button>
              ))}

              {x !== null && y !== null ? (
                <button
                  type="button"
                  aria-label="Mover activo"
                  onPointerDown={(event) => {
                    event.stopPropagation()
                    setDragging(true)
                    event.currentTarget.setPointerCapture(event.pointerId)
                  }}
                  className="absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-white bg-rose-500 shadow-lg ring-2 ring-rose-700 active:cursor-grabbing"
                  style={{ left: `${x}%`, top: `${y}%` }}
                />
              ) : null}
            </div>
          </div>
        </section>

        <aside className="brand-card p-4">
          <div>
            <h3 className="font-semibold text-[color:var(--brand-ink)]">Ubicación</h3>
            <p className="mt-1 text-sm text-[color:var(--brand-muted)]">
              Haz clic en el plano para colocar el pin. Arrastra el pin para ajustar.
            </p>
          </div>

          <label className="mt-4 block">
            <span className="text-sm font-medium text-[color:var(--brand-olive)]">Zona o subzona</span>
            <select
              value={zonaId}
              onChange={(event) => setZonaId(event.target.value)}
              className="brand-field mt-1 w-full px-3 py-2 text-sm"
            >
              <option value="">Sin cambio de zona</option>
              {zonasNivel.map((zona) => (
                <option key={zona.id} value={zona.id}>
                  {zona.tipo === 'subzona' ? 'Subzona' : 'Zona'} · {zona.nombre}
                </option>
              ))}
            </select>
          </label>

          <dl className="mt-4 space-y-2 text-sm text-[color:var(--brand-muted)]">
            <div className="flex justify-between gap-3">
              <dt>Nivel</dt>
              <dd className="font-medium text-[color:var(--brand-ink)]">{selectedNivel?.nombre ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Zona</dt>
              <dd className="text-right font-medium text-[color:var(--brand-ink)]">
                {selectedZona?.nombre ?? 'Sin cambio'}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Pin</dt>
              <dd className="font-medium text-[color:var(--brand-ink)]">
                {x !== null && y !== null ? `${x.toFixed(1)}, ${y.toFixed(1)}` : 'Sin punto'}
              </dd>
            </div>
          </dl>

          <label className="mt-4 flex items-center gap-2 rounded-md border border-[color:color-mix(in_srgb,var(--brand-olive)_14%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-bone)_76%,white)] p-3 text-sm text-[color:var(--brand-olive)]">
            <input
              type="checkbox"
              name="quitar_ubicacion"
              className="h-4 w-4 rounded border-[color:color-mix(in_srgb,var(--brand-olive)_22%,transparent)] text-[color:var(--brand-wine)] accent-[color:var(--brand-wine)]"
            />
            Quitar ubicación del mapa
          </label>
        </aside>
      </div>
    </form>
  )
}
