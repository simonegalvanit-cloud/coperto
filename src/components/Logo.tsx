export function Logo({ href = "/" }: { href?: string }) {
  return (
    <a className="logo" href={href}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <rect x="2" y="2" width="20" height="20" />
        <circle cx="12" cy="12" r="5" />
      </svg>
      coperto
    </a>
  );
}
