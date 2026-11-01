// WaniKani mnemonics contain inline tags such as <radical>, <kanji>,
// <vocabulary>, <reading>, <meaning> and <ja>. Split them into segments
// so they can be rendered as styled React elements (no innerHTML).

export type MarkupTag = "radical" | "kanji" | "vocabulary" | "reading" | "meaning" | "ja";

export interface MarkupSegment {
  tag: MarkupTag | null;
  text: string;
}

const TAG_RE = /<(radical|kanji|vocabulary|reading|meaning|ja)>([\s\S]*?)<\/\1>/g;
const STRAY_TAG_RE = /<\/?[a-z]+>/gi;

export function parseMarkup(text: string | null | undefined): MarkupSegment[] {
  if (!text) return [];
  const segments: MarkupSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(TAG_RE)) {
    if (match.index > last) {
      segments.push({ tag: null, text: text.slice(last, match.index).replace(STRAY_TAG_RE, "") });
    }
    segments.push({ tag: match[1] as MarkupTag, text: match[2]!.replace(STRAY_TAG_RE, "") });
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    segments.push({ tag: null, text: text.slice(last).replace(STRAY_TAG_RE, "") });
  }
  return segments.filter((s) => s.text);
}
