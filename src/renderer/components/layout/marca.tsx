/** Logo: una hoja de agenda con un turno marcado. */
export function Marca({ className = 'size-10' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <rect width="40" height="40" rx="10" fill="var(--acento)" />
      <rect x="10" y="11" width="20" height="19" rx="3" fill="none" stroke="#fff" strokeWidth="2.2" />
      <path d="M10 16.5h20" stroke="#fff" strokeWidth="2.2" />
      <path d="M15 9v4M25 9v4" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
      <rect x="14.5" y="20" width="6" height="5" rx="1.2" fill="#fff" />
    </svg>
  );
}
