import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { duration, SCOPE_UNASSIGNED } from "@/lib/focus-spans";
import type { AddRefusal } from "@/lib/focus-store";
import { useI18n } from "@/lib/i18n";
import { paletteVar, type TodoList } from "@/lib/types";

/**
 * 补记 — the dialog for time the switch never saw.
 *
 * Three fields and no cleverness: a day, a start, an end, and the list it
 * belongs to. Every rule about the stretch itself belongs to the store — how
 * long it has to be to count, and whether it claims time the log already holds
 * — and `addManual` answers with the reason it refused, which is what this
 * dialog reads out. The two checks kept here as well are the ones the raw
 * fields can give away on their own: end before start, and a day still to come.
 */

function toMs(date: Date, time: string): number {
  const [h, m] = time.split(":").map(Number);
  const d = new Date(date);
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return d.getTime();
}

export function AddSpanDialog({
  open,
  onOpenChange,
  lists,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lists: TodoList[];
  onAdd: (start: number, end: number, listId: string | null) => AddRefusal | null;
}) {
  const { t, language } = useI18n();
  const [day, setDay] = useState<Date>(() => new Date());
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("10:00");
  const [listId, setListId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset for each opening: a stale half-filled form reads as data you never
  // entered.
  useEffect(() => {
    if (open) {
      setDay(new Date());
      setStart("09:00");
      setEnd("10:00");
      setListId(null);
      setError(null);
    }
  }, [open]);

  const submit = () => {
    const startMs = toMs(day, start);
    const endMs = toMs(day, end);
    if (!(endMs > startMs)) {
      setError(t("focusLog.invalid"));
      return;
    }
    if (startMs > Date.now()) {
      setError(t("focusLog.future"));
      return;
    }
    // The store judges the length and the overlap; both come back as a reason
    // to print rather than as a plain refusal.
    const refusal = onAdd(startMs, Math.min(endMs, Date.now()), listId);
    if (refusal !== null) {
      setError(
        t(refusal === "overlap" ? "focusLog.overlap" : "focusLog.invalid")
      );
      return;
    }
    toast.success(t("focusLog.added", { value: duration(endMs - startMs, language) }));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("focusLog.addTitle")}</DialogTitle>
          <DialogDescription>{t("focusLog.addDesc")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 px-7 py-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="add-span-date">{t("focusLog.date")}</Label>
            <DatePicker
              mode="single"
              value={day}
              onChange={(value) => {
                if (value instanceof Date) setDay(value);
              }}
              maxDate={new Date()}
              shortcuts={[]}
              aria-label={t("focusLog.date")}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="add-span-start">{t("focusLog.start")}</Label>
              <TimePicker
                id="add-span-start"
                value={start}
                onChange={setStart}
                aria-label={t("focusLog.start")}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="add-span-end">{t("focusLog.end")}</Label>
              <TimePicker
                id="add-span-end"
                value={end}
                onChange={setEnd}
                aria-label={t("focusLog.end")}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="add-span-list">{t("editor.listLabel")}</Label>
            <Select
              value={listId ?? SCOPE_UNASSIGNED}
              onValueChange={(next) =>
                setListId(next === SCOPE_UNASSIGNED ? null : next)
              }
            >
              <SelectTrigger id="add-span-list" aria-label={t("editor.listLabel")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SCOPE_UNASSIGNED}>
                  {t("focus.unassigned")}
                </SelectItem>
                {lists.map((list) => (
                  <SelectItem key={list.id} value={list.id}>
                    <span
                      aria-hidden="true"
                      className="mr-1.5 inline-block h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: paletteVar(list.color) }}
                    />
                    {list.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error !== null && (
            <p role="alert" className="text-sm text-red">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit}>{t("focusLog.addSubmit")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
