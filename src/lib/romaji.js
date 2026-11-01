import { toKana } from "wanakana";

// Romaji -> kana conversion for the reading input, built on wanakana's
// IME mode (the same library WaniKani uses) with two conveniences on top:
// - "nn" + vowel/y is read as ん + な/に/…, so "minna" -> みんな the way
//   most people write it (a plain IME would give みんあ).
// - "tch" is accepted for っち, as in "matcha".

const IME = { IMEMode: true };

function prepare(text) {
  return text
    .toLowerCase()
    .replace(/tch/g, "cch")
    .replace(/dzu/g, "du")
    .replace(/(?<!n)nn(?=[aiueoy])/g, "n'n");
}

// Conversion while typing: romaji that may still change (a trailing "n",
// "nn" or lone consonant) is left as-is until the next letter arrives.
export function toKanaWhileTyping(text) {
  const s = prepare(text);
  if (s.endsWith("nn")) return toKana(s.slice(0, -2), IME) + "nn";
  return toKana(s, IME);
}

// Conversion on submit: commit anything that was being held back.
export function toKanaFinal(text) {
  return toKana(toKanaWhileTyping(text).replace(/nn$/, "n"));
}
