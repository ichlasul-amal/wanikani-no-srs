import { describe, expect, it } from "vitest";
import {
  type AnswerSubject,
  checkMeaning,
  checkReading,
  finalizeReading,
  levenshtein,
  normalizeMeaning,
} from "./answers";

const kanji: AnswerSubject = {
  meanings: [
    { meaning: "Person", primary: true, accepted_answer: true },
  ],
  auxiliaryMeanings: [
    { meaning: "Human", type: "whitelist" },
    { meaning: "Enter", type: "blacklist" },
  ],
  readings: [
    { reading: "じん", primary: true, accepted_answer: true, type: "onyomi" },
    { reading: "にん", primary: false, accepted_answer: true, type: "onyomi" },
    { reading: "ひと", primary: false, accepted_answer: false, type: "kunyomi" },
  ],
};

const vocab: AnswerSubject = {
  meanings: [{ meaning: "Large Intestine", primary: true, accepted_answer: true }],
  auxiliaryMeanings: [],
  readings: [{ reading: "だいちょう", primary: true, accepted_answer: true }],
};

describe("normalizeMeaning", () => {
  it("lowercases and collapses punctuation and whitespace", () => {
    expect(normalizeMeaning("  One-Self's  ")).toBe("one self s");
  });
});

describe("levenshtein", () => {
  it("counts edits", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(levenshtein("", "abc")).toBe(3);
    expect(levenshtein("same", "same")).toBe(0);
  });
});

describe("checkMeaning", () => {
  it("accepts primary meanings and whitelisted auxiliary meanings", () => {
    expect(checkMeaning(kanji, "person")).toEqual({ status: "correct" });
    expect(checkMeaning(kanji, " HUMAN ")).toEqual({ status: "correct" });
  });

  it("rejects blacklisted meanings", () => {
    expect(checkMeaning(kanji, "enter")).toEqual({ status: "wrong" });
  });

  it("accepts the person's own synonyms", () => {
    expect(checkMeaning(kanji, "dude", ["Dude"])).toEqual({ status: "correct" });
  });

  it("forgives small typos on longer answers only", () => {
    expect(checkMeaning(vocab, "large intestin")).toEqual({ status: "correct", close: true });
    expect(checkMeaning(kanji, "persan")).toEqual({ status: "correct", close: true });
    expect(checkMeaning({ ...kanji, meanings: [{ meaning: "Cat", primary: true, accepted_answer: true }] }, "car"))
      .toEqual({ status: "wrong" });
  });

  it("does not grade empty or Japanese input", () => {
    expect(checkMeaning(kanji, "   ").status).toBe("invalid");
    expect(checkMeaning(kanji, "じん").status).toBe("invalid");
  });
});

describe("finalizeReading", () => {
  it("turns a trailing n into ん", () => {
    expect(finalizeReading("jin")).toBe("じん");
    expect(finalizeReading("じn")).toBe("じん");
    expect(finalizeReading("じnn")).toBe("じん");
  });
});

describe("checkReading", () => {
  it("accepts accepted readings in kana, romaji or katakana", () => {
    expect(checkReading(kanji, "じん")).toEqual({ status: "correct" });
    expect(checkReading(kanji, "nin")).toEqual({ status: "correct" });
    expect(checkReading(kanji, "ジン")).toEqual({ status: "correct" });
    expect(checkReading(vocab, "daichou")).toEqual({ status: "correct" });
  });

  it("does not count a non-accepted reading as wrong", () => {
    const result = checkReading(kanji, "ひと");
    expect(result.status).toBe("invalid");
    expect(result).toMatchObject({ message: expect.stringContaining("on'yomi") });
  });

  it("marks other kana as wrong", () => {
    expect(checkReading(kanji, "かん")).toEqual({ status: "wrong" });
  });

  it("does not grade empty input or leftover romaji", () => {
    expect(checkReading(kanji, "").status).toBe("invalid");
    expect(checkReading(kanji, "jq").status).toBe("invalid");
  });
});
