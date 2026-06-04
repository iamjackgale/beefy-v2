import type { Namespace, TFunction } from 'react-i18next';
import { groupBy, uniqBy } from 'lodash-es';
import { getTransactApi } from '../apis/instances.ts';
import {
  isVaultToVaultSingleTokenDepositOption,
  type InputTokenAmount,
  type TransactQuote,
  type VaultToVaultSingleTokenDepositQuote,
} from '../apis/transact/transact-types.ts';
import type { VaultEntity } from '../entities/vault.ts';
import { isTokenErc20 } from '../entities/token.ts';
import { selectUserVaultBalanceInShareToken } from '../selectors/balance.ts';
import { selectTokenByAddress } from '../selectors/tokens.ts';
import { selectVaultById } from '../selectors/vaults.ts';
import { selectWalletAddress } from '../selectors/wallet.ts';
import type { BeefyDispatchFn, BeefyStateFn, BeefyThunk } from '../store/types.ts';
import { fetchAllowanceAction } from './allowance.ts';
import { transactSteps } from './wallet/transact.ts';

/**
 * Standalone same-chain vault-to-vault (v2v) migration, fully decoupled from the transact form.
 *
 * `replacementVaultId` migrations move a user from an OLD wrapper vault into the NEW wrapper vault
 * of the replacement CLM. We always model this as a DEPOSIT into the NEW vault sourced from the
 * OLD vault: `fetchDepositOptionsFor(newVaultId)` enumerates source vaults, and we pick the option
 * whose `srcVaultId === oldVaultId`. This works the same whichever page the user is on, because the
 * vault ids are passed explicitly rather than read from transact UI state.
 */
async function buildReplacementQuote(
  oldVaultId: VaultEntity['id'],
  newVaultId: VaultEntity['id'],
  dispatch: BeefyDispatchFn,
  getState: BeefyStateFn
): Promise<VaultToVaultSingleTokenDepositQuote> {
  const state = getState();
  const walletAddress = selectWalletAddress(state);
  if (!walletAddress) {
    throw new Error('Wallet not connected');
  }

  const api = await getTransactApi();
  const options = await api.fetchDepositOptionsFor(newVaultId, getState);
  const option = options.find(
    o => isVaultToVaultSingleTokenDepositOption(o) && o.srcVaultId === oldVaultId
  );
  if (!option || !isVaultToVaultSingleTokenDepositOption(option)) {
    throw new Error(`No v2v migration option from ${oldVaultId} into ${newVaultId}`);
  }

  // input is the user's directly-held position in the old vault, denominated in its share token.
  // Boost-staked (and bridged/pending) shares are excluded because the zap can only pull shares
  // held in the wallet; the card surfaces a notice prompting the user to unstake those separately.
  const oldVault = selectVaultById(state, oldVaultId);
  const shareToken = selectTokenByAddress(state, oldVault.chainId, oldVault.contractAddress);
  const amount = selectUserVaultBalanceInShareToken(state, oldVaultId, walletAddress);
  const input: InputTokenAmount = { token: shareToken, amount, max: true };

  const quotes = await api.fetchDepositQuotesFor([option], [input], getState);
  const quote = quotes.find(q => q.option.id === option.id);
  if (!quote) {
    throw new Error('Failed to build migration quote');
  }

  // Fetch the quote's allowances into state so the approval-step check (in getTransactSteps) sees
  // the real on-chain allowance and skips approval when already approved. Without this the standalone
  // flow never populates the share-token->zap allowance, so it always asks to approve.
  const erc20Allowances = quote.allowances.flatMap(a =>
    isTokenErc20(a.token) ? [{ token: a.token, spenderAddress: a.spenderAddress }] : []
  );
  const byChainSpender = groupBy(
    uniqBy(erc20Allowances, a => `${a.token.chainId}-${a.spenderAddress}-${a.token.address}`),
    a => `${a.token.chainId}-${a.spenderAddress}`
  );
  await Promise.all(
    Object.values(byChainSpender).map(allowances =>
      dispatch(
        fetchAllowanceAction({
          chainId: allowances[0].token.chainId,
          spenderAddress: allowances[0].spenderAddress,
          tokens: allowances.map(a => a.token),
          walletAddress,
        })
      )
    )
  );

  return quote as VaultToVaultSingleTokenDepositQuote;
}

/** "Start migration" CTA: fetch the v2v deposit quote and prime its allowances in state. */
export function fetchReplacementMigrationQuote(
  oldVaultId: VaultEntity['id'],
  newVaultId: VaultEntity['id']
): BeefyThunk<Promise<VaultToVaultSingleTokenDepositQuote>> {
  return async (dispatch, getState) =>
    buildReplacementQuote(oldVaultId, newVaultId, dispatch, getState);
}

/**
 * "Migrate now" CTA: run approval(s) + the zap via the shared stepper.
 * Reuses {@link transactSteps}, which builds allowance steps from `quote.allowances`, re-quotes to
 * guard against price drift (populating the global confirm state consumed by `ConfirmNotice`), and
 * starts the stepper. It only reads slippage from transact state.
 */
export function executeReplacementMigration(
  quote: TransactQuote,
  t: TFunction<Namespace>
): BeefyThunk {
  return transactSteps(quote, t);
}
