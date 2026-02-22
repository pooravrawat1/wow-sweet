// ============================================================
// SweetReturns — StoreManager: Renders visible stores by sector
// ============================================================

import React, { useMemo } from 'react';
import { useStore } from '../store/useStore';
import Store from './Store';

const MemoizedStore = React.memo(Store);

function StoreManager() {
  const stocks = useStore((s) => s.stocks);
  const visibleSectors = useStore((s) => s.visibleSectors);

  const visibleStocks = useMemo(
    () => stocks.filter((s) => visibleSectors.has(s.sector)),
    [stocks, visibleSectors],
  );

  return (
    <group name="store-manager">
      {visibleStocks.map((stock) => (
        <MemoizedStore key={stock.ticker} stock={stock} />
      ))}
    </group>
  );
}

export default React.memo(StoreManager);
