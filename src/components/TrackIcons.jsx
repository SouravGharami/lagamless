/** Small inline icons + the hero illustration for the Track / Return / Replace screens. */

const base = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
}

export const MailIcon = (p) => (
  <svg {...base} width={18} height={18} {...p}><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m3.5 7 8.5 6 8.5-6" /></svg>
)
export const BagIcon = (p) => (
  <svg {...base} {...p}><path d="M5 8h14l-1 12H6L5 8Z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></svg>
)
export const CheckIcon = (p) => (
  <svg {...base} {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
)
export const TruckIcon = (p) => (
  <svg {...base} {...p}><path d="M2 6h11v10H2zM13 10h4l3 3v3h-7" /><circle cx="6.5" cy="17.5" r="1.8" /><circle cx="16.5" cy="17.5" r="1.8" /></svg>
)
export const HomeIcon = (p) => (
  <svg {...base} {...p}><path d="m3 11 9-7 9 7" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" /></svg>
)
export const ShirtIcon = (p) => (
  <svg {...base} width={22} height={22} {...p}><path d="m8 3-5 3 2.5 4L8 9v12h8V9l2.5 1L21 6l-5-3a4 4 0 0 1-8 0Z" /></svg>
)
export const ReturnIcon = (p) => (
  <svg {...base} {...p}><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></svg>
)
export const SwapIcon = (p) => (
  <svg {...base} {...p}><path d="M17 3l4 4-4 4" /><path d="M21 7H8a4 4 0 0 0-4 4" /><path d="M7 21l-4-4 4-4" /><path d="M3 17h13a4 4 0 0 0 4-4" /></svg>
)
export const ShieldIcon = (p) => (
  <svg {...base} {...p}><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z" /><path d="m9 12 2 2 4-4" /></svg>
)
export const PulseIcon = (p) => (
  <svg {...base} {...p}><path d="M3 12h4l2-6 4 12 2-6h6" /></svg>
)

/** Animated hero art: orbit rings, a glowing route with checkpoints and a floating parcel. */
export function TrackHeroArt() {
  return (
    <svg className="tk-art" viewBox="0 0 500 500" role="img" aria-label="A parcel travelling along a delivery route">
      <defs>
        <radialGradient id="tk-core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="tk-face-top" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#bdbab0" />
        </linearGradient>
        <linearGradient id="tk-face-left" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2b2a27" />
          <stop offset="100%" stopColor="#0f0f0e" />
        </linearGradient>
        <linearGradient id="tk-face-right" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#151514" />
          <stop offset="100%" stopColor="#050505" />
        </linearGradient>
        <linearGradient id="tk-route" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#fff" stopOpacity="0" />
          <stop offset="60%" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0.2" />
        </linearGradient>
      </defs>

      <circle cx="250" cy="250" r="210" fill="url(#tk-core)" />

      <g className="tk-art__ring" fill="none" stroke="rgba(255,255,255,0.14)">
        <circle cx="250" cy="250" r="215" strokeDasharray="2 9" />
        <circle cx="250" cy="35" r="4" fill="#fff" stroke="none" />
      </g>
      <g className="tk-art__ring tk-art__ring--rev" fill="none" stroke="rgba(255,255,255,0.1)">
        <circle cx="250" cy="250" r="170" />
        <circle cx="80" cy="250" r="3" fill="#fff" stroke="none" />
      </g>
      <circle cx="250" cy="250" r="125" fill="none" stroke="rgba(255,255,255,0.07)" />

      {/* Route */}
      <path
        className="tk-art__route"
        d="M40 430 C 130 430, 130 330, 210 330 S 330 400, 400 300 S 440 120, 470 90"
        fill="none"
        stroke="url(#tk-route)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <g>
        <g className="tk-art__node"><circle cx="130" cy="392" r="14" fill="rgba(255,255,255,0.1)" /><circle cx="130" cy="392" r="5" fill="#fff" /></g>
        <g className="tk-art__node"><circle cx="330" cy="352" r="14" fill="rgba(255,255,255,0.1)" /><circle cx="330" cy="352" r="5" fill="#fff" /></g>
        <g className="tk-art__node"><circle cx="452" cy="150" r="14" fill="rgba(255,255,255,0.1)" /><circle cx="452" cy="150" r="5" fill="#fff" /></g>
      </g>

      {/* Parcel */}
      <g className="tk-art__float">
        <ellipse cx="250" cy="372" rx="90" ry="16" fill="rgba(255,255,255,0.08)" />
        <polygon points="250,150 340,200 250,250 160,200" fill="url(#tk-face-top)" />
        <polygon points="160,200 250,250 250,360 160,310" fill="url(#tk-face-left)" stroke="rgba(255,255,255,0.18)" />
        <polygon points="340,200 250,250 250,360 340,310" fill="url(#tk-face-right)" stroke="rgba(255,255,255,0.12)" />
        {/* tape */}
        <polygon points="250,150 268,160 178,210 160,200" fill="rgba(0,0,0,0.12)" />
        <polygon points="205,225 250,250 250,262 205,237" fill="rgba(255,255,255,0.14)" />
        {/* label */}
        <text x="182" y="280" fill="#fff" fontSize="15" fontWeight="800" letterSpacing="2" transform="rotate(29 182 280)" fontFamily="'Bricolage Grotesque', Arial, sans-serif">LAGAMLESS</text>
        <text x="182" y="298" fill="#8d8a82" fontSize="8" letterSpacing="2.5" transform="rotate(29 182 298)" fontFamily="Inter, Arial, sans-serif">MORE THAN CLOTHING</text>
      </g>
    </svg>
  )
}
