type GlobalSearchFormProps = {
  defaultValue?: string
  compact?: boolean
  autoFocus?: boolean
}

export function GlobalSearchForm({
  defaultValue,
  compact = false,
  autoFocus = false
}: GlobalSearchFormProps) {
  return (
    <form
      action="/buscar"
      method="get"
      className={`flex items-center gap-2 ${compact ? 'w-full md:w-auto' : 'w-full'}`}
    >
      <label className={`min-w-0 flex-1 ${compact ? 'md:w-[13rem] xl:w-[15rem]' : ''}`}>
        <span className="sr-only">Buscar en la app</span>
        <input
          type="search"
          name="q"
          defaultValue={defaultValue}
          autoFocus={autoFocus}
          placeholder="Buscar activo, ticket, proveedor..."
          minLength={2}
          className={`brand-field ${compact ? 'py-2 text-sm' : ''}`}
        />
      </label>
      <button type="submit" className={`brand-button shrink-0 rounded-md px-3 ${compact ? 'py-2 text-sm' : 'py-2.5 text-sm font-medium'}`}>
        Buscar
      </button>
    </form>
  )
}
