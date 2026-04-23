import { logout } from '@/app/login/actions'

export function LogoutButton() {
  return (
    <form action={logout}>
      <button
        type="submit"
        className="brand-nav-link rounded-md px-3 py-2 text-sm font-medium"
      >
        Salir
      </button>
    </form>
  )
}
