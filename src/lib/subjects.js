export const MAX_LEVEL = 60;
export const ALL_LEVELS = Array.from({ length: MAX_LEVEL }, (_, i) => i + 1);

// The three categories shown as filters. Kana-only vocabulary is grouped
// under "vocabulary", same as on WaniKani itself.
export const TYPE_FILTERS = ["radical", "kanji", "vocabulary"];

export const TYPE_LABEL = {
  radical: "Radical",
  kanji: "Kanji",
  vocabulary: "Vocabulary",
  kana_vocabulary: "Vocabulary",
};

// WaniKani's official palette: radical = blue, kanji = pink, vocabulary = purple.
export const TYPE_COLOR = {
  radical: "#00AAFF",
  kanji: "#FF00AA",
  vocabulary: "#AA00FF",
  kana_vocabulary: "#AA00FF",
};

// One representative character per category, like WaniKani's own icons.
export const TYPE_ICON_CHAR = { radical: "部", kanji: "字", vocabulary: "語" };

const TYPE_RANK = { radical: 0, kanji: 1, vocabulary: 2, kana_vocabulary: 2 };

export function filterCategory(type) {
  return type === "kana_vocabulary" ? "vocabulary" : type;
}

export function primaryMeaning(subject) {
  const m = subject.meanings.find((x) => x.primary) ?? subject.meanings[0];
  return m ? m.meaning : "";
}

// Lesson order: by level, then radical -> kanji -> vocabulary, then
// WaniKani's own lesson position within each type.
export function compareSubjects(a, b) {
  return (
    a.level - b.level ||
    TYPE_RANK[a.type] - TYPE_RANK[b.type] ||
    a.lessonPosition - b.lessonPosition ||
    a.id - b.id
  );
}
