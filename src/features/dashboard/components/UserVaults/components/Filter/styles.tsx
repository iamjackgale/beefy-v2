import type { Theme } from '@material-ui/core';

export const styles = (theme: Theme) => ({
  container: {
    backgroundColor: theme.palette.background.contentDark,
    borderRadius: '8px 8px 0px 0px',
    padding: '16px',
    display: 'grid',
    width: '100%',
    columnGap: '8px',
    backgroundClip: 'padding-box',
    borderBottom: `solid 2px ${theme.palette.background.contentDark}`,
    gridTemplateColumns: 'minmax(0, 40fr) minmax(0, 60fr)',
    [theme.breakpoints.down('sm')]: {
      gridTemplateColumns: 'minmax(0, 60fr) minmax(0, 40fr)',
    },
  },
  sortColumns: {
    display: 'grid',
    width: '100%',
    columnGap: '8px',
    gridTemplateColumns: 'repeat(1, minmax(0, 1fr))',
    [theme.breakpoints.up('md')]: {
      gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
    },
    [theme.breakpoints.up('lg')]: {
      gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
    },
  },
  hideSm: {
    display: 'none',
    [theme.breakpoints.up('md')]: {
      display: 'flex',
    },
  },
  hideMd: {
    display: 'none',
    [theme.breakpoints.up('lg')]: {
      display: 'flex',
    },
  },
  searchWidth: {
    [theme.breakpoints.up('lg')]: {
      maxWidth: '75%',
    },
  },
});
