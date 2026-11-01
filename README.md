# WaniKani — No SRS

A small web app for studying your own WaniKani radicals, kanji and vocabulary
**without SRS scheduling**: pick any level (or several), read through the
lessons, and drill meaning/reading reviews as often as you like.

It talks directly to the [WaniKani API v2](https://docs.api.wanikani.com/)
from the browser using your personal access token. There is no backend.

## Features

- **Lessons**: meanings, readings (on'yomi/kun'yomi), highlighted mnemonics,
  component and "used in" relations (across levels), and example sentences.
  Navigate with the ← → keys.
- **Reviews**: meaning and/or reading questions, shuffled or in lesson order.
  - Romaji is converted to kana as you type (via [wanakana](https://github.com/WaniKani/WanaKana)).
  - Answers are checked like WaniKani does: accepted readings only,
    whitelisted/blacklisted alternative meanings, your own synonyms, and
    typo tolerance for longer answers.
  - Empty answers, leftover romaji, or a valid but non-accepted reading make
    the input shake instead of counting as wrong.
  - Missed cards come back later in the session (optional), and you can
    re-review the misses at the end.
- Levels beyond your subscription are locked; your current level is preselected.
- Optional "Remember me" (stores the token in `localStorage`).
- Dark mode (follows the system setting) and Noto Sans JP for Japanese text.

## Getting started

Requires Node.js 20+.

```bash
npm install
npm run dev
```

Open the printed URL and paste a WaniKani API token. Create one at
<https://www.wanikani.com/settings/personal_access_tokens>. A token with the
default read-only permissions is enough.

| Script               | What it does                     |
| -------------------- | -------------------------------- |
| `npm run dev`        | Start the Vite dev server        |
| `npm run build`      | Production build into `dist/`    |
| `npm run preview`    | Serve the production build       |
| `npm test`           | Run the test suite once (Vitest) |
| `npm run test:watch` | Run tests in watch mode          |
| `npm run lint`       | Lint with ESLint                 |

`.npmrc` sets `legacy-peer-deps=true` because npm's resolver currently
mis-reports Vitest's (satisfied) peer dependency on Vite 8.

## Project structure

```
src/
  api/wanikani.js        API client: auth, timeouts, rate-limit retry, pagination, normalization
  store/subjectStore.js  Session cache of subjects/levels/synonyms (one per token)
  store/useSubjects.js   React hook + context for the store
  lib/answers.js         Meaning/reading answer checking
  lib/romaji.js          Romaji -> kana conversion for the reading input
  lib/quiz.js            Building and re-queuing review cards
  lib/markup.js          Parsing WaniKani's mnemonic markup
  lib/subjects.js        Shared constants (levels, colors, labels) and helpers
  lib/tokenStorage.js    Opt-in token persistence
  components/            TokenGate, Dashboard, LessonPage, Quiz and shared UI
```

## Privacy

The token is sent only to `api.wanikani.com`. Unless "Remember me" is ticked,
it lives in memory for the current tab and is gone on reload. Disconnecting
clears it and all cached data.

## A note on content

Subject data and mnemonics are WaniKani's paid content, fetched with your own
token for your own study. If you host this app publicly, keep it that way:
don't bundle or redistribute WaniKani data, and follow the
[WaniKani API terms](https://docs.api.wanikani.com/).
