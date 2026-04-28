'use client'

import { useState } from 'react'
import { fusionarIncidencia } from './actions'

type IncidenciaOption = {
  id: string
  ticket_numero: string
  descripcion: string
  reportado_por: string | null
}

export function FusionarPanel({
  incidenciaId,
  candidatos
}: {
  incidenciaId: string
  candidatos: IncidenciaOption[]
}) {
  const [open, setOpen] = useState(false)
  const [principalId, setPrincipalId] = useState('')
  const action = fusionarIncidencia.bind(null, incidenciaId)

  if (!candidatos.length) return null

  return (
    <div className="mt-4 border-t border-[rgba(239,169,30,0.2)] pt-4">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-sm font-medium text-[#8f5a00] underline underline-offset-2 dark:text-[#ffd982]"
        >
          Fusionar con otra incidencia pendiente
        </button>
      ) : (
        <form action={action} className="space-y-3">
          <input type="hidden" name="principal_id" value={principalId} />
          <p className="text-sm font-medium text-[#8f5a00] dark:text-[#ffd982]">
            Esta incidencia se cerrará y sus datos quedarán registrados en la principal que elijas.
          </p>
          <select
            value={principalId}
            onChange={(e) => setPrincipalId(e.target.value)}
            className="brand-field w-full"
            required
          >
            <option value="">Selecciona la incidencia principal</option>
            {candidatos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.ticket_numero} · {c.reportado_por ? `${c.reportado_por} · ` : ''}{c.descripcion}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={!principalId}
              className="brand-button rounded-md px-4 py-2 text-sm font-medium disabled:opacity-40"
            >
              Fusionar
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="brand-button-muted rounded-md px-4 py-2 text-sm font-medium"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
