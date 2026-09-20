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

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Check, Copy, Download, ExternalLink, Languages, QrCode, RefreshCw, Trash2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import type { LucideIcon } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { chordModifier } from "@/lib/global-shortcut";
import { useI18n } from "@/lib/i18n";
import { LANGUAGES, LANGUAGE_LABELS, LOCALES, type MessageKey } from "@/lib/messages";
import { HIDEABLE_VIEWS, MIN_WIDGET_OPACITY, type AppSettings, type HideableView } from "@/lib/settings";
import { formatCode } from "@/lib/sync/config";
import { APP_VERSION } from "@/lib/version";
import type { SyncControls, SyncStatus } from "@/lib/sync/engine";
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
 * The legal documents — the privacy policy and the terms of use — live in the
 * repository, not in the app: there they are versioned with the code, so the
 * text a given release shipped with can still be read afterwards, and each is
 * the one address a release page, a store listing or a security questionnaire
 * can point at. In-app text has none of those properties, and would drift out
 * of step with the next release.
 *
 * So the app carries the pointers themselves, and nothing beside them. The
 * one-line summary that used to sit under the policy label is gone: a
 * paraphrase invites a reader to stop at it instead of opening the document,
 * and that one had quietly gone false the day sync arrived — it still promised
 * that nothing ever left this machine.
 *
 * Both paths hang off one base so the two documents cannot drift onto
 * different branches of the repository.
 */
const DOC_BASE_URL = "https://github.com/wes383/orkest-todo/blob/main";
const PRIVACY_URL = `${DOC_BASE_URL}/PRIVACY.md`;
const TERMS_URL = `${DOC_BASE_URL}/TERMS.md`;

/**
 * The Chinese half of each document sits after the English one, so a Chinese
 * reader is sent straight to it instead of to a screen of English. The fragment
 * is percent-encoded by hand because the heading it points at is CJK, and a
 * heading that cannot be renamed without breaking this is worse than the
 * alternative: if the fragment ever misses, the reader simply lands at the top
 * of the document, which is the same place they would have landed anyway.
 */
const ZH_ANCHOR = "#%E4%B8%AD%E6%96%87";
const PRIVACY_URL_ZH = `${PRIVACY_URL}${ZH_ANCHOR}`;
const TERMS_URL_ZH = `${TERMS_URL}${ZH_ANCHOR}`;

/**
 * The phone page's address. It lives here, not inside the message table,
 * because it is also what a click puts on the clipboard: the string the hint
 * prints and the string it copies have to be the same address, and two copies
 * of it would be free to drift.
 */
const MOBILE_URL = "orkest-focus.wesluma.com";

/** The token `sync.mobileHint` marks the address with. */
const MOBILE_URL_TOKEN = "{url}";

/**
 * How long the copy button wears its tick. Long enough to be read as an
 * answer (the toast says the same thing in words), short enough that the
 * button is back to its normal face before the next thing you want to do.
 *
 * The button is disabled for the same stretch: copying the same string twice
 * within a second is never what was meant, and the second press would only
 * re-run the tick you are already looking at.
 */
const COPY_FEEDBACK_MS = 1600;

/** One row of a settings panel: label (and its explanation) on the left, the
    control on the right, a hairline between rows. */
function Row({
  label,
  hint,
  icon,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  /** An optional mark in front of the label. Only for the rare row whose
      subject is worth placing at a glance rather than read — the language
      row, whose label is one word and whose panel is otherwise bare. */
  icon?: LucideIcon;
  htmlFor?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-3.5 last:border-b-0">
      <div className="min-w-0">
        <label
          htmlFor={htmlFor}
          className="flex items-center gap-1.5 text-sm font-medium leading-tight text-foreground"
        >
          {icon ? (
            <Icon
              icon={icon}
              size="sm"
              className="text-foreground-muted"
              aria-hidden
            />
          ) : null}
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
  /** 关闭窗口时最小化到托盘 — whether the ✕ parks the window in the tray or
      closes the app. Mirrored down to the window handler in Rust, which is the
      side that has to answer a close request; see `useCloseToTray`. */
  setCloseToTray: (value: boolean) => void;
  /** The OS-wide chord — mirrored down to Rust, which registers/unregisters. */
  setGlobalShortcuts: (value: boolean) => void;
  /** 隐藏快捷键提示 — whether the interface prints its chords at all. Stored
      here like the rest and read by the toolbar, QuickAdd, the editor, the
      palette and the focus screen; nothing is unbound by it. */
  setHideShortcutHints: (value: boolean) => void;
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
  /** 同步 — the desktop half of the focus sync, owned by App the way the
      autostart row is; see `sync/engine.ts` for what the handle carries. */
  sync: SyncControls;
}

const SYNC_STATUS_KEYS: Record<SyncStatus, MessageKey> = {
  off: "sync.status.off",
  idle: "sync.status.idle",
  syncing: "sync.status.syncing",
  error: "sync.status.error",
};

export function SettingsView({
  spans,
  todos,
  lists,
  settings,
  setViewVisible,
  setSpanLimits,
  setWidgetOpacity,
  setQuitStopsFocus,
  setCloseToTray,
  setGlobalShortcuts,
  setHideShortcutHints,
  onDeleteAllData,
  autostart,
  focusWidget,
  sync,
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

  /*
   * 同步 — the Supabase connection is baked into the build, so the section
   * is one switch and one code: flip it, get the code onto the phone (copied
   * or scanned), done.
   */
  const [confirmRegenOpen, setConfirmRegenOpen] = useState(false);

  /** Whether the sync code is being shown as a QR code. The code is the one
      thing about this section that is easier to carry across as an image than
      as text, so it gets a surface of its own rather than a row of its own. */
  const [qrOpen, setQrOpen] = useState(false);

  /** Whether the code's copy button is still wearing its tick. */
  const [codeCopied, setCodeCopied] = useState(false);
  const copyTimerRef = useRef<number | null>(null);

  /* A pending tick that outlives the page would set state on a gone
     component — the settings page is unmounted every time the reader leaves
     it, so the timer is cleared with it. */
  useEffect(
    () => () => {
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    },
    []
  );

  const copyCode = useCallback(() => {
    if (!sync.code || codeCopied) return;
    void navigator.clipboard.writeText(sync.code).then(() => {
      setCodeCopied(true);
      toast.success(t("sync.codeCopied"));
      copyTimerRef.current = window.setTimeout(() => {
        copyTimerRef.current = null;
        setCodeCopied(false);
      }, COPY_FEEDBACK_MS);
    });
  }, [sync.code, codeCopied, t]);

  /** The address is meant to be typed on a phone, so the click copies it
      instead of opening it here — this is a desktop window, and the point is
      to carry the address across, not to visit it. */
  const copyMobileUrl = useCallback(() => {
    void navigator.clipboard
      .writeText(MOBILE_URL)
      .then(() => toast.success(t("sync.mobileUrlCopied")));
  }, [t]);

  /** `14:32` — the clock of the last successful cycle, in the reader's own
      locale; the seconds a cycle takes are not the interesting part. */
  const lastSyncLabel = sync.lastSyncAt
    ? t("sync.lastSync", {
        time: new Intl.DateTimeFormat(LOCALES[language], {
          hour: "2-digit",
          minute: "2-digit",
        }).format(sync.lastSyncAt),
      })
    : t("sync.never");

  const syncStatusLabel = sync.error
    ? t("sync.status.error", { error: sync.error })
    : t(SYNC_STATUS_KEYS[sync.status]);

  /**
   * The mobile hint with its `{url}` token cut out, so the address can be
   * rendered as a control rather than as more prose. Splitting into a list
   * instead of destructuring two halves means a translation that drops the
   * token still prints its whole sentence — just without the button.
   */
  const mobileHintParts = t("sync.mobileHint").split(MOBILE_URL_TOKEN);

  /** The export names a list on every row it writes; a deleted list's stretches
      go out as the empty name, which is what the unassigned bucket means. */
  const nameOf = useCallback(
    (listId: string | null) =>
      listId === null ? null : lists.find((list) => list.id === listId)?.name ?? null,
    [lists]
  );

  /**
   * Whether this is the desktop app — asked here rather than borrowed from
   * `autostart.available` because the two rows below have no hook of their own
   * to ask: these are two ways of saying the same thing, and their reason for
   * needing it is the tray, which only a desktop window has.
   */
  const desktop = isTauri();

  /**
   * Open one of the documents above in the system browser, not in this window.
   *
   * A plain `<a href>` would navigate the webview itself: the app would be
   * replaced by a GitHub page and a running focus session would go with it —
   * the same reason `browser-guards` already blocks Ctrl+O. `openUrl` hands the
   * URL to the OS, so the window never moves.
   *
   * Outside the Tauri shell (the plain `pnpm dev` browser) there is no opener to
   * call, so that path falls back to a new tab.
   */
  const openExternal = useCallback((url: string) => {
    if (isTauri()) {
      void openUrl(url);
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  /** Two documents, one behaviour: the reader is handed the half that is in
      the language they are reading the app in. */
  const openPrivacy = useCallback(() => {
    openExternal(language === "zh" ? PRIVACY_URL_ZH : PRIVACY_URL);
  }, [language, openExternal]);

  const openTerms = useCallback(() => {
    openExternal(language === "zh" ? TERMS_URL_ZH : TERMS_URL);
  }, [language, openExternal]);

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
              <Row
                label={t("appearance.highContrast")}
                htmlFor="settings-high-contrast"
              >
                <Switch
                  id="settings-high-contrast"
                  checked={highContrast}
                  onCheckedChange={toggleHighContrast}
                  aria-label={t("appearance.highContrast")}
                />
              </Row>
              <Row
                label={t("settings.hideShortcutHints")}
                htmlFor="settings-hide-shortcut-hints"
              >
                <Switch
                  id="settings-hide-shortcut-hints"
                  checked={settings.hideShortcutHints}
                  onCheckedChange={setHideShortcutHints}
                  aria-label={t("settings.hideShortcutHints")}
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
              <Row
                label={t("language.label")}
                icon={Languages}
                htmlFor="settings-language"
              >
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
              {/* The label has to name the switch it points at: without the
                  paired id a click on the row title does nothing, which is
                  exactly what the rows further down already get right. */}
              {HIDEABLE_VIEWS.map((view) => (
                <Row
                  key={view}
                  label={t(HIDEABLE_LABEL_KEYS[view])}
                  htmlFor={`settings-sidebar-${view}`}
                >
                  <Switch
                    id={`settings-sidebar-${view}`}
                    checked={!settings.hiddenViews[view]}
                    onCheckedChange={(visible) => setViewVisible(view, visible)}
                    aria-label={t(HIDEABLE_LABEL_KEYS[view])}
                  />
                </Row>
              ))}
            </div>
          </section>

          {/* Focus — how the switch can be reached without the main window, and
              the rules the log measures a stretch by.

              The pill and the chord are one idea twice: the switch made
              visible, and the switch made reachable from wherever the cursor
              is. Both are desktop-only, and both keep their truth outside this
              app — the pill's in a file Rust owns, the chord's in a claim the
              OS holds — which is why either can fail out loud where a plain
              switch would only have sprung back.

              Values are clamped here before they are stored, so a wild number
              never reaches the log; settings.ts clamps again on the way back
              in. */}
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
              {/* The chord, last: where the two numbers above say what a stretch
                  is worth, this says how the switch is reached while the window
                  is somewhere else. Its hint is written with `chordModifier()`,
                  because ⌃⌥ is how macOS spells the pair and is two glyphs that
                  name no key on a Windows keyboard. Turning it off unregisters
                  at once; a registration the OS turns down (another app already
                  owns the chord) is a console warning rather than a switch that
                  springs back. */}
              <Row
                label={t("settings.globalShortcuts")}
                hint={
                  desktop
                    ? t("settings.globalShortcutsHint", { mod: chordModifier() })
                    : t("settings.desktopOnly")
                }
                htmlFor="settings-global-shortcuts"
              >
                <Switch
                  id="settings-global-shortcuts"
                  checked={settings.globalShortcuts}
                  disabled={!desktop}
                  onCheckedChange={setGlobalShortcuts}
                  aria-label={t("settings.globalShortcuts")}
                />
              </Row>
            </div>
          </section>

          {/* Startup — the app's own life on this machine: whether it is there
              before you ask it to be, what the ✕ does with it, and what leaving
              does to a session still running. Placed just above 数据: the
              sections above are about how the app behaves, the two below are
              about what it holds and what it can destroy, and these three rows
              are the last of the first kind.

              The autostart row is the only one that edits something outside the
              app: the login item the OS holds, which is also where its state is
              read back from, so a refusal (Windows' 任务管理器 can veto an entry)
              shows up here as a failure rather than as a switch that springs
              back.

              The other two keep their answers here, and the difference is worth
              noticing between rows that look alike. The login item's truth lives
              in the OS, so it cannot be duplicated; these two are both about
              leaving, and leaving is carried out either by the webview (closing
              the session — it holds the focus log) or by the window handler in
              Rust (hiding or exiting). So one is asked for at the moment of the
              quit and the other is pushed down in advance — a close request has
              to be answered inside the event, where there is nobody to ask. See
              `quit.ts` for both. */}
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
                label={t("settings.closeToTray")}
                hint={desktop ? undefined : t("settings.desktopOnly")}
                htmlFor="settings-close-to-tray"
              >
                <Switch
                  id="settings-close-to-tray"
                  checked={settings.closeToTray}
                  disabled={!desktop}
                  onCheckedChange={setCloseToTray}
                  aria-label={t("settings.closeToTray")}
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

          {/* ── 同步 ── The bridge to the phone: credentials, the sync code
              the phone will be told, and the state of the engine right now. */}
          <section className="mt-6">
            <SubsectionLabel className="px-1 text-xs text-foreground-subtle">
              {t("settings.sectionSync")}
            </SubsectionLabel>
            <div className="mt-2 overflow-hidden rounded-lg border border-border bg-surface">
              <Row
                label={t("sync.enable")}
                hint={t("sync.enableHint")}
                htmlFor="sync-enabled"
              >
                <Switch
                  id="sync-enabled"
                  checked={sync.enabled}
                  onCheckedChange={sync.setEnabled}
                  aria-label={t("sync.enable")}
                />
              </Row>
              <Row label={t("sync.code")}>
                {sync.code ? (
                  <div className="flex items-center gap-1">
                    <code className="rounded bg-surface-muted px-2 py-1 font-mono text-xs tracking-wider">
                      {formatCode(sync.code)}
                    </code>
                    {/* The tick is the whole acknowledgement: green ink, the
                        same green the app uses for "this went well", and it
                        stays put for `COPY_FEEDBACK_MS` while the button
                        refuses a second press. Opacity is restored with it —
                        a dimmed tick would read as "not available" rather
                        than "done". */}
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={copyCode}
                      disabled={codeCopied}
                      aria-label={t("sync.copyCode")}
                      className={codeCopied ? "text-green-fg disabled:opacity-100" : undefined}
                    >
                      <Icon icon={codeCopied ? Check : Copy} size="sm" />
                    </Button>
                    {/* The QR, one press away instead of a row of its own: it
                        is how the code reaches a phone's camera, and it is
                        wanted only while the phone is being set up. It sits
                        between the two, so the hand-over pair stands together
                        and the destructive one stays last — regenerating
                        orphans the cloud data under the old code. */}
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setQrOpen(true)}
                      aria-label={t("sync.qr")}
                    >
                      <Icon icon={QrCode} size="sm" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setConfirmRegenOpen(true)}
                      aria-label={t("sync.regenerate")}
                    >
                      <Icon icon={RefreshCw} size="sm" />
                    </Button>
                  </div>
                ) : (
                  <span className="font-mono text-xs text-foreground-subtle">—</span>
                )}
              </Row>
              {/* The engine's state, read-only: a cycle runs every 5 s and a
                  failure backs off on its own, so there is nothing here for a
                  person to press. */}
              <Row
                label={t("sync.status")}
                hint={`${syncStatusLabel} · ${lastSyncLabel}`}
              />
            </div>
            {/* The phone's half of the switch: where to open it. The address
                is a button because the next step is to type it into a phone —
                copying is the action worth offering, and it is the only one. */}
            <p className="mt-2 px-1 text-xs leading-relaxed text-foreground-subtle">
              {mobileHintParts.flatMap((part, i) =>
                i < mobileHintParts.length - 1
                  ? [
                      part,
                      <button
                        key="url"
                        type="button"
                        onClick={copyMobileUrl}
                        aria-label={t("sync.mobileUrlCopy")}
                        className="cursor-pointer text-inherit underline-offset-2 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {MOBILE_URL}
                      </button>,
                    ]
                  : [part]
              )}
            </p>
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
              <Row label={t("settings.privacy")}>
                <Button variant="outline" size="sm" onClick={openPrivacy}>
                  <Icon icon={ExternalLink} size="sm" />
                  {t("settings.privacyAction")}
                </Button>
              </Row>
              {/* The terms follow the policy, in that order: these are the two
                  documents that together are the app's contract with the
                  reader — what is done with what they type, and what is asked
                  of them in return — and the policy is the one people go
                  looking for by name. */}
              <Row label={t("settings.terms")}>
                <Button variant="outline" size="sm" onClick={openTerms}>
                  <Icon icon={ExternalLink} size="sm" />
                  {t("settings.termsAction")}
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

          {/* 关于 — the build's number, and the last panel on the page.
              It belongs here because this is where a person comes when
              something is wrong, and "which version are you on" is the first
              question any bug report gets asked.

              A panel and a row like every section above it, with one
              difference: the row has no control on the right. `版本` takes the
              label's place and the number reads as its explanation, the way
              `settings.autostartHint` explains the row above it — which is
              what it is: a fact about this build, not a setting to change. */}
          <section className="mt-6">
            <SubsectionLabel className="px-1 text-xs text-foreground-subtle">
              {t("settings.sectionAbout")}
            </SubsectionLabel>
            <div className="mt-2 overflow-hidden rounded-lg border border-border bg-surface">
              <Row
                label={t("settings.version")}
                hint={t("settings.versionHint", { version: APP_VERSION })}
              />
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

      {/* Regenerating the sync code orphans the cloud data under the old one
          — nothing is migrated, every device needs retelling. A confirm the
          colour of a warning is the least it deserves. */}
      <AlertDialog
        open={confirmRegenOpen}
        onOpenChange={setConfirmRegenOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("sync.regenerateTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("sync.regenerateBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction destructive onClick={() => sync.regenerateCode()}>
              {t("sync.regenerate")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* The QR on a surface of its own. The payload is the mobile URL with the
          code in the query, so scanning opens the page with the code already
          filled in; the phone validates the shape before it ever connects, so a
          truncated scan fails there with the same message a mistyped code gets.
          Only rendered while a code exists — before the first enable there is
          nothing to hand over, and the button that opens this is not there
          either. */}
      {sync.code && (
        <Dialog open={qrOpen} onOpenChange={setQrOpen}>
          <DialogContent className="max-w-sm" closeLabel={t("common.close")}>
            <DialogHeader>
              <DialogTitle>{t("sync.qr")}</DialogTitle>
              <DialogDescription>{t("sync.qrHint")}</DialogDescription>
            </DialogHeader>
            <div className="flex justify-center p-7 pt-5">
              {/* White behind the code in either theme: a QR code is read by a
                  camera, and a scanner needs dark modules on light ones. */}
              <div className="rounded-xl bg-white p-3">
                <QRCodeSVG
                  value={`https://${MOBILE_URL}/?code=${sync.code}`}
                  size={192}
                  marginSize={0}
                />
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </main>
  );
}
