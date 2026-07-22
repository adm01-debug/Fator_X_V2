// Utilidades de destaque de citação: extrai frase-chave do snippet e monta
// URL de viewer já posicionada na página / no texto correto quando possível.

const STOPWORDS = new Set([
  'a','o','os','as','um','uma','de','do','da','dos','das','e','ou','que','em','no','na',
  'nos','nas','para','por','com','sem','ao','à','às','se','sua','seu','suas','seus','como',
  'the','a','an','and','or','of','to','in','on','for','with','is','are','be','by','at','as',
]);

/**
 * Extrai uma frase curta e significativa do snippet — usada para busca em texto
 * dentro do PDF (Chromium) e para o modo highlight visual dentro do próprio diálogo.
 */
export function extractKeyPhrase(snippet: string | null | undefined, maxWords = 8): string {
  if (!snippet) return '';
  // Remove aspas e ruído comum, pega a sentença mais densa.
  const clean = snippet.replace(/["'`“”‘’]/g, '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const sentences = clean.split(/(?<=[.!?])\s+/).filter(Boolean);
  const target = sentences.sort((a, b) => b.length - a.length)[0] ?? clean;
  const words = target.split(/\s+/);
  // Preserva ordem, mas descarta stopwords iniciais para começar em algo forte.
  let start = 0;
  while (start < words.length && STOPWORDS.has(words[start].toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''))) {
    start += 1;
  }
  const picked = words.slice(start, start + maxWords).join(' ');
  return picked.trim();
}

/**
 * Monta a URL do viewer com âncora de página (padrão PDF `#page=N`) e, quando
 * suportado, um Text Fragment (`#:~:text=`) para destacar o trecho automaticamente.
 * Retorna a URL original se nenhum reforço for aplicável.
 */
export function buildDeepLink(baseUrl: string, opts: { page?: number | null; phrase?: string | null }): string {
  if (!baseUrl) return baseUrl;
  try {
    const url = new URL(baseUrl);
    const parts: string[] = [];
    if (opts.page && Number.isFinite(opts.page) && opts.page > 0) {
      parts.push(`page=${opts.page}`);
    }
    if (opts.phrase && opts.phrase.trim().length >= 4) {
      // Text Fragment padrão (Chromium): #:~:text=encoded
      parts.push(`:~:text=${encodeURIComponent(opts.phrase.trim())}`);
    }
    if (parts.length === 0) return url.toString();
    // Preserva query original, substitui apenas o hash.
    url.hash = parts.join('&');
    return url.toString();
  } catch {
    return baseUrl;
  }
}

/**
 * Divide o snippet em segmentos para renderização com <mark> destacando a frase-chave.
 * Case-insensitive, primeira ocorrência apenas.
 */
export function splitForHighlight(snippet: string, phrase: string): Array<{ text: string; hit: boolean }> {
  if (!snippet || !phrase) return [{ text: snippet ?? '', hit: false }];
  const idx = snippet.toLowerCase().indexOf(phrase.toLowerCase());
  if (idx < 0) return [{ text: snippet, hit: false }];
  return [
    { text: snippet.slice(0, idx), hit: false },
    { text: snippet.slice(idx, idx + phrase.length), hit: true },
    { text: snippet.slice(idx + phrase.length), hit: false },
  ];
}
