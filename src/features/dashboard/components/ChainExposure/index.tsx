import { memo } from 'react';
import { useAppSelector } from '../../../../store';
import { selectIsUserBalanceAvailable } from '../../../data/selectors/data-loader';
import { ExposureChart } from '../ExposureChart';
import type { ExposureDashboardChartLoaderProps } from '../ExposureChart/types';
import { selectDashboardUserExposureByChain } from '../../../data/selectors/dashboard';

const ChainExposure = memo<ExposureDashboardChartLoaderProps>(function ChainExposure({
  title,
  address,
}) {
  const chainExposureData = useAppSelector(state =>
    selectDashboardUserExposureByChain(state, address)
  );
  return <ExposureChart title={title} type="chain" data={chainExposureData} />;
});

export const ChainExposureLoader = memo<ExposureDashboardChartLoaderProps>(
  function ChainExposureLoader({ title, address }) {
    const isUserDataAvailable = useAppSelector(state =>
      selectIsUserBalanceAvailable(state, address)
    );

    if (isUserDataAvailable) {
      return <ChainExposure address={address} title={title} />;
    }

    return null;
  }
);
