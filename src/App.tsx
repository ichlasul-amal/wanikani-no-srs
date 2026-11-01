import { useEffect, useEffectEvent, useState } from "react";
import { WaniKaniError, getUser } from "./api/wanikani";
import Dashboard from "./components/Dashboard";
import LessonPage from "./components/LessonPage";
import Quiz from "./components/Quiz";
import TokenGate from "./components/TokenGate";
import { LoadingBanner } from "./components/ui";
import { TYPE_FILTERS } from "./lib/subjects";
import { clearSavedToken, loadSavedToken, saveToken } from "./lib/tokenStorage";
import { SubjectStore } from "./store/subjectStore";
import { SubjectStoreContext } from "./store/useSubjects";
import type { Settings, User } from "./types";

type View = "restoring" | "connect" | "dashboard" | "lessons" | "reviews";

const DEFAULT_SETTINGS: Settings = {
  levels: [1],
  types: TYPE_FILTERS,
  questionTypes: "both",
  order: "shuffled",
  repeatWrong: true,
};

export default function App() {
  const [savedToken] = useState(loadSavedToken);
  const [view, setView] = useState<View>(savedToken ? "restoring" : "connect");
  const [connectError, setConnectError] = useState<string | null>(null);
  const [store, setStore] = useState<SubjectStore | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  // Bumped on every Lessons/Reviews start so the page remounts fresh.
  const [sessionKey, setSessionKey] = useState(0);

  function connect(token: string, nextUser: User, remember: boolean) {
    if (remember) saveToken(token);
    setStore(new SubjectStore(token));
    setUser(nextUser);
    setSettings((s) => ({ ...s, levels: [Math.min(nextUser.level, nextUser.maxLevelGranted)] }));
    setConnectError(null);
    setView("dashboard");
  }

  function disconnect() {
    store?.dispose();
    clearSavedToken();
    setStore(null);
    setUser(null);
    setView("connect");
  }

  const onRestored = useEffectEvent((token: string, restoredUser: User) => connect(token, restoredUser, false));

  // Sign back in with a remembered token.
  useEffect(() => {
    if (!savedToken) return;
    const controller = new AbortController();
    getUser(savedToken, { signal: controller.signal })
      .then((u) => onRestored(savedToken, u))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof WaniKaniError && err.status === 401) clearSavedToken();
        setConnectError(err instanceof Error ? err.message : "Couldn't sign you back in.");
        setView("connect");
      });
    return () => controller.abort();
  }, [savedToken]);

  function startSession(nextView: "lessons" | "reviews") {
    setSessionKey((k) => k + 1);
    setView(nextView);
  }

  const backToDashboard = () => setView("dashboard");

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <main key={view} className="view-transition">
        {view === "restoring" && (
          <div className="max-w-md mx-auto px-4 py-16">
            <LoadingBanner>Signing you back in…</LoadingBanner>
          </div>
        )}

        {view === "connect" && <TokenGate onConnected={connect} initialError={connectError} />}

        {store && user && (
          <SubjectStoreContext value={store}>
            {view === "dashboard" && (
              <Dashboard
                user={user}
                settings={settings}
                setSettings={setSettings}
                onStudy={() => startSession("lessons")}
                onQuiz={() => startSession("reviews")}
                onDisconnect={disconnect}
              />
            )}
            {view === "lessons" && (
              <LessonPage key={sessionKey} levels={settings.levels} types={settings.types} onBack={backToDashboard} />
            )}
            {view === "reviews" && (
              <Quiz
                key={sessionKey}
                levels={settings.levels}
                types={settings.types}
                options={settings}
                onBack={backToDashboard}
              />
            )}
          </SubjectStoreContext>
        )}
      </main>
    </div>
  );
}
