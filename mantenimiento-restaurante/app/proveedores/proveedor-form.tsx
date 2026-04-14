import type { Proveedor } from '@/lib/types'
import { actualizarProveedor, crearProveedor } from './actions'

export function ProveedorForm({ proveedor }: { proveedor?: Proveedor }) {
  const action = proveedor ? actualizarProveedor.bind(null, proveedor.id) : crearProveedor

  return (
    <form action={action} className="space-y-5 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Nombre" name="nombre" defaultValue={proveedor?.nombre} required />
        <Field label="Especialidad" name="especialidad" defaultValue={proveedor?.especialidad} />
        <Field label="Telefono" name="telefono" defaultValue={proveedor?.telefono} />
        <Field label="Contacto" name="contacto" defaultValue={proveedor?.contacto} />
      </div>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Notas</span>
        <textarea
          name="notas"
          defaultValue={proveedor?.notas ?? ''}
          rows={4}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
        />
      </label>

      <button
        type="submit"
        className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
      >
        {proveedor ? 'Guardar cambios' : 'Crear proveedor'}
      </button>
    </form>
  )
}

function Field({
  label,
  name,
  defaultValue,
  required = false
}: {
  label: string
  name: string
  defaultValue?: string | null
  required?: boolean
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        name={name}
        defaultValue={defaultValue ?? ''}
        required={required}
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
      />
    </label>
  )
}
