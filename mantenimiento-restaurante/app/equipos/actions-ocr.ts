'use server'

import { extraerDatosPlacaDesdeImagen, type DatosPlaca } from '@/lib/ocr'

export async function extraerDatosPlaca(formData: FormData): Promise<DatosPlaca> {
  const file = formData.get('imagen')
  if (!(file instanceof File) || file.size === 0) {
    return { marca: null, modelo: null, numero_serie: null, specs: null }
  }

  const buffer = await file.arrayBuffer()
  const base64 = Buffer.from(buffer).toString('base64')
  const mediaType = (file.type === 'image/png' ? 'image/png'
    : file.type === 'image/webp' ? 'image/webp'
    : 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/webp'

  return extraerDatosPlacaDesdeImagen(base64, mediaType)
}
