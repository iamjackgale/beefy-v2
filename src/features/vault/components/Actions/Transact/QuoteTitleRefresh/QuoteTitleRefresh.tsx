import { css, cx, type CssStyles } from '@repo/styles/css';
import { memo, useCallback } from 'react';
import { legacyMakeStyles } from '../../../../../../helpers/mui.ts';
import { useAppDispatch } from '../../../../../data/store/hooks.ts';
import Refresh from '../../../../../../images/icons/mui/Refresh.svg?react';
import { transactFetchQuotes } from '../../../../../data/actions/transact.ts';
import { styles } from './styles.ts';

const useStyles = legacyMakeStyles(styles);

export type QuoteTitleRefreshProps = {
  title: string;
  enableRefresh?: boolean;
  refreshCountdown?: number;
  refreshSpinning?: boolean;
  onRefresh?: () => void;
  css?: CssStyles;
};
export const QuoteTitleRefresh = memo(function QuoteTitleRefresh({
  title,
  enableRefresh = false,
  refreshCountdown,
  refreshSpinning = false,
  onRefresh,
  css: cssProp,
}: QuoteTitleRefreshProps) {
  const classes = useStyles();
  const dispatch = useAppDispatch();
  const handleRefresh = useCallback(() => {
    if (onRefresh) {
      onRefresh();
      return;
    }

    dispatch(transactFetchQuotes());
  }, [dispatch, onRefresh]);

  return (
    <div className={css(styles.holder, cssProp)}>
      <div className={classes.title}>{title}</div>
      {enableRefresh ?
        <button type="button" className={classes.refreshButton} onClick={handleRefresh}>
          <Refresh
            className={cx(classes.refreshIcon, refreshSpinning && classes.refreshIconSpin)}
          />
          {refreshCountdown !== undefined ?
            <span className={classes.refreshCountdown}>{refreshCountdown}</span>
          : null}
        </button>
      : null}
    </div>
  );
});
