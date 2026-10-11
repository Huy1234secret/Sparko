import metadata from './metadata.json';
import { animationLoaders } from './loaders';
import { assetUrls } from './urls';
import { validateAnimation } from './validation';

export type AssetId = keyof typeof animationLoaders;
export type IconState =
  | 'idle'
  | 'hover'
  | 'focus'
  | 'active'
  | 'success'
  | 'error'
  | 'disabled';
export type AssetTheme = 'light' | 'dark';
export type ExportKind =
  | 'lottie'
  | 'svg'
  | 'discord-static'
  | 'discord-animated';

export interface AssetExport {
  kind: ExportKind;
  theme: AssetTheme;
  path: string;
  url: string;
  mimeType: string;
  byteSize: number;
  width: number;
  height: number;
}

export interface AssetEntry {
  id: AssetId;
  version: string;
  license: 'CC0-1.0';
  author: string;
  source: string;
  dimensions: { width: number; height: number };
  byteSize: number;
  unicodeFallback: string;
  states: Record<IconState, readonly [number, number]>;
  exportVariants: AssetExport[];
}

export const assetRegistry: readonly AssetEntry[] = metadata.map((entry) => ({
  ...entry,
  id: entry.id as AssetId,
  license: 'CC0-1.0' as const,
  states: entry.states as Record<IconState, [number, number]>,
  exportVariants: entry.exportVariants.map((variant) => ({
    ...variant,
    kind: variant.kind as ExportKind,
    theme: variant.theme as AssetTheme,
    url: assetUrls[variant.path] ?? '',
  })),
}));

export function getAsset(id: AssetId): AssetEntry {
  const entry = assetRegistry.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`Unknown Sparko asset: ${String(id)}`);
  return entry;
}

export function getAssetExport(
  id: AssetId,
  kind: ExportKind,
  theme: AssetTheme = 'light',
): AssetExport | undefined {
  return getAsset(id).exportVariants.find(
    (variant) => variant.kind === kind && variant.theme === theme,
  );
}

/** Website animation names are never used as Discord custom emoji IDs. */
export function getDiscordMedia(id: AssetId, animated = false): AssetExport {
  const kind = animated ? 'discord-animated' : 'discord-static';
  const variant =
    getAssetExport(id, kind) ?? getAssetExport(id, 'discord-static');
  if (!variant) throw new Error(`No Discord media export for ${id}`);
  return variant;
}

export async function loadAnimation(
  id: AssetId,
  theme: AssetTheme,
): Promise<object> {
  const data: unknown = (await animationLoaders[id][theme]()).default;
  const result = validateAnimation(data);
  if (!result.valid)
    throw new Error(`Invalid animation ${id}: ${result.errors.join('; ')}`);
  return data as object;
}
