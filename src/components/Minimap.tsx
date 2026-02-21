// ============================================================
// SweetReturns — City Minimap
// Top-right 180x180 grid showing sector blocks & platinum dots
// ============================================================

import React, { useCallback, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { SECTORS } from '../data/stockData';

// Grid layout: 3 cols x 4 rows, matching sector positions
const GRID_COLS = 3;
const GRID_ROWS = 4;
const MAP_SIZE = 180;
const PADDING = 10;
const GAP = 3;

const cellW = (MAP_SIZE - PADDING * 2 - GAP * (GRID_COLS - 1)) / GRID_COLS;
const cellH = (MAP_SIZE - PADDING * 2 - GAP * (GRID_ROWS - 1)) / GRID_ROWS;

export const Minimap: React.FC = () => {
  const stocks = useStore((s) => s.stocks);
  const selectedSector = useStore((s) => s.selectedSector);
  const selectSector = useStore((s) => s.selectSector);

  // Build a lookup: position key -> sector info
  const sectorGrid = useMemo(() => {
    const map = new Map<string, (typeof SECTORS)[0]>();
    for (const s of SECTORS) {
      map.set(`${s.position[0]},${s.position[1]}`, s);
    }
    return map;
  }, []);

  // Platinum stocks per sector
  const platinumBySector = useMemo(() => {
    const m = new Map<string, number>();
    for (const st of stocks) {
      if (st.is_platinum) {
        m.set(st.sector, (m.get(st.sector) || 0) + 1);
      }
    }
    return m;
  }, [stocks]);

  const handleClick = useCallback(
    (sectorName: string) => {
      selectSector(selectedSector === sectorName ? null : sectorName);
    },
    [selectedSector, selectSector],
  );

  return (
    <div style={containerStyle}>
      <div style={titleStyle}>City Map</div>
      <div style={gridWrapStyle}>
        {Array.from({ length: GRID_ROWS }, (_, row) =>
          Array.from({ length: GRID_COLS }, (_, col) => {
            const key = `${col},${row}`;
            const sector = sectorGrid.get(key);
            const left = PADDING + col * (cellW + GAP);
            const top = PADDING + 16 + row * (cellH + GAP);
            const isActive = sector ? selectedSector === sector.name : false;
            const platCount = sector ? platinumBySector.get(sector.name) || 0 : 0;

            return (
              <div
                key={key}
                style={{
                  position: 'absolute',
                  left,
                  top,
                  width: cellW,
                  height: cellH,
                  borderRadius: 3,
                  backgroundColor: sector ? `${sector.color}44` : 'rgba(255,255,255,0.03)',
                  border: isActive
                    ? `1.5px solid ${sector!.color}`
                    : '1px solid rgba(255,255,255,0.08)',
                  cursor: sector ? 'pointer' : 'default',
                  transition: 'border 0.15s, box-shadow 0.15s',
                  boxShadow: isActive ? `0 0 8px ${sector!.color}55` : 'none',
                  overflow: 'hidden',
                }}
                onClick={() => sector && handleClick(sector.name)}
                title={sector ? `${sector.name} - ${sector.district}` : undefined}
              >
                {/* Sector label */}
                {sector && (
                  <span
                    style={{
                      fontSize: 7,
                      color: '#ccc',
                      position: 'absolute',
                      top: 2,
                      left: 3,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: cellW - 6,
                      lineHeight: 1.2,
                    }}
                  >
                    {sector.name.slice(0, 8)}
                  </span>
                )}

                {/* Platinum dots */}
                {sector &&
                  platCount > 0 &&
                  Array.from({ length: Math.min(platCount, 5) }, (__, i) => (
                    <span
                      key={i}
                      style={{
                        position: 'absolute',
                        bottom: 3,
                        left: 3 + i * 7,
                        width: 4,
                        height: 4,
                        borderRadius: '50%',
                        backgroundColor: '#FFD700',
                        boxShadow: '0 0 4px #FFD700',
                      }}
                    />
                  ))}
              </div>
            );
          }),
        )}
      </div>
    </div>
  );
};

// --------------- Styles ---------------

const containerStyle: React.CSSProperties = {
  position: 'fixed',
  top: 12,
  right: 12,
  width: MAP_SIZE,
  height: MAP_SIZE,
  background: 'rgba(26, 26, 46, 0.85)',
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  border: '1px solid rgba(255,255,255,0.2)',
  borderRadius: 8,
  zIndex: 900,
  fontFamily: "'Inter', 'Segoe UI', sans-serif",
};

const titleStyle: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 700,
  color: '#FF69B4',
  textTransform: 'uppercase',
  letterSpacing: 1.2,
  textAlign: 'center',
  paddingTop: 5,
};

const gridWrapStyle: React.CSSProperties = {
  position: 'relative',
  width: '100%',
  height: '100%',
};

export default Minimap;
