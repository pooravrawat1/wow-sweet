// ============================================================
// SweetReturns — Sector Filter Sidebar
// Left-side panel listing all 11 sectors with colored indicators
// ============================================================

import React from 'react';
import { useStore } from '../store/useStore';
import { SECTORS } from '../data/stockData';

export const SectorFilter: React.FC = () => {
  const selectedSector = useStore((s) => s.selectedSector);
  const selectSector = useStore((s) => s.selectSector);

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>Sectors</div>

      {/* All Sectors button */}
      <button
        style={{
          ...itemStyle,
          borderColor: selectedSector === null ? '#FF69B4' : 'rgba(255,255,255,0.08)',
          boxShadow: selectedSector === null ? '0 0 10px rgba(255,105,180,0.35)' : 'none',
          background: selectedSector === null ? 'rgba(255,105,180,0.12)' : 'transparent',
        }}
        onClick={() => selectSector(null)}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #FF69B4, #FFD700, #9370DB)',
            flexShrink: 0,
          }}
        />
        <div style={{ flex: 1 }}>
          <div style={sectorNameStyle}>All Sectors</div>
        </div>
      </button>

      {/* Individual sectors */}
      <div style={listStyle}>
        {SECTORS.map((sector) => {
          const isActive = selectedSector === sector.name;
          return (
            <button
              key={sector.name}
              style={{
                ...itemStyle,
                borderColor: isActive ? sector.color : 'rgba(255,255,255,0.08)',
                boxShadow: isActive ? `0 0 10px ${sector.color}55` : 'none',
                background: isActive ? `${sector.color}18` : 'transparent',
              }}
              onClick={() => selectSector(sector.name)}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: sector.color,
                  flexShrink: 0,
                  boxShadow: isActive ? `0 0 6px ${sector.color}` : 'none',
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={sectorNameStyle}>{sector.name}</div>
                <div style={districtNameStyle}>{sector.district}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

// --------------- Styles ---------------

const containerStyle: React.CSSProperties = {
  position: 'fixed',
  left: 0,
  top: 80,
  bottom: 80,
  width: 210,
  background: 'rgba(26, 26, 46, 0.85)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  borderRight: '1px solid rgba(255, 105, 180, 0.15)',
  zIndex: 900,
  display: 'flex',
  flexDirection: 'column',
  padding: '10px 8px',
  boxSizing: 'border-box',
  fontFamily: "'Inter', 'Segoe UI', sans-serif",
  overflowY: 'auto',
  overflowX: 'hidden',
};

const headerStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: '#FF69B4',
  textTransform: 'uppercase',
  letterSpacing: 1.5,
  marginBottom: 8,
  paddingLeft: 6,
};

const listStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  flex: 1,
  overflowY: 'auto',
};

const itemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 8px',
  borderRadius: 6,
  border: '1px solid rgba(255,255,255,0.08)',
  cursor: 'pointer',
  background: 'transparent',
  textAlign: 'left',
  transition: 'all 0.15s ease',
  width: '100%',
};

const sectorNameStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: '#eee',
  lineHeight: 1.3,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const districtNameStyle: React.CSSProperties = {
  fontSize: 9,
  color: '#999',
  lineHeight: 1.3,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

export default SectorFilter;
