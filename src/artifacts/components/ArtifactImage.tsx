import { useEffect, useState, type CSSProperties } from 'react';

/**
 * Returns the URL when it is safe to put in an `<img src>` coming from agent output — `http(s)` and raster
 * `data:image/` only. Anything else (`javascript:`, `file:`, a relative path, SVG data that can carry script)
 * yields `undefined`, which renders the fallback instead.
 */
export function safeImageUrl(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const url = raw.trim();
  if (/^https?:\/\//i.test(url)) return url;
  if (/^data:image\/(png|jpe?g|gif|webp|avif);base64,/i.test(url)) return url;
  return undefined;
}

/** Returns the address when it is an `http(s)` link, otherwise `undefined` — for links coming from agent output (`javascript:` never passes). */
export function safeHttpUrl(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const url = raw.trim();
  return /^https?:\/\//i.test(url) ? url : undefined;
}

export interface ArtifactImageProps {
  src?: string;
  /** Accessible description. Also the source of the fallback's initial. */
  alt?: string;
  /** CSS aspect-ratio, e.g. `"4 / 3"`. Defaults to `"4 / 3"`. */
  aspectRatio?: string;
  /** How the picture fills its box: `cover` crops, `contain` shows the whole picture (products). Defaults to `contain`. */
  fit?: 'cover' | 'contain';
  /** Fixed width (px or CSS length). Without it the image fills the width of its container. */
  width?: number | string;
  radius?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * The one way artifacts show a picture: lazy-loaded, never wider than its container, and when the address is
 * missing, unsafe or fails to load it shows a neutral block with the first letter of `alt` — never a broken-image icon.
 * Images are requested without a `Referer` so a shop that refuses foreign pages still serves them.
 */
export function ArtifactImage({ src, alt, aspectRatio = '4 / 3', fit = 'contain', width, radius = 8, className, style }: ArtifactImageProps) {
  const safe = safeImageUrl(src);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [safe]);

  const box: CSSProperties = {
    width: width ?? '100%',
    maxWidth: '100%',
    aspectRatio,
    borderRadius: radius,
    overflow: 'hidden',
    background: 'var(--ag-surface-container-high, #eef1f5)',
    border: '1px solid var(--ag-outline-variant, #e2e8f0)',
    boxSizing: 'border-box',
    flexShrink: 0,
    ...style,
  };

  if (!safe || failed) {
    const initial = (alt ?? '').trim().charAt(0).toUpperCase();
    return (
      <div className={className} role="img" aria-label={alt ?? ''} data-ag-image-fallback="true" style={{ ...box, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 600, opacity: 0.5 }}>
        {initial || '▣'}
      </div>
    );
  }

  return (
    <div className={className} style={box}>
      <img
        src={safe}
        alt={alt ?? ''}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        style={{ display: 'block', width: '100%', height: '100%', objectFit: fit }}
      />
    </div>
  );
}
