import { ArtifactCard } from '../ArtifactCard.js';
import { ArtifactImage, safeHttpUrl, safeImageUrl } from '../ArtifactImage.js';
import type { ChartProps } from '../charts/BarChart.js';

interface GalleryImage {
  url?: string;
  alt?: string;
  caption?: string;
  /** Where the picture comes from or leads to — makes it a link. */
  href?: string;
}

function asImages(raw: unknown): GalleryImage[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((i): i is Record<string, unknown> => !!i && typeof i === 'object')
    .map((i) => ({
      url: safeImageUrl(i['url']),
      alt: typeof i['alt'] === 'string' ? i['alt'] : undefined,
      caption: typeof i['caption'] === 'string' ? i['caption'] : undefined,
      href: safeHttpUrl(i['href']),
    }));
}

/**
 * A grid of pictures, each with an optional caption and link — port of `AgImageGallery`. Display-only.
 *
 * Agent props: `{ title, images: [{ url, alt?, caption?, href? }], columns?, aspectRatio?, fit? }` — `columns` 1–4
 * (default 3), `aspectRatio` a CSS ratio such as `"4 / 3"`, `fit` `"contain"` (whole picture, default) or `"cover"`.
 * A picture that cannot be shown keeps its place with a neutral block, so captions stay aligned.
 */
export function ImageGallery({ props }: ChartProps) {
  const title = typeof props['title'] === 'string' ? props['title'] : 'Images';
  const images = asImages(props['images']);
  const requested = typeof props['columns'] === 'number' ? Math.round(props['columns']) : 3;
  const columns = Math.min(4, Math.max(1, requested));
  const aspectRatio = typeof props['aspectRatio'] === 'string' && /^\d+(\.\d+)?\s*\/\s*\d+(\.\d+)?$/.test(props['aspectRatio'].trim()) ? props['aspectRatio'].trim() : '4 / 3';
  const fit = props['fit'] === 'cover' ? 'cover' : 'contain';

  return (
    <ArtifactCard title={title} type="Images">
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${Math.floor(560 / columns)}px), 1fr))`, gap: 12 }}>
        {images.map((image, i) => {
          const picture = <ArtifactImage src={image.url} alt={image.alt ?? image.caption} aspectRatio={aspectRatio} fit={fit} />;
          return (
            <figure key={i} style={{ margin: 0, minWidth: 0 }}>
              {image.href ? (
                <a href={image.href} target="_blank" rel="noopener noreferrer" style={{ display: 'block' }}>
                  {picture}
                </a>
              ) : (
                picture
              )}
              {image.caption && <figcaption style={{ marginTop: 6, fontSize: 11, opacity: 0.65, lineHeight: 1.35 }}>{image.caption}</figcaption>}
            </figure>
          );
        })}
      </div>
    </ArtifactCard>
  );
}
