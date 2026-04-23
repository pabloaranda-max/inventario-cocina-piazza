'use client'

import { useRef, useState } from 'react'

const MAX_PX = 1200
const QUALITY = 0.8

async function compressImage(file: File): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img
      if (width > MAX_PX || height > MAX_PX) {
        if (width >= height) {
          height = Math.round((height * MAX_PX) / width)
          width = MAX_PX
        } else {
          width = Math.round((width * MAX_PX) / height)
          height = MAX_PX
        }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        (blob) => {
          if (!blob) { resolve(file); return }
          const name = file.name.replace(/\.[^.]+$/, '.jpg')
          resolve(new File([blob], name, { type: 'image/jpeg' }))
        },
        'image/jpeg',
        QUALITY
      )
    }
    img.src = url
  })
}

export function ImageInput({
  name,
  label,
  multiple = false,
  onFileSelected,
}: {
  name: string
  label: string
  multiple?: boolean
  onFileSelected?: (file: File) => void
}) {
  const hiddenRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const [fileNames, setFileNames] = useState<string[]>([])

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return

    const compressed = await Promise.all(files.map(compressImage))

    if (onFileSelected && compressed[0]) {
      onFileSelected(compressed[0])
    }

    const dt = new DataTransfer()
    if (multiple && hiddenRef.current?.files) {
      Array.from(hiddenRef.current.files).forEach((f) => dt.items.add(f))
    }
    compressed.forEach((f) => dt.items.add(f))

    if (hiddenRef.current) hiddenRef.current.files = dt.files
    setFileNames((prev) =>
      multiple ? [...prev, ...compressed.map((f) => f.name)] : compressed.map((f) => f.name)
    )
    e.target.value = ''
  }

  return (
    <div>
      <span className="brand-label">{label}</span>
      <input ref={hiddenRef} type="file" name={name} multiple={multiple} className="hidden" />
      <input ref={galleryRef} type="file" accept="image/*" multiple={multiple} className="hidden" onChange={handleChange} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleChange} />

      <div className="mt-1 flex gap-2">
        <button
          type="button"
          onClick={() => galleryRef.current?.click()}
          className="brand-button-muted flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium dark:border-[rgba(101,127,68,0.24)] dark:bg-[rgba(39,54,28,0.9)]"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          Galería
        </button>
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          className="brand-button-muted flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium dark:border-[rgba(101,127,68,0.24)] dark:bg-[rgba(39,54,28,0.9)]"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Cámara
        </button>
      </div>

      {fileNames.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {fileNames.map((name, i) => (
            <li key={i} className="brand-hint flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 shrink-0 text-[color:var(--brand-olive)]" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              {name}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
