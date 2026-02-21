// ============================================================
// SweetReturns — Candy-Themed SVG Icon Library
// Replaces all emojis with inline SVG candy symbols
// ============================================================

import React from 'react';

const Icon: React.FC<{ children: React.ReactNode; size?: number; style?: React.CSSProperties }> = ({
  children, size = 16, style,
}) => (
  <span style={{ display: 'inline-flex', width: size, height: size, verticalAlign: 'middle', flexShrink: 0, ...style }}>
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" xmlns="http://www.w3.org/2000/svg">
      {children}
    </svg>
  </span>
);

// --- Navigation Icons ---

export const CandyCane: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <Icon size={size}>
    <path d="M16 4c0-1.66-1.34-3-3-3h-2C9.34 1 8 2.34 8 4v14c0 2.21 1.79 4 4 4s4-1.79 4-4V4z" fill="none" stroke="#FF69B4" strokeWidth="2"/>
    <path d="M16 4c0-1.66-1.34-3-3-3" stroke="#FF4444" strokeWidth="3" strokeLinecap="round"/>
    <line x1="8" y1="8" x2="16" y2="6" stroke="#FF4444" strokeWidth="1.5"/>
    <line x1="8" y1="12" x2="16" y2="10" stroke="#FF4444" strokeWidth="1.5"/>
    <line x1="8" y1="16" x2="16" y2="14" stroke="#FF4444" strokeWidth="1.5"/>
  </Icon>
);

export const ChartLine: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <Icon size={size}>
    <polyline points="2,18 7,10 12,14 22,4" stroke="#00BFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    <circle cx="7" cy="10" r="2" fill="#00BFFF"/>
    <circle cx="12" cy="14" r="2" fill="#FFD700"/>
    <circle cx="22" cy="4" r="2" fill="#00FF7F"/>
  </Icon>
);

export const LightningBolt: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <Icon size={size}>
    <polygon points="13,2 4,14 12,14 11,22 20,10 12,10" fill="#FFD700" stroke="#FF8C00" strokeWidth="1"/>
  </Icon>
);

export const WebNodes: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <Icon size={size}>
    <circle cx="12" cy="4" r="2.5" fill="#9370DB"/>
    <circle cx="4" cy="18" r="2.5" fill="#FF69B4"/>
    <circle cx="20" cy="18" r="2.5" fill="#00BFFF"/>
    <line x1="12" y1="6.5" x2="4" y2="15.5" stroke="#9370DB" strokeWidth="1.5"/>
    <line x1="12" y1="6.5" x2="20" y2="15.5" stroke="#00BFFF" strokeWidth="1.5"/>
    <line x1="6.5" y1="18" x2="17.5" y2="18" stroke="#FF69B4" strokeWidth="1.5"/>
  </Icon>
);

export const Gumball: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <Icon size={size}>
    <circle cx="12" cy="12" r="9" fill="#FF69B4" stroke="#FF1493" strokeWidth="1.5"/>
    <ellipse cx="9" cy="9" rx="2.5" ry="3.5" fill="rgba(255,255,255,0.25)" transform="rotate(-20 9 9)"/>
  </Icon>
);

export const NoteBook: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <Icon size={size}>
    <rect x="5" y="2" width="14" height="20" rx="2" fill="none" stroke="#FFD700" strokeWidth="2"/>
    <line x1="9" y1="7" x2="17" y2="7" stroke="#FFD700" strokeWidth="1.5"/>
    <line x1="9" y1="11" x2="17" y2="11" stroke="#FFD700" strokeWidth="1.5"/>
    <line x1="9" y1="15" x2="14" y2="15" stroke="#FFD700" strokeWidth="1.5"/>
    <line x1="5" y1="2" x2="5" y2="22" stroke="#8B6914" strokeWidth="2.5"/>
  </Icon>
);

// --- Loading / Title ---

export const Lollipop: React.FC<{ size?: number }> = ({ size = 48 }) => (
  <Icon size={size}>
    <circle cx="12" cy="9" r="7" fill="none" stroke="#FF69B4" strokeWidth="2"/>
    <path d="M12 2 A7 7 0 0 1 19 9" stroke="#FFD700" strokeWidth="2.5" fill="none"/>
    <path d="M5 9 A7 7 0 0 1 12 2" stroke="#FF4444" strokeWidth="2.5" fill="none"/>
    <path d="M19 9 A7 7 0 0 1 12 16" stroke="#00BFFF" strokeWidth="2.5" fill="none"/>
    <line x1="12" y1="16" x2="12" y2="23" stroke="#DEB887" strokeWidth="2.5" strokeLinecap="round"/>
  </Icon>
);

export const ChocolateBar: React.FC<{ size?: number }> = ({ size = 20 }) => (
  <Icon size={size}>
    <rect x="2" y="5" width="20" height="14" rx="2" fill="#8B4513" stroke="#5C3317" strokeWidth="1"/>
    <line x1="8.5" y1="5" x2="8.5" y2="19" stroke="#6B3410" strokeWidth="0.8"/>
    <line x1="15.5" y1="5" x2="15.5" y2="19" stroke="#6B3410" strokeWidth="0.8"/>
    <line x1="2" y1="12" x2="22" y2="12" stroke="#6B3410" strokeWidth="0.8"/>
    <rect x="3" y="6" width="4.5" height="5" rx="0.5" fill="#A0522D"/>
    <rect x="9.5" y="6" width="5" height="5" rx="0.5" fill="#A0522D"/>
    <rect x="16.5" y="6" width="4.5" height="5" rx="0.5" fill="#A0522D"/>
  </Icon>
);

// --- Whale Fund Icons ---

export const TopHat: React.FC<{ size?: number }> = ({ size = 14 }) => (
  <Icon size={size}>
    <rect x="3" y="16" width="18" height="3" rx="1.5" fill="#FFD700"/>
    <rect x="7" y="4" width="10" height="13" rx="1" fill="#FFD700" stroke="#DAA520" strokeWidth="1"/>
    <rect x="7" y="11" width="10" height="2" fill="#DAA520"/>
  </Icon>
);

export const Rocket: React.FC<{ size?: number }> = ({ size = 14 }) => (
  <Icon size={size}>
    <path d="M12 2L8 10h8L12 2z" fill="#FF4500"/>
    <rect x="9" y="10" width="6" height="7" rx="1" fill="#FF6347"/>
    <path d="M9 17l-2 4 3-2" fill="#FFD700"/>
    <path d="M15 17l2 4-3-2" fill="#FFD700"/>
    <circle cx="12" cy="12" r="1.5" fill="#fff"/>
  </Icon>
);

export const CoinStack: React.FC<{ size?: number }> = ({ size = 14 }) => (
  <Icon size={size}>
    <ellipse cx="12" cy="17" rx="7" ry="3" fill="#FFD700" stroke="#DAA520" strokeWidth="1"/>
    <ellipse cx="12" cy="13" rx="7" ry="3" fill="#FFD700" stroke="#DAA520" strokeWidth="1"/>
    <ellipse cx="12" cy="9" rx="7" ry="3" fill="#FFD700" stroke="#DAA520" strokeWidth="1"/>
    <text x="12" y="11" textAnchor="middle" fill="#8B6914" fontSize="6" fontWeight="bold">$</text>
  </Icon>
);

export const CrystalBall: React.FC<{ size?: number }> = ({ size = 14 }) => (
  <Icon size={size}>
    <circle cx="12" cy="10" r="8" fill="none" stroke="#9370DB" strokeWidth="2"/>
    <circle cx="12" cy="10" r="5" fill="rgba(147,112,219,0.2)"/>
    <ellipse cx="9.5" cy="7.5" rx="2" ry="2.5" fill="rgba(255,255,255,0.2)" transform="rotate(-15 9.5 7.5)"/>
    <rect x="8" y="19" width="8" height="3" rx="1" fill="#9370DB"/>
  </Icon>
);

// --- Leaderboard ---

export const GoldenStar: React.FC<{ size?: number }> = ({ size = 14 }) => (
  <Icon size={size}>
    <polygon points="12,2 15,9 22,9.5 17,14.5 18.5,22 12,18 5.5,22 7,14.5 2,9.5 9,9"
             fill="#FFD700" stroke="#DAA520" strokeWidth="1"/>
  </Icon>
);

// --- Hamburger Menu ---

export const HamburgerMenu: React.FC<{ size?: number }> = ({ size = 12 }) => (
  <Icon size={size}>
    <line x1="3" y1="6" x2="21" y2="6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
    <line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
    <line x1="3" y1="18" x2="21" y2="18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
  </Icon>
);

// --- Whale icon lookup by fund ID ---
export const WHALE_ICONS: Record<number, React.ReactNode> = {
  0: <TopHat size={12} />,
  1: <Rocket size={12} />,
  2: <CoinStack size={12} />,
  3: <CrystalBall size={12} />,
};
