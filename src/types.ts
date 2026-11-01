export type SubjectType = "radical" | "kanji" | "vocabulary" | "kana_vocabulary";
// The three categories offered as filters; kana_vocabulary counts as vocabulary.
export type TypeFilter = "radical" | "kanji" | "vocabulary";
export type ReadingType = "onyomi" | "kunyomi" | "nanori";
export type AskType = "meaning" | "reading";

export interface Meaning {
  meaning: string;
  primary: boolean;
  accepted_answer: boolean;
}

export interface AuxiliaryMeaning {
  meaning: string;
  type: "whitelist" | "blacklist";
}

export interface Reading {
  reading: string;
  primary: boolean;
  accepted_answer: boolean;
  type?: ReadingType;
}

export interface ContextSentence {
  ja: string;
  en: string;
}

export interface Subject {
  id: number;
  type: SubjectType;
  level: number;
  lessonPosition: number;
  characters: string | null;
  imageUrl: string | null;
  meanings: Meaning[];
  auxiliaryMeanings: AuxiliaryMeaning[];
  readings: Reading[];
  meaningMnemonic: string;
  readingMnemonic: string;
  componentIds: number[];
  amalgamationIds: number[];
  contextSentences: ContextSentence[];
  hidden: boolean;
}

export interface User {
  username: string;
  level: number;
  maxLevelGranted: number;
}

export type QuestionTypes = "both" | "meaning" | "reading";
export type QuizOrder = "shuffled" | "ordered";

export interface QuizCard {
  id: string;
  subjectId: number;
  askType: AskType;
}

export interface Settings {
  levels: number[];
  types: TypeFilter[];
  questionTypes: QuestionTypes;
  order: QuizOrder;
  repeatWrong: boolean;
}
