import { logout } from '@/app/login/actions'

export function LogoutButton() {
  return (
    <form action={logout}>
      <button
        type="submit"
        className="rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 hover:text-slate-950"
      >
        Salir
      </button>
    </form>
  )
}
