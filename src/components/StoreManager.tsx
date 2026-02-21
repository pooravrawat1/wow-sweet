// ============================================================
// SweetReturns — StoreManager: Renders all 500 stores grouped by sector
// ============================================================

import React, { useMemo } from 'react';
import { useStore } from '../store/useStore';
import type { StockData } from '../types';
import Store from './Store';

/** Memoized individual store to avoid re-renders when other stocks change */
const MemoizedStore = React.memo(Store);

function StoreManager() {
  const stocks = useStore((s) => s.stocks);

  // Group stocks by sector for organized rendering
  const sectorGroups = useMemo(() => {
    const groups = new Map<string, StockData[]>();
    for (const stock of stocks) {
      const existing = groups.get(stock.sector);
      if (existing) {
        existing.push(stock);
      } else {
        groups.set(stock.sector, [stock]);
      }
    }
    return groups;
  }, [stocks]);

  return (
    <group name="store-manager">
      {Array.from(sectorGroups.entries()).map(([sector, sectorStocks]) => (
        <group key={sector} name={`sector-${sector}`}>
          {sectorStocks.map((stock) => (
            <MemoizedStore key={stock.ticker} stock={stock} />
          ))}
        </group>
      ))}
    </group>
  );
}

export default React.memo(StoreManager);
