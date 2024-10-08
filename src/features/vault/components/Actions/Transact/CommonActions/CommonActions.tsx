import type { ChainEntity } from '../../../../../data/entities/chain';
import { type FC, memo, type ReactNode, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppDispatch, useAppSelector } from '../../../../../../store';
import { selectChainById } from '../../../../../data/selectors/chains';
import { askForNetworkChange, askForWalletConnection } from '../../../../../data/actions/wallet';
import { Button } from '../../../../../../components/Button';
import {
  selectCurrentChainId,
  selectIsWalletConnected,
} from '../../../../../data/selectors/wallet';
import { selectIsStepperStepping } from '../../../../../data/selectors/stepper';

export type ActionButtonProps = {
  className?: string;
};

export const ActionConnect = memo<ActionButtonProps>(function ActionConnect({ className }) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const isStepping = useAppSelector(selectIsStepperStepping);
  const handleClick = useCallback(() => {
    dispatch(askForWalletConnection());
  }, [dispatch]);

  return (
    <Button
      variant="success"
      fullWidth={true}
      borderless={true}
      className={className}
      onClick={handleClick}
      disabled={isStepping}
    >
      {t('Network-ConnectWallet')}
    </Button>
  );
});

export type ActionSwitchProps = { chainId: ChainEntity['id'] } & ActionButtonProps;
export const ActionSwitch = memo<ActionSwitchProps>(function ActionSwitch({ chainId, className }) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const isStepping = useAppSelector(selectIsStepperStepping);
  const chain = useAppSelector(state => selectChainById(state, chainId));
  const handleClick = useCallback(() => {
    dispatch(askForNetworkChange({ chainId }));
  }, [dispatch, chainId]);

  return (
    <Button
      variant="success"
      fullWidth={true}
      borderless={true}
      className={className}
      onClick={handleClick}
      disabled={isStepping}
    >
      {t('Network-Change', { network: chain.name })}
    </Button>
  );
});

export type ActionConnectSwitchProps = {
  className?: string;
  chainId?: ChainEntity['id'];
  children: ReactNode;
  FeesComponent?: FC;
};

export const ActionConnectSwitch = memo<ActionConnectSwitchProps>(function ActionConnectSwitch({
  children,
  className,
  chainId,
  FeesComponent,
}) {
  const isWalletConnected = useAppSelector(selectIsWalletConnected);
  const connectedChainId = useAppSelector(selectCurrentChainId);

  if (!isWalletConnected) {
    return (
      <div className={className}>
        <ActionConnect />
        {FeesComponent && <FeesComponent />}
      </div>
    );
  }

  if (chainId && chainId !== connectedChainId) {
    return (
      <div className={className}>
        <ActionSwitch chainId={chainId} />
        {FeesComponent && <FeesComponent />}
      </div>
    );
  }

  return <>{children}</>;
});
