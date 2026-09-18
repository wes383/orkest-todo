"use client";

/**
 * The settings page — the whole app's configuration in one column.
 *
 * Three things moved here from the sidebar footer (language, appearance and
 * the CSV export that used to close the focus statistics), and one thing is
 * new: which smart views the sidebar prints. Everything else the app holds is
 * user data, and user data belongs to the tasks, not to settings.
 *
 * Each section is one panel of rows: a quiet label on the left, its control on
 * the right. The page reads top-down in the order a new user meets the app —
 * how it looks, what it says, what it shows, whether it is there at all when
 * you sit down (启动), what it hands over.
 */

import { useCallback, useState, type ReactNode } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Download, ExternalLink, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SubsectionLabel } from "@/components/ui/section";
import { Switch } from "@/components/ui/switch";
import { useAppTheme } from "@/components/theme-provider";
import { downloadAll } from "@/components/focus/focus-csv";
import type { FocusSpan } from "@/lib/focus-spans";
import { useI18n } from "@/lib/i18n";
import { LANGUAGES, LANGUAGE_LABELS, type MessageKey } from "@/lib/messages";
import { HIDEABLE_VIEWS, MIN_WIDGET_OPACITY, type AppSettings, type HideableView } from "@/lib/settings";
import type { Todo, TodoList } from "@/lib/types";

/** Which sidebar row each hideable view names — the sidebar's own message
    keys, so the two surfaces cannot drift apart. */
const HIDEABLE_LABEL_KEYS: Record<HideableView, MessageKey> = {
  upcoming: "view.upcoming",
  overdue: "view.overdue",
  starred: "view.starred",
  completed: "view.completed",
};

/** Clamp a typed number into its range — the settings page's own guard, so a
    wild value never even reaches storage. */
function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/**
 * The canonical privacy policy lives in the repository, not in the app: there
 * it is versioned with the code, so the text a given release shipped with can
 * still be read afterwards, and it is the one address a release page, a store
 * listing or a security questionnaire can all point at. In-app text has none of
 * those properties, and would drift out of step with the next release.
 *
 * So the app carries a one-line summary plus this pointer. The summary matters
 * as much as the link: it is what most readers actually read, and it is what
 * remains if the reader is offline or GitHub is unreachable.
 */
const PRIVACY_URL = "https://github.com/wes383/orkest-todo/blob/main/PRIVACY.md";

/**
 * The Chinese half of that document sits after the English one, so a Chinese
 * reader is sent straight to it instead of to a screen of English. The fragment
 * is percent-encoded by hand because the heading it points at is CJK, and a
 * heading that cannot be renamed without breaking this is worse than the
 * alternative: if the fragment ever misses, the reader simply lands at the top
 * of the document, which is the same place they would have landed anyway.
 */
const PRIVACY_URL_ZH = `${PRIVACY_URL}#%E4%B8%AD%E6%96%87`;

/** One row of a settings panel: label (and its explanation) on the left, the
    control on the right, a hairline between rows. */
function Row({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-3.5 last:border-b-0">
      <div className="min-w-0">
        <label
          htmlFor={htmlFor}
          className="block text-sm font-medium leading-tight text-foreground"
        >
          {label}
        </label>
        {hint ? (
          <p className="mt-0.5 text-xs leading-snug text-foreground-subtle">
            {hint}
          </p>
        ) : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export interface SettingsViewProps {
  /** The whole focus log — the export hands over all of it. */
  spans: FocusSpan[];
  /** The whole task set — the export hands these over too, in their own file. */
  todos: Todo[];
  lists: TodoList[];
  /** Owned by App, so the sidebar answers the moment a toggle moves. */
  settings: AppSettings;
  setViewVisible: (view: HideableView, visible: boolean) => void;
  /** The focus rules the log reads live; see `settings.ts`. */
  setSpanLimits: (minSpanMinutes: number, maxSpanHours: number) => void;
  /** The focus widget pill's alpha, as a percentage — 100 is opaque. It travels
      to the widget over the snapshot bridge, not through any CSS of ours: the
      widget is a window of its own. */
  setWidgetOpacity: (widgetOpacity: number) => void;
  /** The settings page's own trigger — App clears both stores behind it, so
      the button stays a declaration and the wiping stays where the data is. */
  onDeleteAllData: () => void;
  /** Whether leaving the app also ends a session that is still running. The
      other half of the same preference: one row decides how the app arrives,
      this one how it goes, and both are habits of the app rather than of the
      work. */
  setQuitStopsFocus: (value: boolean) => void;
  /** 开机自启 — the OS login item, read and written by the plugin rather than
      stored here; see `autostart.ts` for why it is the one row with no entry in
      `AppSettings`. */
  autostart: {
    enabled: boolean;
    pending: boolean;
    error: boolean;
    available: boolean;
    setEnabled: (value: boolean) => Promise<void>;
  };
  focusWidget: {
    enabled: boolean;
    pending: boolean;
    error: boolean;
    available: boolean;
    setVisible: (enabled: boolean) => Promise<void>;
  };
}

export function SettingsView({
  spans,
  todos,
  lists,
  settings,
  setViewVisible,
  setSpanLimits,
  setWidgetOpacity,
  setQuitStopsFocus,
  onDeleteAllData,
  autostart,
  focusWidget,
}: SettingsViewProps) {
  const { t, language, setLanguage } = useI18n();
  const { theme, setTheme, highContrast, toggleHighContrast } = useAppTheme();
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  /** What the reader has typed into the confirm box — the delete only
      unlocks when it matches the keyword, so a click means they read. */
  const [confirmText, setConfirmText] = useState("");
  /** The word the dialog demands. Chinese readers get the verb itself; for
      Latin text the case is folded, because "delete" vs "DELETE" is not a
      distinction worth holding a delete button hostage over. */
  const deleteKeyword = language === "zh" ? "删除" : "DELETE";
  const deleteConfirmed =
    confirmText.trim().toLowerCase() === deleteKeyword.toLowerCase();

  /** The export names a list on every row it writes; a deleted list's stretches
      go out as the empty name, which is what the unassigned bucket means. */
  const nameOf = useCallback(
    (listId: string | null) =>
      listId === null ? null : lists.find((list) => list.id === listId)?.name ?? null,
    [lists]
  );

  /**
   * Whether this is the desktop app — asked here rather than borrowed from
   * `autostart.available` because the quit row has no hook of its own to ask:
   * these are two ways of saying the same thing, and this row's reason for
   * needing it is the tray menu that only a desktop window has.
   */
  const desktop = isTauri();

  /**
   * Open the policy in the system browser, not in this window.
   *
   * A plain `<a href>` would navigate the webview itself: the app would be
   * replaced by a GitHub page and a running focus session would go with it —
   * the same reason `browser-guards` already blocks Ctrl+O. `openUrl` hands the
   * URL to the OS, so the window never moves.
   *
   * Outside the Tauri shell (the plain `pnpm dev` browser) there is no opener to
   * call, so that path falls back to a new tab.
   */
  const openPrivacy = useCallback(() => {
    const url = language === "zh" ? PRIVACY_URL_ZH : PRIVACY_URL;
    if (isTauri()) {
      void openUrl(url);
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }, [language]);

  return (
    <main className="flex h-full min-w-0 flex-1 flex-col bg-background text-foreground">
      {/* `relative`: see focus-stats — an absolute `sr-only` descendant added
          here later would otherwise escape the clip and grow the document a
          scrollbar of its own. */}
      <div className="relative min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[880px] px-8 pb-16 pt-6">
          {/* Appearance */}
          <section className="mt-6">
            <SubsectionLabel className="px-1 text-xs text-foreground-subtle">
              {t("settings.sectionAppearance")}
            </SubsectionLabel>
            <div className="mt-2 overflow-hidden rounded-lg border border-border bg-surface">
              <Row label={t("settings.theme")} htmlFor="settings-theme">
                <Select value={theme} onValueChange={setTheme}>
                  <SelectTrigger
                    id="settings-theme"
                    aria-label={t("settings.theme")}
                    className="h-9 w-36 rounded-md text-sm"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">{t("appearance.light")}</SelectItem>
                    <SelectItem value="dark">{t("appearance.dark")}</SelectItem>
                    <SelectItem value="system">
                      {t("appearance.system")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </Row>
              <Row label={t("appearance.highContrast")}>
                <Switch
                  checked={highContrast}
                  onCheckedChange={toggleHighContrast}
                  aria-label={t("appearance.highContrast")}
                />
              </Row>
            </div>
          </section>

          {/* Language */}
          <section className="mt-6">
            <SubsectionLabel className="px-1 text-xs text-foreground-subtle">
              {t("settings.sectionLanguage")}
            </SubsectionLabel>
            <div className="mt-2 overflow-hidden rounded-lg border border-border bg-surface">
              <Row label={t("language.label")} htmlFor="settings-language">
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger
                    id="settings-language"
                    aria-label={t("language.label")}
                    className="h-9 w-36 rounded-md text-sm"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map((option) => (
                      <SelectItem key={option} value={option}>
                        {/* Named in its own language, so the menu is usable
                            from inside the language you are trying to leave. */}
                        {LANGUAGE_LABELS[option]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Row>
            </div>
          </section>

          {/* Sidebar — which smart views are worth a row */}
          <section className="mt-6">
            <SubsectionLabel className="px-1 text-xs text-foreground-subtle">
              {t("settings.sectionSidebar")}
            </SubsectionLabel>
            <div className="mt-2 overflow-hidden rounded-lg border border-border bg-surface">
              <Row label={t("settings.sidebarHint")} />
              {HIDEABLE_VIEWS.map((view) => (
                <Row key={view} label={t(HIDEABLE_LABEL_KEYS[view])}>
                  <Switch
                    checked={!settings.hiddenViews[view]}
                    onCheckedChange={(visible) => setViewVisible(view, visible)}
                    aria-label={t(HIDEABLE_LABEL_KEYS[view])}
                  />
                </Row>
              ))}
            </div>
          </section>

          {/* Focus — the two rules the log measures a stretch by. Values are
              clamped here before they are stored, so a wild number never
              reaches the log; settings.ts clamps again on the way back in. */}
          <section className="mt-6">
            <SubsectionLabel className="px-1 text-xs text-foreground-subtle">
              {t("settings.sectionFocus")}
            </SubsectionLabel>
            <div className="mt-2 overflow-hidden rounded-lg border border-border bg-surface">
              <Row
                label={t("settings.focusWidget")}
                hint={t(focusWidget.error ? "widget.error" : focusWidget.available ? "settings.focusWidgetHint" : "settings.desktopOnly")}
                htmlFor="settings-focus-widget"
              >
                <Switch
                  id="settings-focus-widget"
                  checked={focusWidget.enabled}
                  disabled={!focusWidget.available || focusWidget.pending}
                  onCheckedChange={(enabled) => { void focusWidget.setVisible(enabled); }}
                  aria-label={t("settings.focusWidget")}
                />
              </Row>
              {/* The pill's alpha sits directly under the switch that decides
                  whether there is a pill at all. A slider rather than a typed
                  number, unlike the two rules below: this is a value you tune
                  by looking at the thing, and every step of a drag goes
                  straight out over the snapshot bridge — the widget is its own
                  preview. Its floor is in `settings.ts`, where the value is
                  read back as well as set. */}
              <Row
                label={t("settings.widgetOpacity")}
                hint={t("settings.widgetOpacityHint")}
                htmlFor="settings-widget-opacity"
              >
                <div className="flex items-center gap-2.5">
                  <input
                    id="settings-widget-opacity"
                    type="range"
                    min={MIN_WIDGET_OPACITY}
                    max={100}
                    step={5}
                    value={settings.widgetOpacity}
                    onChange={(event) => setWidgetOpacity(Number(event.target.value))}
                    className="w-40 accent-[color:var(--accent)]"
                  />
                  {/* The number beside the track, so the setting is a value and
                      not just a position. Fixed width: a readout that reflows
                      between 20% and 100% would shift the track under the
                      cursor mid-drag. */}
                  <span className="w-9 shrink-0 text-right text-xs tabular-nums text-foreground-muted">
                    {settings.widgetOpacity}%
                  </span>
                </div>
              </Row>
              <Row
                label={t("settings.minSpan")}
                hint={t("settings.minSpanHint")}
                htmlFor="settings-min-span"
              >
                <Input
                  id="settings-min-span"
                  type="number"
                  min={0}
                  max={1440}
                  value={settings.minSpanMinutes}
                  onChange={(e) =>
                    setSpanLimits(
                      clamp(Number(e.target.value) || 0, 0, 1440),
                      settings.maxSpanHours
                    )
                  }
                  className="h-9 w-24 rounded-md text-sm"
                />
              </Row>
              <Row
                label={t("settings.maxSpan")}
                hint={t("settings.maxSpanHint")}
                htmlFor="settings-max-span"
              >
                <Input
                  id="settings-max-span"
                  type="number"
                  min={1}
                  max={24}
                  value={settings.maxSpanHours}
                  onChange={(e) =>
                    setSpanLimits(
                      settings.minSpanMinutes,
                      clamp(Number(e.target.value) || 1, 1, 24)
                    )
                  }
                  className="h-9 w-24 rounded-md text-sm"
                />
              </Row>
            </div>
          </section>

          {/* Startup — the app's own life on this machine: whether it is there
              before you ask it to be, and what leaving does to a session still
              running. Placed just above 数据: the sections above are about how
              the app behaves, the two below are about what it holds and what it
              can destroy, and these two rows are the last of the first kind.

              The autostart row is the only one that edits something outside the
              app: the login item the OS holds, which is also where its state is
              read back from, so a refusal (Windows' 任务管理器 can veto an entry)
              shows up here as a failure rather than as a switch that springs
              back.

              The quit row keeps its answer here instead, and that is the
              difference worth noticing between two rows that look alike. The
              login item's truth lives in the OS, so it cannot be duplicated;
              quitting is carried out by the webview that holds the focus log, so
              there is nothing outside to ask — Rust asks us. See `quit.ts`. */}
          <section className="mt-6">
            <SubsectionLabel className="px-1 text-xs text-foreground-subtle">
              {t("settings.sectionStartup")}
            </SubsectionLabel>
            <div className="mt-2 overflow-hidden rounded-lg border border-border bg-surface">
              <Row
                label={t("settings.autostart")}
                hint={t(autostart.error ? "widget.error" : autostart.available ? "settings.autostartHint" : "settings.desktopOnly")}
                htmlFor="settings-autostart"
              >
                <Switch
                  id="settings-autostart"
                  checked={autostart.enabled}
                  disabled={!autostart.available || autostart.pending}
                  onCheckedChange={(enabled) => { void autostart.setEnabled(enabled); }}
                  aria-label={t("settings.autostart")}
                />
              </Row>
              <Row
                label={t("settings.quitStopsFocus")}
                hint={desktop ? undefined : t("settings.desktopOnly")}
                htmlFor="settings-quit-stops-focus"
              >
                <Switch
                  id="settings-quit-stops-focus"
                  checked={settings.quitStopsFocus}
                  disabled={!desktop}
                  onCheckedChange={setQuitStopsFocus}
                  aria-label={t("settings.quitStopsFocus")}
                />
              </Row>
            </div>
          </section>

          {/* Data — what the app does with what it holds. The CSV export moved
              here from the foot of the statistics page: "everything the log
              holds" is a whole-app concern, and one click now writes two files
              — the focus log as it always went, and the task set beside it.
              The privacy row answers the other half of the same question. */}
          <section className="mt-6">
            <SubsectionLabel className="px-1 text-xs text-foreground-subtle">
              {t("settings.sectionData")}
            </SubsectionLabel>
            <div className="mt-2 overflow-hidden rounded-lg border border-border bg-surface">
              <Row label={t("focus.log.export")}>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={spans.length === 0 && todos.length === 0}
                  onClick={() => {
                    // One folder pick covers both files inside the Tauri app;
                    // the answer is where they went, `null` a cancel. A
                    // failure is *shown* rather than swallowed: a silent
                    // catch here reads exactly like a dead button.
                    downloadAll(spans, todos, nameOf, lists, language)
                      .then((folder) => {
                        if (folder !== null) {
                          toast.success(t("focus.log.exportSaved", { folder }));
                        }
                      })
                      .catch((error: unknown) => {
                        toast.error(
                          t("focus.log.exportFailed", {
                            error: String(error),
                          })
                        );
                      });
                  }}
                >
                  <Icon icon={Download} size="sm" />
                  {t("focus.log.exportAction")}
                </Button>
              </Row>
              {/* The policy row sits beside the export because both are about
                  what happens to the data the app is holding — one hands it
                  over to you, the other states that nobody else receives it. */}
              <Row label={t("settings.privacy")} hint={t("settings.privacyHint")}>
                <Button variant="outline" size="sm" onClick={openPrivacy}>
                  <Icon icon={ExternalLink} size="sm" />
                  {t("settings.privacyAction")}
                </Button>
              </Row>
            </div>
          </section>

          {/* Danger zone — the one destructive button on the page. Behind the
              confirm dialog, because a single mis-click on "delete everything"
              is not a mistake the app can offer to undo. */}
          <section className="mt-6">
            <SubsectionLabel className="px-1 text-xs text-foreground-subtle">
              {t("settings.sectionDanger")}
            </SubsectionLabel>
            <div className="mt-2 overflow-hidden rounded-lg border border-border bg-surface">
              <Row label={t("settings.deleteAll")} hint={t("settings.deleteAllHint")}>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setConfirmDeleteOpen(true)}
                >
                  <Icon icon={Trash2} size="sm" />
                  {t("settings.deleteAllAction")}
                </Button>
              </Row>
            </div>
          </section>
        </div>
      </div>

      <AlertDialog
        open={confirmDeleteOpen}
        onOpenChange={(open) => {
          // A closed dialog forgets what was typed: next time starts cold,
          // and nothing half-typed lingers armed beside a destructive key.
          setConfirmDeleteOpen(open);
          if (!open) setConfirmText("");
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settings.deleteAllTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.deleteAllBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {/* The content shell is `p-0` — header and footer carry their own
              padding, so an element between them pads itself. `px-6` lines the
              field up with the description above it. */}
          <div className="px-6">
            {/* `sm`: the dialog is a short question with a short answer, and
                the md default reads like a form field for a whole sentence. */}
            <Input
              size="sm"
              className="mt-1"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={t("settings.deleteAllType", {
                keyword: deleteKeyword,
              })}
              aria-label={t("settings.deleteAllType", {
                keyword: deleteKeyword,
              })}
              autoComplete="off"
              autoFocus
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              destructive
              disabled={!deleteConfirmed}
              onClick={() => {
                onDeleteAllData();
                toast.success(t("settings.deleteAllDone"));
              }}
            >
              {t("settings.deleteAllAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
