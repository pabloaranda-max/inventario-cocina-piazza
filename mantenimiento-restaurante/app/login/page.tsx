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
    <div className="mx-auto mt-12 max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-semibold text-slate-950">Entrar</h1>
      <p className="mt-2 text-sm text-slate-600">
        Usa tu cuenta interna creada en Supabase.
      </p>

      <form action={login} className="mt-6 space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Email</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-950 outline-none focus:border-slate-700"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Contraseña</span>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-950 outline-none focus:border-slate-700"
          />
        </label>

        {error ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          className="w-full rounded-md bg-slate-950 px-4 py-2 font-medium text-white hover:bg-slate-800"
        >
          Iniciar sesión
        </button>
      </form>
    </div>
  )
}
