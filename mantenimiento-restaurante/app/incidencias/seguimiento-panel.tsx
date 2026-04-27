'use client'

import { useActionState, useRef } from 'react'
import type { IncidenciaSeguimiento } from '@/lib/types'
import { agregarSeguimiento } from './actions'
import { initialFormState } from '@/lib/form-state'
import { formatDateTime } from '@/lib/utils'

export function SeguimientoPanel({
  incidenciaId,
  seguimientos,
  usuarioEmail
}: {
  incidenciaId: string
  seguimientos: IncidenciaSeguimiento[]
  usuarioEmail?: string | null
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const action = agregarSeguimiento.bind(null, incidenciaId)

  const [state, formAction, pending] = useActionState(
    async (prev: typeof initialFormState, formData: FormData) => {
      const result = await action(prev, formData)
      if (!result.error) formRef.current?.reset()
      return result
    },
    initialFormState
  )

  return (
    <section className="brand-card rounded-lg p-5 space-y-4">
      <h2 className="text-lg font-semibold">Seguimiento</h2>

      {seguimientos.length > 0 ? (
        <ul className="space-y-3">
          {seguimientos.map((s) => (
            <li
              key={s.id}
              className="rounded-md border border-[rgba(47,62,30,0.1)] bg-[rgba(47,62,30,0.04)] px-4 py-3 dark:border-[rgba(238,227,202,0.1)] dark:bg-[rgba(238,227,202,0.05)]"
            >
              <p className="text-sm text-[color:var(--brand-green)] dark:text-[color:var(--brand-bone)] whitespace-pre-line">
                {s.texto}
              </p>
              <p className="brand-hint mt-2 text-xs">
                {formatDateTime(s.created_at)}
                {s.registrado_por ? ` · ${s.registrado_por}` : ''}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="brand-hint text-sm">Sin actualizaciones registradas aún.</p>
      )}

      <form ref={formRef} action={formAction} className="space-y-3 pt-2 border-t border-[rgba(47,62,30,0.08)] dark:border-[rgba(238,227,202,0.08)]">
        <p className="text-sm font-medium text-[color:var(--brand-ink)]">Agregar actualización</p>
        {state.error && (
          <p className="text-xs text-red-600 dark:text-red-400">{state.error}</p>
        )}
        {usuarioEmail && (
          <input type="hidden" name="registrado_por" value={usuarioEmail} />
        )}
        <textarea
          name="texto"
          required
          rows={3}
          placeholder="¿Qué avanzó? ¿Qué está bloqueado?..."
          className="brand-field w-full"
        />
        <button
          type="submit"
          disabled={pending}
          className="brand-button rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {pending ? 'Guardando...' : 'Registrar actualización'}
        </button>
      </form>
    </section>
  )
}
