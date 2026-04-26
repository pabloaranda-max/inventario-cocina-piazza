'use client'

import { useActionState, useState } from 'react'
import type { Activo, ClaseActivo, MapaNivel, MapaZona } from '@/lib/types'
import { ZonaSelect } from '@/components/ui/zona-select'
import { asignarIncidencia, crearActivoRapido } from './actions'
import { initialFormState } from '@/lib/form-state'

const clases = ['equipo', 'infraestructura', 'mobiliario', 'edificacion', 'sistema']

type ActivoItem = { id: string; nombre: string; area: string | null; clase: ClaseActivo; tipo: string }
type ZonaItem = Pick<MapaZona, 'id' | 'nombre' | 'area' | 'label' | 'nivel_id'>
type NivelItem = Pick<MapaNivel, 'id' | 'nombre' | 'orden'>

export function AsignarPanel({
  incidenciaId,
  activos: activosInit,
  zonas,
  niveles,
}: {
  incidenciaId: string
  activos: ActivoItem[]
  zonas: ZonaItem[]
  niveles: NivelItem[]
}) {
  const [activos, setActivos] = useState<ActivoItem[]>(activosInit)
  const [selectedActivoId, setSelectedActivoId] = useState('')
  const [selectedZonaId, setSelectedZonaId] = useState('')
  const [zonaTexto, setZonaTexto] = useState('')
  const [showNuevoActivo, setShowNuevoActivo] = useState(false)

  const [nuevoActivoState, nuevoActivoAction, nuevoActivoPending] = useActionState(
    async (state: typeof initialFormState, formData: FormData) => {
      const result = await crearActivoRapido(state, formData)
      if (result.activo) {
        setActivos((prev) => [...prev, result.activo! as ActivoItem])
        setSelectedActivoId(result.activo.id)
        setShowNuevoActivo(false)
      }
      return result
    },
    initialFormState
  )

  const asignar = asignarIncidencia.bind(null, incidenciaId)

  return (
    <div className="space-y-4">
      <form action={asignar} className="space-y-4">
        <input type="hidden" name="zona_texto" value={zonaTexto} />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-orange-800 dark:text-orange-300">Activo</label>
            <select
              name="activo_id"
              value={selectedActivoId}
              onChange={(e) => setSelectedActivoId(e.target.value)}
              className="mt-1 w-full rounded-md border border-orange-200 bg-white px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-600 dark:text-white"
            >
              <option value="">Sin activo específico</option>
              {activos.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre} · {a.tipo}{a.area ? ` · ${a.area}` : ''}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setShowNuevoActivo((v) => !v)}
              className="mt-1.5 text-xs font-medium text-orange-700 hover:underline dark:text-orange-400"
            >
              {showNuevoActivo ? '✕ Cancelar' : '＋ Nuevo activo'}
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-orange-800 dark:text-orange-300">Zona del mapa</label>
            <ZonaSelect
              name="zona_id"
              value={selectedZonaId}
              onChange={(e) => { setSelectedZonaId(e.target.value); if (e.target.value) setZonaTexto('') }}
              className="mt-1 w-full rounded-md border border-orange-200 bg-white px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-600 dark:text-white"
              placeholder="Sin zona del mapa"
              zonas={zonas}
              niveles={niveles}
            />
            {!selectedZonaId && (
              <input
                type="text"
                placeholder="O escribe la ubicación..."
                value={zonaTexto}
                onChange={(e) => setZonaTexto(e.target.value)}
                className="mt-1.5 w-full rounded-md border border-orange-200 bg-white px-3 py-2 text-sm placeholder-orange-300 dark:bg-slate-800 dark:border-slate-600 dark:text-white dark:placeholder-slate-500"
              />
            )}
          </div>
        </div>

        <button
          type="submit"
          className="rounded-md bg-orange-700 px-4 py-2 text-sm font-medium text-white hover:bg-orange-800 dark:bg-orange-800 dark:hover:bg-orange-700"
        >
          Confirmar y abrir incidencia
        </button>
      </form>

      {showNuevoActivo && (
        <form action={nuevoActivoAction} className="rounded-md border border-orange-200 bg-orange-50/60 p-4 space-y-3 dark:bg-slate-800/60 dark:border-slate-600">
          <p className="text-sm font-semibold text-orange-800 dark:text-orange-300">Nuevo activo</p>
          {nuevoActivoState.error && (
            <p className="text-xs text-red-600">{nuevoActivoState.error}</p>
          )}
          <input type="hidden" name="zona_id" value={selectedZonaId} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-medium text-orange-700 dark:text-orange-400">Nombre *</span>
              <input
                name="nombre"
                required
                placeholder="ej. Freidora principal"
                className="mt-0.5 w-full rounded-md border border-orange-200 bg-white px-3 py-1.5 text-sm dark:bg-slate-800 dark:border-slate-600 dark:text-white"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-orange-700 dark:text-orange-400">Clase *</span>
              <select
                name="clase"
                required
                className="mt-0.5 w-full rounded-md border border-orange-200 bg-white px-3 py-1.5 text-sm dark:bg-slate-800 dark:border-slate-600 dark:text-white"
              >
                <option value="">Seleccionar</option>
                {clases.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-orange-700 dark:text-orange-400">Tipo *</span>
              <input
                name="tipo"
                required
                placeholder="ej. Freidora, Mesa, Bomba"
                className="mt-0.5 w-full rounded-md border border-orange-200 bg-white px-3 py-1.5 text-sm dark:bg-slate-800 dark:border-slate-600 dark:text-white"
              />
            </label>
          </div>
          <p className="text-xs text-orange-700 dark:text-orange-400">
            {selectedZonaId ? 'El activo se creará dentro de la zona seleccionada.' : 'Primero selecciona una zona del mapa para poder crear el activo.'}
          </p>
          <button
            type="submit"
            disabled={nuevoActivoPending || !selectedZonaId}
            className="rounded-md bg-orange-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-800 disabled:opacity-50"
          >
            {nuevoActivoPending ? 'Guardando...' : 'Crear y seleccionar'}
          </button>
        </form>
      )}
    </div>
  )
}
