import { AlertCircle, ChevronLeft, Loader2 } from "lucide-react";
import { parseMarkup } from "../lib/markup";
import { TYPE_COLOR, TYPE_ICON_CHAR, TYPE_LABEL, primaryMeaning } from "../lib/subjects";

export function TypeBadge({ type }) {
  return (
    <span className="inline-flex items-center px-3 py-1 rounded-md text-sm font-semibold bg-white text-slate-900">
      {TYPE_LABEL[type]}
    </span>
  );
}

export function TypeIconSquare({ type, active = true }) {
  return (
    <span
      aria-hidden="true"
      lang="ja"
      className={`inline-flex items-center justify-center w-7 h-7 rounded-md text-white font-ja font-bold text-sm shrink-0 transition-opacity ${
        active ? "" : "opacity-40"
      }`}
      style={{ backgroundColor: TYPE_COLOR[type] }}
    >
      {TYPE_ICON_CHAR[type]}
    </span>
  );
}

export function NavBar({ title, onBack, backLabel = "Back", right }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-6">
      <div className="flex items-center gap-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1 px-3 py-2 rounded-lg text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
          >
            <ChevronLeft size={18} aria-hidden="true" />
            <span className="text-sm font-medium">{backLabel}</span>
          </button>
        )}
        {title && <h1 className="text-xl font-serif font-bold text-slate-900 dark:text-slate-100">{title}</h1>}
      </div>
      {right}
    </div>
  );
}

// Renders the subject's character, or its SVG image for radicals that
// have no unicode character.
export function CharacterGlyph({ subject, className = "", imgSize = 24 }) {
  if (subject.characters) {
    return (
      <span lang="ja" className={`font-ja ${className}`}>
        {subject.characters}
      </span>
    );
  }
  if (subject.imageUrl) {
    return (
      <img
        src={subject.imageUrl}
        alt={primaryMeaning(subject)}
        style={{ width: imgSize, height: imgSize, filter: "brightness(0) invert(1)" }}
        className="inline-block"
      />
    );
  }
  return <span className={className}>?</span>;
}

export function RelatedChip({ subject, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-2 rounded-lg hover:brightness-95 transition-all"
      style={{ backgroundColor: TYPE_COLOR[subject.type] }}
    >
      <CharacterGlyph subject={subject} className="text-lg font-bold text-white" imgSize={20} />
      <span className="text-xs font-medium text-white">{primaryMeaning(subject)}</span>
    </button>
  );
}

export function SectionLabel({ children, className = "" }) {
  return (
    <p className={`text-xs uppercase tracking-wide text-slate-400 font-semibold mb-2 ${className}`}>{children}</p>
  );
}

export function LoadingBanner({ children }) {
  return (
    <div
      role="status"
      className="mb-4 p-3 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center gap-2 text-slate-500 dark:text-slate-300"
    >
      <Loader2 size={16} className="animate-spin" aria-hidden="true" />
      <p className="text-sm font-medium">{children}</p>
    </div>
  );
}

export function ErrorBanner({ children, onRetry }) {
  return (
    <div
      role="alert"
      className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 dark:bg-red-950/40 dark:border-red-900 flex items-center justify-between gap-3"
    >
      <div className="flex items-start gap-2 text-red-700 dark:text-red-300">
        <AlertCircle size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-sm font-medium">{children}</p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:brightness-95 transition-all"
        >
          Try again
        </button>
      )}
    </div>
  );
}

export function NoticeBanner({ children }) {
  return (
    <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/40 dark:border-amber-900 text-center">
      <p className="text-sm text-amber-800 dark:text-amber-300 font-medium">{children}</p>
    </div>
  );
}

const MARKUP_CLASS = {
  radical: "px-1 rounded text-white",
  kanji: "px-1 rounded text-white",
  vocabulary: "px-1 rounded text-white",
  reading: "px-1 rounded bg-slate-700 text-white dark:bg-slate-600",
  meaning: "px-1 rounded bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-slate-100",
  ja: "font-ja",
};

// A WaniKani mnemonic with its inline highlights styled like on WaniKani.
export function Mnemonic({ text }) {
  return (
    <p className="text-slate-700 dark:text-slate-300 text-base leading-relaxed whitespace-pre-line">
      {parseMarkup(text).map((seg, i) =>
        seg.tag ? (
          <span
            key={i}
            lang={seg.tag === "ja" || seg.tag === "reading" ? "ja" : undefined}
            className={MARKUP_CLASS[seg.tag]}
            style={TYPE_COLOR[seg.tag] ? { backgroundColor: TYPE_COLOR[seg.tag] } : undefined}
          >
            {seg.text}
          </span>
        ) : (
          <span key={i}>{seg.text}</span>
        )
      )}
    </p>
  );
}
