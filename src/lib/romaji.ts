import { toKana } from "wanakana";

// Romaji -> kana conversion for the reading input, built on wanakana's
// IME mode (the same library WaniKani uses) with two conveniences on top:
// - "nn" + vowel/y is read as ん + な/に/…, so "minna" -> みんな the way
//   most people write it (a plain IME would give みんあ).
// - "tch" is accepted for っち, as in "matcha".

const IME = { IMEMode: true };

function prepare(text: string): string {
  return text
    .toLowerCase()
    .replace(/tch/g, "cch")
    .replace(/dzu/g, "du")
    .replace(/ん(?=[aiueoy])/g, "nn") // "nn" already showed as ん while typing
    .replace(/(?<!n)nn(?=[aiueoy])/g, "n'n");
}

// Conversion while typing: romaji that may still change (a trailing "n" or
// lone consonant) is left as-is until the next letter arrives. "n'" is held
// too: as a bare ん, the next vowel or "y" would read it as "nn".
export function toKanaWhileTyping(text: string): string {
  const s = prepare(text);
  const held = /n'y?$/.exec(s)?.[0] ?? "";
  return toKana(s.slice(0, s.length - held.length), IME) + held;
}

// Conversion on submit: commit anything that was being held back.
export function toKanaFinal(text: string): string {
  return toKana(toKanaWhileTyping(text));
}
