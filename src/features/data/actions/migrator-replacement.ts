import type { Namespace, TFunction } from 'react-i18next';
import { groupBy, uniqBy } from 'lodash-es';
import { getTransactApi } from '../apis/instances.ts';
import {
  isVaultToVaultSingleTokenDepositOption,
  type InputTokenAmount,
  type TransactQuote,
  type VaultToVaultSingleTokenDepositQuote,
} from '../apis/transact/transact-types.ts';
import type { SerializedError } from '../apis/transact/strategies/error-types.ts';
import { isSerializableError } from '../apis/transact/strategies/error.ts';
import type { VaultEntity } from '../entities/vault.ts';
import { isTokenErc20 } from '../entities/token.ts';
import { selectUserVaultBalanceInShareToken } from '../selectors/balance.ts';
import { selectTokenByAddress } from '../selectors/tokens.ts';
import { selectVaultById } from '../selectors/vaults.ts';
import { selectWalletAddress } from '../selectors/wallet.ts';
import type { BeefyDispatchFn, BeefyState, BeefyStateFn, BeefyThunk } from '../store/types.ts';
import { createAppAsyncThunk } from '../utils/store-utils.ts';
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

export type TransactFetchMigrationQuoteArgs = {
  oldVaultId: VaultEntity['id'];
  newVaultId: VaultEntity['id'];
};

/**
 * Builds the v2v migration quote and stores it in the shared transact quotes slice (reducer cases
 * in `reducers/wallet/transact.ts`), so the standard `selectTransactSelectedQuote*` selectors work.
 * The Migrate tab drives this directly since it has no input field.
 */
export const transactFetchMigrationQuote = createAppAsyncThunk<
  { quotes: TransactQuote[] },
  TransactFetchMigrationQuoteArgs,
  { state: BeefyState; rejectValue: SerializedError }
>(
  'transact/fetchMigrationQuote',
  async ({ oldVaultId, newVaultId }, { getState, dispatch, rejectWithValue }) => {
    try {
      const quote = await buildReplacementQuote(oldVaultId, newVaultId, dispatch, getState);
      return { quotes: [quote] };
    } catch (e: unknown) {
      if (isSerializableError(e)) {
        return rejectWithValue(e.serialize());
      }
      throw e;
    }
  }
);

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
