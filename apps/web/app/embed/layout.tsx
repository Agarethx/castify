import '../globals.css';

/**
 * Minimal shell for embeddable pages served inside iframes.
 * No auth, no nav, no extra chrome — just the raw player.
 */
export default function EmbedLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <html lang="es">
      <body style={{ margin: 0, padding: 0, background: '#000', overflow: 'hidden' }}>
        {children}
      </body>
    </html>
  );
}
