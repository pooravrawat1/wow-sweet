import { useState, useRef, useCallback, type ReactNode } from 'react';

const FONT = `'Leckerli One', cursive`;

interface DraggablePanelProps {
  title: string;
  defaultPosition: { x: number; y: number };
  width?: number;
  children: ReactNode;
  zIndex?: number;
  maxHeight?: number | string;
}

export function DraggablePanel({
  title,
  defaultPosition,
  width = 220,
  children,
  zIndex = 20,
  maxHeight,
}: DraggablePanelProps) {
  const [pos, setPos] = useState(defaultPosition);
  const [collapsed, setCollapsed] = useState(false);
  const dragging = useRef(false);
  const offset = useRef({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    // Only drag from header
    e.preventDefault();
    dragging.current = true;
    offset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      let nx = ev.clientX - offset.current.x;
      let ny = ev.clientY - offset.current.y;
      // Clamp to viewport
      nx = Math.max(0, Math.min(nx, window.innerWidth - width));
      ny = Math.max(0, Math.min(ny, window.innerHeight - 40));
      setPos({ x: nx, y: ny });
    };

    const onMouseUp = () => {
      dragging.current = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [pos.x, pos.y, width]);

  return (
    <div
      ref={panelRef}
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        width,
        zIndex,
        background: 'rgba(255,255,255,0.72)',
        border: '1.5px solid rgba(106,0,170,0.13)',
        borderRadius: 16,
        boxShadow: '0 2px 16px rgba(106,0,170,0.08)',
        backdropFilter: 'blur(6px)',
        overflow: 'hidden',
        transition: collapsed ? 'height 0.2s' : undefined,
        maxHeight: collapsed ? 36 : maxHeight,
      }}
    >
      {/* Header — drag handle + collapse toggle */}
      <div
        onMouseDown={onMouseDown}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '7px 12px',
          cursor: 'grab',
          userSelect: 'none',
          background: 'rgba(106,0,170,0.06)',
          borderBottom: collapsed ? 'none' : '1px solid rgba(106,0,170,0.1)',
        }}
      >
        <span style={{
          fontFamily: FONT,
          fontSize: 12,
          fontWeight: 700,
          color: '#4b0082',
          letterSpacing: 0.3,
        }}>
          {title}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setCollapsed((c) => !c);
          }}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 14,
            color: '#6a00aa',
            padding: '0 2px',
            lineHeight: 1,
            transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
          }}
        >
          ▼
        </button>
      </div>

      {/* Body */}
      {!collapsed && (
        <div style={{ overflow: 'auto', maxHeight: typeof maxHeight === 'number' ? maxHeight - 36 : undefined }}>
          {children}
        </div>
      )}
    </div>
  );
}
