import { Check, Contrast, Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppTheme } from "@/components/theme-provider";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/messages";

const THEME_OPTIONS: {
  value: string;
  labelKey: MessageKey;
  icon: LucideIcon;
}[] = [
  { value: "light", labelKey: "appearance.light", icon: Sun },
  { value: "dark", labelKey: "appearance.dark", icon: Moon },
  { value: "system", labelKey: "appearance.system", icon: Monitor },
];

/**
 * AppearanceMenu — Orkest ships three first-class appearances (light / dark /
 * high-contrast). Exposing all of them from a single menu keeps the sidebar
 * footer calm while still honouring the library's theming model.
 */
export function AppearanceMenu() {
  const { t } = useI18n();
  const { theme, setTheme, isDark, highContrast, toggleHighContrast } =
    useAppTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("appearance.aria")}
          title={t("appearance.aria")}
        >
          <Icon icon={isDark ? Moon : Sun} />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>{t("appearance.label")}</DropdownMenuLabel>
        {THEME_OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onSelect={() => setTheme(option.value)}
          >
            <Icon icon={option.icon} size="sm" />
            {t(option.labelKey)}
            {theme === option.value && (
              <Icon icon={Check} size="sm" className="ml-auto text-accent" />
            )}
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />

        <DropdownMenuCheckboxItem
          checked={highContrast}
          onCheckedChange={toggleHighContrast}
        >
          <Icon icon={Contrast} size="sm" />
          {t("appearance.highContrast")}
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
