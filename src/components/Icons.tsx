interface IconProps {
  size?: number;
  strokeWidth?: number;
}

function frame(size = 20, strokeWidth = 1.6) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
}

export function ArrowLeft({ size, strokeWidth }: IconProps) {
  return (
    <svg {...frame(size, strokeWidth)}>
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

export function ChevronLeft({ size, strokeWidth }: IconProps) {
  return (
    <svg {...frame(size, strokeWidth)}>
      <path d="M14.5 6.5L9 12l5.5 5.5" />
    </svg>
  );
}

export function ChevronRight({ size, strokeWidth }: IconProps) {
  return (
    <svg {...frame(size, strokeWidth)}>
      <path d="M9.5 6.5L15 12l-5.5 5.5" />
    </svg>
  );
}

export function ListIcon({ size, strokeWidth }: IconProps) {
  return (
    <svg {...frame(size, strokeWidth)}>
      <path d="M4 6h16M4 12h16M4 18h11" />
    </svg>
  );
}

export function TypeIcon({ size, strokeWidth }: IconProps) {
  return (
    <svg {...frame(size, strokeWidth)}>
      <path d="M5 7V5h14v2M12 5v14M9 19h6" />
    </svg>
  );
}

export function BookmarkIcon({ size, strokeWidth, filled }: IconProps & { filled?: boolean }) {
  return (
    <svg {...frame(size, strokeWidth)} fill={filled ? 'currentColor' : 'none'}>
      <path d="M7 4h10a1 1 0 011 1v15l-6-4-6 4V5a1 1 0 011-1z" />
    </svg>
  );
}

export function XIcon({ size, strokeWidth }: IconProps) {
  return (
    <svg {...frame(size, strokeWidth)}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function TrashIcon({ size, strokeWidth }: IconProps) {
  return (
    <svg {...frame(size, strokeWidth)}>
      <path d="M4 7h16M9 7V5h6v2M7 7l1 13h8l1-13M10 11v6M14 11v6" />
    </svg>
  );
}

export function UploadIcon({ size, strokeWidth }: IconProps) {
  return (
    <svg {...frame(size, strokeWidth)}>
      <path d="M12 16V4M8 8l4-4 4 4M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" />
    </svg>
  );
}

export function PlusIcon({ size, strokeWidth }: IconProps) {
  return (
    <svg {...frame(size, strokeWidth)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function MoreVertical({ size, strokeWidth }: IconProps) {
  return (
    <svg {...frame(size, strokeWidth)}>
      <circle cx="12" cy="5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="19" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function MinusIcon({ size, strokeWidth }: IconProps) {
  return (
    <svg {...frame(size, strokeWidth)}>
      <path d="M5 12h14" />
    </svg>
  );
}
