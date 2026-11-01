import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Brain,
  Check,
  X,
  Loader2,
  AlertCircle,
  LogOut,
} from "lucide-react";

// ============================================================
// WANIKANI API CLIENT
// Talks directly to api.wanikani.com from the browser using the
// person's own API token. The token only ever lives in React state
// for this session — it's never hardcoded, never written to
// localStorage/sessionStorage, and never sent anywhere other than
// WaniKani's own API.
// ============================================================

const WK_API_BASE = "https://api.wanikani.com/v2";
const WK_REVISION = "20170710";

class WaniKaniError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function wkFetch(token, path) {
  const res = await fetch(`${WK_API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Wanikani-Revision": WK_REVISION,
    },
  });
  if (!res.ok) {
    if (res.status === 401) {
      throw new WaniKaniError(
        "That token wasn't accepted by WaniKani. Double-check it and try again.",
        401
      );
    }
    if (res.status === 429) {
      throw new WaniKaniError(
        "WaniKani's API rate limit was hit. Wait a minute and try again.",
        429
      );
    }
    throw new WaniKaniError(`WaniKani API error (${res.status}).`, res.status);
  }
  return res.json();
}

// Fetch every page of a collection endpoint (WaniKani paginates at 1000
// items, which only matters for very large /subjects pulls).
async function wkFetchAllPages(token, path) {
  let url = path;
  let all = [];
  while (url) {
    const json = await wkFetch(token, url);
    all = all.concat(json.data || []);
    const next = json.pages && json.pages.next_url;
    if (!next) break;
    // next_url is a full URL already; strip the base back off so
    // wkFetch's header logic stays in one place.
    url = next.replace(WK_API_BASE, "");
  }
  return all;
}

async function wkGetUser(token) {
  const json = await wkFetch(token, "/user");
  return json.data;
}

// Pull radical/kanji/vocabulary subjects for a specific level straight
// from WaniKani, and normalize them into the same shape the rest of
// this app already expects (mirrors the original dummy SUBJECTS shape).
async function wkGetSubjectsForLevel(token, level) {
  const rows = await wkFetchAllPages(
    token,
    `/subjects?levels=${level}&types=radical,kanji,vocabulary`
  );
  return rows.map(normalizeSubject);
}

// Strip WaniKani's inline markup tags (<radical>, <kanji>, <vocabulary>,
// <reading>, <meaning>) out of mnemonic text, since this app renders
// mnemonics as plain text rather than styled HTML.
function stripWkMarkup(str) {
  if (!str) return str;
  return str.replace(/<\/?(radical|kanji|vocabulary|reading|meaning)>/g, "");
}

// Convert a raw WaniKani subject object into the flatter shape the rest
// of this file works with. The dummy data used separate
// component_radical_ids/component_kanji_ids arrays; the real API just
// has one component_subject_ids array (radicals for kanji, kanji for
// vocab), so we route it into the right field based on subject type.
function normalizeSubject(raw) {
  const d = raw.data;
  const base = {
    id: raw.id,
    object: raw.object,
    level: d.level,
    characters: d.characters, // may be null for image-only radicals
    characters_image_url:
      d.character_images?.find((i) => i.content_type === "image/svg+xml")
        ?.url || null,
    meanings: d.meanings,
    meaning_mnemonic: stripWkMarkup(d.meaning_mnemonic),
  };
  if (raw.object === "kanji") {
    return {
      ...base,
      readings: d.readings,
      reading_mnemonic: stripWkMarkup(d.reading_mnemonic),
      component_radical_ids: d.component_subject_ids || [],
    };
  }
  if (raw.object === "vocabulary") {
    return {
      ...base,
      readings: d.readings,
      component_kanji_ids: d.component_subject_ids || [],
      context_sentences: d.context_sentences || [],
    };
  }
  // radical
  return base;
}

// ============================================================
// (The original dummy SUBJECTS array — hardcoded levels 1/5/10 — has
// been removed. Subjects are now fetched live from WaniKani per level;
// see useWaniKaniLevel() further down.)
// ============================================================


// Full WaniKani level range. Every level button is shown and clickable;
// subjects for a level are only fetched from the API once that level is
// actually selected (see useWaniKaniLevel below). A level the person
// hasn't unlocked yet, or one WaniKani has no data for, just results in
// 0 subjects, which disables the Lessons/Reviews buttons automatically
// (see `filtered.length === 0` further down).
const ALL_LEVELS = Array.from({ length: 60 }, (_, i) => i + 1);
const TYPE_LABEL = { radical: "Radical", kanji: "Kanji", vocabulary: "Vocabulary" };
const TYPE_ORDER = ["radical", "kanji", "vocabulary"];

// Per-type color, using WaniKani's exact official palette: radical = blue,
// kanji = pink/magenta, vocabulary = purple. `hex` is the exact solid
// color, used everywhere via inline style for pixel-perfect accuracy
// (backgrounds, borders, text) since Tailwind's core utilities don't
// include arbitrary color values directly. `bgSoft` is the one exception:
// a light Tailwind tint used for soft backgrounds on small UI (grid
// cards, chips, inactive filter states), where an exact match isn't
// necessary.
const TYPE_STYLE = {
  radical: {
    hex: "#00AAFF",
    bgSoft: "bg-blue-50",
  },
  kanji: {
    hex: "#FF00AA",
    bgSoft: "bg-pink-50",
  },
  vocabulary: {
    hex: "#AA00FF",
    bgSoft: "bg-purple-50",
  },
};

// ============================================================
// LIVE SUBJECT CACHE
// Replaces the old hardcoded SUBJECTS array. Subjects are fetched from
// WaniKani one level at a time (see useWaniKaniLevel) and merged into
// this module-level Map, keyed by subject id. Cross-level lookups
// (e.g. jumping from a kanji to a radical that lives on a different
// level) work as long as that other level has already been fetched at
// least once this session — components that need a guaranteed lookup
// fetch the relevant level first.
// ============================================================

const subjectCache = new Map();
// Tracks which levels have already been fetched this session, so we
// don't needlessly refetch a level the person revisits.
const fetchedLevels = new Set();

function cacheSubjects(subjects) {
  subjects.forEach((s) => subjectCache.set(s.id, s));
}

function byId(id) {
  return subjectCache.get(id);
}

function primaryMeaning(subject) {
  const m = subject.meanings.find((x) => x.primary) || subject.meanings[0];
  return m ? m.meaning : "";
}

// Display order within a level: radical -> kanji -> vocabulary. The
// WaniKani API already returns subjects in a stable lesson_position
// order per type, and wkGetSubjectsForLevel requests all 3 types in
// that same radical/kanji/vocabulary order, so a simple cache filter
// (rather than re-sorting) preserves it.
//
// `cacheVersion` isn't read inside the function body — subjectCache is
// a plain Map living outside React state, so reading it doesn't need
// any particular argument. It's accepted as a parameter purely so a
// caller's useMemo(() => subjectsForLevel(level, activeTypes, cacheVersion), [..., cacheVersion])
// has a dependency that's visibly *used* inside the memoized callback,
// which is what tells exhaustive-deps the dependency is real rather
// than reporting it as unnecessary.
function subjectsForLevel(level, activeTypes) {
  return [...subjectCache.values()].filter(
    (s) => s.level === level && activeTypes.includes(s.object)
  );
}

function allCachedSubjectsForLevel(level) {
  return [...subjectCache.values()].filter((s) => s.level === level);
}

// ============================================================
// ROMAJI -> HIRAGANA CONVERTER
// Manual lookup table (no external library), supports:
// - basic kana (a-row, ka-row, etc.)
// - youon (kya, sha, chu, etc. — combined with small ya/yu/yo)
// - sokuon (double consonant -> small tsu, e.g. "kka" -> "っか")
// - a lone "n" at the end of a word -> ん
// Greedy matching: try the longest substring first (3 letters, then 2, then 1).
// ============================================================

const ROMAJI_TO_KANA = {
  // a-row
  a: "あ", i: "い", u: "う", e: "え", o: "お",
  // k-row
  ka: "か", ki: "き", ku: "く", ke: "け", ko: "こ",
  kya: "きゃ", kyu: "きゅ", kyo: "きょ",
  // s-row
  sa: "さ", shi: "し", si: "し", su: "す", se: "せ", so: "そ",
  sha: "しゃ", shu: "しゅ", sho: "しょ",
  // t-row
  ta: "た", chi: "ち", ti: "ち", tsu: "つ", tu: "つ", te: "て", to: "と",
  cha: "ちゃ", chu: "ちゅ", cho: "ちょ",
  // n-row
  na: "な", ni: "に", nu: "ぬ", ne: "ね", no: "の",
  nya: "にゃ", nyu: "にゅ", nyo: "にょ",
  // h-row
  ha: "は", hi: "ひ", fu: "ふ", hu: "ふ", he: "へ", ho: "ほ",
  hya: "ひゃ", hyu: "ひゅ", hyo: "ひょ",
  // m-row
  ma: "ま", mi: "み", mu: "む", me: "め", mo: "も",
  mya: "みゃ", myu: "みゅ", myo: "みょ",
  // y-row
  ya: "や", yu: "ゆ", yo: "よ",
  // r-row
  ra: "ら", ri: "り", ru: "る", re: "れ", ro: "ろ",
  rya: "りゃ", ryu: "りゅ", ryo: "りょ",
  // w-row
  wa: "わ", wo: "を",
  // g-row
  ga: "が", gi: "ぎ", gu: "ぐ", ge: "げ", go: "ご",
  gya: "ぎゃ", gyu: "ぎゅ", gyo: "ぎょ",
  // z-row
  za: "ざ", ji: "じ", zi: "じ", zu: "ず", ze: "ぜ", zo: "ぞ",
  ja: "じゃ", ju: "じゅ", jo: "じょ",
  // d-row
  da: "だ", di: "ぢ", du: "づ", de: "で", do: "ど", dzu: "づ",
  // b-row
  ba: "ば", bi: "び", bu: "ぶ", be: "べ", bo: "ぼ",
  bya: "びゃ", byu: "びゅ", byo: "びょ",
  // p-row
  pa: "ぱ", pi: "ぴ", pu: "ぷ", pe: "ぺ", po: "ぽ",
  pya: "ぴゃ", pyu: "ぴゅ", pyo: "ぴょ",
  // small tsu standalone (rarely typed directly, usually via sokuon)
  xtsu: "っ", ltsu: "っ",
  // lone n (at the end of a word or before a consonant)
  n: "ん", nn: "ん",
};

// Consonants valid for sokuon (double consonant -> っ + consonant)
const SOKUON_CONSONANTS = ["k", "s", "t", "p", "g", "z", "d", "b", "c"];

// Single consonants that should NOT be converted immediately when they are
// the last character of the input — they're still waiting for a following
// vowel to form a syllable (e.g. "k" waiting to become "ka"/"ki"/etc.).
// "n" is deliberately left out here since it has its own rule below.
const PENDING_CONSONANTS = ["k", "s", "t", "p", "g", "z", "d", "b", "c", "h", "m", "r", "y", "w", "f", "j"];

function romajiToHiragana(input) {
  let result = "";
  let i = 0;
  const s = input.toLowerCase();

  while (i < s.length) {
    const remaining = s.length - i;
    let matched = false;

    // 1. Sokuon: a doubled consonant, e.g. "kk" + vowel -> っ + syllable.
    //    But if the doubled consonant is at the very end with no vowel
    //    after it yet (e.g. the user just typed "kk"), DON'T convert yet —
    //    it's still waiting for the next vowel.
    if (
      SOKUON_CONSONANTS.includes(s[i]) &&
      s[i] === s[i + 1] &&
      i + 2 < s.length // there must be at least one more letter after the pair
    ) {
      const rest = s.slice(i + 1);
      for (let len = 3; len >= 1; len--) {
        const piece = rest.slice(0, len);
        if (piece.length === len && ROMAJI_TO_KANA[piece]) {
          result += "っ" + ROMAJI_TO_KANA[piece];
          i += 1 + len;
          matched = true;
          break;
        }
      }
      if (matched) continue;
    }

    // 2. "n" has a special rule because it's ambiguous: it can start a
    //    syllable (na/ni/nu/ne/no/nya/nyu/nyo) OR stand alone as ん.
    //    This mirrors WanaKana's "IME mode" (used by WaniKani itself for
    //    live typing): an "n" at the very end of the input is held as
    //    plain romaji, waiting for the next letter, so "n" -> "ni" becomes
    //    "に" instead of ん followed by a separate "i".
    if (s[i] === "n") {
      const next = s[i + 1];

      if (next === undefined) {
        // "n" is the LAST character of the input — hold it, don't convert.
        result += "n";
        i += 1;
        continue;
      }

      // "nn": the classic romaji ambiguity. The convention we use (matching
      // how people usually write words like "konnichi", "minna", "onna",
      // "sannin" with just 2 n's, not ん + a new syllable):
      // - "nn" followed by a VOWEL/Y -> the FIRST n becomes ん, the SECOND n
      //   is reused as the start of a new syllable with that vowel.
      //   (e.g. "minna" -> mi + n(→ん) + na -> みんな)
      // - "nn" followed by NOTHING (end of input) or by a CONSONANT ->
      //   commit BOTH n's at once into a single ん.
      //   (e.g. "jinn" at the end -> じん, not じんn)
      if (next === "n") {
        const afterNN = s[i + 2];
        const afterIsVowelOrY = afterNN !== undefined && "aiueoy".includes(afterNN);
        if (afterIsVowelOrY) {
          // the second n will be reused for a new syllable
          result += "ん";
          i += 1;
          continue;
        }
        // end of input OR followed by a consonant -> commit both into ん
        result += "ん";
        i += 2;
        continue;
      }

      // try to form a na/ni/nu/ne/no/nya/nyu/nyo syllable first
      let formedSyllable = false;
      for (let len = 3; len >= 2; len--) {
        const piece = s.slice(i, i + len);
        if (piece.length === len && ROMAJI_TO_KANA[piece]) {
          result += ROMAJI_TO_KANA[piece];
          i += len;
          formedSyllable = true;
          break;
        }
      }
      if (formedSyllable) continue;

      // there's a letter after "n" but it's not a valid vowel/y combo
      // (e.g. another consonant) -> commit "n" into ん, then continue
      // processing the next letter normally.
      result += "ん";
      i += 1;
      continue;
    }

    // 3. A single consonant (other than n) that's the LAST character of
    //    the input -> hold it, don't convert, still waiting for a vowel.
    if (remaining === 1 && PENDING_CONSONANTS.includes(s[i])) {
      result += s[i];
      i += 1;
      continue;
    }

    // 4. A single consonant still waiting for a SECOND letter to form a
    //    youon (e.g. "ky" waiting for "kya/kyu/kyo") -> if this 2-letter
    //    pair doesn't already form anything valid AND these are the last
    //    2 letters of the input, hold it too.
    if (
      remaining === 2 &&
      PENDING_CONSONANTS.includes(s[i]) &&
      "y".includes(s[i + 1]) &&
      !ROMAJI_TO_KANA[s.slice(i, i + 2)]
    ) {
      result += s.slice(i, i + 2);
      i += 2;
      continue;
    }

    // 5. Direct match: try length 3, then 2, then 1 character.
    for (let len = 3; len >= 1; len--) {
      const piece = s.slice(i, i + len);
      if (piece.length === len && ROMAJI_TO_KANA[piece]) {
        result += ROMAJI_TO_KANA[piece];
        i += len;
        matched = true;
        break;
      }
    }

    if (!matched) {
      // unrecognized character (space, punctuation, etc.) — leave as is
      result += s[i];
      i += 1;
    }
  }

  return result;
}

// ============================================================
// SHARED UI PIECES
// ============================================================

// One representative character per type, used as the small category icon
// on the Dashboard's subject-type filter buttons — mirrors how WaniKani
// itself shows a single sample glyph (e.g. 字 for Kanji, 語 for Vocabulary)
// next to the type name.
const TYPE_ICON_CHAR = { radical: "部", kanji: "字", vocabulary: "語" };

function TypeBadge({ type }) {
  return (
    <span className="inline-flex items-center px-3 py-1 rounded-md text-sm font-semibold bg-white text-slate-900">
      {TYPE_LABEL[type]}
    </span>
  );
}

// Small rounded-square icon with a single representative character —
// used on the Dashboard's Radical/Kanji/Vocabulary filter buttons, styled
// after WaniKani's own category icons (see reference screenshot).
function TypeIconSquare({ type, active = true }) {
  const s = TYPE_STYLE[type];
  return (
    <span
      className={`inline-flex items-center justify-center w-7 h-7 rounded-md text-white font-bold text-sm shrink-0 transition-opacity ${
        active ? "" : "opacity-40"
      }`}
      style={{ backgroundColor: s.hex }}
    >
      {TYPE_ICON_CHAR[type]}
    </span>
  );
}

function NavBar({ title, onBack, right }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-6">
      <div className="flex items-center gap-3">
        {onBack && (
          <button
            onClick={onBack}
            className="flex items-center gap-1 px-3 py-2 rounded-lg text-slate-600 hover:bg-slate-200 transition-colors"
          >
            <ChevronLeft size={18} />
            <span className="text-sm font-medium">Back</span>
          </button>
        )}
        <h1 className="text-xl font-serif font-bold text-slate-900">{title}</h1>
      </div>
      {right}
    </div>
  );
}

function RelatedChip({ subject, onClick }) {
  const s = TYPE_STYLE[subject.object];
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-2 rounded-lg hover:brightness-95 transition-all"
      style={{ backgroundColor: s.hex }}
    >
      <CharacterGlyph subject={subject} className="text-lg font-bold text-white" imgSize={20} />
      <span className="text-xs font-medium text-white">{primaryMeaning(subject)}</span>
    </button>
  );
}

// Some WaniKani radicals have no unicode character at all and are only
// defined as an SVG image (characters === null, characters_image_url
// set instead). This renders whichever one the subject actually has,
// so RelatedChip / the lesson header / etc. don't show a blank space.
function CharacterGlyph({ subject, className = "", imgSize = 24 }) {
  if (subject.characters) {
    return <span className={className}>{subject.characters}</span>;
  }
  if (subject.characters_image_url) {
    return (
      <img
        src={subject.characters_image_url}
        alt={primaryMeaning(subject)}
        style={{ width: imgSize, height: imgSize, filter: "brightness(0) invert(1)" }}
        className="inline-block"
      />
    );
  }
  return <span className={className}>?</span>;
}

// ============================================================
// DATA LOADING HOOK
// Fetches + caches subjects for one level at a time from WaniKani.
// Re-running with the same level after it's already been fetched is a
// no-op (served straight from subjectCache), so revisiting a level via
// the Dashboard's level picker doesn't refetch every time.
// ============================================================

function useWaniKaniLevel(token, level) {
  // Follows React's recommended "adjusting state during render" pattern
  // for fetch-by-id effects (see react.dev/learn/you-might-not-need-an-effect):
  // track which level/token this state belongs to, and if it doesn't
  // match the current render's level/token, treat status as "loading"
  // immediately during render — no setState call needed to enter the
  // loading state, since it's derived rather than stored.
  const [request, setRequest] = useState(null); // { token, level, status: "ready"|"error", error? }
  // subjectCache/fetchedLevels are a plain Map/Set living outside React
  // state, so reading them in render doesn't make React re-run memos
  // when they change. cacheVersion is bumped whenever they're mutated,
  // and returned below so callers can use it (not `status`) as an
  // explicit "the cache changed" dependency in their own useMemo calls.
  const [cacheVersion, setCacheVersion] = useState(0);

  const alreadyCached = !!level && fetchedLevels.has(level);
  const isStaleRequest = !request || request.token !== token || request.level !== level;

  useEffect(() => {
    if (!token || !level || fetchedLevels.has(level)) return;
    let cancelled = false;

    wkGetSubjectsForLevel(token, level)
      .then((subjects) => {
        if (cancelled) return;
        cacheSubjects(subjects);
        fetchedLevels.add(level);
        setCacheVersion((v) => v + 1);
        setRequest({ token, level, status: "ready" });
      })
      .catch((err) => {
        if (cancelled) return;
        setRequest({
          token,
          level,
          status: "error",
          error: err instanceof Error ? err.message : "Failed to load this level.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [token, level]);

  // Lets a component force a re-fetch (e.g. a "Try again" button after
  // a network error) by clearing this level out of the cache first.
  const retry = useCallback(() => {
    fetchedLevels.delete(level);
    setCacheVersion((v) => v + 1);
    setRequest(null);
  }, [level]);

  let status;
  if (alreadyCached) {
    status = "ready";
  } else if (isStaleRequest) {
    // This render's token/level hasn't produced a settled result yet —
    // the effect above either hasn't run yet or is still in flight.
    status = token && level ? "loading" : "idle";
  } else {
    status = request.status;
  }
  const error = !isStaleRequest && request.status === "error" ? request.error : null;

  return { status, error, retry, cacheVersion };
}

// ============================================================
// DASHBOARD
// ============================================================

function Dashboard({ token, username, level, setLevel, activeTypes, setActiveTypes, onStudy, onQuiz, onDisconnect }) {
  const { status, error, retry, cacheVersion } = useWaniKaniLevel(token, level);
  const filtered = useMemo(
    () => subjectsForLevel(level, activeTypes, cacheVersion),
    [level, activeTypes, cacheVersion]
  );
  const levelScrollRef = useRef(null);

  function scrollLevels(direction) {
    levelScrollRef.current?.scrollBy({ left: direction * 200, behavior: "smooth" });
  }

  const countsByType = useMemo(() => {
    const counts = { radical: 0, kanji: 0, vocabulary: 0 };
    allCachedSubjectsForLevel(level, cacheVersion).forEach((s) => {
      counts[s.object]++;
    });
    return counts;
  }, [level, cacheVersion]);

  function toggleType(type) {
    setActiveTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <header className="mb-10 text-center relative">
        {username && (
          <button
            onClick={onDisconnect}
            className="absolute right-0 top-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <LogOut size={13} />
            Disconnect
          </button>
        )}
        <h1 className="text-3xl font-serif font-bold text-slate-900 mb-1">WaniKani — No SRS</h1>
        <p className="text-slate-500 text-sm">
          {username ? `Signed in as ${username}. ` : ""}
          Learn radicals, kanji, and vocabulary — no SRS, no waiting, jump to any level anytime.
        </p>
      </header>

      {/* Level picker */}
      <section className="mb-8">
        <h2 className="text-xs font-semibold text-slate-400 mb-3 uppercase tracking-wide">Select level</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => scrollLevels(-1)}
            className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 transition-colors"
            aria-label="Scroll levels left"
          >
            <ChevronLeft size={16} />
          </button>
          <div
            ref={levelScrollRef}
            className="flex gap-2 overflow-x-auto scroll-smooth scrollbar-hide py-1"
            style={{ scrollbarWidth: "none" }}
          >
            {ALL_LEVELS.map((lvl) => (
              <button
                key={lvl}
                onClick={() => setLevel(lvl)}
                className={`shrink-0 px-4 py-2 rounded-lg font-bold border-2 transition-colors ${
                  level === lvl
                    ? "bg-slate-900 border-slate-900 text-white"
                    : "bg-white border-slate-300 text-slate-700 hover:border-slate-500"
                }`}
              >
                Level {lvl}
              </button>
            ))}
          </div>
          <button
            onClick={() => scrollLevels(1)}
            className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 transition-colors"
            aria-label="Scroll levels right"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </section>

      {/* Live-load status for the selected level */}
      {status === "loading" && (
        <div className="mb-4 p-3 rounded-lg bg-slate-100 flex items-center justify-center gap-2 text-slate-500">
          <Loader2 size={16} className="animate-spin" />
          <p className="text-sm font-medium">Loading level {level} from WaniKani…</p>
        </div>
      )}
      {status === "error" && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-red-700">
            <AlertCircle size={16} />
            <p className="text-sm font-medium">{error}</p>
          </div>
          <button
            onClick={retry}
            className="shrink-0 px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:brightness-95 transition-all"
          >
            Try again
          </button>
        </div>
      )}


      <section className="mb-8">
        <h2 className="text-xs font-semibold text-slate-400 mb-3 uppercase tracking-wide">Subject type</h2>
        <div className="flex gap-2 flex-wrap">
          {TYPE_ORDER.map((type) => {
            const s = TYPE_STYLE[type];
            const isActive = activeTypes.includes(type);
            return (
              <button
                key={type}
                onClick={() => toggleType(type)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 font-medium transition-colors ${
                  isActive ? s.bgSoft : "border-slate-200 bg-white text-slate-400 hover:border-slate-300"
                }`}
                style={isActive ? { borderColor: s.hex, color: s.hex } : undefined}
              >
                <TypeIconSquare type={type} active={isActive} />
                {TYPE_LABEL[type]}
                <span className="text-xs font-normal opacity-75">({countsByType[type]})</span>
              </button>
            );
          })}
        </div>
      </section>

      {filtered.length === 0 && (
        <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-center">
          <p className="text-sm text-amber-800 font-medium">
            Select at least one subject type above to get started.
          </p>
        </div>
      )}

      {/* Mode buttons */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-2">
        <button
          onClick={onStudy}
          disabled={filtered.length === 0 || status === "loading"}
          style={{ backgroundColor: TYPE_STYLE.kanji.hex }}
          className="flex items-center justify-center gap-3 px-6 py-5 rounded-xl text-white font-semibold text-lg hover:brightness-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <BookOpen size={22} />
          Lessons
          <span
            className="min-w-8 h-8 px-2 flex items-center justify-center rounded-full bg-white text-lg font-bold leading-none"
            style={{ color: TYPE_STYLE.kanji.hex }}
          >
            {filtered.length}
          </span>
        </button>
        <button
          onClick={onQuiz}
          disabled={filtered.length === 0 || status === "loading"}
          style={{ backgroundColor: TYPE_STYLE.radical.hex }}
          className="flex items-center justify-center gap-3 px-6 py-5 rounded-xl text-white font-semibold text-lg hover:brightness-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Brain size={22} />
          Reviews
          <span
            className="min-w-8 h-8 px-2 flex items-center justify-center rounded-full bg-white text-lg font-bold leading-none"
            style={{ color: TYPE_STYLE.radical.hex }}
          >
            {filtered.length}
          </span>
        </button>
      </section>
    </div>
  );
}

// ============================================================
// LESSON MODE — sequential subject-by-subject walkthrough
// ============================================================

// A single lesson page: all info for one subject at once, similar to the
// quiz layout but without a question. Sequential prev/next navigation
// across subjects[] (radical -> kanji -> vocab order).
function LessonPage({ token, level, activeTypes, onBack }) {
  const subjects = useMemo(() => subjectsForLevel(level, activeTypes), [level, activeTypes]);
  const [index, setIndex] = useState(0);
  // jump-via-chip history, so the back button can return to where we jumped from
  const [jumpStack, setJumpStack] = useState([]);
  // A single subject viewed via a cross-level jump (e.g. a level-1
  // radical referenced from a level-5 kanji). Rendered instead of the
  // indexed list while non-null; "Previous" returns to the list.
  const [jumpedSubject, setJumpedSubject] = useState(null);
  // Bumped whenever an on-demand fetch (componentRadicals/componentKanji
  // for a subject from another level) lands in the cache. The value
  // itself isn't read here — subjectCache.has()/.values() are read
  // directly in the component body below, so they're recomputed on
  // every render automatically; this state's only job is to trigger
  // that re-render once new data lands.
  const [, setCacheVersion] = useState(0);
  // Tracks the most recently *settled* (or in-flight, see below)
  // component-resolution request, keyed by subject id — not a plain
  // boolean, so "loading" can be derived during render (comparing this
  // against the current subject.id) instead of being set directly in
  // the effect body. See useWaniKaniLevel for the same pattern.
  const [componentFetch, setComponentFetch] = useState(null); // { subjectId, done: true } | null

  const isFirst = index === 0 && !jumpedSubject;
  const isLast = !jumpedSubject && index === subjects.length - 1;

  useEffect(() => {
    function handleKeyDown(e) {
      // Guard: don't trigger navigation if the user is typing in any form
      // field (input, textarea, etc.) — so arrow keys still work normally
      // for moving the text cursor instead of accidentally switching
      // subjects. LessonPage doesn't have an input right now, but this
      // guard keeps things robust going forward.
      const tag = e.target?.tagName;
      const isTypingField = tag === "INPUT" || tag === "TEXTAREA" || e.target?.isContentEditable;
      if (isTypingField) return;

      if (e.key === "ArrowLeft") {
        if (jumpedSubject) {
          backFromJump();
        } else if (index > 0) {
          setIndex((i) => i - 1);
        }
      } else if (e.key === "ArrowRight") {
        if (jumpedSubject) {
          backFromJump();
        } else if (index < subjects.length - 1) {
          setIndex((i) => i + 1);
        } else {
          onBack();
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // backFromJump is a plain function re-created each render, not a
    // stale closure risk here since this effect re-attaches on every
    // navigation-relevant state change already listed below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, subjects.length, jumpedSubject, onBack]);

  const subject = jumpedSubject || subjects[index];

  // Component radicals/kanji are referenced by id only. If this
  // subject's own level hasn't been fully resolved against the cache
  // yet (e.g. its components live on an earlier level the person never
  // opened from the Dashboard), fetch whichever levels are missing so
  // the chips below have something to show instead of staying empty.
  // This must run before the `if (!subject) return null` guard below,
  // since hooks can't be called conditionally.
  useEffect(() => {
    if (!subject) return;
    const neededIds = [
      ...(subject.component_radical_ids || []),
      ...(subject.component_kanji_ids || []),
    ];
    const missing = neededIds.filter((id) => !subjectCache.has(id));
    if (missing.length === 0 || !token) return;
    let cancelled = false;

    // We don't know which level a missing id lives on without fetching
    // it directly, so use the single-subject endpoint per missing id
    // rather than guessing a level to bulk-fetch.
    Promise.all(
      missing.map((id) =>
        wkFetch(token, `/subjects/${id}`).then((json) => normalizeSubject(json))
      )
    )
      .then((fetched) => {
        if (cancelled) return;
        cacheSubjects(fetched);
        setCacheVersion((v) => v + 1);
      })
      .catch(() => {
        // Silently skip — the chip section just stays empty for
        // whichever component couldn't be resolved.
      })
      .finally(() => {
        if (!cancelled) setComponentFetch({ subjectId: subject.id, done: true });
      });
    return () => {
      cancelled = true;
    };
  }, [subject, token]);

  // "Loading" is true exactly when this subject has missing components
  // to resolve and the request above hasn't settled for this subject
  // yet — derived during render rather than stored, so entering the
  // loading state never needs a setState call inside the effect itself.
  const neededComponentIds = subject
    ? [...(subject.component_radical_ids || []), ...(subject.component_kanji_ids || [])]
    : [];
  const hasMissingComponents = neededComponentIds.some((id) => !subjectCache.has(id));
  const componentFetchSettledForSubject =
    componentFetch && subject && componentFetch.subjectId === subject.id;
  const loadingComponents = !!token && hasMissingComponents && !componentFetchSettledForSubject;

  if (!subject) return null;

  // The subject content panel always matches the subject's own type color
  // (blue for radical, pink for kanji, purple for vocabulary) — only the
  // "Lessons" button on the Dashboard has a fixed pink theme.
  const theme = TYPE_STYLE[subject.object];

  const componentRadicals = (subject.component_radical_ids || []).map(byId).filter(Boolean);
  const componentKanji = (subject.component_kanji_ids || []).map(byId).filter(Boolean);
  // "Used in" relations search the whole cache (not just the current
  // level), since a level-1 radical can be a component of kanji on any
  // later level. This only finds matches among subjects already
  // fetched this session — see the note on subjectCache above.
  const usedInKanji =
    subject.object === "radical"
      ? [...subjectCache.values()].filter(
          (s2) => s2.object === "kanji" && (s2.component_radical_ids || []).includes(subject.id)
        )
      : [];
  const usedInVocab =
    subject.object === "kanji"
      ? [...subjectCache.values()].filter(
          (s2) => s2.object === "vocabulary" && (s2.component_kanji_ids || []).includes(subject.id)
        )
      : [];

  function goPrev() {
    if (jumpedSubject) {
      backFromJump();
      return;
    }
    if (index > 0) setIndex((i) => i - 1);
  }
  function goNext() {
    if (jumpedSubject) {
      backFromJump();
      return;
    }
    if (index < subjects.length - 1) setIndex((i) => i + 1);
  }

  // Jump to another subject via a relation chip. If it's part of the
  // current level/type list, just move the index there. Otherwise
  // (a component or "used in" subject from a different level) show it
  // as a one-off detail page; "Previous" / Back returns to where the
  // jump happened from.
  function jumpTo(targetId) {
    const target = byId(targetId);
    if (!target) return;
    const targetIdxInList = subjects.findIndex((s2) => s2.id === targetId);
    setJumpStack((stack) => [...stack, jumpedSubject ? { jumped: jumpedSubject } : { index }]);
    if (targetIdxInList !== -1) {
      setJumpedSubject(null);
      setIndex(targetIdxInList);
    } else {
      setJumpedSubject(target);
    }
  }

  function backFromJump() {
    if (jumpStack.length > 0) {
      const prev = jumpStack[jumpStack.length - 1];
      setJumpStack((stack) => stack.slice(0, -1));
      if (prev.jumped) {
        setJumpedSubject(prev.jumped);
      } else {
        setJumpedSubject(null);
        setIndex(prev.index);
      }
    } else if (jumpedSubject) {
      setJumpedSubject(null);
    } else {
      onBack();
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <NavBar title="Lessons" onBack={backFromJump} />

      {/* Segmented progress bar: each segment = 1 subject, colored by type
          (radical/kanji/vocab), so the user always knows where they are
          relative to the whole sequence. The position number lives here
          only (not duplicated in the NavBar) so there's no double progress
          indicator on the same page. */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
          {jumpedSubject ? "Viewing related subject" : "Progress"}
        </span>
        {!jumpedSubject && (
          <span className="text-xs font-medium text-slate-400">
            {index + 1} / {subjects.length}
          </span>
        )}
      </div>
      <div className="flex gap-1 mb-6">
        {jumpedSubject
          ? null
          : subjects.map((s2, i) => {
              const segStyle = TYPE_STYLE[s2.object];
              const isPast = i < index;
              const isCurrent = i === index;
              return (
                <div
                  key={s2.id}
                  className={`flex-1 h-1.5 rounded-full transition-colors ${
                    isCurrent || isPast ? "" : "bg-slate-200"
                  }`}
                  style={
                    isCurrent || isPast
                      ? { backgroundColor: segStyle.hex, opacity: isPast && !isCurrent ? 0.4 : 1 }
                      : undefined
                  }
                  title={`${TYPE_LABEL[s2.object]}: ${primaryMeaning(s2)}`}
                />
              );
            })}
      </div>

      <div className="p-8 rounded-xl mb-6" style={{ backgroundColor: theme.hex }}>
        <div className="flex items-start justify-between mb-4">
          <CharacterGlyph subject={subject} className="text-6xl font-bold text-white" imgSize={56} />
          <TypeBadge type={subject.object} />
        </div>

        <div>
          <p className="text-xs uppercase tracking-wide text-white font-semibold mb-1">Meaning</p>
          <p className="text-white font-bold text-xl">
            {subject.meanings.map((m) => m.meaning).join(", ")}
          </p>
        </div>
      </div>

      <div className="p-6 rounded-xl bg-white border border-slate-200 mb-6 space-y-4">
        {subject.readings && subject.readings.length > 0 && (
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400 font-semibold mb-1">Reading</p>
            <div className="flex gap-4 flex-wrap">
              {subject.readings.map((r, i) => (
                <p key={i} className="text-slate-900 font-bold text-xl">
                  {r.reading}
                  {r.type && <span className="text-xs font-medium text-slate-400 ml-1">({r.type})</span>}
                </p>
              ))}
            </div>
          </div>
        )}

        {subject.meaning_mnemonic && (
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400 font-semibold mb-1">
              Meaning Mnemonic
            </p>
            <p className="text-slate-700 text-base leading-relaxed">{subject.meaning_mnemonic}</p>
          </div>
        )}

        {subject.reading_mnemonic && (
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400 font-semibold mb-1">
              Reading Mnemonic
            </p>
            <p className="text-slate-700 text-base leading-relaxed">{subject.reading_mnemonic}</p>
          </div>
        )}

        {componentRadicals.length > 0 && (
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400 font-semibold mb-2">Made of radicals</p>
            <div className="flex gap-2 flex-wrap">
              {componentRadicals.map((r) => (
                <RelatedChip key={r.id} subject={r} onClick={() => jumpTo(r.id)} />
              ))}
            </div>
          </div>
        )}

        {componentKanji.length > 0 && (
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400 font-semibold mb-2">Made of kanji</p>
            <div className="flex gap-2 flex-wrap">
              {componentKanji.map((k) => (
                <RelatedChip key={k.id} subject={k} onClick={() => jumpTo(k.id)} />
              ))}
            </div>
          </div>
        )}

        {usedInKanji.length > 0 && (
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400 font-semibold mb-2">Used in kanji</p>
            <div className="flex gap-2 flex-wrap">
              {usedInKanji.map((k) => (
                <RelatedChip key={k.id} subject={k} onClick={() => jumpTo(k.id)} />
              ))}
            </div>
          </div>
        )}

        {usedInVocab.length > 0 && (
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400 font-semibold mb-2">Used in vocabulary</p>
            <div className="flex gap-2 flex-wrap">
              {usedInVocab.map((v) => (
                <RelatedChip key={v.id} subject={v} onClick={() => jumpTo(v.id)} />
              ))}
            </div>
          </div>
        )}

        {subject.context_sentences && subject.context_sentences.length > 0 && (
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400 font-semibold mb-2">Example sentences</p>
            <div className="space-y-2">
              {subject.context_sentences.map((c, i) => (
                <div key={i} className="p-3 rounded-lg bg-slate-50 border-l-2" style={{ borderLeftColor: theme.hex }}>
                  <p className="text-slate-900 font-medium mb-1">{c.ja}</p>
                  <p className="text-slate-500 text-sm">{c.en}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {loadingComponents && (
        <div className="flex items-center gap-2 text-slate-400 text-xs mb-4">
          <Loader2 size={13} className="animate-spin" />
          Loading related subjects…
        </div>
      )}

      {/* Sequential navigation */}
      <div className="flex gap-3 mt-8">
        <button
          onClick={goPrev}
          disabled={isFirst}
          className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl border-2 border-slate-300 text-slate-700 font-semibold hover:bg-slate-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronLeft size={18} />
          {jumpedSubject ? "Back" : "Previous"}
        </button>
        {jumpedSubject ? (
          <button
            onClick={backFromJump}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-slate-900 text-white font-semibold hover:brightness-95 transition-all"
          >
            Back to lesson
            <ChevronRight size={18} />
          </button>
        ) : isLast ? (
          <button
            onClick={onBack}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-slate-900 text-white font-semibold hover:brightness-95 transition-all"
          >
            Done
          </button>
        ) : (
          <button
            onClick={goNext}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-slate-900 text-white font-semibold hover:brightness-95 transition-all"
          >
            Next
            <ChevronRight size={18} />
          </button>
        )}
      </div>
      <p className="text-center text-xs text-slate-400 mt-3">
        You can also use <kbd className="px-1.5 py-0.5 rounded border border-slate-300 bg-slate-50 font-mono">←</kbd>{" "}
        <kbd className="px-1.5 py-0.5 rounded border border-slate-300 bg-slate-50 font-mono">→</kbd> on your keyboard
      </p>
    </div>
  );
}

// ============================================================
// QUIZ MODE
// ============================================================

function buildQuizCards(subjects) {
  const cards = [];
  subjects.forEach((s) => {
    cards.push({ subjectId: s.id, askType: "meaning" });
    if (s.readings && s.readings.length > 0) {
      cards.push({ subjectId: s.id, askType: "reading" });
    }
  });

  // Fisher-Yates shuffle first, for a basic random order.
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }

  // Then tidy up so that 2 cards from the SAME subject (e.g. "meaning" and
  // "reading" for the same kanji) don't end up too close together — keep
  // at least a few other cards in between, so the person isn't memorizing
  // the answer from "the card right before this one" instead of the
  // subject itself.
  const MIN_GAP = Math.min(3, Math.floor(cards.length / 2));
  for (let i = 1; i < cards.length; i++) {
    const current = cards[i];
    // check if a card with the same subjectId appeared within the last MIN_GAP
    let tooClose = false;
    for (let back = 1; back <= MIN_GAP && i - back >= 0; back++) {
      if (cards[i - back].subjectId === current.subjectId) {
        tooClose = true;
        break;
      }
    }
    if (!tooClose) continue;
    // look ahead for another card that's safe to swap with
    for (let swapWith = i + 1; swapWith < cards.length; swapWith++) {
      const candidate = cards[swapWith];
      let candidateSafe = true;
      for (let back = 1; back <= MIN_GAP && i - back >= 0; back++) {
        if (cards[i - back].subjectId === candidate.subjectId) {
          candidateSafe = false;
          break;
        }
      }
      if (candidateSafe) {
        [cards[i], cards[swapWith]] = [cards[swapWith], cards[i]];
        break;
      }
    }
  }

  return cards;
}

function normalize(str) {
  return str.trim().toLowerCase();
}

// While live-typing, a trailing "n" is deliberately HELD as romaji (see
// romajiToHiragana) so it can still become "ni"/"na"/etc. But once the
// answer is submitted, any "n" still left at the end needs to be finalized
// into ん — so a reading that genuinely ends in ん (e.g. じん) can still be
// answered correctly.
function finalizeReading(str) {
  if (str.endsWith("n") && !str.endsWith("nn")) {
    return str.slice(0, -1) + "ん";
  }
  return str;
}

function checkAnswer(subject, askType, userInput) {
  const rawInput = askType === "reading" ? finalizeReading(userInput) : userInput;
  const input = normalize(rawInput);
  if (!input) return false;
  if (askType === "meaning") {
    return subject.meanings.some((m) => normalize(m.meaning) === input);
  } else {
    return subject.readings.some((r) => normalize(r.reading) === input);
  }
}

function QuizFlashcard({ level, activeTypes, onBack }) {
  const subjects = useMemo(() => subjectsForLevel(level, activeTypes), [level, activeTypes]);
  const [cards] = useState(() => buildQuizCards(subjects));
  const [index, setIndex] = useState(0);
  const [input, setInput] = useState("");
  // For readings: keep the RAW romaji keystroke history separate from what's
  // displayed. This matters for cases like "minna" (n-n-a), which need to
  // be re-converted from SCRATCH every time a new letter comes in — if we
  // only re-convert from the previous kana result, the fact that "ん" came
  // from an "n" that could still turn into "na" is lost once it's committed.
  const [rawRomaji, setRawRomaji] = useState("");
  const [result, setResult] = useState(null);
  // Log of every answer given this session — each entry records which
  // subject/askType was tested and whether it was answered correctly.
  // Shown as a running tally at the top, and as a full breakdown on the
  // session-complete screen. Purely in-memory for this one Reviews run;
  // it's not saved anywhere, consistent with the "no persistent tracking"
  // design of this app.
  const [answerLog, setAnswerLog] = useState([]);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [index, result]);

  if (cards.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <NavBar title="Reviews" onBack={onBack} />
        <p className="text-slate-500">No cards for this filter.</p>
      </div>
    );
  }

  if (index >= cards.length) {
    const correctAnswers = answerLog.filter((a) => a.correct);
    const wrongAnswers = answerLog.filter((a) => !a.correct);

    return (
      <div className="max-w-2xl mx-auto px-4 py-16">
        <div className="text-center">
          <p className="text-2xl font-serif font-bold text-slate-900 mb-2">Session complete</p>
          <p className="text-slate-500 mb-6">You've gone through every card for level {level}.</p>
          <div className="flex items-center justify-center gap-6 mb-8">
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-10 h-10 rounded-full bg-green-100 text-green-600">
                <Check size={20} />
              </span>
              <div className="text-left">
                <p className="text-xl font-bold text-slate-900">{correctAnswers.length}</p>
                <p className="text-xs text-slate-400">Correct</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-10 h-10 rounded-full bg-red-100 text-red-600">
                <X size={20} />
              </span>
              <div className="text-left">
                <p className="text-xl font-bold text-slate-900">{wrongAnswers.length}</p>
                <p className="text-xs text-slate-400">Wrong</p>
              </div>
            </div>
          </div>
        </div>

        {/* Per-item breakdown, so the person can see exactly which subjects
            and which question type (meaning/reading) tripped them up,
            without this being saved anywhere once they leave the screen. */}
        {(correctAnswers.length > 0 || wrongAnswers.length > 0) && (
          <div className="space-y-4 mb-8">
            {wrongAnswers.length > 0 && (
              <div>
                <p className="text-xs uppercase tracking-wide text-red-600 font-semibold mb-2">Wrong</p>
                <div className="space-y-1.5">
                  {wrongAnswers.map((a, i) => {
                    const s = byId(a.subjectId);
                    const sStyle = TYPE_STYLE[s.object];
                    return (
                      <div
                        key={i}
                        className="flex items-center gap-3 p-2.5 rounded-lg bg-red-50 border-l-4 border-red-500"
                      >
                        <span
                          className="flex items-center justify-center w-9 h-9 rounded-md text-white font-bold shrink-0"
                          style={{ backgroundColor: sStyle.hex }}
                        >
                          <CharacterGlyph subject={s} imgSize={18} />
                        </span>
                        <span className="text-sm text-slate-900 font-semibold">{primaryMeaning(s)}</span>
                        <span className="text-xs text-red-600 font-medium ml-auto">
                          {a.askType === "meaning" ? "Meaning" : "Reading"}
                        </span>
                        <X size={16} className="text-red-500 shrink-0" />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {correctAnswers.length > 0 && (
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400 font-semibold mb-2">Correct</p>
                <div className="space-y-1.5">
                  {correctAnswers.map((a, i) => {
                    const s = byId(a.subjectId);
                    const sStyle = TYPE_STYLE[s.object];
                    return (
                      <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg bg-green-50">
                        <span
                          className="flex items-center justify-center w-9 h-9 rounded-md text-white font-bold shrink-0"
                          style={{ backgroundColor: sStyle.hex }}
                        >
                          <CharacterGlyph subject={s} imgSize={18} />
                        </span>
                        <span className="text-sm text-slate-700 font-medium">{primaryMeaning(s)}</span>
                        <span className="text-xs text-slate-400 ml-auto">
                          {a.askType === "meaning" ? "Meaning" : "Reading"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="text-center">
          <button
            onClick={onBack}
            className="px-6 py-3 rounded-lg bg-slate-900 text-white font-semibold hover:brightness-95 transition-all"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const card = cards[index];
  const subject = byId(card.subjectId);
  // The subject content panel always matches the subject's own type color
  // (blue for radical, pink for kanji, purple for vocabulary) — only the
  // "Reviews" button on the Dashboard has a fixed blue theme.
  const theme = TYPE_STYLE[subject.object];
  const isLast = index === cards.length - 1;

  function handleFormSubmit(e) {
    e.preventDefault();
    if (result) {
      handleNext();
    } else {
      // On submit, any trailing "n" (reading) is finalized into ん for both
      // checking and display, so the two stay consistent.
      const finalInput = card.askType === "reading" ? finalizeReading(input) : input;
      if (finalInput !== input) setInput(finalInput);
      const correct = checkAnswer(subject, card.askType, input);
      setResult(correct ? "correct" : "wrong");
      setAnswerLog((log) => [
        ...log,
        { subjectId: subject.id, askType: card.askType, correct },
      ]);
    }
  }

  function handleNext() {
    setResult(null);
    setInput("");
    setRawRomaji("");
    setIndex((i) => i + 1);
  }

  function correctAnswerText() {
    if (card.askType === "meaning") {
      return subject.meanings.map((m) => m.meaning).join(", ");
    }
    // For kanji, readings carry a `type` (onyomi/kunyomi) — show them
    // separately with a label instead of lumping everything into one
    // flat, contextless list.
    const hasTypes = subject.readings.some((r) => r.type);
    if (!hasTypes) {
      return subject.readings.map((r) => r.reading).join(", ");
    }
    const onyomi = subject.readings.filter((r) => r.type === "onyomi").map((r) => r.reading);
    const kunyomi = subject.readings.filter((r) => r.type === "kunyomi").map((r) => r.reading);
    const parts = [];
    if (onyomi.length) parts.push(`onyomi: ${onyomi.join(", ")}`);
    if (kunyomi.length) parts.push(`kunyomi: ${kunyomi.join(", ")}`);
    return parts.join(" / ");
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-1 px-3 py-2 rounded-lg text-slate-600 hover:bg-slate-200 transition-colors"
        >
          <ChevronLeft size={16} />
          <span className="text-sm font-medium">Exit Reviews</span>
        </button>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-sm font-semibold text-green-600">
            <Check size={14} />
            {answerLog.filter((a) => a.correct).length}
          </span>
          <span className="flex items-center gap-1 text-sm font-semibold text-red-600">
            <X size={14} />
            {answerLog.filter((a) => !a.correct).length}
          </span>
          <span className="text-sm text-slate-400 font-medium">
            {index + 1} / {cards.length}
          </span>
        </div>
      </div>

      {/* Simple linear progress bar, for a sense of "how much is left"
          without having to do the math from the X/Y number. */}
      <div className="w-full h-1.5 bg-slate-200 rounded-full mb-6 overflow-hidden">
        <div
          className="h-full bg-slate-900 rounded-full transition-all duration-300"
          style={{ width: `${((index + (result ? 1 : 0)) / cards.length) * 100}%` }}
        />
      </div>

      <div className="rounded-xl overflow-hidden mb-6" style={{ backgroundColor: theme.hex }}>
        <div className="p-8 pb-6 text-center">
          <TypeBadge type={subject.object} />
          <p className="my-6">
            <CharacterGlyph subject={subject} className="text-6xl font-bold text-white" imgSize={64} />
          </p>
        </div>
        <p
          className={`block w-full px-4 py-3 text-center text-sm font-semibold ${
            card.askType === "meaning"
              ? "bg-slate-200 text-slate-900"
              : "bg-slate-900 text-white"
          }`}
        >
          {TYPE_LABEL[subject.object]} {card.askType === "meaning" ? "Meaning" : "Reading"}
        </p>
      </div>

      <form onSubmit={handleFormSubmit} className="mb-4">
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => {
              const newValue = e.target.value;
              if (card.askType !== "reading") {
                setInput(newValue);
                return;
              }
              if (newValue.length > input.length) {
                // A new character was added at the end (the common typing case).
                const added = newValue.slice(input.length);
                const newRaw = rawRomaji + added;
                setRawRomaji(newRaw);
                setInput(romajiToHiragana(newRaw));
              } else if (newValue.length < input.length) {
                // Backspace -> use the display value the browser already
                // trimmed (delete one HIRAGANA character outright, instead
                // of "unwinding" it back into romaji). rawRomaji is synced
                // to this new display value so further conversion (if the
                // user keeps typing) stays accurate from this point on.
                setRawRomaji(newValue);
                setInput(newValue);
              } else {
                // Same length (e.g. a selection replace) -> treat the new
                // display value as the new raw value too.
                setRawRomaji(newValue);
                setInput(romajiToHiragana(newValue));
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleFormSubmit(e);
              }
            }}
            readOnly={!!result}
            placeholder={card.askType === "meaning" ? "Type the meaning..." : "Type the reading..."}
            className={`w-full px-4 py-4 rounded-xl border-2 text-lg font-medium text-slate-900 focus:outline-none transition-colors ${
              result === "correct"
                ? "border-green-600 bg-green-50"
                : result === "wrong"
                ? "border-red-600 bg-red-50"
                : ""
            }`}
            style={result ? undefined : { borderColor: theme.hex }}
          />
        </div>
      </form>

      {result && (
        <div
          className={`flex items-center gap-3 p-4 rounded-xl mb-4 ${
            result === "correct" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
          }`}
        >
          {result === "correct" ? <Check size={22} /> : <X size={22} />}
          <div>
            <p className="font-semibold">{result === "correct" ? "Correct!" : "Not quite"}</p>
            {result === "wrong" && (
              <p className="text-sm opacity-80">Answer: {correctAnswerText()}</p>
            )}
          </div>
        </div>
      )}

      <div className="flex gap-3">
        {!result ? (
          <button
            onClick={handleFormSubmit}
            className="flex-1 px-6 py-3 rounded-xl bg-slate-900 text-white font-semibold hover:brightness-95 transition-all"
          >
            Check answer
          </button>
        ) : (
          <button
            onClick={handleNext}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-slate-900 text-white font-semibold hover:brightness-95 transition-all"
          >
            {isLast ? "Done" : "Next"}
            <ChevronRight size={18} />
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================
// TOKEN GATE
// Where the person pastes their own WaniKani API token. The token is
// kept only in the parent App's React state for this session — never
// hardcoded, never written to localStorage/sessionStorage, and never
// sent anywhere except directly to api.wanikani.com from the browser.
// Validated by calling /user once before handing control back to App.
// ============================================================

function TokenGate({ onConnected }) {
  const [tokenInput, setTokenInput] = useState("");
  const [status, setStatus] = useState("idle"); // idle | checking | error
  const [error, setError] = useState(null);

  async function handleSubmit() {
    const trimmed = tokenInput.trim();
    if (!trimmed) return;
    setStatus("checking");
    setError(null);
    try {
      // Guard against a request that hangs silently (e.g. blocked by the
      // browser without a clear network error) instead of leaving the
      // button stuck on "Connecting…" forever.
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("TIMEOUT")), 15000)
      );
      const user = await Promise.race([wkGetUser(trimmed), timeoutPromise]);
      onConnected(trimmed, user.username);
    } catch (err) {
      console.error("WaniKani connect failed:", err);
      setStatus("error");
      if (err instanceof WaniKaniError) {
        setError(err.message);
      } else if (err?.message === "TIMEOUT") {
        setError(
          "The request to WaniKani timed out. This usually means the browser blocked the request — see the note below the form."
        );
      } else {
        setError(
          "Couldn't reach WaniKani. This is often a browser/CORS restriction in this preview — see the note below the form."
        );
      }
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <header className="mb-8 text-center">
        <h1 className="text-3xl font-serif font-bold text-slate-900 mb-2">WaniKani — No SRS</h1>
        <p className="text-slate-500 text-sm">
          Connect your WaniKani account to study your own radicals, kanji, and
          vocabulary — with no SRS scheduling, so you can drill any level
          whenever you want.
        </p>
      </header>

      <div className="space-y-3">
        <div>
          <label htmlFor="wk-token" className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
            WaniKani API token
          </label>
          <input
            id="wk-token"
            type="password"
            autoComplete="off"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
            }}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            className="w-full px-4 py-3 rounded-xl border-2 border-slate-300 text-sm font-mono text-slate-900 focus:outline-none focus:border-slate-900 transition-colors"
          />
        </div>

        {status === "error" && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700">
            <AlertCircle size={15} className="shrink-0 mt-0.5" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!tokenInput.trim() || status === "checking"}
          className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-slate-900 text-white font-semibold hover:brightness-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {status === "checking" && <Loader2 size={16} className="animate-spin" />}
          {status === "checking" ? "Connecting…" : "Connect"}
        </button>
      </div>

      <p className="text-xs text-slate-400 mt-4 leading-relaxed">
        Your token stays in this browser tab only, for this session — it's
        never saved, logged, or sent anywhere besides WaniKani's own API.
        Closing or reloading this tab clears it, and you'll need to paste it
        in again. You can generate or revoke tokens at{" "}
        <span className="font-mono">wanikani.com/settings/personal_access_tokens</span>.
      </p>

      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 mt-3 leading-relaxed">
        If "Connect" hangs or fails with no clear reason, open your browser's
        developer console (F12) and check for a CORS error. Some browser
        preview sandboxes block direct requests to external APIs like
        WaniKani's — in that case this app would need to run outside the
        artifact preview (e.g. as a local file or small hosted app) to reach
        api.wanikani.com directly.
      </p>
    </div>
  );
}

export default function App() {
  // Token + username live ONLY in this component's React state for the
  // current session. Nothing here touches localStorage/sessionStorage,
  // and the token is only ever sent straight to api.wanikani.com.
  const [token, setToken] = useState(null);
  const [username, setUsername] = useState(null);
  const [view, setView] = useState("connect"); // connect | dashboard | study-lesson | quiz
  const [level, setLevel] = useState(1);
  const [activeTypes, setActiveTypes] = useState(["radical", "kanji", "vocabulary"]);
  // Token that changes every time Lessons is opened from the Dashboard, so
  // LessonPage remounts fresh and starts back at the first subject.
  const [lessonEntryToken, setLessonEntryToken] = useState(0);

  function handleConnected(newToken, newUsername) {
    setToken(newToken);
    setUsername(newUsername);
    setView("dashboard");
  }

  function handleDisconnect() {
    // Drop the token from memory and clear the session's subject cache,
    // since it belongs to whichever account was just connected.
    setToken(null);
    setUsername(null);
    subjectCache.clear();
    fetchedLevels.clear();
    setView("connect");
  }

  function openLesson() {
    setLessonEntryToken((t) => t + 1);
    setView("study-lesson");
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <style>{`
        @keyframes fadeInView {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .view-transition {
          animation: fadeInView 0.18s ease-out;
        }
        @media (prefers-reduced-motion: reduce) {
          .view-transition { animation: none; }
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>

      <div key={view} className="view-transition">
        {view === "connect" && <TokenGate onConnected={handleConnected} />}

        {view === "dashboard" && (
          <Dashboard
            token={token}
            username={username}
            level={level}
            setLevel={setLevel}
            activeTypes={activeTypes}
            setActiveTypes={setActiveTypes}
            onStudy={openLesson}
            onQuiz={() => setView("quiz")}
            onDisconnect={handleDisconnect}
          />
        )}

        {view === "study-lesson" && (
          <LessonPage
            key={lessonEntryToken}
            token={token}
            level={level}
            activeTypes={activeTypes}
            onBack={() => setView("dashboard")}
          />
        )}

        {view === "quiz" && (
          <QuizFlashcard
            level={level}
            activeTypes={activeTypes}
            onBack={() => setView("dashboard")}
          />
        )}
      </div>
    </div>
  );
}
