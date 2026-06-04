import { lazy, memo } from 'react';
import { useAppSelector } from '../../../data/store/hooks.ts';
import { selectVaultById } from '../../../data/selectors/vaults.ts';
import type { VaultEntity } from '../../../data/entities/vault.ts';

const FreeZapPromotionCard = lazy(() =>
  import('./FreeZapPromotionCard.tsx').then(m => ({ default: m.FreeZapPromotionCard }))
);

export type FreeZapPromotionCardLoaderProps = {
  vaultId: VaultEntity['id'];
};

export const FreeZapPromotionCardLoader = memo(function FreeZapPromotionCardLoader({
  vaultId,
}: FreeZapPromotionCardLoaderProps) {
  const zapCampaign = useAppSelector(state => selectVaultById(state, vaultId));
  if (!zapCampaign) {
    return null;
  }

  return <FreeZapPromotionCard />;
});
