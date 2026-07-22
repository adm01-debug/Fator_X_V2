/**
 * ChatBackground — pattern SVG sutil (doodles) para o painel de conversa,
 * inspirado no WhatsApp mas com tokens Nexus (dark theme + grain).
 */
export function ChatBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 opacity-[0.035]"
      style={{
        backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140' viewBox='0 0 140 140'><g fill='none' stroke='%23ffffff' stroke-width='1.2' stroke-linecap='round'><circle cx='20' cy='20' r='6'/><path d='M50 30 q10 -10 20 0 t20 0'/><path d='M100 15 l10 10 l-10 10 l-10 -10 z'/><circle cx='120' cy='60' r='4'/><path d='M15 80 l12 0 M15 85 l8 0'/><path d='M70 90 q6 -6 12 0 q6 6 12 0'/><circle cx='110' cy='115' r='7'/><path d='M30 120 l0 -14 l10 0'/><path d='M55 65 l8 8 l-8 8'/></g></svg>")`,
        backgroundSize: '280px 280px',
      }}
    />
  );
}
