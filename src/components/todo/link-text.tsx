import { useCallback } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { linkify } from "@/lib/linkify";
import { cn } from "@/lib/utils";

/**
 * A note with its URLs made live. The text is never re-rendered as HTML —
 * `linkify` cuts it into segments and the links are ordinary `<a>` elements,
 * so nothing but the address itself is interpreted.
 *
 * Inside the Tauri shell a click goes to the system browser via the opener
 * plugin: a plain navigation would replace the app window with the page, and
 * the webview's own target=_blank has nowhere to open. In a plain browser
 * (dev server) the same link falls back to a new tab.
 */
export function LinkText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const open = useCallback((href: string, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (isTauri()) {
      void openUrl(href);
      return;
    }
    window.open(href, "_blank", "noopener,noreferrer");
  }, []);

  return (
    <p className={cn("whitespace-pre-wrap", className)}>
      {linkify(text).map((segment, i) =>
        segment.kind === "text" ? (
          <span key={i}>{segment.text}</span>
        ) : (
          <a
            key={i}
            href={segment.href}
            // The card around this note answers clicks of its own; a link must
            // not bubble into an expand toggle.
            onClick={(event) => open(segment.href, event)}
            className="break-all text-accent underline decoration-accent/40 underline-offset-2 transition-colors hover:decoration-accent"
          >
            {segment.text}
          </a>
        )
      )}
    </p>
  );
}
