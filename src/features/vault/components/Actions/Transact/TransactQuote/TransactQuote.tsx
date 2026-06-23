import { css, type CssStyles } from '@repo/styles/css';
import type BigNumber from 'bignumber.js';
import { debounce } from 'lodash-es';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { AlertError, AlertWarning } from '../../../../../../components/Alerts/Alerts.tsx';
import { BIG_ZERO } from '../../../../../../helpers/big-number.ts';
import { legacyMakeStyles } from '../../../../../../helpers/mui.ts';
import { useAppDispatch, useAppSelector } from '../../../../../data/store/hooks.ts';
import {
  transactClearQuotes,
  transactFetchQuotes,
  transactFetchQuotesIfNeeded,
} from '../../../../../data/actions/transact.ts';
import {
  CrossChainBridgeBelowFeeError,
  QuoteCowcentratedNoSingleSideError,
  QuoteCowcentratedNotCalmError,
} from '../../../../../data/apis/transact/strategies/error.ts';
import {
  type CowcentratedVaultDepositQuote,
  type CowcentratedZapDepositQuote,
  type CowcentratedDualZapDepositQuote,
  isCowcentratedDepositQuote,
  isZapQuote,
  quoteNeedsSlippage,
} from '../../../../../data/apis/transact/transact-types.ts';
import { isCowcentratedLikeVault } from '../../../../../data/entities/vault.ts';
import {
  TransactMode,
  TransactStatus,
} from '../../../../../data/reducers/wallet/transact-types.ts';
import {
  selectTransactCrossChainPreflight,
  selectTransactInputAmounts,
  selectTransactInputMaxes,
  selectTransactMode,
  selectTransactQuoteError,
  selectTransactQuoteStatus,
  selectTransactSelected,
  selectTransactSelectedChainId,
  selectTransactSelectedQuote,
  selectTransactSelectedSelectionId,
  selectTransactSlippage,
  selectTransactVaultId,
} from '../../../../../data/selectors/transact.ts';
import { selectVaultById } from '../../../../../data/selectors/vaults.ts';
import { QuoteTitleRefresh } from '../QuoteTitleRefresh/QuoteTitleRefresh.tsx';
import { TokenAmountIcon, TokenAmountIconLoader } from '../TokenAmountIcon/TokenAmountIcon.tsx';
import { ZapRoute } from '../ZapRoute/ZapRoute.tsx';
import { ZapSlippage } from '../ZapSlippage/ZapSlippage.tsx';
import { styles } from './styles.ts';
import { ExternalLink } from '../../../../../../components/Links/ExternalLink.tsx';

const useStyles = legacyMakeStyles(styles);
const NOT_CALM_REFRESH_SECONDS = 10;
const NOT_CALM_SUCCESS_LOADING_MS = 600;

export type TransactQuoteProps = {
  title: string;
  css?: CssStyles;
};
export const TransactQuote = memo(function TransactQuote({
  title,
  css: cssProp,
}: TransactQuoteProps) {
  const dispatch = useAppDispatch();
  const mode = useAppSelector(selectTransactMode);
  const selectionId = useAppSelector(selectTransactSelectedSelectionId);
  const selection = useAppSelector(selectTransactSelected);
  const inputAmounts = useAppSelector(selectTransactInputAmounts);
  const inputMaxes = useAppSelector(selectTransactInputMaxes);
  const chainId = useAppSelector(selectTransactSelectedChainId);
  const status = useAppSelector(selectTransactQuoteStatus);
  const quoteError = useAppSelector(selectTransactQuoteError);
  const preflightOk = useAppSelector(selectTransactCrossChainPreflight);
  const slippage = useAppSelector(selectTransactSlippage);
  const isNotCalmDepositError =
    !!quoteError &&
    QuoteCowcentratedNotCalmError.match(quoteError) &&
    quoteError.action === 'deposit';
  const [notCalmAutoRefresh, setNotCalmAutoRefresh] = useState(false);
  const [stickyNotCalmWarning, setStickyNotCalmWarning] = useState(false);
  const [notCalmRefreshSeconds, setNotCalmRefreshSeconds] = useState(NOT_CALM_REFRESH_SECONDS);
  const [notCalmRefreshSpinning, setNotCalmRefreshSpinning] = useState(false);
  const [notCalmSuccessLoading, setNotCalmSuccessLoading] = useState(false);
  const notCalmRefreshTimeout = useRef<number | undefined>(undefined);
  const notCalmSuccessLoadingTimeout = useRef<number | undefined>(undefined);
  const showNotCalmSuccessLoading =
    status === TransactStatus.Fulfilled && (stickyNotCalmWarning || notCalmSuccessLoading);
  const showStickyNotCalmWarning = status === TransactStatus.Pending && stickyNotCalmWarning;
  const showNotCalmWarning = isNotCalmDepositError || showStickyNotCalmWarning;
  const showNotCalmRefresh = notCalmAutoRefresh && !showNotCalmSuccessLoading;
  const inputIsZero = useMemo(
    () => inputAmounts.every(amount => amount.lte(BIG_ZERO)),
    [inputAmounts]
  );
  const debouncedFetchQuotes = useMemo(
    () =>
      debounce(
        (
          dispatch: ReturnType<typeof useAppDispatch>,
          inputAmounts: BigNumber[],
          preflightOk: boolean
        ) => {
          const inputIsZero = inputAmounts.every(amount => amount.lte(BIG_ZERO));
          if (inputIsZero || !preflightOk) {
            dispatch(transactClearQuotes());
          } else {
            dispatch(transactFetchQuotesIfNeeded());
          }
        },
        200,
        { leading: false, trailing: true, maxWait: 1000 }
      ),
    []
  );

  useEffect(() => {
    debouncedFetchQuotes(dispatch, inputAmounts, preflightOk);
  }, [
    dispatch,
    mode,
    chainId,
    selectionId,
    selection,
    inputAmounts,
    inputMaxes,
    preflightOk,
    debouncedFetchQuotes,
  ]);

  // slippage isn't part of the if-needed change check, so force a re-quote when it changes
  const skipInitialSlippageRequote = useRef(true);
  const skipInitialNotCalmReset = useRef(true);
  useEffect(() => {
    if (skipInitialSlippageRequote.current) {
      skipInitialSlippageRequote.current = false;
      return;
    }
    const inputIsZero = inputAmounts.every(amount => amount.lte(BIG_ZERO));
    if (!inputIsZero && preflightOk) {
      dispatch(transactFetchQuotes());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed on slippage only
  }, [slippage]);

  const handleNotCalmRefresh = useCallback(() => {
    setNotCalmAutoRefresh(true);
    setNotCalmRefreshSeconds(0);
    setNotCalmRefreshSpinning(true);

    if (!inputIsZero && preflightOk && status !== TransactStatus.Pending) {
      dispatch(transactFetchQuotes());
    }

    if (notCalmRefreshTimeout.current !== undefined) {
      window.clearTimeout(notCalmRefreshTimeout.current);
    }
    notCalmRefreshTimeout.current = window.setTimeout(() => {
      setNotCalmRefreshSpinning(false);
      setNotCalmRefreshSeconds(NOT_CALM_REFRESH_SECONDS);
      notCalmRefreshTimeout.current = undefined;
    }, 600);
  }, [dispatch, inputIsZero, preflightOk, status]);

  useEffect(() => {
    if (isNotCalmDepositError) {
      setNotCalmAutoRefresh(true);
      setStickyNotCalmWarning(true);
      setNotCalmRefreshSeconds(NOT_CALM_REFRESH_SECONDS);
      setNotCalmSuccessLoading(false);
    } else if (status === TransactStatus.Fulfilled) {
      if (stickyNotCalmWarning && notCalmSuccessLoadingTimeout.current === undefined) {
        setNotCalmSuccessLoading(true);
        notCalmSuccessLoadingTimeout.current = window.setTimeout(() => {
          setNotCalmSuccessLoading(false);
          notCalmSuccessLoadingTimeout.current = undefined;
        }, NOT_CALM_SUCCESS_LOADING_MS);
      }
      setNotCalmAutoRefresh(false);
      setNotCalmRefreshSpinning(false);
      setNotCalmRefreshSeconds(NOT_CALM_REFRESH_SECONDS);
      setStickyNotCalmWarning(false);
      if (notCalmRefreshTimeout.current !== undefined) {
        window.clearTimeout(notCalmRefreshTimeout.current);
        notCalmRefreshTimeout.current = undefined;
      }
    } else if (
      status === TransactStatus.Idle ||
      (status === TransactStatus.Rejected && quoteError)
    ) {
      setNotCalmAutoRefresh(false);
      setNotCalmRefreshSpinning(false);
      setNotCalmRefreshSeconds(NOT_CALM_REFRESH_SECONDS);
      setStickyNotCalmWarning(false);
      setNotCalmSuccessLoading(false);
      if (notCalmRefreshTimeout.current !== undefined) {
        window.clearTimeout(notCalmRefreshTimeout.current);
        notCalmRefreshTimeout.current = undefined;
      }
    }
  }, [isNotCalmDepositError, quoteError, status, stickyNotCalmWarning]);

  useEffect(() => {
    if (skipInitialNotCalmReset.current) {
      skipInitialNotCalmReset.current = false;
      return;
    }

    setStickyNotCalmWarning(false);
    setNotCalmAutoRefresh(false);
    setNotCalmRefreshSpinning(false);
    setNotCalmRefreshSeconds(NOT_CALM_REFRESH_SECONDS);
    setNotCalmSuccessLoading(false);
    if (notCalmRefreshTimeout.current !== undefined) {
      window.clearTimeout(notCalmRefreshTimeout.current);
      notCalmRefreshTimeout.current = undefined;
    }
  }, [chainId, inputAmounts, inputMaxes, mode, selection, selectionId]);

  useEffect(() => {
    if (!notCalmAutoRefresh || notCalmRefreshSpinning) {
      return;
    }

    if (notCalmRefreshSeconds <= 0) {
      handleNotCalmRefresh();
      return;
    }

    const timeout = window.setTimeout(() => {
      setNotCalmRefreshSeconds(seconds => Math.max(seconds - 1, 0));
    }, 1000);

    return () => window.clearTimeout(timeout);
  }, [handleNotCalmRefresh, notCalmAutoRefresh, notCalmRefreshSeconds, notCalmRefreshSpinning]);

  useEffect(() => {
    return () => {
      if (notCalmRefreshTimeout.current !== undefined) {
        window.clearTimeout(notCalmRefreshTimeout.current);
      }
      if (notCalmSuccessLoadingTimeout.current !== undefined) {
        window.clearTimeout(notCalmSuccessLoadingTimeout.current);
      }
    };
  }, []);

  if (status === TransactStatus.Idle) {
    return <QuoteIdle title={title} css={cssProp} />;
  }

  return (
    <div className={css(cssProp)}>
      <QuoteTitleRefresh
        title={title}
        enableRefresh={
          status === TransactStatus.Pending ||
          status === TransactStatus.Fulfilled ||
          status === TransactStatus.Rejected ||
          showNotCalmWarning
        }
        onRefresh={showNotCalmRefresh ? handleNotCalmRefresh : undefined}
        autoRefresh={true}
        autoRefreshSeconds={NOT_CALM_REFRESH_SECONDS}
      />
      {(
        (status === TransactStatus.Pending && !showStickyNotCalmWarning) ||
        showNotCalmSuccessLoading
      ) ?
        <QuoteLoading />
      : null}
      {status === TransactStatus.Fulfilled && !showNotCalmSuccessLoading ?
        <QuoteLoaded />
      : null}
      {status === TransactStatus.Rejected || showStickyNotCalmWarning ?
        <QuoteError showNotCalmDeposit={showStickyNotCalmWarning} />
      : null}
    </div>
  );
});

const QuoteIdle = memo(function QuoteIdle({ title, css: cssProp }: TransactQuoteProps) {
  const classes = useStyles();
  const vaultId = useAppSelector(selectTransactVaultId);
  const vault = useAppSelector(state => selectVaultById(state, vaultId));

  return (
    <div className={css(styles.disabled, cssProp)}>
      <QuoteTitleRefresh
        title={title}
        enableRefresh={true}
        autoRefresh={false}
        autoRefreshSeconds={NOT_CALM_REFRESH_SECONDS}
      />
      <div className={classes.tokenAmounts}>
        {isCowcentratedLikeVault(vault) ?
          <div className={classes.amountReturned}>
            {vault.depositTokenAddresses.map(tokenAddress => {
              return (
                <TokenAmountIcon
                  key={tokenAddress}
                  amount={BIG_ZERO}
                  chainId={vault.chainId}
                  tokenAddress={tokenAddress}
                  css={styles.fullWidth}
                />
              );
            })}
          </div>
        : <TokenAmountIcon
            amount={BIG_ZERO}
            chainId={vault.chainId}
            tokenAddress={vault.depositTokenAddress}
          />
        }
      </div>
    </div>
  );
});

type QuoteErrorProps = {
  showNotCalmDeposit?: boolean;
};

const QuoteError = memo(function QuoteError({ showNotCalmDeposit = false }: QuoteErrorProps) {
  const classes = useStyles();
  const { t } = useTranslation();
  const error = useAppSelector(selectTransactQuoteError);
  const mode = useAppSelector(selectTransactMode);

  if (
    showNotCalmDeposit ||
    (error && QuoteCowcentratedNotCalmError.match(error) && error.action === 'deposit')
  ) {
    return (
      <AlertWarning>
        <Trans
          t={t}
          i18nKey="Transact-Quote-Error-Calm-deposit"
          components={{
            LinkCalm: (
              <ExternalLink
                className={classes.link}
                href={'https://docs.beefy.finance/beefy-products/clm#calmness-check'}
              />
            ),
          }}
        />
      </AlertWarning>
    );
  }

  if (error) {
    if (CrossChainBridgeBelowFeeError.match(error)) {
      const action = mode === TransactMode.Deposit ? 'deposit' : 'withdraw';
      return <AlertError>{t(`Transact-Quote-Error-CrossChain-TooLow-${action}`)}</AlertError>;
    }
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
                <ExternalLink
                  className={classes.link}
                  href={'https://docs.beefy.finance/beefy-products/clm#calmness-check'}
                />
              ),
            }}
          />
        </AlertError>
      );
    }
  }

  return (
    <AlertError>
      <p>{t('Transact-Quote-Error')}</p>
      {error && error.message ?
        <p>{error.message}</p>
      : null}
    </AlertError>
  );
});

const QuoteLoading = memo(function QuoteLoading() {
  return <TokenAmountIconLoader />;
});

const QuoteLoaded = memo(function QuoteLoaded() {
  // const { t } = useTranslation();
  const classes = useStyles();
  const quote = useAppSelector(selectTransactSelectedQuote);
  const isZap = isZapQuote(quote);
  const needsSlippage = quoteNeedsSlippage(quote);

  return (
    <>
      <div className={classes.tokenAmounts}>
        {isCowcentratedDepositQuote(quote) ?
          <CowcentratedLoadedQuote quote={quote} />
        : <>
            {quote.outputs.map(({ token, amount }) => (
              <TokenAmountIcon
                key={token.address}
                amount={amount}
                chainId={token.chainId}
                tokenAddress={token.address}
              />
            ))}
          </>
        }
      </div>
      {/*      {quote.returned.length ? (
            <div className={classes.returned}>
              <div className={classes.returnedTitle}>{t('Transact-Returned')}</div>
              <div className={classes.tokenAmounts}>
                {quote.returned.map(({ token, amount }) => (
                  <TokenAmountIcon
                    key={token.address}
                    amount={amount}
                    chainId={token.chainId}
                    tokenAddress={token.address}
                  />
                ))}
              </div>
            </div>
          ) : null}*/}
      {isZap ?
        <ZapRoute quote={quote} css={styles.route} />
      : null}
      {needsSlippage ?
        <ZapSlippage css={styles.slippage} />
      : null}
    </>
  );
});

export const CowcentratedLoadedQuote = memo(function CowcentratedLoadedQuote({
  quote,
}: {
  quote:
    | CowcentratedVaultDepositQuote
    | CowcentratedZapDepositQuote
    | CowcentratedDualZapDepositQuote;
}) {
  const { t } = useTranslation();
  const shares = quote.outputs[0];
  const vaultId = useAppSelector(selectTransactVaultId);
  const vault = useAppSelector(state => selectVaultById(state, vaultId));
  const classes = useStyles();

  return (
    <div className={classes.cowcentratedDepositContainer}>
      <div className={classes.amountReturned}>
        {quote.used.map(used => {
          return (
            <TokenAmountIcon
              key={used.token.id}
              amount={used.amount}
              chainId={used.token.chainId}
              tokenAddress={used.token.address}
              showSymbol={false}
              css={styles.fullWidth}
              tokenImageSize={28}
              amountWithValueCss={styles.alignItemsEnd}
            />
          );
        })}
      </div>
      <div className={classes.label}>{t('Transact-YourPositionWillBe')}</div>
      <div className={classes.cowcentratedSharesDepositContainer}>
        <TokenAmountIcon
          key={shares.token.id}
          amount={shares.amount}
          chainId={shares.token.chainId}
          tokenAddress={vault.depositTokenAddress}
          css={styles.mainLp}
        />
        <div className={classes.amountReturned}>
          {quote.position.map((position, i) => {
            return (
              <TokenAmountIcon
                key={position.token.id}
                amount={position.amount}
                chainId={position.token.chainId}
                tokenAddress={position.token.address}
                css={css.raw(
                  styles.fullWidth,
                  i === 0 ? styles.borderRadiusToken0 : styles.borderRadiusToken1
                )}
                showSymbol={false}
                tokenImageSize={28}
                amountWithValueCss={styles.alignItemsEnd}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
});
