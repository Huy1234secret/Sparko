export { AnimatedIcon } from './AnimatedIcon';
export type { AnimatedIconProps, MotionPreference } from './AnimatedIcon';
export {
  assetRegistry,
  getAsset,
  getAssetExport,
  getDiscordMedia,
  loadAnimation,
} from './registry';
export type {
  AssetId,
  AssetEntry,
  AssetExport,
  AssetTheme,
  IconState,
  ExportKind,
} from './registry';
export {
  validateAnimation,
  boundedIterations,
  shouldAnimate,
  ANIMATION_MAX_BYTES,
  ANIMATION_MAX_SECONDS,
} from './validation';
