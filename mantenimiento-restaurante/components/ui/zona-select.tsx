import type { ComponentPropsWithoutRef } from 'react'

type ZonaOption = { id: string; nombre: string | null; label?: string | null; nivel_id?: string | null }
type NivelOption = { id: string; nombre: string; orden: number }

export function ZonaSelect({
  zonas,
  niveles,
  placeholder = 'Selecciona una zona',
  ...props
}: ComponentPropsWithoutRef<'select'> & {
  zonas: ZonaOption[]
  niveles: NivelOption[]
  placeholder?: string
}) {
  const sorted = [...niveles].sort((a, b) => a.orden - b.orden)
  const sinNivel = zonas.filter((z) => !z.nivel_id)

  return (
    <select {...props}>
      <option value="">{placeholder}</option>
      {sorted.map((nivel) => {
        const zonasNivel = zonas.filter((z) => z.nivel_id === nivel.id)
        if (!zonasNivel.length) return null
        return (
          <optgroup key={nivel.id} label={nivel.nombre}>
            {zonasNivel.map((zona) => (
              <option key={zona.id} value={zona.id}>
                {zona.nombre || zona.label}
              </option>
            ))}
          </optgroup>
        )
      })}
      {sinNivel.map((zona) => (
        <option key={zona.id} value={zona.id}>
          {zona.nombre || zona.label}
        </option>
      ))}
    </select>
  )
}
