'use client'

import { useFormState } from 'react-dom'
import type { Equipo, Incidencia } from '@/lib/types'
import { actualizarIncidencia, crearIncidencia } from './actions'
import { FormError } from '@/components/ui/flash-message'
import { initialFormState } from '@/lib/form-state'

const prioridades = ['baja', 'media', 'alta', 'urgente']

export function IncidenciaForm({
  equipos,
  selectedEquipoId,
  incidencia
}: {
  equipos: Pick<Equipo, 'id' | 'nombre' | 'area'>[]
  selectedEquipoId?: string
  incidencia?: Incidencia
}) {
  const action = incidencia ? actualizarIncidencia.bind(null, incidencia.id) : crearIncidencia
  const [state, formAction] = useFormState(action, initialFormState)

  return (
    <form action={formAction} className="space-y-5 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <FormError message={state.error} />

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Equipo</span>
        <select
          name="equipo_id"
          defaultValue={incidencia?.equipo_id ?? selectedEquipoId ?? ''}
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
          defaultValue={incidencia?.descripcion ?? ''}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
        />
      </label>

      <div className="grid gap-4 md:grid-cols-3">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Prioridad</span>
          <select
            name="prioridad"
            defaultValue={incidencia?.prioridad ?? 'media'}
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
          <input
            name="reportado_por"
            defaultValue={incidencia?.reportado_por ?? ''}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Fecha</span>
          <input
            name="fecha_reporte"
            type="date"
            defaultValue={incidencia?.fecha_reporte ?? new Date().toISOString().slice(0, 10)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
      </div>

      {incidencia ? (
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Estado</span>
          <select
            name="estado"
            defaultValue={incidencia.estado}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          >
            <option value="abierta">abierta</option>
            <option value="en_progreso">en_progreso</option>
            <option value="resuelta">resuelta</option>
            <option value="cerrada">cerrada</option>
          </select>
        </label>
      ) : null}

      <label className="block">
        <span className="text-sm font-medium text-slate-700">
          {incidencia ? 'Reemplazar foto' : 'Foto opcional'}
        </span>
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
        {incidencia ? 'Guardar cambios' : 'Crear incidencia'}
      </button>
    </form>
  )
}
