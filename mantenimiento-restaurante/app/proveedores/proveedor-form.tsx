'use client'

import { useFormState } from 'react-dom'
import type { Proveedor } from '@/lib/types'
import { actualizarProveedor, crearProveedor } from './actions'
import { FormError } from '@/components/ui/flash-message'
import { MultipleDefinedCheckboxes } from '@/components/ui/defined-fields'
import { proveedorEspecialidades } from '@/lib/defined-options'
import { initialFormState } from '@/lib/form-state'

export function ProveedorForm({ proveedor }: { proveedor?: Proveedor }) {
  const action = proveedor ? actualizarProveedor.bind(null, proveedor.id) : crearProveedor
  const [state, formAction] = useFormState(action, initialFormState)

  return (
    <form action={formAction} className="space-y-5 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <FormError message={state.error} />

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Nombre" name="nombre" defaultValue={proveedor?.nombre} required />
        <Field label="Contacto principal" name="contacto" defaultValue={proveedor?.contacto} />
        <Field label="Puesto principal" name="puesto_contacto" defaultValue={proveedor?.puesto_contacto} />
        <Field label="Teléfono principal" name="telefono" defaultValue={proveedor?.telefono} />
        <Field
          label="Contacto secundario"
          name="contacto_secundario"
          defaultValue={proveedor?.contacto_secundario}
        />
        <Field
          label="Puesto secundario"
          name="puesto_contacto_secundario"
          defaultValue={proveedor?.puesto_contacto_secundario}
        />
        <Field
          label="Teléfono secundario"
          name="telefono_secundario"
          defaultValue={proveedor?.telefono_secundario}
        />
      </div>

      <MultipleDefinedCheckboxes
        label="Especialidades"
        name="especialidad"
        otherName="especialidad_otro"
        options={proveedorEspecialidades}
        defaultValue={proveedor?.especialidad}
      />

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
