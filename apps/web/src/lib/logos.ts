import type { GraphNode } from '@/types';

export function normalizeLogoKey(input: string): string {
  return input.trim().toLowerCase();
}

// Public assets under apps/web/public are served from the site root.
export function getMidasAssetLogoPath(assetId: string): string {
  return `/logos/midas/${normalizeLogoKey(assetId)}.svg`;
}

// Keep this list in sync with apps/web/public/logos/midas/*.svg.
// We intentionally only return paths for assets we actually ship locally,
// so UI can gracefully fall back instead of rendering broken images.
const MIDAS_ASSET_LOGO_KEYS = new Set<string>([
  'mapollo',
  'mbasis',
  'mbtc',
  'medge',
  'mevbtc',
  'mf-one',
  'mfarm',
  'mhyper',
  'mhyperbtc',
  'mhypereth',
  'mmev',
  'mre7btc',
  'mre7sol',
  'mre7yield',
  'msyrupusd',
  'mtbill',
  'mxrp',
]);

export function hasMidasAssetLogo(assetId: string): boolean {
  return MIDAS_ASSET_LOGO_KEYS.has(normalizeLogoKey(assetId));
}

export function getNodeLogoPath(node: GraphNode): string | null {
  // For now we only have a curated local set of MIDAS asset logos.
  if (node.protocol === 'midas') {
    if (!hasMidasAssetLogo(node.name)) return null;
    return getMidasAssetLogoPath(node.name);
  }

  return null;
}

export function getFallbackMonogram(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '?';
  return trimmed.slice(0, 2).toUpperCase();
}
