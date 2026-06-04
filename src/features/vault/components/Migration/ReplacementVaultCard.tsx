import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Button } from '../../../../components/Button/Button.tsx';
import {
  AnimatedButton,
  CowAnimationProvider,
} from '../../../../components/Button/AnimatedButton.tsx';
import { AlertError } from '../../../../components/Alerts/Alerts.tsx';
import { ExternalLink } from '../../../../components/Links/ExternalLink.tsx';
import { formatPercent } from '../../../../helpers/format.ts';
import { legacyMakeStyles } from '../../../../helpers/mui.ts';
import { getPlatformSrc } from '../../../../helpers/platformsSrc.ts';
import { BIG_ONE } from '../../../../helpers/big-number.ts';
import {
  executeReplacementMigration,
  fetchReplacementMigrationQuote,
} from '../../../data/actions/migrator-replacement.ts';
import { transactClearInput, transactSetSuccessClosed } from '../../../data/actions/transact.ts';
import { stepperReset } from '../../../data/actions/wallet/stepper.ts';
import { StepContent } from '../../../data/reducers/wallet/stepper-types.ts';
import type { VaultEntity } from '../../../data/entities/vault.ts';
import {
  isZapFeeDiscounted,
  type VaultToVaultSingleTokenDepositQuote,
} from '../../../data/apis/transact/transact-types.ts';
import {
  QuoteCowcentratedNoSingleSideError,
  QuoteCowcentratedNotCalmError,
} from '../../../data/apis/transact/strategies/error.ts';
import { serializeError } from '../../../data/apis/transact/strategies/error.ts';
import type { SerializedError } from '../../../data/apis/transact/strategies/error-types.ts';
import {
  selectUserVaultBalanceInShareTokenIncludingDisplaced,
  selectUserVaultBalanceInUsdIncludingDisplaced,
} from '../../../data/selectors/balance.ts';
import {
  selectIsStepperStepping,
  selectStepperStepContent,
} from '../../../data/selectors/stepper.ts';
import {
  selectTransactConfirmNeededWithChanges,
  selectTransactExecuting,
  selectTransactSelectedQuoteOrUndefined,
  selectTransactSlippage,
  selectTransactSuccessClosed,
} from '../../../data/selectors/transact.ts';
import {
  selectVaultById,
  selectVaultReplacementMigration,
} from '../../../data/selectors/vaults.ts';
import { selectWalletAddressIfKnown } from '../../../data/selectors/wallet.ts';
import { useAppDispatch, useAppSelector } from '../../../data/store/hooks.ts';
import { ActionConnectSwitch } from '../Actions/Transact/CommonActions/CommonActions.tsx';
import { ConfirmNotice } from '../Actions/Transact/ConfirmNotice/ConfirmNotice.tsx';
import { PriceImpactNotice } from '../Actions/Transact/PriceImpactNotice/PriceImpactNotice.tsx';
import { ZapRoute, ZapRoutePlaceholder } from '../Actions/Transact/ZapRoute/ZapRoute.tsx';
import { ZapSlippage } from '../Actions/Transact/ZapSlippage/ZapSlippage.tsx';
import { IconWithTooltip } from '../../../../components/Tooltip/IconWithTooltip.tsx';
import { BasicTooltipContent } from '../../../../components/Tooltip/BasicTooltipContent.tsx';
import InfoIcon from '../../../../images/icons/info-rounded-square.svg?react';
import { styles } from './styles.ts';
import { styled } from '@repo/styles/jsx';

const useStyles = legacyMakeStyles(styles);

interface ReplacementVaultCardProps {
  vaultId: VaultEntity['id'];
}

/**
 * Self-contained card that migrates a user from an old vault into its replacement using the
 * same-chain vault-to-vault (v2v) zap. It owns its own quote + execution flow (two CTAs:
 * "Start migration" -> quote, then "Migrate now" -> approve + zap) and does NOT touch the shared
 * transact form/reducer.
 *
 * `replacementVaultId` lives on the naked (hidden) CLM, but users hold a wrapper (gov "-rp" pool or
 * standard "-vault"); {@link selectVaultReplacementMigration} maps the page wrapper to the
 * same-kind wrapper on the other side of the replacement.
 */
export const ReplacementVaultCard = memo(function ReplacementVaultCard({
  vaultId,
}: ReplacementVaultCardProps) {
  const walletAddress = useAppSelector(selectWalletAddressIfKnown);
  const migration = useAppSelector(state => selectVaultReplacementMigration(state, vaultId));

  if (!walletAddress || !migration) {
    return null;
  }

  return (
    <MigrateGate
      walletAddress={walletAddress}
      oldVaultId={migration.oldVaultId}
      newVaultId={migration.newVaultId}
    />
  );
});

type MigrateProps = {
  walletAddress: string;
  oldVaultId: VaultEntity['id'];
  newVaultId: VaultEntity['id'];
};

/**
 * Gates visibility independently from the live balance poll:
 * - Latch on first show: once the user is seen to have a balance in the old vault, keep the card
 *   mounted for the rest of the session so the periodic (~3min) balance refetch can't make it flicker
 *   or disappear mid-flow.
 * - Session dismiss: pressing Close after a successful migration hides it for the session (a reload
 *   re-evaluates from the now-zero balance, so it stays gone naturally — no localStorage needed).
 */
const MigrateGate = memo(function MigrateGate({
  walletAddress,
  oldVaultId,
  newVaultId,
}: MigrateProps) {
  const shareBalance = useAppSelector(state =>
    selectUserVaultBalanceInShareTokenIncludingDisplaced(state, oldVaultId, walletAddress)
  );
  const balanceUsd = useAppSelector(state =>
    selectUserVaultBalanceInUsdIncludingDisplaced(state, oldVaultId, walletAddress)
  );
  const hasBalance = balanceUsd.gte(BIG_ONE) && shareBalance.gt(0);

  const [dismissed, setDismissed] = useState(false);
  const everHadBalanceRef = useRef(false);
  if (hasBalance) {
    everHadBalanceRef.current = true;
  }

  const handleDismiss = useCallback(() => setDismissed(true), []);

  if (dismissed || !everHadBalanceRef.current) {
    return null;
  }

  return <Migrate oldVaultId={oldVaultId} newVaultId={newVaultId} onDismiss={handleDismiss} />;
});

type MigrateInnerProps = {
  oldVaultId: VaultEntity['id'];
  newVaultId: VaultEntity['id'];
  onDismiss: () => void;
};

const Migrate = memo(function Migrate({ oldVaultId, newVaultId, onDismiss }: MigrateInnerProps) {
  const classes = useStyles();
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const newVault = useAppSelector(state => selectVaultById(state, newVaultId));
  const isStepping = useAppSelector(selectIsStepperStepping);
  const isExecuting = useAppSelector(selectTransactExecuting);
  const stepperContent = useAppSelector(selectStepperStepContent);
  const successClosed = useAppSelector(selectTransactSuccessClosed);
  const slippage = useAppSelector(selectTransactSlippage);
  // when the pre-execute re-quote finds a significant output change, ConfirmNotice shows and the
  // user must re-confirm; the updated quote lands in global transact state
  const confirmNeededWithChanges = useAppSelector(selectTransactConfirmNeededWithChanges);
  const confirmUpdatedQuote = useAppSelector(selectTransactSelectedQuoteOrUndefined);

  const [quote, setQuote] = useState<VaultToVaultSingleTokenDepositQuote | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<SerializedError | undefined>(undefined);
  const [isDisabledByConfirm, setIsDisabledByConfirm] = useState(false);
  const [isDisabledByPriceImpact, setIsDisabledByPriceImpact] = useState(false);
  const requestedRef = useRef(false);

  const fetchQuote = useCallback(() => {
    requestedRef.current = true;
    setLoading(true);
    setError(undefined);
    // clear any stale confirm/quote state (e.g. from the transact form or a prior attempt)
    dispatch(transactClearInput());
    dispatch(fetchReplacementMigrationQuote(oldVaultId, newVaultId))
      .then(setQuote)
      .catch((e: unknown) => {
        console.error('Failed to fetch replacement migration quote', e);
        setQuote(undefined);
        setError(serializeError(e));
      })
      .finally(() => setLoading(false));
  }, [dispatch, oldVaultId, newVaultId]);

  // re-quote when slippage changes, but only once the user has previewed at least once
  useEffect(() => {
    if (requestedRef.current && !isStepping) {
      fetchQuote();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed on slippage only
  }, [slippage]);

  const handleMigrate = useCallback(() => {
    // on re-confirm, execute the quote the price-drift re-check stored in global state; otherwise
    // the locally-built preview quote
    const toExecute = confirmNeededWithChanges && confirmUpdatedQuote ? confirmUpdatedQuote : quote;
    if (toExecute) {
      dispatch(executeReplacementMigration(toExecute, t));
    }
  }, [dispatch, quote, confirmNeededWithChanges, confirmUpdatedQuote, t]);

  const handleClose = useCallback(() => {
    dispatch(transactSetSuccessClosed(false));
    dispatch(transactClearInput());
    dispatch(stepperReset());
    setQuote(undefined);
    requestedRef.current = false;
    // hide the card for this session (the migration is done); a reload re-evaluates from balance
    onDismiss();
  }, [dispatch, onDismiss]);

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

  return (
    <CowAnimationProvider>
      <div className={classes.container}>
        <div className={classes.replacementHeader}>
          <div className={classes.replacementTitle}>{t('ReplacementVault-Title')}</div>
          <img
            className={classes.replacementIcon}
            alt=""
            aria-hidden={true}
            src={getPlatformSrc(newVault.platformId)}
          />
        </div>
        <div className={classes.replacementContent}>
          <div className={classes.text}>
            <Trans
              t={t}
              i18nKey="ReplacementVault-Text"
              components={{ Highlight: <Highlight />, br: <br /> }}
            />
          </div>

          {quote ?
            <>
              <ZapRoute quote={quote} expandable={true} />
              <ZapSlippage refetchTransactQuotes={false} />
              {error ?
                <QuoteError error={error} />
              : null}
              <PriceImpactNotice quote={quote} onChange={setIsDisabledByPriceImpact} />
              <ConfirmNotice onChange={setIsDisabledByConfirm} />
              <ActionsContainer>
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
                        loading ||
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
                <ZapFee fee={quote.fee.value} original={getOriginalFee(quote)} />
              </ActionsContainer>
            </>
          : <>
              <ZapRoutePlaceholder />
              {error ?
                <QuoteError error={error} />
              : null}
              <ActionsContainer>
                <ActionConnectSwitch chainId={newVault.chainId}>
                  <Button
                    onClick={fetchQuote}
                    variant="cta"
                    fullWidth={true}
                    borderless={true}
                    disabled={loading}
                  >
                    {loading ? t('ReplacementVault-Loading') : t('ReplacementVault-Start')}
                  </Button>
                </ActionConnectSwitch>
                <ZapFee fee={0} original={0.0005} />
              </ActionsContainer>
            </>
          }
        </div>
      </div>
    </CowAnimationProvider>
  );
});

function getOriginalFee(quote: VaultToVaultSingleTokenDepositQuote): number | undefined {
  return isZapFeeDiscounted(quote.fee) ? quote.fee.original : undefined;
}

const QuoteError = memo(function QuoteError({ error }: { error: SerializedError }) {
  const { t } = useTranslation();

  if (QuoteCowcentratedNoSingleSideError.match(error)) {
    return (
      <AlertError>
        {t('Transact-Notice-CowcentratedNoSingleSideAllowed', {
          inputToken: error.inputToken,
          neededToken: error.neededToken,
        })}
      </AlertError>
    );
  }
  if (QuoteCowcentratedNotCalmError.match(error)) {
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
      {error.message ?
        <p>{error.message}</p>
      : null}
    </AlertError>
  );
});

const ZapFee = memo(function ZapFee({
  fee,
  original,
}: {
  fee: number;
  original: number | undefined;
}) {
  const classes = useStyles();
  const { t } = useTranslation();
  return (
    <div className={classes.feeContainer}>
      <span className={classes.feeLabel}>
        {t('Transact-Fee-Zap')}
        <IconWithTooltip
          Icon={InfoIcon}
          iconSize={16}
          iconCss={styles.feeInfoIcon}
          tooltip={
            <BasicTooltipContent
              title={t('Transact-Fee-Zap')}
              content={t('ReplacementVault-Fee-Explainer')}
            />
          }
        />
      </span>
      <span className={classes.feeValue}>
        {original !== undefined && original !== fee ?
          <>
            <span className={classes.feeOriginal}>{formatPercent(original, 2)}</span>
            <span aria-hidden={true}>→</span>
          </>
        : null}
        {formatPercent(fee, 2)}
      </span>
    </div>
  );
});

const ActionsContainer = styled('div', {
  base: {
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'background.content.light',
    borderRadius: '8px',
  },
});

const CalmLink = styled(ExternalLink, {
  base: {
    color: 'text.lightest',
    textDecoration: 'underline',
  },
});

function Highlight({ children }: { children?: ReactNode }) {
  const classes = useStyles();
  return <span className={classes.highlight}>{children}</span>;
}
