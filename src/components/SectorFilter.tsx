// ============================================================
// SweetReturns — Sector Filter: Multi-select checkbox dropdown
// Filters visible buildings on the city map by industry
// ============================================================

import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { SECTORS } from '../data/stockData';

const ACCENT = '#FFD700';
const PANEL_BG = 'rgba(15, 15, 35, 0.92)';

export const SectorFilter: React.FC = () => {
  const visibleSectors = useStore((s) => s.visibleSectors);
  const toggleVisibleSector = useStore((s) => s.toggleVisibleSector);
  const setVisibleSectors = useStore((s) => s.setVisibleSectors);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  const allSelected = visibleSectors.size === SECTORS.length;
  const noneSelected = visibleSectors.size === 0;
  const count = visibleSectors.size;

  return (
    <div ref={containerRef} style={{ position: 'relative', zIndex: 900 }}>
      {/* Toggle Button */}
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 14px',
          borderRadius: 8,
          border: `1px solid ${ACCENT}44`,
          background: PANEL_BG,
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          color: ACCENT,
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          fontFamily: 'monospace',
          letterSpacing: 0.5,
          transition: 'all 0.15s',
          boxShadow: open ? `0 0 12px ${ACCENT}22` : 'none',
        }}
      >
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: allSelected
            ? `linear-gradient(135deg, #FF69B4, ${ACCENT}, #9370DB)`
            : noneSelected ? '#555' : ACCENT,
          flexShrink: 0,
        }} />
        Sectors {!allSelected && <span style={{ fontSize: 10, color: '#999' }}>({count})</span>}
        <span style={{
          fontSize: 8,
          transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.2s',
          display: 'inline-block',
        }}>
          {'\u25BC'}
        </span>
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          marginTop: 4,
          width: 240,
          background: PANEL_BG,
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: `1px solid ${ACCENT}33`,
          borderRadius: 10,
          padding: 6,
          fontFamily: 'monospace',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}>
          {/* All / None row */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '4px 8px 6px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            marginBottom: 4,
          }}>
            <button
              onClick={() => setVisibleSectors(new Set(SECTORS.map((s) => s.name)))}
              style={{
                background: 'none', border: 'none', color: allSelected ? ACCENT : '#888',
                fontSize: 10, cursor: 'pointer', padding: 0, fontFamily: 'monospace',
                textTransform: 'uppercase', letterSpacing: 0.5,
              }}
            >
              All
            </button>
            <button
              onClick={() => setVisibleSectors(new Set())}
              style={{
                background: 'none', border: 'none', color: noneSelected ? ACCENT : '#888',
                fontSize: 10, cursor: 'pointer', padding: 0, fontFamily: 'monospace',
                textTransform: 'uppercase', letterSpacing: 0.5,
              }}
            >
              None
            </button>
          </div>

          {/* Sector checkboxes */}
          {SECTORS.map((sector) => {
            const active = visibleSectors.has(sector.name);
            return (
              <button
                key={sector.name}
                onClick={() => toggleVisibleSector(sector.name)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '5px 8px',
                  borderRadius: 5,
                  border: 'none',
                  cursor: 'pointer',
                  background: active ? 'rgba(255,255,255,0.03)' : 'transparent',
                  textAlign: 'left',
                  transition: 'background 0.1s',
                }}
              >
                {/* Checkbox */}
                <span style={{
                  width: 14, height: 14,
                  borderRadius: 3,
                  border: `1.5px solid ${active ? sector.color : '#555'}`,
                  background: active ? `${sector.color}33` : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                  fontSize: 9,
                  color: sector.color,
                  transition: 'all 0.1s',
                }}>
                  {active ? '\u2713' : ''}
                </span>
                {/* Color dot */}
                <span style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: active ? sector.color : `${sector.color}44`,
                  flexShrink: 0,
                  boxShadow: active ? `0 0 6px ${sector.color}44` : 'none',
                }} />
                {/* Name */}
                <span style={{
                  fontSize: 11, fontWeight: 500,
                  color: active ? '#ddd' : '#666',
                  flex: 1,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {sector.name}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SectorFilter;
