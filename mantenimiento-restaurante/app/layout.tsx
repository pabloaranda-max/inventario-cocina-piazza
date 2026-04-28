import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import localFont from 'next/font/local'
import './globals.css'
import { Navbar } from '@/components/layout/navbar'
import { LogoutButton } from '@/components/layout/logout-button'
import { MobileMenu } from '@/components/layout/mobile-menu'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { getCurrentUser } from '@/lib/supabase/current-user'

const freightNeo = localFont({
  src: '../public/branding/fonts/FreightNeo W03 Book.ttf',
  variable: '--font-brand-body',
  display: 'swap'
})

const ttNooks = localFont({
  src: '../public/branding/fonts/TT Nooks Script Black.otf',
  variable: '--font-brand-accent',
  display: 'swap'
})

export const metadata: Metadata = {
  title: 'Mantenimiento Restaurante',
  description: 'App interna de mantenimiento para restaurante',
  icons: { icon: '/branding/logo.png' }
}

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode
}>) {
  const user = await getCurrentUser()

  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){var t=localStorage.getItem('theme');if(t==='dark'||(t===null&&window.matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')})()` }} />
      </head>
      <body className={`${freightNeo.variable} ${ttNooks.variable}`}>
        <div className="min-h-screen">
          <header className="sticky top-0 z-30 border-b border-[color:var(--brand-border)] bg-[rgba(255,253,248,0.82)] backdrop-blur dark:bg-[rgba(13,19,12,0.88)]">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
              <Link href="/" className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-md border border-[rgba(155,30,33,0.18)] bg-[rgba(255,253,248,0.7)] p-1.5 dark:border-[rgba(238,227,202,0.14)] dark:bg-[rgba(238,227,202,0.08)]">
                  <Image
                    src="/branding/logo.png"
                    alt="Piazza Pasticcio"
                    width={40}
                    height={40}
                    className="h-9 w-9 object-contain"
                    priority
                  />
                </span>
                <span className="flex flex-col">
                  <span className="brand-accent text-lg leading-none text-[color:var(--brand-wine)] dark:text-[color:var(--brand-yellow)]">
                    Piazza Pasticcio
                  </span>
                  <span className="text-base font-semibold tracking-[0.08em] text-[color:var(--brand-green)] dark:text-[color:var(--brand-bone)]">
                    Mantenimiento
                  </span>
                </span>
              </Link>
              <div className="flex items-center gap-1">
                <ThemeToggle />
                {user ? (
                  <>
                    <div className="hidden md:flex md:items-center md:gap-1">
                      <Navbar />
                      <LogoutButton />
                    </div>
                    <div className="md:hidden">
                      <MobileMenu />
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </header>
          <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
        </div>
      </body>
    </html>
  )
}
