import type { Metadata } from 'next'
import Link from 'next/link'
import './globals.css'
import { Navbar } from '@/components/layout/navbar'
import { LogoutButton } from '@/components/layout/logout-button'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'Mantenimiento Restaurante',
  description: 'App interna de mantenimiento para restaurante'
}

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode
}>) {
  const user = isSupabaseConfigured()
    ? (await (await createServerSupabaseClient()).auth.getUser()).data.user
    : null

  return (
    <html lang="es">
      <body>
        <div className="min-h-screen bg-slate-50">
          <header className="border-b border-slate-200 bg-white">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
              <Link href="/" className="text-lg font-semibold text-slate-950">
                Mantto Restaurante
              </Link>
              {user ? (
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Navbar />
                  <LogoutButton />
                </div>
              ) : null}
            </div>
          </header>
          <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
        </div>
      </body>
    </html>
  )
}
