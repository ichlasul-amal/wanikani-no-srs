import { useEffect, useEffectEvent, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { READING_TYPE_LABEL, TYPE_COLOR, TYPE_LABEL, primaryMeaning } from "../lib/subjects";
import { useSubjects } from "../store/useSubjects";
import type { Subject, SubjectType, TypeFilter } from "../types";
import { CharacterGlyph, Mnemonic, NavBar, RelatedChip, SectionLabel, TypeBadge } from "./ui";

const COMPONENT_LABEL: Partial<Record<SubjectType, string>> = {
  kanji: "Made of radicals",
  vocabulary: "Made of kanji",
};
const AMALGAMATION_LABEL: Partial<Record<SubjectType, string>> = {
  radical: "Used in kanji",
  kanji: "Used in vocabulary",
};

// Where a relation-chip jump started from, so Back can return there.
type JumpOrigin = { index: number } | { jumpedId: number };

interface RelatedSectionProps {
  label: string | undefined;
  subjects: Subject[];
  onSelect: (id: number) => void;
}

function RelatedSection({ label, subjects, onSelect }: RelatedSectionProps) {
  if (!label || subjects.length === 0) return null;
  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      <div className="flex gap-2 flex-wrap">
        {subjects.map((s) => (
          <RelatedChip key={s.id} subject={s} onClick={() => onSelect(s.id)} />
        ))}
      </div>
    </div>
  );
}

interface LessonPageProps {
  levels: number[];
  types: TypeFilter[];
  onBack: () => void;
}

// Walks through the selected subjects one at a time. Relation chips can
// jump to any related subject (even from another level); Back returns to
// wherever the jump started.
export default function LessonPage({ levels, types, onBack }: LessonPageProps) {
  const { store, data } = useSubjects();
  // Freeze the list for this session so it doesn't shift while related
  // subjects stream into the cache.
  const [subjects] = useState(() => data.subjectsFor(levels, types));
  const [index, setIndex] = useState(0);
  const [jumpStack, setJumpStack] = useState<JumpOrigin[]>([]);
  const [jumpedId, setJumpedId] = useState<number | null>(null);

  const jumpedSubject = jumpedId != null ? data.get(jumpedId) : undefined;
  const subject = jumpedSubject ?? subjects[index];
  const isFirst = index === 0 && !jumpedSubject;
  const isLast = !jumpedSubject && index === subjects.length - 1;

  useEffect(() => {
    if (subject) store.ensureSubjects([...subject.componentIds, ...subject.amalgamationIds]);
  }, [store, subject]);

  function goPrev() {
    if (jumpedSubject) backFromJump();
    else if (index > 0) setIndex((i) => i - 1);
  }

  function goNext() {
    if (jumpedSubject) backFromJump();
    else if (index < subjects.length - 1) setIndex((i) => i + 1);
    else onBack();
  }

  function jumpTo(targetId: number) {
    setJumpStack((stack) => [...stack, jumpedId != null ? { jumpedId } : { index }]);
    const inList = subjects.findIndex((s) => s.id === targetId);
    if (inList !== -1) {
      setJumpedId(null);
      setIndex(inList);
    } else {
      setJumpedId(targetId);
    }
  }

  function backFromJump() {
    const prev = jumpStack[jumpStack.length - 1];
    if (prev) {
      setJumpStack((stack) => stack.slice(0, -1));
      if ("jumpedId" in prev) {
        setJumpedId(prev.jumpedId);
      } else {
        setJumpedId(null);
        setIndex(prev.index);
      }
    } else if (jumpedSubject) {
      setJumpedId(null);
    } else {
      onBack();
    }
  }

  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable) return;
    if (e.key === "ArrowLeft") goPrev();
    else if (e.key === "ArrowRight") goNext();
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => onKeyDown(e);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (!subject) return null;

  const color = TYPE_COLOR[subject.type];
  const relatedIds = [...subject.componentIds, ...subject.amalgamationIds];
  const loadingRelated = relatedIds.some((id) => !data.has(id) && data.isResolving(id));
  const resolve = (ids: number[]) => ids.flatMap((id) => data.get(id) ?? []);
  const components = resolve(subject.componentIds);
  const amalgamations = resolve(subject.amalgamationIds);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <NavBar title="Lessons" onBack={backFromJump} />

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
      {!jumpedSubject && (
        <div
          className="flex gap-1 mb-6"
          role="progressbar"
          aria-label="Lesson progress"
          aria-valuemin={1}
          aria-valuemax={subjects.length}
          aria-valuenow={index + 1}
        >
          {subjects.map((s, i) => (
            <div
              key={s.id}
              className={`flex-1 h-1.5 rounded-full transition-colors ${i <= index ? "" : "bg-slate-200 dark:bg-slate-800"}`}
              style={i <= index ? { backgroundColor: TYPE_COLOR[s.type], opacity: i < index ? 0.4 : 1 } : undefined}
              title={`${TYPE_LABEL[s.type]}: ${primaryMeaning(s)}`}
            />
          ))}
        </div>
      )}

      <div className="p-8 rounded-xl mb-6" style={{ backgroundColor: color }} aria-live="polite">
        <div className="flex items-start justify-between mb-4">
          <CharacterGlyph subject={subject} className="text-6xl font-bold text-white" imgSize={56} />
          <TypeBadge type={subject.type} />
        </div>
        <p className="text-xs uppercase tracking-wide text-white font-semibold mb-1">Meaning</p>
        <p className="text-white font-bold text-xl">{subject.meanings.map((m) => m.meaning).join(", ")}</p>
        <p className="text-white/80 text-xs mt-2">Level {subject.level}</p>
      </div>

      <div className="p-6 rounded-xl bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800 mb-6 space-y-5">
        {subject.readings.length > 0 && (
          <div>
            <SectionLabel>Reading</SectionLabel>
            <div className="flex gap-4 flex-wrap">
              {subject.readings.map((r, i) => (
                <p
                  key={i}
                  className={`font-bold text-xl ${
                    r.accepted_answer === false ? "text-slate-400" : "text-slate-900 dark:text-slate-100"
                  }`}
                >
                  <span lang="ja" className="font-ja">
                    {r.reading}
                  </span>
                  {r.type && (
                    <span className="text-xs font-medium text-slate-400 ml-1">({READING_TYPE_LABEL[r.type]})</span>
                  )}
                </p>
              ))}
            </div>
          </div>
        )}

        {subject.meaningMnemonic && (
          <div>
            <SectionLabel>Meaning mnemonic</SectionLabel>
            <Mnemonic text={subject.meaningMnemonic} />
          </div>
        )}

        {subject.readingMnemonic && (
          <div>
            <SectionLabel>Reading mnemonic</SectionLabel>
            <Mnemonic text={subject.readingMnemonic} />
          </div>
        )}

        <RelatedSection label={COMPONENT_LABEL[subject.type]} subjects={components} onSelect={jumpTo} />
        <RelatedSection label={AMALGAMATION_LABEL[subject.type]} subjects={amalgamations} onSelect={jumpTo} />

        {loadingRelated && (
          <div role="status" className="flex items-center gap-2 text-slate-400 text-xs">
            <Loader2 size={13} className="animate-spin" aria-hidden="true" />
            Loading related subjects…
          </div>
        )}

        {subject.contextSentences.length > 0 && (
          <div>
            <SectionLabel>Example sentences</SectionLabel>
            <div className="space-y-2">
              {subject.contextSentences.map((c, i) => (
                <div
                  key={i}
                  className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800 border-l-2"
                  style={{ borderLeftColor: color }}
                >
                  <p lang="ja" className="font-ja text-slate-900 dark:text-slate-100 font-medium mb-1">
                    {c.ja}
                  </p>
                  <p className="text-slate-500 dark:text-slate-400 text-sm">{c.en}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-3 mt-8">
        <button
          type="button"
          onClick={goPrev}
          disabled={isFirst}
          className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl border-2 border-slate-300 text-slate-700 dark:border-slate-700 dark:text-slate-300 font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronLeft size={18} aria-hidden="true" />
          {jumpedSubject ? "Back" : "Previous"}
        </button>
        <button
          type="button"
          onClick={goNext}
          className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 font-semibold hover:brightness-95 transition-all"
        >
          {jumpedSubject ? "Back to lesson" : isLast ? "Done" : "Next"}
          {!isLast && <ChevronRight size={18} aria-hidden="true" />}
        </button>
      </div>
      <p className="text-center text-xs text-slate-400 mt-3">
        You can also use{" "}
        <kbd className="px-1.5 py-0.5 rounded border border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-800 font-mono">
          ←
        </kbd>{" "}
        <kbd className="px-1.5 py-0.5 rounded border border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-800 font-mono">
          →
        </kbd>{" "}
        on your keyboard
      </p>
    </div>
  );
}
