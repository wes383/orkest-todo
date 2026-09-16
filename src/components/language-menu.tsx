import { Check, Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "@/lib/i18n";
import { LANGUAGES, LANGUAGE_LABELS } from "@/lib/messages";

/**
 * LanguageMenu — the language switch, sitting next to `AppearanceMenu` in the
 * sidebar footer.
 *
 * Deliberately its own menu rather than a section inside the appearance one:
 * "which language am I reading" is not part of "how does it look", and burying
 * it under 外观设置 would make it something you find only by accident.
 *
 * The two options are named in their own language — see `LANGUAGE_LABELS`. That
 * is not a fallback for missing translations: it is what makes the menu usable
 * from inside the language you are trying to leave.
 */
export function LanguageMenu() {
  const { language, setLanguage, t } = useI18n();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("language.aria")}
          title={t("language.aria")}
        >
          <Icon icon={Languages} />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuLabel>{t("language.label")}</DropdownMenuLabel>
        {LANGUAGES.map((option) => (
          <DropdownMenuItem
            key={option}
            onSelect={() => setLanguage(option)}
          >
            {LANGUAGE_LABELS[option]}
            {language === option && (
              <Icon icon={Check} size="sm" className="ml-auto text-accent" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
