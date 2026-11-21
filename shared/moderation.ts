/**
 * A light filter for what other people will read (lantern wishes, names). It stops the obvious —
 * swearing, slurs, links — not everything; the report button and per-person limits do the rest.
 * Used by the client (instant feedback) and the server (the one that counts).
 */

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's', '!': 'i' };

/** Whole words only (so "Scunthorpe", "assess" and "grape" pass). */
const WORDS =
  /(?:^|[^a-z])(?:fu+c+k+\w*|fu+k+(?:ing|er|s)?|f\*+c?k\w*|sh\*+t\w*|motherf\w*|shit\w*|bullshit|bitch\w*|cunts?|assholes?|arseholes?|bastards?|dickheads?|whores?|sluts?|fag(?:got)?s?|retard(?:ed|s)?|n[i]gg(?:er|a|ah)s?|kys|kill ?yoursel(?:f|ves))(?=$|[^a-z])/;

/** Inside any word, once dots and spaces between letters are squeezed out ("f.u.c.k", "f u c k"). */
const SQUEEZED = /fuck|motherf|nigger|faggot/;

/** Chinese (traditional and simplified). Phrases, not single characters, so 幹部 or 三小時 pass. */
const ZH = ['幹你娘', '干你娘', '操你', '肏', '他媽的', '他妈的', '你媽的', '你妈的', '雞巴', '鸡巴', '婊子', '傻逼', '傻屄', '煞筆', '王八蛋', '去死', '賤人', '贱人', '屌你', '靠北', '智障', '腦殘', '脑残'];

/** Links and handles: a wish wall isn't a place to advertise. */
const LINK = /https?:\/\/|www\.|discord\.gg|\b[a-z0-9-]{2,}\.(?:com|net|org|io|gg|ly|me|co|xyz|cn|tw|ru|info|biz|app|link|site|top|shop)\b/;

export function isBlocked(raw: string): boolean {
  const lower = raw.toLowerCase().normalize('NFKC');
  if (LINK.test(lower)) return true;
  if (ZH.some((w) => lower.includes(w))) return true;
  const plain = lower.replace(/[013457@$!]/g, (c) => LEET[c] ?? c);
  if (WORDS.test(plain)) return true;
  // Squeeze out separators between letters, but keep the gaps between real words.
  const squeezed = plain.replace(/\b([a-z])[\s.*_-]+(?=[a-z]\b)/g, '$1').replace(/([a-z])[.*_-]+(?=[a-z])/g, '$1');
  return squeezed.split(/\s+/).some((w) => SQUEEZED.test(w));
}
