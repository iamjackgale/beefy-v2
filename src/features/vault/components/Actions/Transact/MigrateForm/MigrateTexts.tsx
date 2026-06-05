import { memo } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { styled } from '@repo/styles/jsx';
import { useAppSelector } from '../../../../../data/store/hooks.ts';
import {
  isCowcentratedGovVault,
  isVaultRetired,
  type VaultEntity,
} from '../../../../../data/entities/vault.ts';
import { selectVaultById } from '../../../../../data/selectors/vaults.ts';

export const MigrateNotice = memo(function MigrateNotice({
  oldVaultId,
}: {
  oldVaultId: VaultEntity['id'];
}) {
  const { t } = useTranslation();
  const oldVault = useAppSelector(state => selectVaultById(state, oldVaultId));

  // gov cowcentrated wrapper ("-rp") reads as "pool", standard wrapper ("-vault") as "vault"
  const typeNoun = t(
    isCowcentratedGovVault(oldVault) ? 'ReplacementVault-Noun-pool' : 'ReplacementVault-Noun-vault'
  );

  const i18nKey =
    isVaultRetired(oldVault) ? 'ReplacementVault-Notice-Retired' : 'ReplacementVault-Notice';

  return (
    <Notice>
      <Trans t={t} i18nKey={i18nKey} p values={{ type: typeNoun }} />
    </Notice>
  );
});

export const MigrateZapNotice = memo(function MigrateZapNotice() {
  const { t } = useTranslation();

  return (
    <Zap>
      <Trans t={t} i18nKey="ReplacementVault-Zap" components={{ Highlight: <Highlight /> }} />
    </Zap>
  );
});

const Notice = styled('div', {
  base: {
    textStyle: 'body',
    color: 'text.middle',
  },
});

const Zap = styled('div', {
  base: {
    textStyle: 'body',
    color: 'text.middle',
  },
});

const Highlight = styled('span', {
  base: {
    color: 'text.warning',
  },
});
