import { getMeaningSynonyms, getSubjectsByIds, getSubjectsForLevels } from "../api/wanikani";
import { compareSubjects, filterCategory } from "../lib/subjects";

// Read-only view of the store at one point in time. A new snapshot is
// created on every change, so components can use it as a memo dependency.
class StoreSnapshot {
  constructor(store) {
    this.store = store;
  }

  get(id) {
    return this.store.subjects.get(id);
  }

  has(id) {
    return this.store.subjects.has(id);
  }

  isResolving(id) {
    return this.store.idState.get(id) === "loading";
  }

  levelStatus(level) {
    return this.store.levelState.get(level) ?? { status: "idle", error: null };
  }

  synonymsFor(id) {
    return this.store.synonyms.get(id) ?? [];
  }

  subjectsFor(levels, types) {
    return [...this.store.subjects.values()]
      .filter((s) => levels.includes(s.level) && types.includes(filterCategory(s.type)))
      .sort(compareSubjects);
  }
}

// Session-scoped cache of WaniKani data for one token. Created on connect
// and disposed on disconnect, so nothing leaks between accounts.
export class SubjectStore {
  constructor(token) {
    this.token = token;
    this.subjects = new Map();
    this.levelState = new Map(); // level -> { status: "loading"|"ready"|"error", error }
    this.idState = new Map(); // subject id -> "loading" | "failed"
    this.synonyms = new Map();
    this.synonymsRequested = false;
    this.controller = new AbortController();
    this.listeners = new Set();
    this.snapshot = new StoreSnapshot(this);
  }

  subscribe = (listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;

  emit() {
    this.snapshot = new StoreSnapshot(this);
    this.listeners.forEach((listener) => listener());
  }

  dispose() {
    this.controller.abort();
    this.listeners.clear();
  }

  addSubjects(subjects) {
    subjects.forEach((s) => this.subjects.set(s.id, s));
  }

  ensureLevels(levels) {
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
      .catch((err) => {
        if (this.controller.signal.aborted) return;
        const error = err instanceof Error ? err.message : "Failed to load this level.";
        missing.forEach((level) => this.levelState.set(level, { status: "error", error }));
        this.emit();
      });
  }

  retryLevels(levels) {
    levels.forEach((level) => this.levelState.delete(level));
    this.ensureLevels(levels);
  }

  // Fetch individual subjects (e.g. components or "used in" subjects that
  // live on levels the person hasn't opened) in bulk.
  ensureSubjects(ids) {
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
  ensureSynonyms() {
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
