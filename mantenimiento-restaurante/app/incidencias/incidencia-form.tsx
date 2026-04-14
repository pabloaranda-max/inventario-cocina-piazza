'use client'

import { useFormState } from 'react-dom'
import type { Equipo } from '@/lib/types'
import { crearIncidencia } from './actions'
import { FormError } from '@/components/ui/flash-message'
import { initialFormState } from '@/lib/form-state'

const prioridades = ['baja', 'media', 'alta', 'urgente']

export function IncidenciaForm({
  equipos,
  selectedEquipoId
}: {
  equipos: Pick<Equipo, 'id' | 'nombre' | 'area'>[]
  selectedEquipoId?: string
}) {
  const [state, formAction] = useFormState(crearIncidencia, initialFormState)

  return (
    <form action={formAction} className="space-y-5 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <FormError message={state.error} />

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Equipo</span>
        <select
          name="equipo_id"
          defaultValue={selectedEquipoId ?? ''}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
        >
          <option value="">Sin equipo especifico</option>
          {equipos.map((equipo) => (
            <option key={equipo.id} value={equipo.id}>
              {equipo.nombre} {equipo.area ? `- ${equipo.area}` : ''}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Descripcion</span>
        <textarea
          name="descripcion"
          required
          rows={5}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
        />
      </label>

      <div className="grid gap-4 md:grid-cols-3">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Prioridad</span>
          <select
            name="prioridad"
            defaultValue="media"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          >
            {prioridades.map((prioridad) => (
              <option key={prioridad} value={prioridad}>
                {prioridad}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Reportado por</span>
          <input name="reportado_por" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Fecha</span>
          <input
            name="fecha_reporte"
            type="date"
            defaultValue={new Date().toISOString().slice(0, 10)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
      </div>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Foto opcional</span>
        <input
          name="foto"
          type="file"
          accept="image/*"
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
        />
      </label>

      <button
        type="submit"
        className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
      >
        Crear incidencia
      </button>
    </form>
  )
}
