import { describe, expect, it } from "vitest";
import { buildQuizCards, requeue } from "./quiz";

const radical = { id: 1, readings: [] };
const kanji = { id: 2, readings: [{ reading: "じん" }] };
const vocab = { id: 3, readings: [{ reading: "ひと" }] };
const subjects = [radical, kanji, vocab];

// Deterministic pseudo-random generator so shuffles are reproducible.
function seeded(seed) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

describe("buildQuizCards", () => {
  it("asks meaning for everything and reading only where one exists", () => {
    const cards = buildQuizCards(subjects, { order: "ordered" });
    expect(cards.map((c) => c.id)).toEqual(["1:meaning", "2:meaning", "2:reading", "3:meaning", "3:reading"]);
  });

  it("supports meaning-only and reading-only sessions", () => {
    expect(buildQuizCards(subjects, { questionTypes: "meaning" })).toHaveLength(3);
    const readingOnly = buildQuizCards(subjects, { questionTypes: "reading" });
    expect(readingOnly.map((c) => c.askType)).toEqual(["reading", "reading"]);
  });

  it("keeps every card when shuffling", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: i, readings: [{ reading: "あ" }] }));
    const cards = buildQuizCards(many, { random: seeded(42) });
    expect(cards).toHaveLength(40);
    expect(new Set(cards.map((c) => c.id)).size).toBe(40);
  });

  it("keeps cards of the same subject apart when possible", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: i, readings: [{ reading: "あ" }] }));
    const cards = buildQuizCards(many, { random: seeded(7) });
    for (let i = 1; i < cards.length; i++) {
      expect(cards[i].subjectId).not.toBe(cards[i - 1].subjectId);
    }
  });
});

describe("requeue", () => {
  it("re-inserts the card a few positions later", () => {
    const queue = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l"];
    const result = requeue(queue, 0, "a", () => 0);
    expect(result).toHaveLength(13);
    expect(result.indexOf("a", 1)).toBe(4);
  });

  it("appends to the end when the queue is short", () => {
    expect(requeue(["a", "b"], 1, "b", () => 0.99)).toEqual(["a", "b", "b"]);
  });
});
