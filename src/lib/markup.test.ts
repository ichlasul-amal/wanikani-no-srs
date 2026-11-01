import { describe, expect, it } from "vitest";
import { parseMarkup } from "./markup";

describe("parseMarkup", () => {
  it("splits tagged spans from plain text", () => {
    expect(parseMarkup("The <radical>ground</radical> is <reading>じ</reading>.")).toEqual([
      { tag: null, text: "The " },
      { tag: "radical", text: "ground" },
      { tag: null, text: " is " },
      { tag: "reading", text: "じ" },
      { tag: null, text: "." },
    ]);
  });

  it("drops unknown tags but keeps their text", () => {
    expect(parseMarkup("a <b>bold</b> move")).toEqual([{ tag: null, text: "a bold move" }]);
  });

  it("handles empty input", () => {
    expect(parseMarkup("")).toEqual([]);
    expect(parseMarkup(null)).toEqual([]);
  });
});
