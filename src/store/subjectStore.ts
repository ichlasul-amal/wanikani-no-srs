import { getMeaningSynonyms, getSubjectsByIds, getSubjectsForLevels } from "../api/wanikani";
import { compareSubjects, filterCategory } from "../lib/subjects";
import type { Subject, TypeFilter } from "../types";

export type LevelStatus =
  | { status: "idle" | "loading" | "ready"; error: null }
  | { status: "error"; error: string };

// Read-only view of the store at one point in time. A new snapshot is
// created on every change, so components can use it as a memo dependency.
export class StoreSnapshot {
  private readonly store: SubjectStore;

  constructor(store: SubjectStore) {
    this.store = store;
  }

  get(id: number): Subject | undefined {
    return this.store.subjects.get(id);
  }

  has(id: number): boolean {
    return this.store.subjects.has(id);
  }

  isResolving(id: number): boolean {
    return this.store.idState.get(id) === "loading";
  }

  levelStatus(level: number): LevelStatus {
    return this.store.levelState.get(level) ?? { status: "idle", error: null };
  }

  synonymsFor(id: number): string[] {
    return this.store.synonyms.get(id) ?? [];
  }

  subjectsFor(levels: readonly number[], types: readonly TypeFilter[]): Subject[] {
    return [...this.store.subjects.values()]
      .filter((s) => levels.includes(s.level) && types.includes(filterCategory(s.type)))
      .sort(compareSubjects);
  }
}

// Session-scoped cache of WaniKani data for one token. Created on connect
// and disposed on disconnect, so nothing leaks between accounts.
export class SubjectStore {
  readonly token: string;
  readonly subjects = new Map<number, Subject>();
  readonly levelState = new Map<number, LevelStatus>();
  readonly idState = new Map<number, "loading" | "failed">();
  synonyms = new Map<number, string[]>();
  private synonymsRequested = false;
  private readonly controller = new AbortController();
  private readonly listeners = new Set<() => void>();
  private snapshot: StoreSnapshot = new StoreSnapshot(this);

  constructor(token: string) {
    this.token = token;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): StoreSnapshot => this.snapshot;

  private emit(): void {
    this.snapshot = new StoreSnapshot(this);
    this.listeners.forEach((listener) => listener());
  }

  dispose(): void {
    this.controller.abort();
    this.listeners.clear();
  }

  private addSubjects(subjects: Subject[]): void {
    subjects.forEach((s) => this.subjects.set(s.id, s));
  }

  ensureLevels(levels: readonly number[]): void {
    const missing = levels.filter((level) => {
      const status = this.levelState.get(level)?.status;
      return status !== "ready" && status !== "loading";
    });
    if (missing.length === 0) return;

    missing.forEach((level) => this.levelState.set(level, { status: "loading", error: null }));
    this.emit();

    getSubjectsForLevels(this.token, missing, { signal: this.controller.signal })
      .then((subjects) => {
        this.addSubjects(subjects);
        missing.forEach((level) => this.levelState.set(level, { status: "ready", error: null }));
        this.emit();
      })
      .catch((err: unknown) => {
        if (this.controller.signal.aborted) return;
        const error = err instanceof Error ? err.message : "Failed to load this level.";
        missing.forEach((level) => this.levelState.set(level, { status: "error", error }));
        this.emit();
      });
  }

  retryLevels(levels: readonly number[]): void {
    levels.forEach((level) => this.levelState.delete(level));
    this.ensureLevels(levels);
  }

  // Fetch individual subjects (e.g. components or "used in" subjects that
  // live on levels the person hasn't opened) in bulk.
  ensureSubjects(ids: readonly number[]): void {
    const missing = [...new Set(ids)].filter((id) => !this.subjects.has(id) && !this.idState.has(id));
    if (missing.length === 0) return;

    missing.forEach((id) => this.idState.set(id, "loading"));
    this.emit();

    getSubjectsByIds(this.token, missing, { signal: this.controller.signal })
      .then((subjects) => {
        this.addSubjects(subjects);
        missing.forEach((id) => {
          if (this.subjects.has(id)) this.idState.delete(id);
          else this.idState.set(id, "failed");
        });
        this.emit();
      })
      .catch(() => {
        if (this.controller.signal.aborted) return;
        missing.forEach((id) => this.idState.set(id, "failed"));
        this.emit();
      });
  }

  // User synonyms are a nice-to-have for answer checking; failures are
  // ignored and answers are simply checked without them.
  ensureSynonyms(): void {
    if (this.synonymsRequested) return;
    this.synonymsRequested = true;
    getMeaningSynonyms(this.token, { signal: this.controller.signal })
      .then((synonyms) => {
        this.synonyms = synonyms;
        this.emit();
      })
      .catch(() => {});
  }
}
