'use client'

import { useActionState } from 'react'
import type { Proveedor } from '@/lib/types'
import { actualizarProveedor, crearProveedor } from './actions'
import { FormError } from '@/components/ui/flash-message'
import { MultipleDefinedCheckboxes } from '@/components/ui/defined-fields'
import { proveedorEspecialidades } from '@/lib/defined-options'
import { initialFormState } from '@/lib/form-state'

export function ProveedorForm({ proveedor }: { proveedor?: Proveedor }) {
  const action = proveedor ? actualizarProveedor.bind(null, proveedor.id) : crearProveedor
  const [state, formAction] = useActionState(action, initialFormState)

  return (
    <form action={formAction} className="brand-shell space-y-5 rounded-lg p-5">
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
        <span className="brand-label">Notas</span>
        <textarea
          name="notas"
          defaultValue={proveedor?.notas ?? ''}
          rows={4}
          className="brand-field mt-1"
        />
      </label>

      <button
        type="submit"
        className="brand-button rounded-md px-4 py-2 text-sm font-medium"
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
      <span className="brand-label">{label}</span>
      <input
        name={name}
        defaultValue={defaultValue ?? ''}
        required={required}
        className="brand-field mt-1"
      />
    </label>
  )
}
