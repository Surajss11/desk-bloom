import { AssetType, defineAssets } from '@iwsdk/core';

const publicAssetUrl = (filePath: string): string =>
  `${import.meta.env.BASE_URL}${filePath.replace(/^\/+/u, '')}`;

export default defineAssets({
  'focus-panel': {
    url: publicAssetUrl('ui/focus-panel.uikitml'),
    type: AssetType.UIKitML,
    name: 'Focus Panel',
  },
});
