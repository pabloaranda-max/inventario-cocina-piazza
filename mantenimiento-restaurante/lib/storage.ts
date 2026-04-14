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

export async function uploadOptionalFiles(
  supabase: SupabaseClient,
  files: FormDataEntryValue[],
  folder: string
) {
  const paths: string[] = []

  for (const file of files) {
    const path = await uploadOptionalFile(supabase, file, folder)
    if (path) paths.push(path)
  }

  return paths
}

export async function removeStorageFiles(supabase: SupabaseClient, paths: Array<string | null | undefined>) {
  const validPaths = paths.filter((path): path is string => Boolean(path))
  if (!validPaths.length) return

  await supabase.storage.from(BUCKET).remove(validPaths)
}

export async function createSignedUrl(supabase: SupabaseClient, path: string | null) {
  if (!path) return null

  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60)
  return data?.signedUrl ?? null
}

export async function createSignedUrlMap(supabase: SupabaseClient, paths: Array<string | null>) {
  const uniquePaths = Array.from(new Set(paths.filter((path): path is string => Boolean(path))))
  if (!uniquePaths.length) return new Map<string, string>()

  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(uniquePaths, 60 * 60)
  const urlMap = new Map<string, string>()

  data?.forEach((item) => {
    if (item.path && item.signedUrl) {
      urlMap.set(item.path, item.signedUrl)
    }
  })

  return urlMap
}
