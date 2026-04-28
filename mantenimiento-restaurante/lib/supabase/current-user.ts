import { cache } from 'react'
import { createServerSupabaseClient } from './server'

export const getCurrentUser = cache(async () => {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user }
  } = await supabase.auth.getUser()

  return user
})
