import { ReporteRapidoForm } from '@/app/incidencias/incidencia-form'

export default function ReportarPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[color:color-mix(in_srgb,var(--brand-bone)_82%,white)] text-[color:var(--brand-ink)] dark:bg-[rgba(20,30,14,0.98)]">
      <header className="border-b border-[color:color-mix(in_srgb,var(--brand-olive)_14%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-bone)_70%,white)] px-4 py-4 dark:border-[rgba(101,127,68,0.2)] dark:bg-[rgba(31,43,23,0.94)]">
        <p className="brand-accent text-lg leading-none text-[color:var(--brand-wine)] dark:text-[color:var(--brand-yellow)]">Piazza Pasticcio</p>
        <h1 className="mt-1 text-lg font-semibold">Reportar problema</h1>
      </header>
      <main className="flex-1 px-4 py-6">
        <div className="mx-auto max-w-lg">
          <p className="mb-5 text-sm text-[color:var(--brand-muted)]">
            Describe el problema y envía el reporte. El equipo de mantenimiento lo revisará.
          </p>
          <ReporteRapidoForm />
        </div>
      </main>
    </div>
  )
}
