// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import type { RawSubject, RawSubjectData } from "./api/wanikani";
import App from "./App";
import type { SubjectType } from "./types";

// A tiny fake of the WaniKani API: one radical, one kanji, one vocabulary
// word on level 1, plus a level-2 kanji that only shows up as "used in".
function subject(id: number, object: SubjectType, data: Partial<RawSubjectData>): RawSubject {
  return {
    id,
    object,
    data: {
      level: 1,
      lesson_position: 0,
      auxiliary_meanings: [],
      readings: [],
      component_subject_ids: [],
      amalgamation_subject_ids: [],
      context_sentences: [],
      meaning_mnemonic: "",
      hidden_at: null,
      ...data,
    },
  };
}

const SUBJECTS = [
  subject(1, "radical", {
    characters: "一",
    meanings: [{ meaning: "Ground", primary: true, accepted_answer: true }],
    meaning_mnemonic: "The <radical>ground</radical> is flat.",
    amalgamation_subject_ids: [2, 4],
  }),
  subject(2, "kanji", {
    characters: "一",
    meanings: [{ meaning: "One", primary: true, accepted_answer: true }],
    readings: [
      { reading: "いち", primary: true, accepted_answer: true, type: "onyomi" },
      { reading: "ひと", primary: false, accepted_answer: false, type: "kunyomi" },
    ],
    component_subject_ids: [1],
    amalgamation_subject_ids: [3],
  }),
  subject(3, "vocabulary", {
    characters: "一つ",
    meanings: [{ meaning: "One Thing", primary: true, accepted_answer: true }],
    readings: [{ reading: "ひとつ", primary: true, accepted_answer: true }],
    component_subject_ids: [2],
    context_sentences: [{ ja: "一つください。", en: "One, please." }],
  }),
  subject(4, "kanji", {
    level: 2,
    characters: "二",
    meanings: [{ meaning: "Two", primary: true, accepted_answer: true }],
    readings: [{ reading: "に", primary: true, accepted_answer: true, type: "onyomi" }],
    component_subject_ids: [1],
  }),
];

const ANSWERS: Record<string, string> = {
  "一:Radical Meaning": "ground",
  "一:Kanji Meaning": "one",
  "一:Kanji Reading": "ichi",
  "一つ:Vocabulary Meaning": "one thing",
  "一つ:Vocabulary Reading": "hitotsu",
};

function respond(body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
}

function fakeFetch(url: string, init: RequestInit) {
  if ((init.headers as Record<string, string>).Authorization !== "Bearer good-token") {
    return Promise.resolve(new Response("{}", { status: 401 }));
  }
  const { pathname, searchParams } = new URL(url);
  if (pathname === "/v2/user") {
    return respond({ data: { username: "tester", level: 1, subscription: { max_level_granted: 3 } } });
  }
  if (pathname === "/v2/study_materials") return respond({ data: [], pages: { next_url: null } });
  if (pathname === "/v2/subjects") {
    let rows = SUBJECTS;
    const levels = searchParams.get("levels")?.split(",").map(Number);
    if (levels) rows = rows.filter((s) => levels.includes(s.data.level));
    const ids = searchParams.get("ids")?.split(",").map(Number);
    if (ids) rows = rows.filter((s) => ids.includes(s.id));
    return respond({ data: rows, pages: { next_url: null } });
  }
  return Promise.resolve(new Response("{}", { status: 404 }));
}

function levelButton(name: RegExp) {
  return screen.getByRole("button", { name }) as HTMLButtonElement;
}

async function connect(user: UserEvent) {
  render(<App />);
  await user.type(screen.getByLabelText(/api token/i), "good-token");
  await user.click(screen.getByRole("button", { name: "Connect" }));
  await screen.findByText(/signed in as tester/i);
  return screen.findByRole("button", { name: /lessons\s*3/i });
}

describe("App", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(fakeFetch));
    localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("rejects a bad token", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByLabelText(/api token/i), "bad-token");
    await user.click(screen.getByRole("button", { name: "Connect" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/wasn.t accepted/);
  });

  it("locks levels beyond the subscription", async () => {
    const user = userEvent.setup();
    await connect(user);
    expect(levelButton(/level 3$/i).disabled).toBe(false);
    expect(levelButton(/level 4$/i).disabled).toBe(true);
  });

  it("starts the level list at the person's level", async () => {
    const offsetLeft = vi.spyOn(HTMLElement.prototype, "offsetLeft", "get").mockReturnValue(120);
    const user = userEvent.setup();
    await connect(user);
    expect(levelButton(/^level 1\b/i).parentElement?.scrollLeft).toBe(120);
    offsetLeft.mockRestore();
  });

  it("walks through lessons with cross-level relations", async () => {
    const user = userEvent.setup();
    const lessons = await connect(user);
    await user.click(lessons);

    expect(screen.getByText("Ground")).toBeTruthy();
    // The level-2 kanji is fetched on demand for "Used in kanji".
    const usedIn = await screen.findByText("Two");
    await user.click(usedIn);
    expect(screen.getByText("Viewing related subject")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /back to lesson/i }));

    await user.keyboard("{ArrowRight}");
    expect(screen.getByText("Made of radicals")).toBeTruthy();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByText("一つください。")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Done" }));
    await screen.findByText(/signed in as tester/i);
  });

  it("runs a review session and re-asks missed cards", async () => {
    const user = userEvent.setup();
    await connect(user);
    await user.click(screen.getByRole("button", { name: /reviews\s*5/i }));

    let missedOnce = false;
    let shookOnce = false;
    for (let step = 0; step < 20 && !screen.queryByText("Session complete"); step++) {
      const prompt = screen.getByText(/(Radical|Kanji|Vocabulary) (Meaning|Reading)$/).textContent;
      const characters = document.querySelector("[lang=ja].text-6xl")?.textContent;
      const key = `${characters}:${prompt}`;
      const input = screen.getByRole("textbox");

      if (key === "一:Kanji Reading" && !shookOnce) {
        // A valid but non-accepted reading is not graded, just flagged.
        await user.type(input, "hito{Enter}");
        expect(screen.getByText(/looking for the on'yomi/)).toBeTruthy();
        await user.clear(input);
        shookOnce = true;
      }
      if (key === "一:Radical Meaning" && !missedOnce) {
        await user.type(input, "sky{Enter}");
        expect(screen.getByText("Not quite")).toBeTruthy();
        missedOnce = true;
      } else {
        await user.type(input, `${ANSWERS[key]}{Enter}`);
        expect(screen.getByText(/Correct!|Close enough!/)).toBeTruthy();
      }
      await user.keyboard("{Enter}");
    }

    expect(screen.getByText("Session complete")).toBeTruthy();
    expect(missedOnce && shookOnce).toBe(true);
    const missed = screen.getByText("Missed").previousSibling;
    expect(missed?.textContent).toBe("1");
    expect(within(document.body).getByRole("button", { name: /review 1 missed again/i })).toBeTruthy();
  });

  it("remembers the token only when asked", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByLabelText(/api token/i), "good-token");
    await user.click(screen.getByLabelText(/remember me/i));
    await user.click(screen.getByRole("button", { name: "Connect" }));
    await screen.findByText(/signed in as tester/i);
    expect(localStorage.getItem("wk-no-srs:token")).toBe("good-token");

    await user.click(screen.getByRole("button", { name: /disconnect/i }));
    expect(localStorage.getItem("wk-no-srs:token")).toBeNull();
  });
});
