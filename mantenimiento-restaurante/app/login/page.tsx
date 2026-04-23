import Image from 'next/image'
import { login } from './actions'

type LoginPageProps = {
  searchParams: Promise<{
    error?: string
  }>
}

const errorMessages: Record<string, string> = {
  config: 'Falta configurar Supabase en .env.local.',
  missing: 'Escribe email y contraseña.',
  invalid: 'Email o contraseña incorrectos, o el usuario no tiene contraseña asignada.',
  unconfirmed: 'El email del usuario no está confirmado en Supabase Auth.',
  auth: 'Supabase rechazó el inicio de sesión. Revisa el usuario en Auth.'
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedSearchParams = await searchParams
  const error = resolvedSearchParams.error ? errorMessages[resolvedSearchParams.error] : null

  return (
    <div className="mx-auto mt-10 max-w-md">
      <div className="brand-shell rounded-lg p-7">
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-md border border-[rgba(155,30,33,0.18)] bg-[rgba(255,253,248,0.72)] p-1.5 dark:border-[rgba(238,227,202,0.14)] dark:bg-[rgba(238,227,202,0.08)]">
            <Image
              src="/branding/logo.png"
              alt="Piazza Pasticcio"
              width={48}
              height={48}
              className="h-11 w-11 object-contain"
              priority
            />
          </span>
          <div>
            <p className="brand-accent text-xl leading-none text-[color:var(--brand-wine)] dark:text-[color:var(--brand-yellow)]">
              Piazza Pasticcio
            </p>
            <h1 className="mt-1 text-3xl font-semibold">Entrar</h1>
          </div>
        </div>

        <p className="mt-4 text-sm text-[rgba(47,62,30,0.76)] dark:text-[rgba(238,227,202,0.74)]">
          Usa tu cuenta interna para operar incidencias, activos y mantenimientos.
        </p>

        <form action={login} className="mt-6 space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-[color:var(--brand-green)] dark:text-[color:var(--brand-bone)]">Email</span>
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              className="mt-1 w-full rounded-md border border-[rgba(47,62,30,0.16)] bg-[rgba(255,253,248,0.8)] px-3 py-2 text-[color:var(--brand-green)] outline-none placeholder:text-[rgba(47,62,30,0.4)] focus:border-[color:var(--brand-yellow)] dark:border-[rgba(238,227,202,0.12)] dark:bg-[rgba(22,32,18,0.72)] dark:text-[color:var(--brand-bone)] dark:placeholder:text-[rgba(238,227,202,0.42)]"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-[color:var(--brand-green)] dark:text-[color:var(--brand-bone)]">Contraseña</span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="mt-1 w-full rounded-md border border-[rgba(47,62,30,0.16)] bg-[rgba(255,253,248,0.8)] px-3 py-2 text-[color:var(--brand-green)] outline-none placeholder:text-[rgba(47,62,30,0.4)] focus:border-[color:var(--brand-yellow)] dark:border-[rgba(238,227,202,0.12)] dark:bg-[rgba(22,32,18,0.72)] dark:text-[color:var(--brand-bone)] dark:placeholder:text-[rgba(238,227,202,0.42)]"
            />
          </label>

          {error ? (
            <p className="rounded-md border border-[rgba(155,30,33,0.2)] bg-[rgba(155,30,33,0.08)] px-3 py-2 text-sm text-[color:var(--brand-wine)] dark:border-[rgba(239,169,30,0.2)] dark:bg-[rgba(155,30,33,0.18)] dark:text-[color:var(--brand-bone)]">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            className="brand-button w-full rounded-md px-4 py-2 font-medium"
          >
            Iniciar sesión
          </button>
        </form>
      </div>
    </div>
  )
}
