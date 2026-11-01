// Thin client for the WaniKani v2 API. Requests go straight from the
// browser to api.wanikani.com using the person's own API token.

const API_BASE = "https://api.wanikani.com/v2";
const API_REVISION = "20170710";
const REQUEST_TIMEOUT_MS = 15000;
const MAX_RATE_LIMIT_RETRIES = 2;
// /subjects?ids= takes a comma-separated list; keep URLs comfortably short.
const IDS_PER_REQUEST = 300;

export const SUBJECT_TYPES = ["radical", "kanji", "vocabulary", "kana_vocabulary"];

export class WaniKaniError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "WaniKaniError";
    this.status = status;
  }
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason);
    });
  });
}

// WaniKani sends RateLimit-Reset as a Unix timestamp (seconds) for when
// the current one-minute window ends.
function rateLimitDelayMs(res) {
  const reset = Number(res.headers.get("RateLimit-Reset"));
  if (!reset) return 15000;
  return Math.min(Math.max(reset * 1000 - Date.now(), 0) + 500, 61000);
}

function resolveUrl(path) {
  if (!path.startsWith("http")) return `${API_BASE}${path}`;
  // Pagination hands back absolute URLs. Never send the token anywhere else.
  if (!path.startsWith(`${API_BASE}/`)) {
    throw new WaniKaniError("Refusing to send the API token to a non-WaniKani URL.", 0);
  }
  return path;
}

export async function wkFetch(token, path, { signal } = {}) {
  const url = resolveUrl(path);

  for (let attempt = 0; ; attempt++) {
    const signals = [AbortSignal.timeout(REQUEST_TIMEOUT_MS)];
    if (signal) signals.push(signal);

    let res;
    try {
      res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Wanikani-Revision": API_REVISION,
        },
        signal: AbortSignal.any(signals),
      });
    } catch (err) {
      if (signal?.aborted) throw err;
      if (err?.name === "TimeoutError") {
        throw new WaniKaniError("The request to WaniKani timed out. Check your connection and try again.", 0);
      }
      throw new WaniKaniError(
        "Couldn't reach WaniKani. Check your connection, or whether the browser is blocking the request (CORS).",
        0
      );
    }

    if (res.ok) return res.json();

    if (res.status === 401) {
      throw new WaniKaniError("That token wasn't accepted by WaniKani. Double-check it and try again.", 401);
    }
    if (res.status === 429) {
      if (attempt < MAX_RATE_LIMIT_RETRIES) {
        await sleep(rateLimitDelayMs(res), signal);
        continue;
      }
      throw new WaniKaniError("WaniKani's API rate limit was hit. Wait a minute and try again.", 429);
    }
    throw new WaniKaniError(`WaniKani API error (${res.status}).`, res.status);
  }
}

export async function wkFetchCollection(token, path, options) {
  const all = [];
  let next = path;
  while (next) {
    const json = await wkFetch(token, next, options);
    all.push(...(json.data ?? []));
    next = json.pages?.next_url ?? null;
  }
  return all;
}

export async function getUser(token, options) {
  const { data } = await wkFetch(token, "/user", options);
  return {
    username: data.username,
    level: data.level,
    maxLevelGranted: data.subscription?.max_level_granted ?? 3,
  };
}

// Convert a raw WaniKani subject into the flatter shape the app uses.
export function normalizeSubject(raw) {
  const d = raw.data;
  return {
    id: raw.id,
    type: raw.object,
    level: d.level,
    lessonPosition: d.lesson_position ?? 0,
    characters: d.characters ?? null,
    // Some radicals have no unicode character and only exist as an image.
    imageUrl: d.character_images?.find((i) => i.content_type === "image/svg+xml")?.url ?? null,
    meanings: d.meanings ?? [],
    auxiliaryMeanings: d.auxiliary_meanings ?? [],
    readings: d.readings ?? [],
    meaningMnemonic: d.meaning_mnemonic ?? "",
    readingMnemonic: d.reading_mnemonic ?? "",
    componentIds: d.component_subject_ids ?? [],
    amalgamationIds: d.amalgamation_subject_ids ?? [],
    contextSentences: d.context_sentences ?? [],
    hidden: Boolean(d.hidden_at),
  };
}

export async function getSubjectsForLevels(token, levels, options) {
  const rows = await wkFetchCollection(
    token,
    `/subjects?levels=${levels.join(",")}&types=${SUBJECT_TYPES.join(",")}&hidden=false`,
    options
  );
  return rows.map(normalizeSubject).filter((s) => !s.hidden);
}

export async function getSubjectsByIds(token, ids, options) {
  const chunks = [];
  for (let i = 0; i < ids.length; i += IDS_PER_REQUEST) {
    chunks.push(ids.slice(i, i + IDS_PER_REQUEST));
  }
  const results = await Promise.all(
    chunks.map((chunk) => wkFetchCollection(token, `/subjects?ids=${chunk.join(",")}`, options))
  );
  return results.flat().map(normalizeSubject).filter((s) => !s.hidden);
}

// The person's own meaning synonyms, keyed by subject id.
export async function getMeaningSynonyms(token, options) {
  const rows = await wkFetchCollection(token, "/study_materials?hidden=false", options);
  const synonyms = new Map();
  rows.forEach((row) => {
    const list = row.data.meaning_synonyms ?? [];
    if (list.length > 0) synonyms.set(row.data.subject_id, list);
  });
  return synonyms;
}
