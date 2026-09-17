import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Hint, SubsectionLabel } from "@/components/ui/section";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { PALETTE, LIST_NAME_MAX, paletteVar, type PaletteName, type TodoList } from "@/lib/types";

export interface ListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pass an existing list to rename / recolor it; `null` creates a new one. */
  editing: TodoList | null;
  onSubmit: (name: string, color: PaletteName) => void;
}

export function ListDialog({
  open,
  onOpenChange,
  editing,
  onSubmit,
}: ListDialogProps) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [color, setColor] = useState<PaletteName>("indigo");

  // Re-seed the form each time the dialog opens so stale values never leak in.
  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    setColor(editing?.color ?? "indigo");
  }, [open, editing]);

  const canSubmit = name.trim().length > 0;

  const submit = () => {
    if (!canSubmit) return;
    onSubmit(name.trim(), color);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editing ? t("listDialog.editTitle") : t("listDialog.createTitle")}
          </DialogTitle>
          <DialogDescription>{t("listDialog.description")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5 px-7 pb-6 pt-4">
          <div>
            <Label htmlFor="list-name">{t("listDialog.nameLabel")}</Label>
            <Input
              id="list-name"
              value={name}
              autoFocus
              maxLength={LIST_NAME_MAX}
              placeholder={t("listDialog.namePlaceholder")}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
              }}
            />
          </div>

          <div>
            <Label>{t("listDialog.colorLabel")}</Label>
            <div className="flex flex-wrap gap-2">
              {PALETTE.map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-label={p}
                  aria-pressed={color === p}
                  onClick={() => setColor(p)}
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full ring-offset-2 ring-offset-surface transition-all duration-base ease-out",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    color === p
                      ? "ring-2 ring-foreground"
                      : "hover:scale-110"
                  )}
                  style={{ backgroundColor: paletteVar(p) }}
                >
                  {color === p && (
                    <Check
                      className="h-3.5 w-3.5 text-white drop-shadow"
                      strokeWidth={3}
                      aria-hidden="true"
                    />
                  )}
                </button>
              ))}
            </div>
            <Hint className="mt-3">{t("listDialog.colorHint")}</Hint>
          </div>

          <div>
            <SubsectionLabel>{t("listDialog.preview")}</SubsectionLabel>
            <div className="mt-2 flex items-center gap-3 rounded-lg border border-border bg-background px-4 py-3">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: paletteVar(color) }}
                aria-hidden="true"
              />
              <span
                className={cn(
                  "truncate text-sm",
                  canSubmit ? "text-foreground" : "text-foreground-subtle"
                )}
              >
                {name.trim() || t("list.untitled")}
              </span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {editing ? t("common.save") : t("listDialog.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
