'use client'

import { useState } from 'react'
import { otherPrefix, parseDefinedValues } from '@/lib/defined-options'

export function SingleDefinedSelect({
  label,
  name,
  otherName,
  options,
  defaultValue
}: {
  label: string
  name: string
  otherName: string
  options: string[]
  defaultValue?: string | null
}) {
  const parsed = parseDefinedValues(defaultValue)
  const initial = parsed.other ? otherPrefix : parsed.selected[0] ?? ''
  const [selected, setSelected] = useState(initial)

    return (
    <div className="space-y-2">
      <label className="block">
        <span className="brand-label">{label}</span>
        <select
          name={name}
          defaultValue={initial}
          onChange={(event) => setSelected(event.target.value)}
          className="brand-field mt-1"
        >
          <option value="">Sin dato</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
          <option value={otherPrefix}>Otro</option>
        </select>
      </label>
      {selected === otherPrefix ? (
        <input
          name={otherName}
          defaultValue={parsed.other}
          placeholder="Especificar otro"
          className="brand-field"
        />
      ) : null}
    </div>
  )
}

export function MultipleDefinedCheckboxes({
  label,
  name,
  otherName,
  options,
  defaultValue
}: {
  label: string
  name: string
  otherName: string
  options: string[]
  defaultValue?: string | null
}) {
  const parsed = parseDefinedValues(defaultValue)
  const [otherSelected, setOtherSelected] = useState(Boolean(parsed.other))

  return (
    <fieldset className="brand-card space-y-3 rounded-md p-3">
      <legend className="brand-label px-1">{label}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => (
          <label key={option} className="flex items-center gap-2 text-sm text-[color:var(--brand-green)] dark:text-[color:var(--brand-bone)]">
            <input
              type="checkbox"
              name={name}
              value={option}
              defaultChecked={parsed.selected.includes(option)}
              className="h-4 w-4 rounded border-[color:color-mix(in_srgb,var(--brand-olive)_22%,transparent)] text-[color:var(--brand-wine)] accent-[color:var(--brand-wine)]"
            />
            {option}
          </label>
        ))}
        <label className="flex items-center gap-2 text-sm text-[color:var(--brand-green)] dark:text-[color:var(--brand-bone)]">
          <input
            type="checkbox"
            name={name}
            value={otherPrefix}
            defaultChecked={otherSelected}
            onChange={(event) => setOtherSelected(event.target.checked)}
            className="h-4 w-4 rounded border-[color:color-mix(in_srgb,var(--brand-olive)_22%,transparent)] text-[color:var(--brand-wine)] accent-[color:var(--brand-wine)]"
          />
          Otro
        </label>
      </div>
      {otherSelected ? (
        <input
          name={otherName}
          defaultValue={parsed.other}
          placeholder="Especificar otro"
          className="brand-field"
        />
      ) : null}
    </fieldset>
  )
}
