/** Shown the instant staff tap a link, while the page's data loads. */
export default function Loading() {
  return (
    <div className="skeleton" aria-busy="true" aria-label="Caricamento">
      <div className="sk sk-title" />
      <div className="sk sk-bar" />
      <div className="sk sk-block" />
      <div className="sk sk-block" />
    </div>
  );
}
