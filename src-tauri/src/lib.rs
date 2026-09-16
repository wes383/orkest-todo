use std::collections::HashMap;
use std::sync::Mutex;

use tauri::{
  menu::{IsMenuItem, Menu, MenuItem, PredefinedMenuItem},
  tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
  AppHandle, Emitter, Manager, WindowEvent, Wry,
};

/// The window label declared in `tauri.conf.json`.
const MAIN_WINDOW: &str = "main";

/*
 * ── Tray plumbing ─────────────────────────────────────────────
 *
 * Orkest is a background-resident app: the close button parks it in the system
 * tray rather than quitting, so the tray icon is the only route back to the
 * window and the only route out of the process.
 */

/**
 * The channel Rust uses to ask the frontend for something the native menu
 * cannot do on its own.
 *
 * A tray menu can only report *which item was clicked*. It has no idea what
 * 「今天」 means, and the tasks it would act on live in the webview's
 * localStorage — so the menu's job stops at "the user picked 今天", and
 * switching the view belongs to the frontend, which already owns that logic in
 * `selectors.ts`.
 */
const TRAY_COMMAND_EVENT: &str = "tray:command";

/** What the frontend receives on [`TRAY_COMMAND_EVENT`]. */
#[derive(Clone, serde::Serialize)]
#[serde(tag = "action", rename_all = "kebab-case")]
enum TrayCommand {
  /// Focus the inline quick-add field, so a thought can be typed the moment the
  /// window is back. The native menu cannot host a text box, so this is the
  /// closest thing to "add a task straight from the tray".
  NewTask,
  /// Switch to one of the three urgency views.
  OpenView { view: &'static str },
}

const MENU_NEW_TASK: &str = "new-task";
const MENU_OPEN_WINDOW: &str = "open-window";
const MENU_QUIT: &str = "quit";

/**
 * The language the tray menu is drawn in. Mirrors `Language` in
 * `src/lib/messages.ts`, and arrives with every count sync — see
 * [`sync_tray`].
 */
#[derive(Clone, Copy, PartialEq, Eq)]
enum Lang {
  Zh,
  En,
}

impl Lang {
  fn parse(value: &str) -> Self {
    if value == "zh" {
      Lang::Zh
    } else {
      Lang::En
    }
  }
}

/**
 * The three views worth a tray row: `(menu id, view id)`.
 *
 * 已加星 / 已完成 are deliberately absent. Those are places you go *on purpose*;
 * these three are the buckets that answer "does anything need me right now",
 * which is the question a tray menu is actually good at.
 *
 * Also the single source of truth for the view rows — the menu builder, the
 * click handler and [`sync_tray`] all read it, so adding a fourth row here is
 * all it takes and there is no second list to forget.
 *
 * The label is not part of the tuple because it is language-dependent: see
 * [`view_name`]. Every string in the menu resolves through a `Lang`, so there
 * is no build order in which a half-translated menu can exist.
 */
const VIEW_ROWS: [(&str, &str); 3] = [
  ("view-today", "today"),
  ("view-upcoming", "upcoming"),
  ("view-overdue", "overdue"),
];

/** The view's own name — the same words the sidebar uses for it. */
fn view_name(lang: Lang, view: &str) -> &'static str {
  match (lang, view) {
    (Lang::Zh, "today") => "今天",
    (Lang::Zh, "upcoming") => "即将到期",
    (Lang::Zh, "overdue") => "已逾期",
    (_, "today") => "Today",
    (_, "upcoming") => "Due soon",
    (_, "overdue") => "Overdue",
    // `VIEW_ROWS` is the only caller, so this is unreachable; returning "" beats
    // panicking inside a menu paint.
    _ => "",
  }
}

fn label_new_task(lang: Lang) -> &'static str {
  match lang {
    Lang::Zh => "新建任务",
    Lang::En => "New task",
  }
}

fn label_open_window(lang: Lang) -> &'static str {
  match lang {
    Lang::Zh => "打开主窗口",
    Lang::En => "Open main window",
  }
}

fn label_quit(lang: Lang) -> &'static str {
  match lang {
    Lang::Zh => "退出 Orkest Todo",
    Lang::En => "Quit Orkest Todo",
  }
}

/// Stand-in for a count of zero, so the row never renders as a bare `0`.
fn label_no_items(lang: Lang) -> &'static str {
  match lang {
    Lang::Zh => "无",
    Lang::En => "none",
  }
}

/**
 * `今天 · 3`, or `今天 · 无` when the bucket is empty.
 *
 * The row keeps its place either way — [`sync_tray`] retires it with
 * `set_enabled(false)` instead — because a menu whose rows come and go is one
 * you have to re-read on every open, and the position is what your hand
 * remembers.
 */
fn view_label(lang: Lang, view: &str, count: usize) -> String {
  let name = view_name(lang, view);
  match count {
    0 => format!("{name} · {}", label_no_items(lang)),
    n => format!("{name} · {n}"),
  }
}

/**
 * Every menu row whose text the frontend keeps current.
 *
 * Tauri leaves a label wherever you last put it, and both the counts and the
 * language are decided in the webview — so `今天 · 3` can only stay honest if
 * the frontend pushes down and these handles paint. The static rows
 * (新建任务 / 打开主窗口 / 退出) are held for the same reason: switching language
 * has to relabel them too, and without a handle there is nothing to relabel.
 */
struct TrayMenu {
  new_task: MenuItem<Wry>,
  open_window: MenuItem<Wry>,
  quit: MenuItem<Wry>,
  /** One handle per [`VIEW_ROWS`] entry, in the same order. */
  views: Vec<MenuItem<Wry>>,
  /** Last language painted, so a redundant sync does not thrash the menu. */
  lang: Mutex<Lang>,
}

/// Bring the main window back to the foreground.
///
/// The window can be off-screen in two different states, so both have to be
/// undone: 最小化 leaves it *visible but minimized*, while the close button
/// (see `on_window_event` below) hides it outright. `show()` alone would leave
/// a minimized window sitting in the taskbar.
fn reveal_main_window(app: &AppHandle) {
  if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
  }
}

fn hide_main_window(app: &AppHandle) {
  if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
    let _ = window.hide();
  }
}

/// Left-clicking the tray icon toggles the window.
///
/// Only hide when the window is genuinely *in front of the user* — a window
/// that is merely visible (buried behind the browser) should come forward
/// rather than vanish, which is the convention for tray toggles on Windows.
fn toggle_main_window(app: &AppHandle) {
  let in_front = app
    .get_webview_window(MAIN_WINDOW)
    .map(|window| {
      window.is_visible().unwrap_or(false) && window.is_focused().unwrap_or(false)
    })
    .unwrap_or(false);

  if in_front {
    hide_main_window(app);
  } else {
    reveal_main_window(app);
  }
}

/// Nothing to do if this fails: the window is already in front, so the user can
/// just click. Losing the shortcut is not worth taking the app down.
fn emit_command(app: &AppHandle, command: TrayCommand) {
  let _ = app.emit(TRAY_COMMAND_EVENT, command);
}

fn open_view(app: &AppHandle, view: &'static str) {
  reveal_main_window(app);
  emit_command(app, TrayCommand::OpenView { view });
}

fn build_tray(app: &mut tauri::App) -> tauri::Result<()> {
  /*
   * The menu is built in English and corrected by the first [`sync_tray`] a few
   * milliseconds later, once the webview has read its own language preference.
   *
   * Rust cannot work that preference out for itself: it is a frontend decision
   * (localStorage, defaulted from `navigator.languages`) and the shortcut would
   * be to guess from the OS locale — which would disagree with the app the
   * moment someone switched. English because that is the app's default, and
   * nothing can open this menu before the window has painted.
   */
  let lang = Lang::En;

  let new_task = MenuItem::with_id(
    app,
    MENU_NEW_TASK,
    label_new_task(lang),
    true,
    None::<&str>,
  )?;
  let open_window = MenuItem::with_id(
    app,
    MENU_OPEN_WINDOW,
    label_open_window(lang),
    true,
    None::<&str>,
  )?;

  /*
   * The view rows start out empty *and disabled*, because the counts live in the
   * webview and nothing has reported them yet. `sync_tray` fills them in as soon
   * as the app mounts; disabling them until then is what keeps a click from
   * landing on a view that may have nothing in it.
   */
  let mut views = Vec::with_capacity(VIEW_ROWS.len());
  for (id, view) in VIEW_ROWS.iter().copied() {
    views.push(MenuItem::with_id(
      app,
      id,
      view_label(lang, view, 0),
      false,
      None::<&str>,
    )?);
  }

  let quit = MenuItem::with_id(app, MENU_QUIT, label_quit(lang), true, None::<&str>)?;

  // Bound rather than inlined: `Menu::with_items` only borrows them, so a
  // temporary would be dropped while `rows` still pointed at it.
  let divider_views = PredefinedMenuItem::separator(app)?;
  let divider_quit = PredefinedMenuItem::separator(app)?;

  let mut rows: Vec<&dyn IsMenuItem<Wry>> = vec![&new_task, &open_window, &divider_views];
  rows.extend(views.iter().map(|item| item as &dyn IsMenuItem<Wry>));
  rows.push(&divider_quit);
  rows.push(&quit);

  let menu = Menu::with_items(app, &rows)?;

  let mut tray = TrayIconBuilder::with_id("tray")
    .tooltip("Orkest Todo")
    .menu(&menu)
    // Windows convention: left click opens the window, the menu lives on the
    // right click. The default is the other way round.
    .show_menu_on_left_click(false)
    .on_menu_event(|app, event| match event.id.as_ref() {
      MENU_NEW_TASK => {
        reveal_main_window(app);
        emit_command(app, TrayCommand::NewTask);
      }
      MENU_OPEN_WINDOW => reveal_main_window(app),
      // Deliberately NOT `window.close()`: that request is intercepted below and
      // would only hide the window again. `app.exit` is the real way out.
      MENU_QUIT => app.exit(0),
      id => {
        // Matched against `VIEW_ROWS` rather than repeating the ids as literals,
        // so a new row cannot end up as a menu entry that silently does nothing.
        if let Some((_, view)) = VIEW_ROWS
          .iter()
          .copied()
          .find(|(row_id, _)| *row_id == id)
        {
          open_view(app, view);
        }
      }
    })
    .on_tray_icon_event(|tray, event| {
      if let TrayIconEvent::Click {
        button: MouseButton::Left,
        button_state: MouseButtonState::Up,
        ..
      } = event
      {
        toggle_main_window(tray.app_handle());
      }
    });

  /*
   * `default_window_icon()` on Windows is the first entry of `icons/icon.ico`,
   * which `tauri icon` writes at 32×32 — the ideal source for every tray DPI
   * (16 / 20 / 24 / 32), so nothing has to be scaled up.
   *
   * Guarded rather than `unwrap()`ed: a missing icon should cost the tray its
   * picture, not take the whole app down inside `setup`.
   */
  if let Some(icon) = app.default_window_icon().cloned() {
    tray = tray.icon(icon);
  }

  tray.build(app)?;

  // Managed only once the tray exists, so the command can never run against a
  // half-built menu.
  app.manage(TrayMenu {
    new_task,
    open_window,
    quit,
    views,
    lang: Mutex::new(lang),
  });

  Ok(())
}

/**
 * Paint the tray menu: the current 今天 / 即将到期 / 已逾期 counts, in the
 * language the app is currently showing.
 *
 * Counts are keyed by view id rather than positional, and the whole command is
 * deliberately dumb: it paints what it is handed and decides nothing. Deciding
 * what belongs to each view is `selectors.ts`'s job, and a tray that re-derived
 * 「今天」 from scratch would be a second definition waiting to drift out of step
 * with the sidebar. The same goes for the language — it is read in
 * `i18n.tsx`, and guessing it here from the OS locale would be a second source
 * of truth that could disagree.
 *
 * Folded into one call rather than split into `set_language` + `sync_counts`
 * because both repaint the same menu and both arrive from the same place: the
 * frontend sends this whenever the counts move *or* the language changes.
 */
#[tauri::command]
fn sync_tray(app: AppHandle, counts: HashMap<String, usize>, lang: String) {
  let Some(menu) = app.try_state::<TrayMenu>() else {
    return;
  };

  let lang = Lang::parse(&lang);

  /*
   * Repaint the static rows only on a real change. `set_text` on a native menu
   * item is cheap but not free, and this runs on every count sync — which is
   * every time a task is added, completed or deleted.
   *
   * A poisoned mutex is recovered rather than propagated: the lock only ever
   * guards a `Copy` enum, so there is no invariant it could have been left
   * holding, and losing the tray to a panic elsewhere is not a trade worth
   * making.
   */
  let changed = {
    let mut current = menu.lang.lock().unwrap_or_else(|e| e.into_inner());
    if *current == lang {
      false
    } else {
      *current = lang;
      true
    }
  };

  if changed {
    let _ = menu.new_task.set_text(label_new_task(lang));
    let _ = menu.open_window.set_text(label_open_window(lang));
    let _ = menu.quit.set_text(label_quit(lang));
  }

  for ((_, view), item) in VIEW_ROWS.iter().copied().zip(menu.views.iter()) {
    let count = counts.get(view).copied().unwrap_or(0);
    let _ = item.set_text(view_label(lang, view, count));
    let _ = item.set_enabled(count > 0);
  }
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
  format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let builder = tauri::Builder::default();

  /*
   * Single instance, registered first so a second launch is intercepted before
   * any window is created.
   *
   * This matters far more now that closing the window parks the app in the
   * tray. "我以为已经退出了、其实还在后台" becomes a normal state, and the obvious
   * next move is to double-click the exe again. Two live instances share one
   * WebView2 data directory — i.e. one `orkest-todo.v1` localStorage key — and
   * each holds the state it read at startup, so whichever instance writes last
   * silently discards the other's task edits. Focusing the existing window
   * instead makes the second launch harmless.
   */
  #[cfg(desktop)]
  let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
    reveal_main_window(app);
  }));

  builder
    .plugin(tauri_plugin_opener::init())
    .invoke_handler(tauri::generate_handler![greet, sync_tray])
    .setup(|app| {
      build_tray(app)?;
      Ok(())
    })
    .on_window_event(|window, event| {
      if let WindowEvent::CloseRequested { api, .. } = event {
        /*
         * 「关闭窗口」 = 收进系统托盘，而不是退出。
         *
         * This is unconditional and covers *every* close path — the ✕ button,
         * Alt+F4 and the taskbar's 关闭窗口 menu item. Quitting the app has to go
         * through `app.exit(0)` (the tray menu's 退出), because `window.close()`
         * and `window.destroy()` both land right back here.
         */
        api.prevent_close();
        let _ = window.hide();
      }
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
