import { css } from '@repo/styles/css';

export const styles = {
  container: css.raw({
    display: 'flex',
    flexDirection: 'column',
    borderRadius: '12px',
    overflow: 'hidden',
    backgroundColor: 'background.content',
  }),
  header: css.raw({
    display: 'flex',
    alignItems: 'center',
    columnGap: '16px',
    backgroundColor: 'background.content.dark',
    borderRadius: '12px 12px 0px 0px ',
    padding: '16px',
    sm: {
      padding: '24px',
    },
  }),
  icon: css.raw({
    height: '48px',
    width: '48px',
    objectFit: 'contain',
  }),
  subTitle: css.raw({
    textStyle: 'subline',
    fontWeight: 'bold',
    color: 'text.dark',
  }),
  title: css.raw({
    textStyle: 'h3',
    fontWeight: 'medium',
    color: 'text.light',
  }),
  content: css.raw({
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    padding: '16px',
    rowGap: '16px',
    sm: {
      padding: '24px',
    },
  }),

  replacementHeader: css.raw({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: '16px',
    backgroundColor: 'background.content.dark',
    borderRadius: '12px 12px 0px 0px',
    padding: '12px 24px',
  }),
  replacementIcon: css.raw({
    height: '32px',
    width: '32px',
    objectFit: 'contain',
    flexShrink: 0,
  }),
  replacementTitle: css.raw({
    textStyle: 'h3',
    color: 'white.100',
  }),
  replacementContent: css.raw({
    display: 'flex',
    flexDirection: 'column',
    // #242842
    backgroundColor: 'background.content',
    borderRadius: '0px 0px 12px 12px',
    padding: '16px 24px 24px',
    rowGap: '16px',
  }),
  text: css.raw({
    textStyle: 'body.medium',
    color: 'text.middle',
  }),
  highlight: css.raw({
    color: 'text.warning',
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
