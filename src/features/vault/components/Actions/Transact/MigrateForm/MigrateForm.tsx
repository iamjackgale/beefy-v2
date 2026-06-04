import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { css } from '@repo/styles/css';
import { Button } from '../../../../../../components/Button/Button.tsx';
import { AnimatedButton } from '../../../../../../components/Button/AnimatedButton.tsx';
import { AlertError } from '../../../../../../components/Alerts/Alerts.tsx';
import { ExternalLink } from '../../../../../../components/Links/ExternalLink.tsx';

import { legacyMakeStyles } from '../../../../../../helpers/mui.ts';
import { useAppDispatch, useAppSelector } from '../../../../../data/store/hooks.ts';
import {
  executeReplacementMigration,
  transactFetchMigrationQuote,
} from '../../../../../data/actions/migrator-replacement.ts';
import {
  transactClearQuotes,
  transactSetSuccessClosed,
  transactSwitchMode,
} from '../../../../../data/actions/transact.ts';
import { stepperReset } from '../../../../../data/actions/wallet/stepper.ts';
import { StepContent } from '../../../../../data/reducers/wallet/stepper-types.ts';
import {
  TransactMode,
  TransactStatus,
} from '../../../../../data/reducers/wallet/transact-types.ts';
import { isCowcentratedGovVault, type VaultEntity } from '../../../../../data/entities/vault.ts';
import { isZapQuote } from '../../../../../data/apis/transact/transact-types.ts';
import {
  QuoteCowcentratedNoSingleSideError,
  QuoteCowcentratedNotCalmError,
} from '../../../../../data/apis/transact/strategies/error.ts';
import {
  selectUserVaultBalanceInDepositTokenInBoosts,
  selectUserVaultBalanceInShareToken,
} from '../../../../../data/selectors/balance.ts';
import {
  selectIsStepperStepping,
  selectStepperStepContent,
} from '../../../../../data/selectors/stepper.ts';
import {
  selectTransactConfirmNeededWithChanges,
  selectTransactExecuting,
  selectTransactQuoteError,
  selectTransactQuoteStatus,
  selectTransactSelectedQuoteOrUndefined,
  selectTransactSlippage,
  selectTransactSuccessClosed,
  selectTransactVaultId,
} from '../../../../../data/selectors/transact.ts';
import {
  selectVaultById,
  selectVaultReplacementMigration,
} from '../../../../../data/selectors/vaults.ts';
import { ActionConnectSwitch } from '../CommonActions/CommonActions.tsx';
import WithdrawBoostNotice from '../FormStepFooter/WithdrawBoostNotice.tsx';
import { ConfirmNotice } from '../ConfirmNotice/ConfirmNotice.tsx';
import { PriceImpactNotice } from '../PriceImpactNotice/PriceImpactNotice.tsx';
import { ZapRoute, ZapRoutePlaceholder } from '../ZapRoute/ZapRoute.tsx';
import { ZapSlippage } from '../ZapSlippage/ZapSlippage.tsx';
import { styles } from './styles.ts';
import { VaultFees } from '../VaultFees/VaultFees.tsx';

const useStyles = legacyMakeStyles(styles);

/**
 * Same-chain vault-to-vault (v2v) migration rendered as the Transact "Migrate" tab. Unlike the old
 * standalone card, the quote lives in the SHARED transact state (built by
 * {@link transactFetchMigrationQuote}, read via the standard `selectTransactSelectedQuote*`
 * selectors) and the standard route/slippage/notice components are reused.
 */
const MigrateFormLoader = memo(function MigrateFormLoader() {
  const vaultId = useAppSelector(selectTransactVaultId);
  const migration = useAppSelector(state => selectVaultReplacementMigration(state, vaultId));

  if (!migration) {
    return null;
  }

  return <MigrateForm oldVaultId={migration.oldVaultId} newVaultId={migration.newVaultId} />;
});

type MigrateFormProps = {
  oldVaultId: VaultEntity['id'];
  newVaultId: VaultEntity['id'];
};

const MigrateForm = memo(function MigrateForm({ oldVaultId, newVaultId }: MigrateFormProps) {
  const classes = useStyles();
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const oldVault = useAppSelector(state => selectVaultById(state, oldVaultId));
  const newVault = useAppSelector(state => selectVaultById(state, newVaultId));
  // gov cowcentrated wrapper ("-rp") reads as "pool", standard wrapper ("-vault") as "vault"
  const typeNoun = t(
    isCowcentratedGovVault(oldVault) ? 'ReplacementVault-Noun-pool' : 'ReplacementVault-Noun-vault'
  );

  const isStepping = useAppSelector(selectIsStepperStepping);
  const isExecuting = useAppSelector(selectTransactExecuting);
  const stepperContent = useAppSelector(selectStepperStepContent);
  const successClosed = useAppSelector(selectTransactSuccessClosed);
  const slippage = useAppSelector(selectTransactSlippage);
  const confirmNeededWithChanges = useAppSelector(selectTransactConfirmNeededWithChanges);

  // quote now lives in shared transact state (no local useState)
  const quote = useAppSelector(selectTransactSelectedQuoteOrUndefined);
  const quoteStatus = useAppSelector(selectTransactQuoteStatus);
  const quoteError = useAppSelector(selectTransactQuoteError);

  // only directly-held shares can be migrated; if everything is boost-staked there is nothing to
  // migrate until the user unstakes (the boost notice guides them), so block the action
  const migratableBalance = useAppSelector(state =>
    selectUserVaultBalanceInShareToken(state, oldVaultId)
  );
  const hasNothingToMigrate = migratableBalance.isZero();

  const [isDisabledByConfirm, setIsDisabledByConfirm] = useState(false);
  const [isDisabledByPriceImpact, setIsDisabledByPriceImpact] = useState(false);
  const requestedRef = useRef(false);

  const fetchQuote = useCallback(() => {
    requestedRef.current = true;
    dispatch(transactFetchMigrationQuote({ oldVaultId, newVaultId }));
  }, [dispatch, oldVaultId, newVaultId]);

  // re-quote when slippage changes, but only once previewed and not mid-stepper
  useEffect(() => {
    if (requestedRef.current && !isStepping && !hasNothingToMigrate) {
      fetchQuote();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed on slippage only
  }, [slippage]);

  // clear the shared quote when leaving the tab so deposit/withdraw don't see a stale migrate quote
  useEffect(() => {
    return () => {
      dispatch(transactClearQuotes());
    };
  }, [dispatch]);

  const handleMigrate = useCallback(() => {
    if (quote) {
      dispatch(executeReplacementMigration(quote, t));
    }
  }, [dispatch, quote, t]);

  const handleClose = useCallback(() => {
    dispatch(transactSetSuccessClosed(false));
    dispatch(transactClearQuotes());
    dispatch(stepperReset());
    requestedRef.current = false;
    // migration done → balance is now zero, so fall back to the Deposit tab
    dispatch(transactSwitchMode(TransactMode.Deposit));
  }, [dispatch]);

  // disable while the confirm flow is pending/rejected, but keep enabled when changes need confirming
  const effectiveDisabledByConfirm = isDisabledByConfirm && !confirmNeededWithChanges;

  // animated-button states (mirrors DepositActions)
  const isSuccessTx = stepperContent === StepContent.SuccessTx;
  const isComplete = successClosed || isSuccessTx;
  const isCreating =
    isExecuting ||
    (isStepping &&
      (stepperContent === StepContent.StartTx || stepperContent === StepContent.WalletTx));
  const isLoading = isExecuting || isStepping;
  const isQuotePending = quoteStatus === TransactStatus.Pending;
  const hasQuote = quoteStatus === TransactStatus.Fulfilled && !!quote;

  return (
    <div className={classes.container}>
      <div className={classes.notice}>
        <Trans t={t} i18nKey="ReplacementVault-Notice" values={{ type: typeNoun }} />
      </div>

      {/* TODO(migrate): replace with `<FeaturedVaultCard vaultId={newVaultId} />` once it lands on
          this branch (see plan). Placeholder keeps the flow testable in the meantime. */}
      <NewVaultCardSlot newVaultId={newVaultId} />

      <div className={classes.zap}>
        <Trans t={t} i18nKey="ReplacementVault-Zap" components={{ Highlight: <Highlight /> }} />
      </div>

      {hasQuote && isZapQuote(quote) ?
        <>
          <ZapRoute quote={quote} expandable={true} />
          <ZapSlippage refetchTransactQuotes={false} />
          <PriceImpactNotice quote={quote} onChange={setIsDisabledByPriceImpact} />
          <ConfirmNotice onChange={setIsDisabledByConfirm} />
          <div className={classes.actions}>
            <ActionConnectSwitch chainId={newVault.chainId}>
              <AnimatedButton
                variant="cta"
                fullWidth={true}
                borderless={true}
                loading={isComplete ? false : isLoading}
                isCreating={isComplete ? false : isCreating}
                isConfirmed={isComplete}
                disabled={
                  !isComplete &&
                  (isStepping ||
                    isExecuting ||
                    hasNothingToMigrate ||
                    isDisabledByPriceImpact ||
                    effectiveDisabledByConfirm)
                }
                onClick={isComplete ? handleClose : handleMigrate}
              >
                {isComplete ?
                  t('Transactn-Close')
                : isCreating ?
                  t('Transact-CreatingTransaction')
                : isStepping ?
                  t('Transact-DepositInProgress')
                : confirmNeededWithChanges ?
                  t('ReplacementVault-Confirm')
                : t('ReplacementVault-Action')}
              </AnimatedButton>
            </ActionConnectSwitch>
            <VaultFees />
          </div>
        </>
      : <>
          <ZapRoutePlaceholder />
          {quoteStatus === TransactStatus.Rejected && quoteError ?
            <QuoteError error={quoteError} />
          : null}
          {/* two-step flow: preview the route first, then "Migrate Now" once it's loaded */}
          <div className={classes.actions}>
            <ActionConnectSwitch chainId={newVault.chainId}>
              <Button
                onClick={fetchQuote}
                variant="cta"
                fullWidth={true}
                borderless={true}
                disabled={isQuotePending || hasNothingToMigrate}
              >
                {isQuotePending ? t('ReplacementVault-Loading') : t('ReplacementVault-Start')}
              </Button>
            </ActionConnectSwitch>
            <VaultFees />
          </div>
        </>
      }

      <MigrateBoostNotice oldVaultId={oldVaultId} />
    </div>
  );
});

/**
 * Placeholder for the new-vault card. The design uses `FeaturedVaultCard`, which is not yet on this
 * branch — swap this for `<FeaturedVaultCard vaultId={newVaultId} />` once it is.
 */
const NewVaultCardSlot = memo(function NewVaultCardSlot({
  newVaultId,
}: {
  newVaultId: VaultEntity['id'];
}) {
  const classes = useStyles();
  const newVault = useAppSelector(state => selectVaultById(state, newVaultId));
  return (
    <div className={classes.cardSlot}>
      <div className={classes.cardSlotName}>{newVault.names.list}</div>
      <div className={classes.cardSlotNote}>{newVault.id}</div>
    </div>
  );
});

/**
 * Boost-staked shares can't be pulled by the zap, so only the directly-held portion migrates. When
 * the user has a boost balance in the old vault, surface the same "unstake it first" notice as the
 * Withdraw tab.
 */
const MigrateBoostNotice = memo(function MigrateBoostNotice({
  oldVaultId,
}: {
  oldVaultId: VaultEntity['id'];
}) {
  const boostBalance = useAppSelector(state =>
    selectUserVaultBalanceInDepositTokenInBoosts(state, oldVaultId)
  );
  if (boostBalance.isZero()) {
    return null;
  }
  return <WithdrawBoostNotice vaultId={oldVaultId} balance={boostBalance} />;
});

const QuoteError = memo(function QuoteError({
  error,
}: {
  error: ReturnType<typeof selectTransactQuoteError>;
}) {
  const { t } = useTranslation();

  if (error && QuoteCowcentratedNoSingleSideError.match(error)) {
    return (
      <AlertError>
        {t('Transact-Notice-CowcentratedNoSingleSideAllowed', {
          inputToken: error.inputToken,
          neededToken: error.neededToken,
        })}
      </AlertError>
    );
  }
  if (error && QuoteCowcentratedNotCalmError.match(error)) {
    return (
      <AlertError>
        <Trans
          t={t}
          i18nKey={`Transact-Quote-Error-Calm-${error.action}`}
          components={{
            LinkCalm: (
              <CalmLink href="https://docs.beefy.finance/beefy-products/clm#calmness-check" />
            ),
          }}
        />
      </AlertError>
    );
  }

  return (
    <AlertError>
      <p>{t('ReplacementVault-Error')}</p>
      {error && error.message ?
        <p>{error.message}</p>
      : null}
    </AlertError>
  );
});

const CalmLink = ({ href, children }: { href: string; children?: ReactNode }) => (
  <ExternalLink
    href={href}
    className={css({ color: 'text.lightest', textDecoration: 'underline' })}
  >
    {children}
  </ExternalLink>
);

function Highlight({ children }: { children?: ReactNode }) {
  const classes = useStyles();
  return <span className={classes.highlight}>{children}</span>;
}

// eslint-disable-next-line no-restricted-syntax -- default export required for React.lazy()
export default MigrateFormLoader;
