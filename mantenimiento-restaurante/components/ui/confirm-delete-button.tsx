'use client'

import { useState } from 'react'

export function ConfirmDeleteButton({
  label = 'Eliminar',
  firstPrompt,
  secondPrompt,
  className = 'rounded-md border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-800 hover:bg-rose-100 dark:bg-rose-950 dark:border-rose-800 dark:text-rose-300'
}: {
  label?: string
  firstPrompt: string
  secondPrompt: string
  className?: string
}) {
  const [armed, setArmed] = useState(false)

  return (
    <button
      type={armed ? 'submit' : 'button'}
      onClick={(event) => {
        if (!armed) {
          event.preventDefault()
          if (window.confirm(firstPrompt)) setArmed(true)
          return
        }

        if (!window.confirm(secondPrompt)) {
          event.preventDefault()
          setArmed(false)
        }
      }}
      className={className}
    >
      {armed ? 'Confirmar eliminación' : label}
    </button>
  )
}
