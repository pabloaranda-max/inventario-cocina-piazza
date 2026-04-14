import type { Equipo, Proveedor } from '@/lib/types'
import { crearEquipo, actualizarEquipo } from './actions'

const estados = [
  ['operativo', 'Operativo'],
  ['en_reparacion', 'En reparación'],
  ['fuera_de_servicio', 'Fuera de servicio'],
  ['pendiente_revision', 'Pendiente revisión']
]

export function EquipoForm({
  equipo,
  proveedores
}: {
  equipo?: Equipo
  proveedores: Proveedor[]
}) {
  const action = equipo ? actualizarEquipo.bind(null, equipo.id) : crearEquipo

  return (
    <form action={action} className="space-y-5 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Nombre" name="nombre" defaultValue={equipo?.nombre} required />
        <Field label="Area" name="area" defaultValue={equipo?.area} />
        <Field label="Categoria" name="categoria" defaultValue={equipo?.categoria} />
        <Field label="Marca" name="marca" defaultValue={equipo?.marca} />
        <Field label="Modelo" name="modelo" defaultValue={equipo?.modelo} />
        <Field label="Numero de serie" name="numero_serie" defaultValue={equipo?.numero_serie} />

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Estado</span>
          <select
            name="estado"
            defaultValue={equipo?.estado ?? 'operativo'}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          >
            {estados.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Proveedor habitual</span>
          <select
            name="proveedor_id"
            defaultValue={equipo?.proveedor_id ?? ''}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          >
            <option value="">Sin proveedor</option>
            {proveedores.map((proveedor) => (
              <option key={proveedor.id} value={proveedor.id}>
                {proveedor.nombre}
              </option>
            ))}
          </select>
        </label>

        <Field
          label="Ultimo mantenimiento"
          name="fecha_ultimo_mantenimiento"
          type="date"
          defaultValue={equipo?.fecha_ultimo_mantenimiento}
        />
        <Field
          label="Proximo mantenimiento"
          name="fecha_proximo_mantenimiento"
          type="date"
          defaultValue={equipo?.fecha_proximo_mantenimiento}
        />

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Foto general</span>
          <input
            name="foto"
            type="file"
            accept="image/*"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Foto de placa</span>
          <input
            name="foto_placa"
            type="file"
            accept="image/*"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
      </div>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Notas</span>
        <textarea
          name="notas"
          defaultValue={equipo?.notas ?? ''}
          rows={4}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
        />
      </label>

      <button
        type="submit"
        className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
      >
        {equipo ? 'Guardar cambios' : 'Crear equipo'}
      </button>
    </form>
  )
}

function Field({
  label,
  name,
  defaultValue,
  type = 'text',
  required = false
}: {
  label: string
  name: string
  defaultValue?: string | null
  type?: string
  required?: boolean
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue ?? ''}
        required={required}
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
      />
    </label>
  )
}
