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

const modeColors: Record<string, string> = {
  historical: '#9370DB',
  present: '#00FF7F',
  future: '#FF69B4',
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
      {/* Top row: mode buttons | date display | date picker | playback | speed */}
      <div style={topRowStyle}>
        {/* Mode toggle buttons */}
        <div style={btnGroupStyle}>
          {modes.map((mode) => (
            <button
              key={mode}
              onClick={() => handleModeClick(mode)}
              style={{
                ...modeBtnStyle,
                backgroundColor:
                  timeSlider.mode === mode ? modeColors[mode] : 'rgba(255,255,255,0.06)',
                color: timeSlider.mode === mode ? '#1a1a2e' : '#888',
                borderColor:
                  timeSlider.mode === mode ? modeColors[mode] : 'rgba(255,255,255,0.15)',
              }}
            >
              {mode}
            </button>
          ))}
        </div>

        {/* Separator */}
        <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.15)' }} />

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
        <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.15)' }} />

        {/* Playback buttons */}
        <div style={btnGroupStyle}>
          <button style={ctrlBtnStyle} onClick={jumpStart} title="Jump to start">
            |&laquo;
          </button>
          <button style={ctrlBtnStyle} onClick={() => stepDate(-1)} title="Back 1 day">
            &lsaquo;
          </button>
          <button
            style={{
              ...ctrlBtnStyle,
              backgroundColor: timeSlider.isPlaying ? '#FF69B4' : 'rgba(255,255,255,0.12)',
              color: timeSlider.isPlaying ? '#1a1a2e' : '#FF69B4',
              fontWeight: 700,
              minWidth: 44,
            }}
            onClick={() => setPlayback(!timeSlider.isPlaying)}
            title={timeSlider.isPlaying ? 'Pause' : 'Play'}
          >
            {timeSlider.isPlaying ? '\u275A\u275A' : '\u25B6'}
          </button>
          <button style={ctrlBtnStyle} onClick={() => stepDate(1)} title="Forward 1 day">
            &rsaquo;
          </button>
          <button style={ctrlBtnStyle} onClick={jumpEnd} title="Jump to end">
            &raquo;|
          </button>
        </div>

        {/* Speed selector */}
        <div style={btnGroupStyle}>
          {speedOptions.map((spd) => (
            <button
              key={spd}
              style={{
                ...speedBtnStyle,
                backgroundColor:
                  timeSlider.playbackSpeed === spd ? '#FFD700' : 'rgba(255,255,255,0.08)',
                color: timeSlider.playbackSpeed === spd ? '#1a1a2e' : '#aaa',
              }}
              onClick={() => setPlaybackSpeed(spd)}
            >
              {spd}x
            </button>
          ))}
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
  maxHeight: 96,
  background: 'rgba(26, 26, 46, 0.92)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  borderTop: '1px solid rgba(255, 105, 180, 0.25)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 4,
  zIndex: 1000,
  padding: '6px 20px',
  boxSizing: 'border-box',
  fontFamily: "'Inter', 'Segoe UI', sans-serif",
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
  border: '1px solid',
  borderRadius: 4,
  fontSize: 10,
  padding: '2px 8px',
  cursor: 'pointer',
  fontWeight: 600,
  textTransform: 'capitalize',
  letterSpacing: 0.5,
  transition: 'all 0.15s',
  background: 'transparent',
};

const dateDisplayStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: '#FF69B4',
  letterSpacing: 0.5,
  whiteSpace: 'nowrap',
  textShadow: '0 0 8px rgba(255,105,180,0.4)',
};

const dateInputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,105,180,0.3)',
  borderRadius: 4,
  color: '#FF69B4',
  fontSize: 10,
  padding: '2px 6px',
  cursor: 'pointer',
  fontFamily: "'Leckerli One', cursive",
  colorScheme: 'dark',
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
  color: '#aaa',
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
  background: 'linear-gradient(90deg, #9370DB, #00FF7F, #FF69B4)',
  pointerEvents: 'none',
};

const rangeInputStyle: React.CSSProperties = {
  width: '100%',
  height: 4,
  appearance: 'none',
  WebkitAppearance: 'none',
  background: 'rgba(255,255,255,0.1)',
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
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,105,180,0.3)',
  borderRadius: 4,
  color: '#FF69B4',
  fontSize: 13,
  padding: '2px 8px',
  cursor: 'pointer',
  lineHeight: 1.4,
  transition: 'background 0.15s',
};

const speedBtnStyle: React.CSSProperties = {
  border: '1px solid rgba(255,215,0,0.3)',
  borderRadius: 4,
  fontSize: 11,
  padding: '2px 8px',
  cursor: 'pointer',
  fontWeight: 600,
  transition: 'background 0.15s',
};

export default TimeSlider;
