import { toHiragana } from "wanakana";
import { toKanaFinal } from "./romaji";

// Each check returns one of:
//   { status: "correct", close?: true }  close = accepted with a typo
//   { status: "wrong" }
//   { status: "invalid", message }       not graded; ask the person to retry

const KANA_RE = /[぀-ヿ]/;
const LATIN_RE = /[a-z]/i;

export function normalizeMeaning(str) {
  return str
    .toLowerCase()
    .replace(/[-‐–—_.,'’"!?()/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[b.length];
}

// How many typos to forgive, scaled by answer length (short answers must
// be exact, otherwise "cat" would accept "car").
export function typoTolerance(length) {
  if (length <= 3) return 0;
  if (length <= 5) return 1;
  if (length <= 7) return 2;
  return 2 + Math.floor(length / 7);
}

export function checkMeaning(subject, input, synonyms = []) {
  const answer = normalizeMeaning(input);
  if (!answer) return { status: "invalid", message: "Type an answer first." };
  if (KANA_RE.test(answer)) {
    return { status: "invalid", message: "This one asks for the English meaning." };
  }

  const accepted = [
    ...subject.meanings.filter((m) => m.accepted_answer !== false).map((m) => m.meaning),
    ...subject.auxiliaryMeanings.filter((m) => m.type === "whitelist").map((m) => m.meaning),
    ...synonyms,
  ].map(normalizeMeaning);
  const blacklisted = subject.auxiliaryMeanings
    .filter((m) => m.type === "blacklist")
    .map((m) => normalizeMeaning(m.meaning));

  if (accepted.includes(answer)) return { status: "correct" };
  if (blacklisted.includes(answer)) return { status: "wrong" };
  if (accepted.some((a) => levenshtein(a, answer) <= typoTolerance(a.length))) {
    return { status: "correct", close: true };
  }
  return { status: "wrong" };
}

// Finish converting whatever romaji is left (e.g. a trailing "n" that was
// held back while typing) and fold katakana into hiragana for comparison.
export function finalizeReading(input) {
  return toKanaFinal(input.trim()).replace(/\s+/g, "");
}

const READING_TYPE_LABEL = { onyomi: "on'yomi", kunyomi: "kun'yomi", nanori: "nanori" };

export function checkReading(subject, input) {
  const kana = finalizeReading(input);
  if (!kana) return { status: "invalid", message: "Type an answer first." };
  if (LATIN_RE.test(kana)) {
    return { status: "invalid", message: "That isn't valid kana. Check the spelling." };
  }

  const answer = toHiragana(kana);
  const accepted = subject.readings.filter((r) => r.accepted_answer !== false);
  if (accepted.some((r) => toHiragana(r.reading) === answer)) return { status: "correct" };

  // A real reading of this kanji that WaniKani doesn't want here (e.g. the
  // kun'yomi when it teaches the on'yomi) shouldn't count as a mistake.
  const other = subject.readings.find(
    (r) => r.accepted_answer === false && toHiragana(r.reading) === answer
  );
  if (other) {
    const wanted = [...new Set(accepted.map((r) => READING_TYPE_LABEL[r.type]).filter(Boolean))];
    return {
      status: "invalid",
      message: wanted.length
        ? `That's a valid reading, but WaniKani is looking for the ${wanted.join(" or ")} here.`
        : "That's a valid reading, but not the one WaniKani is looking for here.",
    };
  }
  return { status: "wrong" };
}
