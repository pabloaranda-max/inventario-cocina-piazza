import Link from 'next/link'

const prioridadLabel: Record<string, string> = {
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
  urgente: 'Urgente'
}

export default async function GraciasPage({
  searchParams
}: {
  searchParams: Promise<{ ticket?: string; nombre?: string; prioridad?: string }>
}) {
  const { ticket, nombre, prioridad } = await searchParams

  return (
    <div className="flex min-h-screen flex-col bg-[color:color-mix(in_srgb,var(--brand-bone)_82%,white)] text-[color:var(--brand-ink)] dark:bg-[rgba(18,26,14,0.96)]">
      <header className="border-b border-[color:color-mix(in_srgb,var(--brand-olive)_14%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-bone)_70%,white)] px-4 py-4 dark:bg-[rgba(28,40,22,0.9)]">
        <p className="brand-accent text-lg leading-none text-[color:var(--brand-wine)] dark:text-[color:var(--brand-yellow)]">Piazza Pasticcio</p>
        <h1 className="mt-1 text-lg font-semibold">Reporte enviado</h1>
      </header>
      <main className="flex-1 px-4 py-10">
        <div className="mx-auto max-w-sm space-y-6 text-center">
          <div className="brand-accent text-5xl text-[color:var(--brand-wine)] dark:text-[color:var(--brand-yellow)]">✓</div>
          <div>
            <h2 className="text-xl font-semibold text-[color:var(--brand-ink)]">
              Gracias{nombre ? `, ${nombre}` : ''}
            </h2>
            <p className="mt-2 text-sm text-[color:var(--brand-muted)]">
              Tu reporte fue recibido. El equipo de mantenimiento lo revisará pronto.
            </p>
          </div>

          {(ticket || prioridad) && (
            <div className="brand-card space-y-3 p-4 text-left">
              {ticket && (
                <div>
                  <p className="text-xs font-medium text-[color:var(--brand-muted)]">Ticket</p>
                  <p className="mt-0.5 font-semibold text-[color:var(--brand-ink)]">{ticket}</p>
                </div>
              )}
              {prioridad && (
                <div>
                  <p className="text-xs font-medium text-[color:var(--brand-muted)]">Prioridad registrada</p>
                  <p className="mt-0.5 font-semibold text-[color:var(--brand-ink)]">{prioridadLabel[prioridad] ?? prioridad}</p>
                </div>
              )}
            </div>
          )}

          <Link href="/reportar" className="brand-button block px-4 py-3 text-sm font-medium">
            Reportar otro problema
          </Link>
        </div>
      </main>
    </div>
  )
}
