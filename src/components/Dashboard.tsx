import { type Dispatch, type SetStateAction, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Brain, ChevronLeft, ChevronRight, Lock, LogOut } from "lucide-react";
import { buildQuizCards } from "../lib/quiz";
import { ALL_LEVELS, TYPE_COLOR, TYPE_FILTERS, TYPE_LABEL, filterCategory } from "../lib/subjects";
import { useSubjects } from "../store/useSubjects";
import type { QuestionTypes, QuizOrder, Settings, TypeFilter, User } from "../types";
import { ErrorBanner, LoadingBanner, NoticeBanner, TypeIconSquare } from "./ui";

const SOFT_BG: Record<TypeFilter, string> = {
  radical: "bg-sky-50 dark:bg-sky-950/40",
  kanji: "bg-pink-50 dark:bg-pink-950/40",
  vocabulary: "bg-purple-50 dark:bg-purple-950/40",
};

const QUESTION_TYPE_OPTIONS: Option<QuestionTypes>[] = [
  { value: "both", label: "Meaning + Reading" },
  { value: "meaning", label: "Meaning only" },
  { value: "reading", label: "Reading only" },
];
const ORDER_OPTIONS: Option<QuizOrder>[] = [
  { value: "shuffled", label: "Shuffled" },
  { value: "ordered", label: "Lesson order" },
];

interface Option<T extends string> {
  value: T;
  label: string;
}

function formatLevels(levels: readonly number[]): string {
  const sorted = [...levels].sort((a, b) => a - b);
  return sorted.length === 1 ? `level ${sorted[0]}` : `levels ${sorted.join(", ")}`;
}

interface SegmentedControlProps<T extends string> {
  label: string;
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
}

function SegmentedControl<T extends string>({ label, options, value, onChange }: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-lg border border-slate-300 dark:border-slate-700 overflow-hidden"
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 text-sm font-medium transition-colors ${
            value === opt.value
              ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
              : "bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

interface DashboardProps {
  user: User;
  settings: Settings;
  setSettings: Dispatch<SetStateAction<Settings>>;
  onStudy: () => void;
  onQuiz: () => void;
  onDisconnect: () => void;
}

export default function Dashboard({ user, settings, setSettings, onStudy, onQuiz, onDisconnect }: DashboardProps) {
  const { store, data } = useSubjects();
  const { levels, types, questionTypes, order, repeatWrong } = settings;
  const [multiSelect, setMultiSelect] = useState(levels.length > 1);
  const levelScrollRef = useRef<HTMLDivElement>(null);
  const activeLevelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    store.ensureLevels(levels);
    store.ensureSynonyms();
  }, [store, levels]);

  // Bring the selected level into view when the dashboard opens.
  useLayoutEffect(() => {
    const container = levelScrollRef.current;
    const button = activeLevelRef.current;
    if (!container || !button) return;
    container.scrollLeft = button.offsetLeft - container.clientWidth / 2 + button.clientWidth / 2;
  }, []);

  const statuses = levels.map((level) => ({ level, ...data.levelStatus(level) }));
  const loading = statuses.some((s) => s.status === "loading" || s.status === "idle");
  const failed = statuses.filter((s) => s.status === "error");

  const allSubjects = useMemo(() => data.subjectsFor(levels, TYPE_FILTERS), [data, levels]);
  const subjects = useMemo(
    () => allSubjects.filter((s) => types.includes(filterCategory(s.type))),
    [allSubjects, types]
  );
  const reviewCount = useMemo(
    () => buildQuizCards(subjects, { questionTypes, order: "ordered" }).length,
    [subjects, questionTypes]
  );

  const countsByType: Record<TypeFilter, number> = { radical: 0, kanji: 0, vocabulary: 0 };
  allSubjects.forEach((s) => countsByType[filterCategory(s.type)]++);

  const update = (patch: Partial<Settings>) => setSettings((prev) => ({ ...prev, ...patch }));

  function selectLevel(level: number) {
    if (!multiSelect) {
      update({ levels: [level] });
      return;
    }
    const next = levels.includes(level) ? levels.filter((l) => l !== level) : [...levels, level];
    if (next.length > 0) update({ levels: next.sort((a, b) => a - b) });
  }

  function toggleMultiSelect() {
    if (multiSelect && levels.length > 1) update({ levels: levels.slice(0, 1) });
    setMultiSelect((m) => !m);
  }

  function toggleType(type: TypeFilter) {
    update({ types: types.includes(type) ? types.filter((t) => t !== type) : [...types, type] });
  }

  let notice: string | null = null;
  if (types.length === 0) notice = "Select at least one subject type to get started.";
  else if (!loading && failed.length === 0 && subjects.length === 0)
    notice = `No subjects found for ${formatLevels(levels)}.`;
  else if (!loading && subjects.length > 0 && reviewCount === 0)
    notice = "None of the selected subjects have a reading to review. Pick another question type.";

  const disabled = loading || failed.length > 0;
  const firstFailure = failed[0];

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <header className="mb-10">
        <div className="flex justify-end mb-2">
          <button
            type="button"
            onClick={onDisconnect}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-slate-800 transition-colors"
          >
            <LogOut size={13} aria-hidden="true" />
            Disconnect
          </button>
        </div>
        <div className="text-center">
          <h1 className="text-3xl font-serif font-bold text-slate-900 dark:text-slate-100 mb-1">WaniKani — No SRS</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            Signed in as {user.username} (level {user.level}). Learn radicals, kanji, and vocabulary with no SRS and
            no waiting. Jump to any level anytime.
          </p>
        </div>
      </header>

      <section className="mb-8" aria-labelledby="level-heading">
        <div className="flex items-center justify-between mb-3">
          <h2 id="level-heading" className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
            {multiSelect ? "Select levels" : "Select level"}
          </h2>
          <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 cursor-pointer">
            <input type="checkbox" checked={multiSelect} onChange={toggleMultiSelect} />
            Multiple levels
          </label>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => levelScrollRef.current?.scrollBy({ left: -200, behavior: "smooth" })}
            className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Scroll levels left"
          >
            <ChevronLeft size={16} />
          </button>
          <div ref={levelScrollRef} className="flex gap-2 overflow-x-auto scroll-smooth scrollbar-hide py-1">
            {ALL_LEVELS.map((lvl) => {
              const locked = lvl > user.maxLevelGranted;
              const selected = levels.includes(lvl);
              return (
                <button
                  key={lvl}
                  ref={lvl === levels[0] ? activeLevelRef : undefined}
                  type="button"
                  onClick={() => selectLevel(lvl)}
                  disabled={locked}
                  aria-pressed={selected}
                  title={
                    locked
                      ? "Requires an active WaniKani subscription"
                      : lvl === user.level
                        ? "Your current level"
                        : undefined
                  }
                  className={`relative shrink-0 flex items-center gap-1 px-4 py-2 rounded-lg font-bold border-2 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                    selected
                      ? "bg-slate-900 border-slate-900 text-white dark:bg-slate-100 dark:border-slate-100 dark:text-slate-900"
                      : "bg-white border-slate-300 text-slate-700 hover:border-slate-500 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-500"
                  }`}
                >
                  {locked && <Lock size={12} aria-hidden="true" />}
                  Level {lvl}
                  {lvl === user.level && (
                    <span
                      className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: TYPE_COLOR.kanji }}
                    >
                      <span className="sr-only">(your level)</span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => levelScrollRef.current?.scrollBy({ left: 200, behavior: "smooth" })}
            className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Scroll levels right"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </section>

      {loading && <LoadingBanner>Loading {formatLevels(levels)} from WaniKani…</LoadingBanner>}
      {firstFailure && (
        <ErrorBanner onRetry={() => store.retryLevels(failed.map((f) => f.level))}>{firstFailure.error}</ErrorBanner>
      )}

      <section className="mb-8" aria-labelledby="type-heading">
        <h2 id="type-heading" className="text-xs font-semibold text-slate-400 mb-3 uppercase tracking-wide">
          Subject type
        </h2>
        <div className="flex gap-2 flex-wrap">
          {TYPE_FILTERS.map((type) => {
            const isActive = types.includes(type);
            return (
              <button
                key={type}
                type="button"
                onClick={() => toggleType(type)}
                aria-pressed={isActive}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 font-medium transition-colors ${
                  isActive
                    ? SOFT_BG[type]
                    : "border-slate-200 bg-white text-slate-400 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900"
                }`}
                style={isActive ? { borderColor: TYPE_COLOR[type], color: TYPE_COLOR[type] } : undefined}
              >
                <TypeIconSquare type={type} active={isActive} />
                {TYPE_LABEL[type]}
                <span className="text-xs font-normal opacity-75">({countsByType[type]})</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="mb-8" aria-labelledby="review-options-heading">
        <h2 id="review-options-heading" className="text-xs font-semibold text-slate-400 mb-3 uppercase tracking-wide">
          Review options
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <SegmentedControl
            label="Question types"
            options={QUESTION_TYPE_OPTIONS}
            value={questionTypes}
            onChange={(v) => update({ questionTypes: v })}
          />
          <SegmentedControl label="Order" options={ORDER_OPTIONS} value={order} onChange={(v) => update({ order: v })} />
          <label className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300 cursor-pointer">
            <input type="checkbox" checked={repeatWrong} onChange={(e) => update({ repeatWrong: e.target.checked })} />
            Repeat missed items until correct
          </label>
        </div>
      </section>

      {notice && <NoticeBanner>{notice}</NoticeBanner>}

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-2">
        <button
          type="button"
          onClick={onStudy}
          disabled={disabled || subjects.length === 0}
          style={{ backgroundColor: TYPE_COLOR.kanji }}
          className="flex items-center justify-center gap-3 px-6 py-5 rounded-xl text-white font-semibold text-lg hover:brightness-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <BookOpen size={22} aria-hidden="true" />
          Lessons
          <span
            className="min-w-8 h-8 px-2 flex items-center justify-center rounded-full bg-white text-lg font-bold leading-none"
            style={{ color: TYPE_COLOR.kanji }}
          >
            {subjects.length}
          </span>
        </button>
        <button
          type="button"
          onClick={onQuiz}
          disabled={disabled || reviewCount === 0}
          style={{ backgroundColor: TYPE_COLOR.radical }}
          className="flex items-center justify-center gap-3 px-6 py-5 rounded-xl text-white font-semibold text-lg hover:brightness-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Brain size={22} aria-hidden="true" />
          Reviews
          <span
            className="min-w-8 h-8 px-2 flex items-center justify-center rounded-full bg-white text-lg font-bold leading-none"
            style={{ color: TYPE_COLOR.radical }}
          >
            {reviewCount}
          </span>
        </button>
      </section>
    </div>
  );
}
