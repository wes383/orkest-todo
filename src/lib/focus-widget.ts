import { useCallback, useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import type { FocusState, FocusStore } from "@/lib/focus-store";
import type { Language } from "@/lib/messages";

export interface FocusWidgetList {
  id: string;
  name: string;
}

export interface FocusWidgetSnapshot {
  state: FocusState;
  startedAt: number | null;
  /** The list the running stretch is filed under, `null` when unassigned. */
  listId: string | null;
  /** Every list the main window knows, so the widget can offer a picker. */
  lists: FocusWidgetList[];
  listName: string | null;
  language: Language;
  theme: string;
  highContrast: boolean;
}

interface WidgetReply {
  snapshot: FocusWidgetSnapshot;
  requestId?: string;
}

const REQUEST = "focus-widget:request";
const COMMAND = "focus-widget:command";
const SNAPSHOT = "focus-widget:snapshot";

export function useFocusWidgetBridge(
  focus: FocusStore,
  language: Language,
  lists: FocusWidgetList[],
  defaultListId: string | null
) {
  const latest = useRef({ focus, language, lists, defaultListId });
  const publish = useCallback((requestId?: string) => {
    const current = latest.current;
    const root = document.documentElement;
    const running = current.focus.running;
    return emitTo("focus-widget", SNAPSHOT, {
      snapshot: {
        state: current.focus.state,
        startedAt: running?.start ?? null,
        listId: running?.listId ?? null,
        lists: current.lists,
        listName: current.lists.find((list) => list.id === running?.listId)?.name ?? null,
        language: current.language,
        theme: root.classList.contains("dark") ? "dark" : "light",
        highContrast: root.classList.contains("high-contrast"),
      },
      requestId,
    } satisfies WidgetReply).catch(() => undefined);
  }, []);

  useEffect(() => {
    latest.current = { focus, language, lists, defaultListId };
    if (isTauri()) void publish();
  }, [focus, language, lists, defaultListId, publish]);

  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    const subscriptions: (() => void)[] = [];
    const keep = (unsubscribe: () => void) => {
      if (disposed) unsubscribe();
      else subscriptions.push(unsubscribe);
    };
    void listen(REQUEST, () => { void publish(); }).then(keep);
    void listen<{ state?: FocusState; listId?: string | null; requestId: string }>(COMMAND, ({ payload }) => {
      if (!payload || typeof payload.requestId !== "string") return;
      const current = latest.current;
      if (payload.state !== undefined) {
        if (!["idle", "useful"].includes(payload.state)) return;
        current.focus.commit(payload.state, current.defaultListId);
      }
      if (payload.listId !== undefined) {
        // File the running stretch under the chosen list — the same move the
        // focus screen's switch offers, reached from the widget. Only a
        // running stretch can be refiled; while idle there is nothing yet.
        const spans = current.focus.spans;
        const index = spans.length - 1;
        if (current.focus.state === "useful" && index >= 0 && spans[index]?.end === null) {
          current.focus.setList(index, payload.listId);
        }
      }
      window.setTimeout(() => { if (!disposed) void publish(payload.requestId); }, 0);
    }).then(keep);
    const observer = new MutationObserver(() => { void publish(); });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => {
      disposed = true;
      subscriptions.forEach((unsubscribe) => unsubscribe());
      observer.disconnect();
    };
  }, [publish]);
}

export function useFocusWidgetVisibility() {
  const [enabled, setEnabled] = useState(false);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!isTauri()) { setPending(false); return; }
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    void listen<boolean>("focus-widget:visibility", ({ payload }) => {
      if (!disposed) setEnabled(payload);
    }).then(async (fn) => {
      if (disposed) { fn(); return; }
      unsubscribe = fn;
      const value = await invoke<boolean>("get_focus_widget_enabled");
      if (!disposed) setEnabled(value);
    }).catch(() => { if (!disposed) setError(true); })
      .finally(() => { if (!disposed) setPending(false); });
    return () => { disposed = true; unsubscribe?.(); };
  }, []);
  const setVisible = useCallback(async (value: boolean) => {
    setPending(true);
    setError(false);
    try {
      await invoke("set_focus_widget_enabled", { enabled: value });
      setEnabled(await invoke<boolean>("get_focus_widget_enabled"));
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  }, []);
  return { enabled, pending, error, setVisible, available: isTauri() };
}

export function useFocusWidgetClient() {
  const [snapshot, setSnapshot] = useState<FocusWidgetSnapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastReply = useRef(0);
  const waiting = useRef<{ id: string; resolve: () => void; timer: number } | null>(null);
  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    const request = () => emitTo("main", REQUEST).catch(() => {
      if (!disposed) setConnected(false);
    });
    void listen<WidgetReply>(SNAPSHOT, ({ payload }) => {
      if (disposed || !payload?.snapshot) return;
      const value = payload.snapshot;
      if (!["idle", "useful"].includes(value.state)) return;
      lastReply.current = Date.now();
      setSnapshot(value);
      setConnected(true);
      if (waiting.current && waiting.current.id === payload.requestId) {
        window.clearTimeout(waiting.current.timer);
        waiting.current.resolve();
        waiting.current = null;
        setPending(false);
      }
      document.documentElement.classList.toggle("dark", value.theme === "dark");
      document.documentElement.classList.toggle("light", value.theme !== "dark");
      document.documentElement.classList.toggle("high-contrast", value.highContrast);
      document.documentElement.lang = value.language === "zh" ? "zh-CN" : "en";
    }).then((fn) => {
      if (disposed) { fn(); return; }
      unsubscribe = fn;
      void request();
    }).catch(() => { if (!disposed) setError("connection"); });
    const timer = window.setInterval(() => {
      if (Date.now() - lastReply.current > 8000) setConnected(false);
      void request();
    }, 2500);
    return () => {
      disposed = true;
      unsubscribe?.();
      window.clearInterval(timer);
      if (waiting.current) {
        window.clearTimeout(waiting.current.timer);
        waiting.current.resolve();
        waiting.current = null;
      }
    };
  }, []);
  const send = useCallback(async (body: { state?: FocusState; listId?: string | null }) => {
    if (!connected || waiting.current) return;
    setPending(true);
    setError(null);
    const id = crypto.randomUUID();
    await new Promise<void>((resolve) => {
      const finish = () => {
        if (waiting.current?.id !== id) return;
        waiting.current = null;
        setPending(false);
        setError("command");
        resolve();
      };
      const timer = window.setTimeout(finish, 5000);
      waiting.current = { id, resolve, timer };
      void emitTo("main", COMMAND, { ...body, requestId: id }).catch(() => {
        window.clearTimeout(timer);
        finish();
      });
    });
  }, [connected]);
  const setFocus = useCallback(
    (state: FocusState) => send({ state }),
    [send]
  );
  const setList = useCallback(
    (listId: string | null) => send({ listId }),
    [send]
  );
  return { snapshot, connected, pending, error, setFocus, setList, clearError: useCallback(() => setError(null), []) };
}
