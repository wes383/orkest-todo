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
 * how it looks, what it says, what it shows, what it hands over.
 */

import { useCallback, type ReactNode } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
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
import { downloadCsv } from "@/components/focus/focus-csv";
import type { FocusSpan } from "@/lib/focus-spans";
import { useI18n } from "@/lib/i18n";
import { LANGUAGES, LANGUAGE_LABELS, type MessageKey } from "@/lib/messages";
import { HIDEABLE_VIEWS, type AppSettings, type HideableView } from "@/lib/settings";
import type { TodoList } from "@/lib/types";

/** Which sidebar row each hideable view names — the sidebar's own message
    keys, so the two surfaces cannot drift apart. */
const HIDEABLE_LABEL_KEYS: Record<HideableView, MessageKey> = {
  upcoming: "view.upcoming",
  overdue: "view.overdue",
  starred: "view.starred",
  completed: "view.completed",
};

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
  lists: TodoList[];
  /** Owned by App, so the sidebar answers the moment a toggle moves. */
  settings: AppSettings;
  setViewVisible: (view: HideableView, visible: boolean) => void;
}

export function SettingsView({
  spans,
  lists,
  settings,
  setViewVisible,
}: SettingsViewProps) {
  const { t, language, setLanguage } = useI18n();
  const { theme, setTheme, highContrast, toggleHighContrast } = useAppTheme();

  /** The export names a list on every row it writes; a deleted list's stretches
      go out as the empty name, which is what the unassigned bucket means. */
  const nameOf = useCallback(
    (listId: string | null) =>
      listId === null ? null : lists.find((list) => list.id === listId)?.name ?? null,
    [lists]
  );

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

          {/* Data — the CSV export, moved here from the foot of the statistics
              page: "everything the log holds" is a whole-app concern. */}
          <section className="mt-6">
            <SubsectionLabel className="px-1 text-xs text-foreground-subtle">
              {t("settings.sectionData")}
            </SubsectionLabel>
            <div className="mt-2 overflow-hidden rounded-lg border border-border bg-surface">
              <Row label={t("focus.log.export")}>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={spans.length === 0}
                  onClick={() => downloadCsv(spans, nameOf, language)}
                >
                  <Icon icon={Download} size="sm" />
                  {t("focus.log.exportAction")}
                </Button>
              </Row>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
