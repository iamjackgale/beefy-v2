import { memo, type MouseEvent, useCallback } from 'react';
import { useAppSelector } from '../../../../store.ts';
import { selectVaultExistsById } from '../../../../features/data/selectors/vaults.ts';
import { Tokens } from './Tokens.tsx';
import { PricePerFullShare } from './PricePerFullShare.tsx';
import { DropdownContent } from '../../../Dropdown/DropdownContent.tsx';

type PricesDropdownProps = {
  setOpen: (setter: boolean | ((open: boolean) => boolean)) => void;
};

export const PricesDropdown = memo(function PricesDropdown({ setOpen }: PricesDropdownProps) {
  const vaultLoaded = useAppSelector(state => selectVaultExistsById(state, 'bifi-vault'));
  const handleClick = useCallback<(e: MouseEvent<HTMLDivElement>) => void>(
    e => {
      if (!e.target || !(e.target instanceof HTMLElement)) {
        return;
      }

      // this is a hack to make the dropdown close when a button/link is clicked
      if (['a', 'button', 'path', 'svg', 'img'].includes(e.target.tagName.toLowerCase())) {
        setOpen(false);
      }
    },
    [setOpen]
  );

  return (
    <DropdownContent onClick={handleClick}>
      <Tokens />
      {vaultLoaded ? <PricePerFullShare /> : null}
    </DropdownContent>
  );
});
