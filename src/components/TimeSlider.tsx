// ============================================================
// SweetReturns — Time Slider Overlay
// Fixed bottom bar with date scrubber, playback controls, speed & mode
// ============================================================

import React, { useCallback, useMemo, useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';

const MIN_TS = new Date('2019-01-02').getTime();
const MAX_TS = new Date('2027-12-31').getTime();
const TODAY_TS = new Date('2026-02-21').getTime();

function tsToDateStr(ts: number): string {
  const d = new Date(ts);
  return d.toISOString().slice(0, 10);
}

function dateStrToTs(s: string): number {
  return new Date(s).getTime();
}

function formatDisplayDate(s: string): string {
  const d = new Date(s);
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

const FONT = `'Leckerli One', cursive`;
const ACCENT = '#6a00aa';
const GOLD = '#FFD700';

const modeColors: Record<string, { bg: string; text: string; border: string }> = {
  historical: { bg: '#6a00aa',   text: '#fff',    border: '#6a00aa' },
  present:    { bg: '#1a7a00',   text: '#fff',    border: '#1a7a00' },
  future:     { bg: GOLD,        text: '#3d0066', border: '#c8a800' },
};

const speedOptions = [1, 5, 10];
const modes = ['historical', 'present', 'future'] as const;

export const TimeSlider: React.FC = () => {
  const timeSlider = useStore((s) => s.timeSlider);
  const setCurrentDate = useStore((s) => s.setCurrentDate);
  const setPlayback = useStore((s) => s.setPlayback);
  const setPlaybackSpeed = useStore((s) => s.setPlaybackSpeed);
  const setTimeMode = useStore((s) => s.setTimeMode);

  const currentTs = useMemo(() => dateStrToTs(timeSlider.currentDate), [timeSlider.currentDate]);

  // Playback loop using ref to avoid re-creating interval
  const dateRef = useRef(timeSlider.currentDate);
  dateRef.current = timeSlider.currentDate;

  useEffect(() => {
    if (!timeSlider.isPlaying) return;
    const intervalMs = 1000 / timeSlider.playbackSpeed;
    const timer = setInterval(() => {
      const ts = dateStrToTs(dateRef.current);
      const nextTs = ts + 86_400_000;
      if (nextTs > MAX_TS) {
        setPlayback(false);
        return;
      }
      setCurrentDate(tsToDateStr(nextTs));
      // Auto-detect mode from date
      if (nextTs > TODAY_TS) {
        setTimeMode('future');
      } else if (nextTs > new Date('2024-12-31').getTime()) {
        setTimeMode('present');
      } else {
        setTimeMode('historical');
      }
    }, intervalMs);
    return () => clearInterval(timer);
  }, [timeSlider.isPlaying, timeSlider.playbackSpeed, setCurrentDate, setPlayback, setTimeMode]);

  const onSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const ts = Number(e.target.value);
      setCurrentDate(tsToDateStr(ts));
      // Auto-detect mode from slider position
      if (ts > TODAY_TS) setTimeMode('future');
      else if (ts > new Date('2024-12-31').getTime()) setTimeMode('present');
      else setTimeMode('historical');
    },
    [setCurrentDate, setTimeMode],
  );

  const stepDate = useCallback(
    (days: number) => {
      const next = Math.max(MIN_TS, Math.min(MAX_TS, currentTs + days * 86_400_000));
      setCurrentDate(tsToDateStr(next));
    },
    [currentTs, setCurrentDate],
  );

  const jumpStart = useCallback(() => setCurrentDate(tsToDateStr(MIN_TS)), [setCurrentDate]);
  const jumpEnd = useCallback(() => setCurrentDate(tsToDateStr(MAX_TS)), [setCurrentDate]);

  const handleModeClick = useCallback(
    (mode: 'historical' | 'present' | 'future') => {
      setTimeMode(mode);
      if (mode === 'historical') setCurrentDate('2023-06-15');
      else if (mode === 'present') setCurrentDate('2026-02-21');
      else setCurrentDate('2026-06-01');
    },
    [setTimeMode, setCurrentDate],
  );

  const pct = ((currentTs - MIN_TS) / (MAX_TS - MIN_TS)) * 100;

  return (
    <div style={containerStyle}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Leckerli+One&display=swap');
        .sweet-range::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none;
          width: 14px; height: 14px; border-radius: 50%;
          background: ${ACCENT}; border: 2px solid #fff;
          box-shadow: 0 0 6px ${ACCENT}88; cursor: pointer;
        }
        .sweet-range::-moz-range-thumb {
          width: 14px; height: 14px; border-radius: 50%;
          background: ${ACCENT}; border: 2px solid #fff;
          box-shadow: 0 0 6px ${ACCENT}88; cursor: pointer;
        }
        .ts-ctrl:hover { background: #f0c000 !important; }
      `}</style>

      {/* Top row: mode buttons | date display | date picker | playback | speed */}
      <div style={topRowStyle}>
        {/* Mode toggle buttons */}
        <div style={btnGroupStyle}>
          {modes.map((mode) => {
            const active = timeSlider.mode === mode;
            const mc = modeColors[mode];
            return (
              <button
                key={mode}
                onClick={() => handleModeClick(mode)}
                style={{
                  ...modeBtnStyle,
                  backgroundColor: active ? mc.bg : GOLD,
                  color: active ? mc.text : '#3d0066',
                  border: `1.5px solid ${active ? mc.border : '#c8a800'}`,
                  boxShadow: active ? `0 2px 8px ${mc.bg}55` : 'none',
                }}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            );
          })}
        </div>

        {/* Separator */}
        <div style={{ width: 1, height: 18, background: 'rgba(106,0,170,0.18)' }} />

        {/* Date display + picker */}
        <div style={dateDisplayStyle}>{formatDisplayDate(timeSlider.currentDate)}</div>
        <input
          type="date"
          value={timeSlider.currentDate}
          min="2019-01-02"
          max="2027-12-31"
          onChange={(e) => {
            const val = e.target.value;
            if (val) {
              setCurrentDate(val);
              const ts = dateStrToTs(val);
              if (ts > TODAY_TS) setTimeMode('future');
              else if (ts > new Date('2024-12-31').getTime()) setTimeMode('present');
              else setTimeMode('historical');
            }
          }}
          style={dateInputStyle}
        />

        {/* Separator */}
        <div style={{ width: 1, height: 18, background: 'rgba(106,0,170,0.18)' }} />

        {/* Playback buttons */}
        <div style={btnGroupStyle}>
          <button className="ts-ctrl" style={ctrlBtnStyle} onClick={jumpStart} title="Jump to start">|«</button>
          <button className="ts-ctrl" style={ctrlBtnStyle} onClick={() => stepDate(-1)} title="Back 1 day">‹</button>
          <button
            className="ts-ctrl"
            style={{
              ...ctrlBtnStyle,
              backgroundColor: timeSlider.isPlaying ? ACCENT : GOLD,
              color: timeSlider.isPlaying ? '#fff' : '#3d0066',
              border: `1.5px solid ${timeSlider.isPlaying ? ACCENT : '#c8a800'}`,
              fontWeight: 700,
              minWidth: 44,
              boxShadow: `0 2px 8px ${timeSlider.isPlaying ? ACCENT + '55' : GOLD + '55'}`,
            }}
            onClick={() => setPlayback(!timeSlider.isPlaying)}
            title={timeSlider.isPlaying ? 'Pause' : 'Play'}
          >
            {timeSlider.isPlaying ? '❚❚' : '▶'}
          </button>
          <button className="ts-ctrl" style={ctrlBtnStyle} onClick={() => stepDate(1)} title="Forward 1 day">›</button>
          <button className="ts-ctrl" style={ctrlBtnStyle} onClick={jumpEnd} title="Jump to end">»|</button>
        </div>

        {/* Speed selector */}
        <div style={btnGroupStyle}>
          {speedOptions.map((spd) => {
            const active = timeSlider.playbackSpeed === spd;
            return (
              <button
                key={spd}
                style={{
                  ...speedBtnStyle,
                  backgroundColor: active ? GOLD : GOLD,
                  color: '#3d0066',
                  border: `1.5px solid ${active ? '#c8a800' : '#c8a800'}`,
                  boxShadow: active ? `0 2px 6px ${GOLD}55` : 'none',
                  fontWeight: active ? 800 : 600,
                  opacity: active ? 1 : 0.65,
                }}
                onClick={() => setPlaybackSpeed(spd)}
              >
                {spd}×
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom row: slider track */}
      <div style={sliderRowStyle}>
        <span style={yearLabelStyle}>2019</span>
        <div style={sliderWrapStyle}>
          <div
            style={{
              ...trackFillStyle,
              width: `${pct}%`,
            }}
          />
          <input
            type="range"
            min={MIN_TS}
            max={MAX_TS}
            step={86_400_000}
            value={currentTs}
            onChange={onSliderChange}
            className="sweet-range"
            style={rangeInputStyle}
          />
        </div>
        <span style={yearLabelStyle}>2028</span>
      </div>
    </div>
  );
};

// --------------- Styles ---------------

const containerStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: 0,
  left: 0,
  width: '100%',
  height: 'auto',
  minHeight: 56,
  maxHeight: 110,
  background: 'transparent',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 5,
  zIndex: 1000,
  padding: '7px 20px',
  boxSizing: 'border-box',
  fontFamily: FONT,
  overflow: 'visible',
};

const topRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap',
  justifyContent: 'center',
};

const modeBtnStyle: React.CSSProperties = {
  borderRadius: 6,
  fontSize: 11,
  padding: '3px 11px',
  cursor: 'pointer',
  fontWeight: 600,
  fontFamily: FONT,
  letterSpacing: 0.3,
  transition: 'all 0.15s',
};

const dateDisplayStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  fontFamily: FONT,
  color: '#3d0066',
  letterSpacing: 0.3,
  whiteSpace: 'nowrap',
  background: GOLD,
  border: '1.5px solid #c8a800',
  borderRadius: 6,
  padding: '2px 10px',
};

const dateInputStyle: React.CSSProperties = {
  background: GOLD,
  border: '1.5px solid #c8a800',
  borderRadius: 6,
  color: '#3d0066',
  fontSize: 11,
  padding: '2px 7px',
  cursor: 'pointer',
  fontFamily: FONT,
  colorScheme: 'light',
};

const sliderRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  width: '100%',
  maxWidth: 'min(720px, 90vw)' as any,
  gap: 8,
};

const yearLabelStyle: React.CSSProperties = {
  fontSize: 10,
  color: 'rgba(106,0,170,0.45)',
  fontFamily: FONT,
  minWidth: 30,
  textAlign: 'center',
};

const sliderWrapStyle: React.CSSProperties = {
  position: 'relative',
  flex: 1,
  height: 18,
  display: 'flex',
  alignItems: 'center',
};

const trackFillStyle: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  top: '50%',
  transform: 'translateY(-50%)',
  height: 4,
  borderRadius: 2,
  background: `linear-gradient(90deg, ${ACCENT}, ${GOLD})`,
  pointerEvents: 'none',
};

const rangeInputStyle: React.CSSProperties = {
  width: '100%',
  height: 4,
  appearance: 'none',
  WebkitAppearance: 'none',
  background: 'rgba(106,0,170,0.12)',
  borderRadius: 2,
  outline: 'none',
  cursor: 'pointer',
  position: 'relative',
  zIndex: 1,
};

const btnGroupStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
};

const ctrlBtnStyle: React.CSSProperties = {
  background: GOLD,
  border: '1.5px solid #c8a800',
  borderRadius: 6,
  color: '#3d0066',
  fontSize: 13,
  padding: '2px 9px',
  cursor: 'pointer',
  fontFamily: FONT,
  lineHeight: 1.4,
  transition: 'background 0.15s',
  fontWeight: 600,
};

const speedBtnStyle: React.CSSProperties = {
  borderRadius: 6,
  fontSize: 11,
  padding: '3px 9px',
  cursor: 'pointer',
  fontWeight: 600,
  fontFamily: FONT,
  transition: 'all 0.15s',
};

export default TimeSlider;
