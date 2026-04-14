import type { Equipo } from '@/lib/types'
import { crearMantenimiento } from './actions'

export function MantenimientoForm({ equipos }: { equipos: Pick<Equipo, 'id' | 'nombre' | 'area'>[] }) {
  return (
    <form action={crearMantenimiento} className="space-y-5 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Equipo</span>
          <select name="equipo_id" required className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2">
            <option value="">Selecciona equipo</option>
            {equipos.map((equipo) => (
              <option key={equipo.id} value={equipo.id}>
                {equipo.nombre} {equipo.area ? `- ${equipo.area}` : ''}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Tipo</span>
          <select name="tipo" defaultValue="preventivo" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2">
            <option value="preventivo">Preventivo</option>
            <option value="correctivo">Correctivo</option>
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Realizado por</span>
          <input name="realizado_por" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Costo</span>
          <input
            name="costo"
            type="number"
            min="0"
            step="0.01"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Fecha de realizacion</span>
          <input
            name="fecha_realizacion"
            type="date"
            defaultValue={new Date().toISOString().slice(0, 10)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Proxima fecha sugerida</span>
          <input name="proxima_fecha_sugerida" type="date" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
        </label>
      </div>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Descripcion</span>
        <textarea
          name="descripcion"
          required
          rows={5}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Repuestos o notas</span>
        <textarea
          name="repuestos_notas"
          rows={3}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
        />
      </label>

      <button
        type="submit"
        className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
      >
        Registrar mantenimiento
      </button>
    </form>
  )
}
