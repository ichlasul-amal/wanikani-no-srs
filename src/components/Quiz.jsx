import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, ChevronRight, RotateCcw, X } from "lucide-react";
import { checkMeaning, checkReading, finalizeReading } from "../lib/answers";
import { buildQuizCards, requeue } from "../lib/quiz";
import { toKanaWhileTyping } from "../lib/romaji";
import { TYPE_COLOR, TYPE_LABEL, primaryMeaning } from "../lib/subjects";
import { useSubjects } from "../store/useSubjects";
import { CharacterGlyph, NavBar, TypeBadge } from "./ui";

const READING_TYPE_LABEL = { onyomi: "on'yomi", kunyomi: "kun'yomi", nanori: "nanori" };

function correctAnswerText(subject, askType) {
  if (askType === "meaning") return subject.meanings.map((m) => m.meaning).join(", ");
  const accepted = subject.readings.filter((r) => r.accepted_answer !== false);
  if (!accepted.some((r) => r.type)) return accepted.map((r) => r.reading).join(", ");
  const groups = {};
  accepted.forEach((r) => (groups[r.type] ??= []).push(r.reading));
  return Object.entries(groups)
    .map(([type, list]) => `${READING_TYPE_LABEL[type] ?? type}: ${list.join(", ")}`)
    .join(" / ");
}

function newSession(cards) {
  return { queue: cards, total: cards.length, position: 0, finished: 0, firstAttempts: {} };
}

function SummaryRow({ subject, askType, correct }) {
  return (
    <div
      className={`flex items-center gap-3 p-2.5 rounded-lg ${
        correct ? "bg-green-50 dark:bg-green-950/30" : "bg-red-50 dark:bg-red-950/30 border-l-4 border-red-500"
      }`}
    >
      <span
        className="flex items-center justify-center min-w-9 h-9 px-1 rounded-md text-white font-bold shrink-0"
        style={{ backgroundColor: TYPE_COLOR[subject.type] }}
      >
        <CharacterGlyph subject={subject} imgSize={18} />
      </span>
      <span className="text-sm text-slate-900 dark:text-slate-100 font-semibold">{primaryMeaning(subject)}</span>
      {!correct && (
        <span lang={askType === "reading" ? "ja" : undefined} className="text-xs text-slate-500 dark:text-slate-400 font-ja truncate">
          {correctAnswerText(subject, askType)}
        </span>
      )}
      <span className={`text-xs font-medium ml-auto shrink-0 ${correct ? "text-slate-400" : "text-red-600"}`}>
        {askType === "meaning" ? "Meaning" : "Reading"}
      </span>
    </div>
  );
}

export default function Quiz({ levels, types, options, onBack }) {
  const { data } = useSubjects();
  const [session, setSession] = useState(() =>
    newSession(buildQuizCards(data.subjectsFor(levels, types), options))
  );
  const [input, setInput] = useState("");
  const [result, setResult] = useState(null); // { status: "correct"|"wrong", close? }
  const [shake, setShake] = useState(null); // { message, active }
  const inputRef = useRef(null);
  const pendingCaret = useRef(null);

  const { queue, total, position, finished, firstAttempts } = session;
  const card = queue[position];

  useEffect(() => {
    inputRef.current?.focus();
  }, [position, result]);

  // Restore the caret after romaji conversion changes the input's length.
  useLayoutEffect(() => {
    if (pendingCaret.current != null && inputRef.current) {
      inputRef.current.setSelectionRange(pendingCaret.current, pendingCaret.current);
      pendingCaret.current = null;
    }
  });

  const firstResults = Object.values(firstAttempts);
  const correctCount = firstResults.filter(Boolean).length;
  const wrongCount = firstResults.length - correctCount;

  if (!card) {
    const entries = Object.entries(firstAttempts).map(([id, correct]) => {
      const [subjectId, askType] = id.split(":");
      return { id, subject: data.get(Number(subjectId)), askType, correct };
    });
    const missed = entries.filter((e) => !e.correct);

    return (
      <div className="max-w-2xl mx-auto px-4 py-16">
        <div className="text-center">
          <h1 className="text-2xl font-serif font-bold text-slate-900 dark:text-slate-100 mb-2">Session complete</h1>
          <p className="text-slate-500 dark:text-slate-400 mb-6">
            {total} {total === 1 ? "card" : "cards"} reviewed.
          </p>
          <div className="flex items-center justify-center gap-6 mb-8">
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-10 h-10 rounded-full bg-green-100 text-green-600">
                <Check size={20} aria-hidden="true" />
              </span>
              <div className="text-left">
                <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{correctCount}</p>
                <p className="text-xs text-slate-400">Correct first try</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-10 h-10 rounded-full bg-red-100 text-red-600">
                <X size={20} aria-hidden="true" />
              </span>
              <div className="text-left">
                <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{wrongCount}</p>
                <p className="text-xs text-slate-400">Missed</p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-1.5 mb-8">
          {[...missed, ...entries.filter((e) => e.correct)].map((e) => (
            <SummaryRow key={e.id} subject={e.subject} askType={e.askType} correct={e.correct} />
          ))}
        </div>

        <div className="flex flex-wrap justify-center gap-3">
          {missed.length > 0 && (
            <button
              type="button"
              onClick={() =>
                setSession(newSession(missed.map((e) => ({ id: e.id, subjectId: e.subject.id, askType: e.askType }))))
              }
              className="flex items-center gap-2 px-6 py-3 rounded-lg border-2 border-slate-300 text-slate-700 dark:border-slate-700 dark:text-slate-300 font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <RotateCcw size={16} aria-hidden="true" />
              Review {missed.length} missed again
            </button>
          )}
          <button
            type="button"
            onClick={onBack}
            className="px-6 py-3 rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 font-semibold hover:brightness-95 transition-all"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const subject = data.get(card.subjectId);
  const color = TYPE_COLOR[subject.type];
  const isReading = card.askType === "reading";
  const isLast = position === queue.length - 1;

  function handleChange(e) {
    const el = e.target;
    if (!isReading) {
      setInput(el.value);
      return;
    }
    // Convert only the text up to the caret, so editing in the middle of
    // the answer works and the caret stays where it was.
    const caret = el.selectionStart ?? el.value.length;
    const before = toKanaWhileTyping(el.value.slice(0, caret));
    setInput(before + el.value.slice(caret));
    pendingCaret.current = before.length;
  }

  function submitAnswer() {
    const verdict = isReading
      ? checkReading(subject, input)
      : checkMeaning(subject, input, data.synonymsFor(subject.id));

    if (verdict.status === "invalid") {
      setShake({ message: verdict.message, active: true });
      return;
    }

    if (isReading) setInput(finalizeReading(input));
    setShake(null);
    setResult(verdict);

    const correct = verdict.status === "correct";
    setSession((s) => ({
      ...s,
      queue: !correct && options.repeatWrong ? requeue(s.queue, s.position, card) : s.queue,
      finished: correct || !options.repeatWrong ? s.finished + 1 : s.finished,
      firstAttempts: card.id in s.firstAttempts ? s.firstAttempts : { ...s.firstAttempts, [card.id]: correct },
    }));
  }

  function goNext() {
    setResult(null);
    setInput("");
    setShake(null);
    setSession((s) => ({ ...s, position: s.position + 1 }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (result) goNext();
    else submitAnswer();
  }

  const inputStateClass =
    result?.status === "correct"
      ? "border-green-600 bg-green-50 dark:bg-green-950/40"
      : result?.status === "wrong"
        ? "border-red-600 bg-red-50 dark:bg-red-950/40"
        : "bg-white dark:bg-slate-900";

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <NavBar
        onBack={onBack}
        backLabel="Exit Reviews"
        right={
          <div className="flex items-center gap-3" aria-label="Score">
            <span className="flex items-center gap-1 text-sm font-semibold text-green-600">
              <Check size={14} aria-hidden="true" />
              <span className="sr-only">Correct:</span>
              {correctCount}
            </span>
            <span className="flex items-center gap-1 text-sm font-semibold text-red-600">
              <X size={14} aria-hidden="true" />
              <span className="sr-only">Missed:</span>
              {wrongCount}
            </span>
            <span className="text-sm text-slate-400 font-medium">
              {finished} / {total}
            </span>
          </div>
        }
      />

      <div
        className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full mb-6 overflow-hidden"
        role="progressbar"
        aria-label="Review progress"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={finished}
      >
        <div
          className="h-full bg-slate-900 dark:bg-slate-100 rounded-full transition-all duration-300"
          style={{ width: `${(finished / total) * 100}%` }}
        />
      </div>

      <div className="rounded-xl overflow-hidden mb-6" style={{ backgroundColor: color }}>
        <div className="p-8 pb-6 text-center">
          <TypeBadge type={subject.type} />
          <p className="my-6">
            <CharacterGlyph subject={subject} className="text-6xl font-bold text-white" imgSize={64} />
          </p>
        </div>
        <p
          className={`block w-full px-4 py-3 text-center text-sm font-semibold ${
            isReading ? "bg-slate-900 text-white" : "bg-slate-200 text-slate-900"
          }`}
        >
          {TYPE_LABEL[subject.type]} {isReading ? "Reading" : "Meaning"}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mb-4">
        <label htmlFor="answer" className="sr-only">
          {TYPE_LABEL[subject.type]} {isReading ? "reading" : "meaning"}
        </label>
        <input
          id="answer"
          ref={inputRef}
          type="text"
          lang={isReading ? "ja" : "en"}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={input}
          onChange={handleChange}
          onAnimationEnd={() => setShake((s) => s && { ...s, active: false })}
          readOnly={!!result}
          aria-describedby="answer-feedback"
          placeholder={isReading ? "Type the reading…" : "Type the meaning…"}
          className={`w-full px-4 py-4 rounded-xl border-2 text-lg font-medium text-slate-900 dark:text-slate-100 focus:outline-none transition-colors ${
            isReading ? "font-ja" : ""
          } ${shake?.active ? "animate-shake" : ""} ${inputStateClass}`}
          style={result ? undefined : { borderColor: color }}
        />

        <div id="answer-feedback" aria-live="polite" className="mt-4">
          {shake && !result && <p className="text-sm font-medium text-amber-700 dark:text-amber-400">{shake.message}</p>}
          {result && (
            <div
              className={`flex items-center gap-3 p-4 rounded-xl ${
                result.status === "correct"
                  ? "bg-green-50 text-green-800 dark:bg-green-950/40 dark:text-green-300"
                  : "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300"
              }`}
            >
              {result.status === "correct" ? <Check size={22} aria-hidden="true" /> : <X size={22} aria-hidden="true" />}
              <div>
                <p className="font-semibold">
                  {result.status === "correct" ? (result.close ? "Close enough!" : "Correct!") : "Not quite"}
                </p>
                {(result.status === "wrong" || result.close) && (
                  <p className="text-sm opacity-80">
                    Answer: <span lang={isReading ? "ja" : undefined}>{correctAnswerText(subject, card.askType)}</span>
                  </p>
                )}
                {result.status === "wrong" && options.repeatWrong && (
                  <p className="text-xs opacity-70 mt-1">This one will come up again later in the session.</p>
                )}
              </div>
            </div>
          )}
        </div>

        <button
          type="submit"
          className="mt-4 w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 font-semibold hover:brightness-95 transition-all"
        >
          {!result ? "Check answer" : isLast ? "Done" : "Next"}
          {result && <ChevronRight size={18} aria-hidden="true" />}
        </button>
      </form>
    </div>
  );
}
