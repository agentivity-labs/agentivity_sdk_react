import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ImageGallery } from '../src/artifacts/components/media/ImageGallery.js';
import { artifactDownloadUrl, safeImageUrl, setArtifactInstanceUrl } from '../src/artifacts/components/ArtifactImage.js';

describe('a picture the instance keeps', () => {
  afterEach(() => setArtifactInstanceUrl(undefined));

  it('is read from the instance once it is known, and only then', () => {
    expect(safeImageUrl('/api/v1/resources/abc')).toBeUndefined();
    setArtifactInstanceUrl('https://my.agentivity.app/');
    expect(safeImageUrl('/api/v1/resources/abc')).toBe('https://my.agentivity.app/api/v1/resources/abc');
    expect(safeImageUrl('/etc/passwd')).toBeUndefined();
  });

  it('is saved as a download, an image elsewhere is opened', () => {
    expect(artifactDownloadUrl('https://my.agentivity.app/api/v1/resources/abc')).toBe('https://my.agentivity.app/api/v1/resources/abc?download=true');
    expect(artifactDownloadUrl('https://img.recraft.ai/a.png')).toBe('https://img.recraft.ai/a.png');
  });

  it('has a Download button in the gallery when it says how to save it', () => {
    setArtifactInstanceUrl('https://my.agentivity.app');
    render(<ImageGallery props={{ images: [{ url: '/api/v1/resources/abc', download: 'abc.png' }, { url: 'https://x.test/b.png' }] }} />);

    const links = screen.getAllByText('Download');
    expect(links).toHaveLength(1);
    expect(links[0]!.getAttribute('href')).toBe('https://my.agentivity.app/api/v1/resources/abc?download=true');
    expect(links[0]!.getAttribute('download')).toBe('abc.png');
  });
});
