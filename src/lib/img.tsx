import type { ImgHTMLAttributes } from 'react'

// Every published .webp has an .avif twin next to it (scripts/prepare.cjs): about half the size at
// the same sharpness. Browsers without AVIF use the WebP.
export const avif = (src: string) => src.replace(/\.webp(\?|$)/, '.avif$1')

export function Pic({ src, ...img }: ImgHTMLAttributes<HTMLImageElement> & { src: string }) {
  return (
    <picture>
      {/\.webp(\?|$)/.test(src) && <source type="image/avif" srcSet={avif(src)} />}
      <img src={src} {...img} />
    </picture>
  )
}
