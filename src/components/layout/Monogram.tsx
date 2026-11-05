import { useId } from 'react';
export function Monogram({ size = 40 }: { size?: number }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Monograma CP">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F3D88E" /><stop offset=".55" stopColor="#D4AF5A" /><stop offset="1" stopColor="#8C6B2E" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="#0B0B0D" />
      <rect x="3" y="3" width="58" height="58" rx="12" fill="none" stroke={`url(#${id})`} strokeWidth="2.5" />
      <text x="32" y="43" textAnchor="middle" fontFamily="'Barlow Condensed', 'Arial Narrow', sans-serif" fontWeight="800" fontSize="30" fill={`url(#${id})`}>CP</text>
    </svg>
  );
}
