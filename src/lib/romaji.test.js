import { describe, expect, it } from "vitest";
import { toKanaFinal, toKanaWhileTyping } from "./romaji";

// Feed text one keystroke at a time, the way the input receives it.
function type(text) {
  let value = "";
  for (const ch of text) value = toKanaWhileTyping(value + ch);
  return value;
}

describe("toKanaWhileTyping", () => {
  it("holds romaji that may still change", () => {
    expect(type("jin")).toBe("じn");
    expect(type("jinn")).toBe("じnn");
    expect(type("ky")).toBe("ky");
  });

  it("reads nn + vowel as ん + な/に/…", () => {
    expect(type("minna")).toBe("みんな");
    expect(type("onna")).toBe("おんな");
    expect(type("konnyaku")).toBe("こんにゃく");
    expect(type("minnna")).toBe("みんな");
  });

  it("handles sounds the old hand-written table missed", () => {
    expect(type("fairu")).toBe("ふぁいる");
    expect(type("matcha")).toBe("まっちゃ");
    expect(type("kon'ya")).toBe("こんや");
    expect(type("ra-men")).toBe("らーめn");
    expect(type("dzu")).toBe("づ");
  });

  it("gives the same result for pasted text", () => {
    expect(toKanaWhileTyping("minna")).toBe("みんな");
    expect(toKanaWhileTyping("konnichiha")).toBe("こんにちは");
  });
});

describe("toKanaFinal", () => {
  it("commits held-back n", () => {
    expect(toKanaFinal("じn")).toBe("じん");
    expect(toKanaFinal("じnn")).toBe("じん");
    expect(toKanaFinal("ra-men")).toBe("らーめん");
  });

  it("leaves an unfinished consonant so it can be flagged", () => {
    expect(toKanaFinal("k")).toBe("k");
  });
});
