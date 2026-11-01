import { createContext, useContext, useSyncExternalStore } from "react";
import type { StoreSnapshot, SubjectStore } from "./subjectStore";

export const SubjectStoreContext = createContext<SubjectStore | null>(null);

// Returns the session's store (for actions like ensureLevels) and its
// current snapshot (for reads). Re-renders whenever the store changes.
export function useSubjects(): { store: SubjectStore; data: StoreSnapshot } {
  const store = useContext(SubjectStoreContext);
  if (!store) throw new Error("useSubjects must be used inside SubjectStoreContext");
  const data = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return { store, data };
}
