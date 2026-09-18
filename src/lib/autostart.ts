import { useCallback, useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";

/**
 * 开机自启 — the login item, read and written through the `autostart` plugin.
 *
 * The one settings row whose state is deliberately absent from `settings.ts`,
 * and for the same reason the focus widget's is absent from it too: the truth
 * belongs to something outside this app. Here that something is the operating
 * system. A boolean copied into localStorage would be a second answer that can
 * go stale behind the app's back — 任务管理器's 启动 tab owns an override of its
 * own, a moved installation leaves the recorded path pointing at nothing — and
 * a switch that disagrees with the system is worse than one that has to ask. So
 * this asks the OS when the window mounts, and writes back to the OS whenever
 * the switch moves.
 *
 * Nothing reconciles at boot either: an autostarted launch *is* an ordinary
 * launch, window and all, and the app never needs to know which one it is in.
 */
export interface AutostartToggle {
  /** What the OS currently holds — never what we last asked it to hold. */
  enabled: boolean;
  /** A read or a write is in flight; the switch is held until it lands. */
  pending: boolean;
  /** The OS refused, or the read failed. The row says so rather than lying. */
  error: boolean;
  /** False in a plain browser (`pnpm dev`), where there is no login item and
      no plugin to write one with. */
  available: boolean;
  setEnabled: (value: boolean) => Promise<void>;
}

export function useAutostart(): AutostartToggle {
  const [enabled, setValue] = useState(false);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!isTauri()) {
      setPending(false);
      return;
    }
    let disposed = false;
    void isEnabled()
      .then((value) => {
        if (!disposed) setValue(value);
      })
      .catch(() => {
        if (!disposed) setError(true);
      })
      .finally(() => {
        if (!disposed) setPending(false);
      });
    return () => {
      disposed = true;
    };
  }, []);

  /**
   * Read the answer back rather than trusting the write.
   *
   * This is not defensive padding: on Windows `isEnabled` also consults the
   * `StartupApproved` override that 任务管理器's 启动 tab writes, so an entry we
   * just created can still read back as off. Showing the read-back is the only
   * way the switch agrees with what will actually happen at the next login, and
   * flagging the disagreement is what keeps it from silently springing back
   * under the cursor — a switch that does that reads as broken, not as vetoed.
   */
  const setEnabled = useCallback(async (value: boolean) => {
    setPending(true);
    setError(false);
    try {
      await (value ? enable() : disable());
      const applied = await isEnabled();
      setValue(applied);
      if (applied !== value) setError(true);
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  }, []);

  return { enabled, pending, error, setEnabled, available: isTauri() };
}
