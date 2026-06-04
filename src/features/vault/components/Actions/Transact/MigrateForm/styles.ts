import { css } from '@repo/styles/css';

export const styles = {
  container: css.raw({
    display: 'flex',
    flexDirection: 'column',
    rowGap: '24px',
    padding: '16px',
    sm: {
      paddingInline: '24px',
      paddingBlock: '20px 24px',
    },
  }),
  notice: css.raw({
    textStyle: 'body',
    color: 'text.middle',
  }),
  zap: css.raw({
    textStyle: 'body',
    color: 'text.middle',
  }),
  highlight: css.raw({
    color: 'text.warning',
  }),
  // new-vault card slot (placeholder until <FeaturedVaultCard/> lands on this branch)
  cardSlot: css.raw({
    display: 'flex',
    flexDirection: 'column',
    rowGap: '4px',
    padding: '16px',
    borderRadius: '12px',
    backgroundColor: 'background.content.dark',
  }),
  cardSlotName: css.raw({
    textStyle: 'h3',
    color: 'text.light',
  }),
  cardSlotNote: css.raw({
    textStyle: 'body.sm',
    color: 'text.dark',
  }),
  actions: css.raw({
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'background.content.light',
    borderRadius: '8px',
  }),
  feeContainer: css.raw({
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'background.content.light',
    borderRadius: '8px',
    padding: '12px',
  }),
  feeLabel: css.raw({
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    textStyle: 'body.sm.medium',
    textTransform: 'uppercase',
    color: 'text.dark',
  }),
  feeValue: css.raw({
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    textStyle: 'body.sm.medium',
    color: 'text.middle',
  }),
  feeOriginal: css.raw({
    color: 'text.dark',
    textDecoration: 'line-through',
  }),
  feeInfoIcon: css.raw({
    color: 'text.dark',
    width: '16px',
    height: '16px',
  }),
};
