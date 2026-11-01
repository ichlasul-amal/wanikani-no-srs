import type { Subject, SubjectType, TypeFilter } from "../types";

export const MAX_LEVEL = 60;
export const ALL_LEVELS = Array.from({ length: MAX_LEVEL }, (_, i) => i + 1);

// The three categories shown as filters. Kana-only vocabulary is grouped
// under "vocabulary", same as on WaniKani itself.
export const TYPE_FILTERS: TypeFilter[] = ["radical", "kanji", "vocabulary"];

export const TYPE_LABEL: Record<SubjectType, string> = {
  radical: "Radical",
  kanji: "Kanji",
  vocabulary: "Vocabulary",
  kana_vocabulary: "Vocabulary",
};

// WaniKani's official palette: radical = blue, kanji = pink, vocabulary = purple.
export const TYPE_COLOR: Record<SubjectType, string> = {
  radical: "#00AAFF",
  kanji: "#FF00AA",
  vocabulary: "#AA00FF",
  kana_vocabulary: "#AA00FF",
};

// One representative character per category, like WaniKani's own icons.
export const TYPE_ICON_CHAR: Record<TypeFilter, string> = { radical: "部", kanji: "字", vocabulary: "語" };

export const READING_TYPE_LABEL = { onyomi: "on'yomi", kunyomi: "kun'yomi", nanori: "nanori" } as const;

const TYPE_RANK: Record<SubjectType, number> = { radical: 0, kanji: 1, vocabulary: 2, kana_vocabulary: 2 };

export function filterCategory(type: SubjectType): TypeFilter {
  return type === "kana_vocabulary" ? "vocabulary" : type;
}

export function primaryMeaning(subject: Pick<Subject, "meanings">): string {
  const m = subject.meanings.find((x) => x.primary) ?? subject.meanings[0];
  return m ? m.meaning : "";
}

// Lesson order: by level, then radical -> kanji -> vocabulary, then
// WaniKani's own lesson position within each type.
export function compareSubjects(a: Subject, b: Subject): number {
  return (
    a.level - b.level ||
    TYPE_RANK[a.type] - TYPE_RANK[b.type] ||
    a.lessonPosition - b.lessonPosition ||
    a.id - b.id
  );
}
