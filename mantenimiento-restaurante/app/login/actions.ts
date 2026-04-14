'use server'

import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/utils'

export async function login(formData: FormData) {
  if (!isSupabaseConfigured()) {
    redirect('/login?error=config')
  }

  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')

  if (!email || !password) {
    redirect('/login?error=missing')
  }

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password
  })

  if (error) {
    const message = error.message.toLowerCase()

    if (message.includes('email not confirmed')) {
      redirect('/login?error=unconfirmed')
    }

    if (message.includes('invalid login credentials')) {
      redirect('/login?error=invalid')
    }

    redirect('/login?error=auth')
  }

  redirect('/')
}

export async function logout() {
  if (!isSupabaseConfigured()) {
    redirect('/login?error=config')
  }

  const supabase = await createServerSupabaseClient()
  await supabase.auth.signOut()
  redirect('/login')
}
