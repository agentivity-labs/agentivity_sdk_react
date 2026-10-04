import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ArtifactImage, safeHttpUrl, safeImageUrl } from '../src/artifacts/components/ArtifactImage.js';
import { ChoiceCard } from '../src/artifacts/components/interaction/ChoiceCard.js';
import { SummaryCard } from '../src/artifacts/components/interaction/SummaryCard.js';
import { ImageGallery } from '../src/artifacts/components/media/ImageGallery.js';
import { MarkdownBody } from '../src/ag-ui/components/MarkdownBody.js';
import { buildArtifactsRegistry } from '../src/artifacts/registry.js';

const PHOTO = 'https://i5.walmartimages.com/seo/robot-vacuum.jpeg';

describe('image addresses coming from an agent', () => {
  it('accepts http(s) and raster data images only', () => {
    expect(safeImageUrl(PHOTO)).toBe(PHOTO);
    expect(safeImageUrl('data:image/png;base64,AAAA')).toBeDefined();
    expect(safeImageUrl('javascript:alert(1)')).toBeUndefined();
    expect(safeImageUrl('data:image/svg+xml;base64,AAAA')).toBeUndefined();
    expect(safeImageUrl('/relative/photo.jpg')).toBeUndefined();
    expect(safeImageUrl(42)).toBeUndefined();
    expect(safeHttpUrl('javascript:alert(1)')).toBeUndefined();
    expect(safeHttpUrl('https://shop.example/p/1')).toBe('https://shop.example/p/1');
  });
});

describe('ArtifactImage', () => {
  it('shows the picture, lazily and without a referrer', () => {
    render(<ArtifactImage src={PHOTO} alt="Roomba" />);
    const img = screen.getByAltText('Roomba');
    expect(img).toHaveAttribute('src', PHOTO);
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img).toHaveAttribute('referrerpolicy', 'no-referrer');
  });

  it('falls back to a block with the initial when the address is missing or unsafe', () => {
    const { rerender } = render(<ArtifactImage alt="Roomba" />);
    expect(screen.getByRole('img', { name: 'Roomba' })).toHaveTextContent('R');
    rerender(<ArtifactImage src="javascript:alert(1)" alt="Roomba" />);
    expect(screen.getByRole('img', { name: 'Roomba' })).toHaveAttribute('data-ag-image-fallback', 'true');
  });

  it('falls back when the picture fails to load, instead of a broken image', () => {
    render(<ArtifactImage src={PHOTO} alt="Roomba" />);
    fireEvent.error(screen.getByAltText('Roomba'));
    expect(screen.getByRole('img', { name: 'Roomba' })).toHaveAttribute('data-ag-image-fallback', 'true');
  });
});

describe('SummaryCard pictures', () => {
  const sections = [
    { label: 'Roomba Combo', badge: 'Best overall', imageUrl: PHOTO, url: 'https://shop.example/roomba', items: [{ key: 'Price', value: '$499', highlight: true }] },
    { label: 'Dreame X60', items: [{ key: 'Price', value: '$699' }] },
  ];

  it('shows a product sheet: photo, badge and a link per section', () => {
    render(<SummaryCard props={{ title: 'Top picks', sections }} />);
    expect(screen.getByAltText('Roomba Combo')).toHaveAttribute('src', PHOTO);
    expect(screen.getByText('Best overall')).toBeInTheDocument();
    expect(screen.getByText('ROOMBA COMBO').closest('a')).toHaveAttribute('href', 'https://shop.example/roomba');
    expect(screen.getByText('$699')).toBeInTheDocument();
  });

  it('shows a banner picture on the card itself', () => {
    render(<SummaryCard props={{ title: 'Trip', imageUrl: PHOTO, imageAlt: 'Lisbon', sections: [{ items: [{ key: 'Days', value: '5' }] }] }} />);
    expect(screen.getByAltText('Lisbon')).toBeInTheDocument();
  });

  it('keeps working without any picture and drops an unsafe link', () => {
    render(<SummaryCard props={{ title: 'Recap', sections: [{ label: 'Plain', url: 'javascript:alert(1)', items: [{ key: 'A', value: '1' }] }] }} />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('PLAIN').closest('a')).toBeNull();
  });
});

describe('ChoiceCard option pictures', () => {
  it('shows a picture next to an option that has one', () => {
    render(<ChoiceCard props={{ title: 'Pick', options: [{ id: 'a', label: 'Option A', imageUrl: PHOTO }, { id: 'b', label: 'Option B' }] }} />);
    expect(screen.getByAltText('Option A')).toBeInTheDocument();
    expect(screen.getByText('Option B')).toBeInTheDocument();
  });
});

describe('ImageGallery', () => {
  it('shows each picture with its caption and keeps a place for one that cannot be shown', () => {
    render(
      <ImageGallery
        props={{ title: 'Candidates', images: [{ url: PHOTO, alt: 'First', caption: 'First caption', href: 'https://shop.example/1' }, { url: 'ftp://nope', alt: 'Second', caption: 'Second caption' }] }}
      />,
    );
    expect(screen.getByAltText('First').closest('a')).toHaveAttribute('href', 'https://shop.example/1');
    expect(screen.getByText('First caption')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Second' })).toHaveAttribute('data-ag-image-fallback', 'true');
    expect(screen.getByText('Second caption')).toBeInTheDocument();
  });

  it('is registered under its name', () => {
    expect(buildArtifactsRegistry()['ImageGallery']).toBeTypeOf('function');
  });
});

describe('MarkdownBody images', () => {
  it('fits a message image to its bubble', () => {
    render(<MarkdownBody data={`![Roomba](${PHOTO})`} />);
    const img = screen.getByAltText('Roomba');
    expect(img).toHaveAttribute('src', PHOTO);
    expect(img.style.maxWidth).toBe('100%');
    expect(img).toHaveAttribute('referrerpolicy', 'no-referrer');
  });

  it('renders nothing for an address that is not http(s)', () => {
    render(<MarkdownBody data="![x](javascript:alert(1))" />);
    expect(screen.queryByAltText('x')).toBeNull();
  });
});
