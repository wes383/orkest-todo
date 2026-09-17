use std::collections::HashMap;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use tauri::{
  menu::{IsMenuItem, Menu, MenuItem, PredefinedMenuItem},
  tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
  AppHandle, Emitter, Manager, WindowEvent, Wry,
};

/// The window label declared in `tauri.conf.json`.
const MAIN_WINDOW: &str = "main";
const FOCUS_WIDGET: &str = "focus-widget";
const FOCUS_WIDGET_VISIBILITY: &str = "focus-widget:visibility";

struct FocusWidget {
  enabled: AtomicBool,
  operation: Mutex<()>,
  config_path: PathBuf,
}

fn read_focus_widget_preference(path: &Path) -> bool {
  std::fs::read(path)
    .ok()
    .and_then(|bytes| serde_json::from_slice::<bool>(&bytes).ok())
    .unwrap_or(false)
}

fn write_focus_widget_preference(path: &Path, enabled: bool) -> Result<(), String> {
  let parent = path.parent().ok_or("Missing widget config directory")?;
  std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
  let temporary = path.with_extension(format!("{}.tmp", std::process::id()));
  let result = (|| -> std::io::Result<()> {
    let mut file = std::fs::File::create(&temporary)?;
    file.write_all(if enabled { b"true" } else { b"false" })?;
    file.sync_all()?;
    drop(file);
    std::fs::rename(&temporary, path)
  })();
  if result.is_err() {
    let _ = std::fs::remove_file(&temporary);
  }
  result.map_err(|e| format!("Could not save focus widget preference: {e}"))
}

fn widget_axis(
  position: i64,
  old_size: i64,
  new_size: i64,
  start: i64,
  extent: i64,
  threshold: i64,
  snap: bool,
) -> i64 {
  let end = start + extent;
  let start_gap = (position - start).abs();
  let end_gap = (end - position - old_size).abs();
  let position = if end_gap <= threshold && end_gap < start_gap {
    position + old_size - new_size
  } else {
    position
  };
  let last = (end - new_size).max(start);
  let position = position.clamp(start, last);
  if snap {
    let start_gap = position - start;
    let end_gap = last - position;
    if start_gap <= threshold && start_gap <= end_gap {
      return start;
    }
    if end_gap <= threshold {
      return last;
    }
  }
  position
}

fn layout_focus_widget(window: &tauri::WebviewWindow, expanded: bool, snap: bool) -> Result<(), String> {
  let monitor = window.current_monitor().map_err(|e| e.to_string())?
    .or(window.primary_monitor().map_err(|e| e.to_string())?)
    .ok_or("No monitor available for focus widget")?;
  let area = monitor.work_area();
  let scale = monitor.scale_factor();
  let size = tauri::LogicalSize::new(248.0, if expanded { 224.0 } else { 76.0 })
    .to_physical::<u32>(scale);
  let position = window.outer_position().map_err(|e| e.to_string())?;
  let old_size = window.outer_size().map_err(|e| e.to_string())?;
  let threshold = (24.0 * scale).round() as i64;
  let x = widget_axis(
    position.x as i64, old_size.width as i64, size.width as i64,
    area.position.x as i64, area.size.width as i64, threshold, snap,
  );
  let y = widget_axis(
    position.y as i64, old_size.height as i64, size.height as i64,
    area.position.y as i64, area.size.height as i64, threshold, snap,
  );
  window.set_size(size).map_err(|e| e.to_string())?;
  window.set_position(tauri::PhysicalPosition::new(x as i32, y as i32))
    .map_err(|e| e.to_string())
}

fn ensure_focus_widget(app: &AppHandle) -> Result<tauri::WebviewWindow, String> {
  if let Some(window) = app.get_webview_window(FOCUS_WIDGET) {
    return Ok(window);
  }
  let builder = tauri::WebviewWindowBuilder::new(
    app, FOCUS_WIDGET, tauri::WebviewUrl::App("index.html?window=focus-widget".into()),
  )
    .title("Focus widget")
    .decorations(false)
    .shadow(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(false)
    .inner_size(248.0, 76.0)
    .visible(false)
    .focused(false);
  #[cfg(not(target_os = "macos"))]
  let builder = builder.transparent(true);
  let window = builder.build().map_err(|e| e.to_string())?;
  let result = (|| -> Result<(), String> {
    window.set_min_size(None::<tauri::LogicalSize<f64>>).map_err(|e| e.to_string())?;
    let monitor = app.get_webview_window(MAIN_WINDOW)
      .and_then(|main| main.current_monitor().ok().flatten())
      .or(app.primary_monitor().map_err(|e| e.to_string())?)
      .ok_or("No monitor available for focus widget")?;
    let area = monitor.work_area();
    let scale = monitor.scale_factor();
    let size = tauri::LogicalSize::new(248.0, 76.0).to_physical::<u32>(scale);
    let margin = (12.0 * scale).round() as i64;
    let x = (area.position.x as i64 + area.size.width as i64 - size.width as i64 - margin)
      .max(area.position.x as i64);
    let y = (area.position.y as i64 + margin)
      .min((area.position.y as i64 + area.size.height as i64 - size.height as i64)
        .max(area.position.y as i64));
    window.set_position(tauri::PhysicalPosition::new(x as i32, y as i32))
      .map_err(|e| e.to_string())?;
    window.set_size(size).map_err(|e| e.to_string())?;
    Ok(())
  })();
  if let Err(error) = result {
    let _ = window.destroy();
    return Err(error);
  }
  Ok(window)
}

fn refresh_focus_widget_menu(app: &AppHandle) {
  let handle = app.clone();
  let _ = app.run_on_main_thread(move || {
    if let Some(menu) = handle.try_state::<TrayMenu>() {
      let lang = *menu.lang.lock().unwrap_or_else(|e| e.into_inner());
      let enabled = handle.state::<FocusWidget>().enabled.load(Ordering::SeqCst);
      let _ = menu.toggle_widget.set_text(label_toggle_widget(lang, enabled));
    }
  });
}

fn change_focus_widget_enabled(app: &AppHandle, enabled: bool) -> Result<(), String> {
  let state = app.state::<FocusWidget>();
  let previous = state.enabled.load(Ordering::SeqCst);
  let window = if enabled {
    Some(ensure_focus_widget(app)?)
  } else {
    app.get_webview_window(FOCUS_WIDGET)
  };
  if let Some(window) = &window {
    if enabled {
      let expanded = window.inner_size().map_err(|e| e.to_string())?
        .to_logical::<f64>(window.scale_factor().map_err(|e| e.to_string())?).height > 150.0;
      layout_focus_widget(window, expanded, false)?;
      window.show().map_err(|e| e.to_string())?;
    } else {
      window.hide().map_err(|e| e.to_string())?;
    }
  }
  let saved = write_focus_widget_preference(&state.config_path, enabled);
  if enabled && saved.is_err() {
    if !previous {
      if let Some(window) = window {
        let _ = window.hide();
      }
    }
    return saved;
  }
  state.enabled.store(enabled, Ordering::SeqCst);
  refresh_focus_widget_menu(app);
  let _ = app.emit_to(MAIN_WINDOW, FOCUS_WIDGET_VISIBILITY, enabled);
  saved
}

fn queue_focus_widget_change(app: &AppHandle, enabled: Option<bool>) {
  let app = app.clone();
  tauri::async_runtime::spawn_blocking(move || {
    let state = app.state::<FocusWidget>();
    let _operation = state.operation.lock().unwrap_or_else(|e| e.into_inner());
    let enabled = enabled.unwrap_or_else(|| !state.enabled.load(Ordering::SeqCst));
    if let Err(error) = change_focus_widget_enabled(&app, enabled) {
      eprintln!("Focus widget: {error}");
    }
  });
}

fn authorize_widget_control(window: &tauri::WebviewWindow) -> Result<(), String> {
  if matches!(window.label(), MAIN_WINDOW | FOCUS_WIDGET) {
    Ok(())
  } else {
    Err("Window is not authorized to control the focus widget".into())
  }
}

#[tauri::command]
fn get_focus_widget_enabled(app: AppHandle) -> bool {
  app.state::<FocusWidget>().enabled.load(Ordering::SeqCst)
}

#[tauri::command]
async fn set_focus_widget_enabled(window: tauri::WebviewWindow, enabled: bool) -> Result<(), String> {
  authorize_widget_control(&window)?;
  let app = window.app_handle().clone();
  tauri::async_runtime::spawn_blocking(move || {
    let state = app.state::<FocusWidget>();
    let _operation = state.operation.lock().unwrap_or_else(|e| e.into_inner());
    change_focus_widget_enabled(&app, enabled)
  }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn focus_widget_layout(window: tauri::WebviewWindow, expanded: bool, snap: bool) -> Result<(), String> {
  if window.label() != FOCUS_WIDGET {
    return Err("Only the focus widget may change its layout".into());
  }
  tauri::async_runtime::spawn_blocking(move || {
    let state = window.state::<FocusWidget>();
    let _operation = state.operation.lock().unwrap_or_else(|e| e.into_inner());
    layout_focus_widget(&window, expanded, snap)
  }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn open_main_window(window: tauri::WebviewWindow) -> Result<(), String> {
  authorize_widget_control(&window)?;
  let main = window.app_handle().get_webview_window(MAIN_WINDOW)
    .ok_or("Main window is unavailable")?;
  main.unminimize().map_err(|e| e.to_string())?;
  main.show().map_err(|e| e.to_string())?;
  main.set_focus().map_err(|e| e.to_string())
}

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
  /// Flip the focus switch without surfacing the window — the one command the
  /// tray can carry out entirely behind the reader's back.
  ToggleFocus,
  /// Switch to one of the three urgency views.
  OpenView { view: &'static str },
}

const MENU_NEW_TASK: &str = "new-task";
const MENU_TOGGLE_FOCUS: &str = "toggle-focus";
const MENU_TOGGLE_WIDGET: &str = "toggle-focus-widget";
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

/**
 * The focus toggle's label, in both states.
 *
 * The row is a verb that changes with the switch it controls — 开始专注 while
 * idle, 结束专注 while running — so the reader never has to remember which
 * way up the switch currently is; the menu says what clicking will do, the
 * way the other rows do.
 */
fn label_toggle_focus(lang: Lang, running: bool) -> &'static str {
  match (lang, running) {
    (Lang::Zh, false) => "开始专注",
    (Lang::Zh, true) => "结束专注",
    (_, false) => "Start focus",
    (_, true) => "Stop focus",
  }
}

fn label_toggle_widget(lang: Lang, enabled: bool) -> &'static str {
  match (lang, enabled) {
    (Lang::Zh, false) => "显示专注悬浮窗",
    (Lang::Zh, true) => "隐藏专注悬浮窗",
    (Lang::En, false) => "Show focus widget",
    (Lang::En, true) => "Hide focus widget",
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
  toggle_focus: MenuItem<Wry>,
  toggle_widget: MenuItem<Wry>,
  open_window: MenuItem<Wry>,
  quit: MenuItem<Wry>,
  /** One handle per [`VIEW_ROWS`] entry, in the same order. */
  views: Vec<MenuItem<Wry>>,
  /** Last language painted, so a redundant sync does not thrash the menu. */
  lang: Mutex<Lang>,
  /** Last focus state painted — the toggle's label is a function of it, and
      like `lang` it only crosses the bridge when it actually moves. */
  focus_running: Mutex<bool>,
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
  let _ = app.emit_to(MAIN_WINDOW, TRAY_COMMAND_EVENT, command);
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
  // The tray boots before the webview has reported anything: painted as "Start
  // focus" (the idle label), which the first `sync_tray` corrects if a session
  // is somehow already running.
  let toggle_focus = MenuItem::with_id(
    app,
    MENU_TOGGLE_FOCUS,
    label_toggle_focus(lang, false),
    true,
    None::<&str>,
  )?;
  let toggle_widget = MenuItem::with_id(
    app,
    MENU_TOGGLE_WIDGET,
    label_toggle_widget(lang, app.state::<FocusWidget>().enabled.load(Ordering::SeqCst)),
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

  let mut rows: Vec<&dyn IsMenuItem<Wry>> =
    vec![&new_task, &toggle_focus, &toggle_widget, &open_window, &divider_views];
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
      MENU_TOGGLE_FOCUS => {
        // Deliberately no `reveal_main_window` here: flipping the switch is
        // the whole point of this row, and dragging the window up over it
        // would defeat the "without going back to the interface" part.
        emit_command(app, TrayCommand::ToggleFocus);
      }
      MENU_TOGGLE_WIDGET => queue_focus_widget_change(app, None),
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
    toggle_focus,
    toggle_widget,
    open_window,
    quit,
    views,
    lang: Mutex::new(lang),
    focus_running: Mutex::new(false),
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
fn sync_tray(
  window: tauri::WebviewWindow,
  app: AppHandle,
  counts: HashMap<String, usize>,
  lang: String,
  focus_running: bool,
) {
  if window.label() != MAIN_WINDOW {
    return;
  }
  let Some(menu) = app.try_state::<TrayMenu>() else {
    return;
  };

  let lang = Lang::parse(&lang);

  /*
   * Repaint the rows only on a real change. `set_text` on a native menu
   * item is cheap but not free, and this runs on every count sync — which is
   * every time a task is added, completed or deleted.
   *
   * A poisoned mutex is recovered rather than propagated: the locks only ever
   * guard `Copy` values, so there is no invariant they could have been left
   * holding, and losing the tray to a panic elsewhere is not a trade worth
   * making.
   */
  let lang_changed = {
    let mut current = menu.lang.lock().unwrap_or_else(|e| e.into_inner());
    if *current == lang {
      false
    } else {
      *current = lang;
      true
    }
  };
  let running_changed = {
    let mut current = menu
      .focus_running
      .lock()
      .unwrap_or_else(|e| e.into_inner());
    if *current == focus_running {
      false
    } else {
      *current = focus_running;
      true
    }
  };

  if lang_changed {
    let _ = menu.new_task.set_text(label_new_task(lang));
    let _ = menu.open_window.set_text(label_open_window(lang));
    let _ = menu.quit.set_text(label_quit(lang));
    refresh_focus_widget_menu(&app);
  }

  // The toggle's label moves whenever either input to it moves.
  if lang_changed || running_changed {
    let _ = menu
      .toggle_focus
      .set_text(label_toggle_focus(lang, focus_running));
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

/**
 * One file the CSV export wants on disk, as the frontend hands it over: the
 * dated name it should carry (so a second export never lands on the first)
 * and the whole sheet as one string, byte-order mark included.
 */
#[derive(serde::Deserialize)]
struct ExportFile {
  name: String,
  contents: String,
}

/**
 * The CSV export, native side: one folder picker for the whole export, then
 * every file written into it.
 *
 * A folder — not a save dialog per file — because the export is two files
 * that belong together, and asking twice would make the second pick feel
 * like a mistake. The dated names the frontend generates stand in for the
 * filename box a save dialog would have asked about.
 *
 * `Ok(None)` is the reader cancelling; the frontend takes that as nothing
 * happened.
 *
 * The dialog itself is dispatched to the **main thread** via
 * [`run_on_main_thread`], with an mpsc channel carrying the answer back.
 * It has to be: `IFileDialog` on Windows is a COM object that needs an STA
 * thread pumping messages, and a Tauri async command runs on a tokio worker
 * that is neither — called directly from there the picker simply never
 * appears, and the click looks dead. Blocking a worker on `recv()` while the
 * dialog is up is fine: tokio keeps several workers, and the main thread's
 * message pump is doing the waiting work anyway.
 */
#[tauri::command]
async fn save_csv_files(
  window: tauri::WebviewWindow,
  files: Vec<ExportFile>,
) -> Result<Option<String>, String> {
  if window.label() != MAIN_WINDOW {
    return Err("Only the main window may export files".into());
  }
  tauri::async_runtime::spawn_blocking(move || {
    let (tx, rx) = std::sync::mpsc::channel();

    window
      .run_on_main_thread(move || {
        let folder = rfd::FileDialog::new()
          .set_title("选择导出位置 / Choose where to save")
          .pick_folder();
        // The receiver is blocked on this send for as long as the dialog is
        // open, so it cannot go stale even if the window is closed behind it:
        // `run_on_main_thread` tasks finish before teardown completes.
        let _ = tx.send(folder);
      })
      .map_err(|e| e.to_string())?;

    let Some(folder) = rx.recv().map_err(|e| e.to_string())? else {
      return Ok(None);
    };

    for file in &files {
      let path = folder.join(&file.name);
      std::fs::write(&path, file.contents.as_bytes())
        .map_err(|e| format!("{}: {e}", path.display()))?;
    }

    Ok(Some(folder.display().to_string()))
  })
  .await
  .map_err(|e| e.to_string())?
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
    .invoke_handler(tauri::generate_handler![
      greet, sync_tray, save_csv_files, get_focus_widget_enabled,
      set_focus_widget_enabled, focus_widget_layout, open_main_window,
    ])
    .setup(|app| {
      let config_path = app.path().app_config_dir()?.join("focus-widget.json");
      let enabled = read_focus_widget_preference(&config_path);
      app.manage(FocusWidget {
        enabled: AtomicBool::new(enabled),
        operation: Mutex::new(()),
        config_path,
      });
      build_tray(app)?;
      let handle = app.handle().clone();
      tauri::async_runtime::spawn_blocking(move || {
        let state = handle.state::<FocusWidget>();
        let _operation = state.operation.lock().unwrap_or_else(|e| e.into_inner());
        let result = ensure_focus_widget(&handle).and_then(|window| {
          if state.enabled.load(Ordering::SeqCst) {
            window.show().map_err(|e| e.to_string())?;
          }
          Ok(())
        });
        if let Err(error) = result {
          eprintln!("Focus widget startup: {error}");
        }
      });
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
        if window.label() == FOCUS_WIDGET {
          api.prevent_close();
          queue_focus_widget_change(window.app_handle(), Some(false));
        } else if window.label() == MAIN_WINDOW {
          api.prevent_close();
          let _ = window.hide();
        }
      }
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn widget_snaps_to_both_edges_only_within_threshold() {
    for (position, expected) in [(12, 0), (24, 0), (25, 25), (716, 716), (728, 752)] {
      assert_eq!(widget_axis(position, 248, 248, 0, 1000, 24, true), expected);
    }
    assert_eq!(widget_axis(12, 248, 248, 0, 1000, 24, false), 12);
    assert_eq!(widget_axis(24, 76, 76, 0, 1000, 24, true), 0);
    assert_eq!(widget_axis(900, 76, 76, 0, 1000, 24, true), 924);
  }

  #[test]
  fn widget_resize_preserves_bottom_and_right_margins() {
    let expanded = widget_axis(912, 76, 224, 0, 1000, 24, false);
    assert_eq!(expanded, 764);
    assert_eq!(widget_axis(expanded, 224, 76, 0, 1000, 24, false), 912);
    assert_eq!(widget_axis(924, 76, 224, 0, 1000, 24, false), 776);
    assert_eq!(widget_axis(740, 248, 248, 0, 1000, 24, false), 740);
    assert_eq!(widget_axis(12, 76, 224, 0, 1000, 24, false), 12);
  }

  #[test]
  fn widget_geometry_handles_negative_origins_and_scaled_pixels() {
    assert_eq!(widget_axis(-1900, 372, 372, -1920, 1920, 36, true), -1920);
    assert_eq!(widget_axis(-408, 372, 372, -1920, 1920, 36, true), -372);
    assert_eq!(widget_axis(-132, 114, 336, -1080, 1080, 36, false), -354);
    assert_eq!(widget_axis(-5000, 248, 248, -1920, 1920, 24, false), -1920);
    assert_eq!(widget_axis(100, 248, 248, -1920, 1920, 24, false), -248);
    assert_eq!(widget_axis(0, 76, 224, -100, 100, 24, false), -100);
  }

  #[test]
  fn widget_preference_defaults_safely_and_replaces_existing_file() {
    let directory = std::env::temp_dir().join(format!(
      "orkest-focus-widget-test-{}-{}",
      std::process::id(),
      std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos(),
    ));
    let path = directory.join("focus-widget.json");
    assert!(!read_focus_widget_preference(&path));
    write_focus_widget_preference(&path, true).unwrap();
    assert!(read_focus_widget_preference(&path));
    write_focus_widget_preference(&path, false).unwrap();
    assert!(!read_focus_widget_preference(&path));
    for invalid in ["", "null", "{}", "\"true\"", "1", "tru"] {
      std::fs::write(&path, invalid).unwrap();
      assert!(!read_focus_widget_preference(&path));
    }
    write_focus_widget_preference(&path, true).unwrap();
    assert!(read_focus_widget_preference(&path));
    assert!(!path.with_extension(format!("{}.tmp", std::process::id())).exists());
    std::fs::remove_dir_all(directory).unwrap();
  }

  #[test]
  fn widget_capability_does_not_inherit_main_permissions() {
    let capabilities: tauri::utils::acl::capability::CapabilityFile =
      serde_json::from_str(include_str!("../capabilities/default.json")).unwrap();
    let tauri::utils::acl::capability::CapabilityFile::NamedList { capabilities } = capabilities else {
      panic!("Expected separate window capabilities");
    };
    assert_eq!(capabilities.len(), 2);
    assert_eq!(capabilities[0].identifier, "default");
    assert_eq!(capabilities[0].windows, ["main"]);
    assert_eq!(capabilities[1].identifier, "focus-widget");
    assert_eq!(capabilities[1].windows, ["focus-widget"]);
    let value: serde_json::Value =
      serde_json::from_str(include_str!("../capabilities/default.json")).unwrap();
    assert_eq!(value["capabilities"][0]["permissions"], serde_json::json!([
      "core:default", "core:window:allow-set-theme", "opener:default",
    ]));
    assert_eq!(value["capabilities"][1]["permissions"], serde_json::json!([
      "core:default", "core:window:allow-set-position", "core:window:allow-set-theme",
    ]));
  }

  #[test]
  fn widget_menu_labels_follow_language_and_visibility() {
    assert_eq!(label_toggle_widget(Lang::En, false), "Show focus widget");
    assert_eq!(label_toggle_widget(Lang::En, true), "Hide focus widget");
    assert_eq!(label_toggle_widget(Lang::Zh, false), "显示专注悬浮窗");
    assert_eq!(label_toggle_widget(Lang::Zh, true), "隐藏专注悬浮窗");
  }
}
