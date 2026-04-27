'use client'

import { useActionState } from 'react'
import { aplicarMantenimiento } from './actions'
import { FormError } from '@/components/ui/flash-message'
import { initialFormState } from '@/lib/form-state'
import { todayMX } from '@/lib/utils'

export function AplicarPanel({
  mantenimientoId,
  costoEstimado,
  ejecucionTipo,
  requiereMaterial,
}: {
  mantenimientoId: string
  costoEstimado: number | null
  ejecucionTipo: 'interno' | 'externo'
  requiereMaterial: boolean
}) {
  const action = aplicarMantenimiento.bind(null, mantenimientoId)
  const [state, formAction] = useActionState(action, initialFormState)
  const showCosto = ejecucionTipo === 'externo' || requiereMaterial

  return (
    <section className="brand-card rounded-lg border-[rgba(239,169,30,0.22)] bg-[rgba(239,169,30,0.12)] p-5 dark:border-[rgba(239,169,30,0.24)] dark:bg-[rgba(239,169,30,0.16)]">
      <h2 className="text-base font-semibold text-[#8f5a00] dark:text-[#ffd982]">Mantenimiento planeado</h2>
      <p className="mt-1 text-sm text-[#8f5a00] dark:text-[#ffd982]">
        Este mantenimiento aún no se ha aplicado. Complétalo cuando se realice.
      </p>

      <form action={formAction} className="mt-4 space-y-4">
        <FormError message={state.error} />

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="brand-label">Fecha de realización</span>
            <input
              name="fecha_realizacion"
              type="date"
              defaultValue={todayMX()}
              required
              className="brand-field mt-1"
            />
          </label>

          <label className="block">
            <span className="brand-label">Próxima fecha sugerida</span>
            <input
              name="proxima_fecha_sugerida"
              type="date"
              className="brand-field mt-1"
            />
          </label>

          {showCosto && (
            <label className="block">
              <span className="brand-label">
                Costo real{costoEstimado != null ? ` (estimado: $${costoEstimado})` : ''}
              </span>
              <input
                name="costo"
                type="number"
                min="0"
                step="0.01"
                defaultValue={costoEstimado ?? ''}
                className="brand-field mt-1"
              />
            </label>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm text-[#8f5a00] dark:text-[#ffd982]">
          <input
            name="marcar_operativo"
            type="checkbox"
            className="h-4 w-4 rounded accent-[color:var(--brand-wine)]"
          />
          Marcar el activo como operativo
        </label>

        <button
          type="submit"
          className="brand-button rounded-md px-4 py-2 text-sm font-medium"
        >
          Aplicar mantenimiento
        </button>
      </form>
    </section>
  )
}
