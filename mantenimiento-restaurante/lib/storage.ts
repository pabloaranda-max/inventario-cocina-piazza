import type { SupabaseClient } from '@supabase/supabase-js'

const BUCKET = 'mantenimiento'

export async function uploadOptionalFile(
  supabase: SupabaseClient,
  file: FormDataEntryValue | null,
  folder: string
) {
  if (!(file instanceof File) || file.size === 0) return null

  const extension = file.name.split('.').pop()?.toLowerCase() || 'bin'
  const safeName = file.name
    .replace(/\.[^/.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
  const path = `${folder}/${Date.now()}-${safeName}.${extension}`

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: false
  })

  if (error) {
    throw new Error(error.message)
  }

  return path
}

export async function createSignedUrl(supabase: SupabaseClient, path: string | null) {
  if (!path) return null

  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60)
  return data?.signedUrl ?? null
}
