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

/// Serialized result of a widget layout pass, so the widget webview can
/// mirror the docked state without guessing from window geometry.
#[derive(Debug, Clone, serde::Serialize)]
struct WidgetLayoutState {
  docked: bool,
  edge: Option<&'static str>,
}

impl WidgetLayoutState {
  const fn floating() -> Self {
    Self { docked: false, edge: None }
  }
}

/// A widget is "docked" when its window is one of the small edge tabs.
/// Pill is 248 logical wide, expanded pill too, tabs are 48 or 96 wide.
fn widget_is_docked(width: i64, height: i64, scale: f64) -> bool {
  // Left/right tabs are 36 wide; the top tab keeps the pill's 216 width but
  // is only 36 tall. The pill itself is 216x76.
  (width as f64 / scale) < 160.0 || (height as f64 / scale) < 60.0
}

/// Picks the nearest work-area edge within `threshold`, or `None` when the
/// pointer floats far from every edge. Docking to the bottom edge is
/// disabled by design; ties resolve left, right, top.
fn dock_edge(left: i64, right: i64, top: i64, threshold: i64) -> Option<&'static str> {
  let candidates = [("left", left), ("right", right), ("top", top)];
  let mut best: Option<(&'static str, i64)> = None;
  for (edge, gap) in candidates {
    if gap < 0 || gap > threshold {
      continue;
    }
    match best {
      Some((_, current)) if current <= gap => {}
      _ => best = Some((edge, gap)),
    }
  }
  best.map(|(edge, _)| edge)
}

/// Gap between each work-area edge (left, right, top, bottom) and a rect,
/// clamped at zero: a rect overlapping the edge counts as touching it, so a
/// widget dragged halfway past the edge still docks.
fn dock_gaps(
  position: (i64, i64),
  size: (i64, i64),
  area: (i64, i64, i64, i64),
) -> (i64, i64, i64, i64) {
  let (area_x, area_y, area_w, area_h) = area;
  (
    (position.0 - area_x).max(0),
    (area_x + area_w - position.0 - size.0).max(0),
    (position.1 - area_y).max(0),
    (area_y + area_h - position.1 - size.1).max(0),
  )
}

/// Position for the small edge tab: flush against the chosen edge, centered
/// on `anchor` (the pointer or window center) along that edge, clamped inside
/// the work area.
fn docked_tab(
  edge: &str,
  anchor: (i64, i64),
  area: (i64, i64, i64, i64),
  tab: (i64, i64),
) -> (i64, i64) {
  let (area_x, area_y, area_w, area_h) = area;
  let clamp_x = |x: i64| x.clamp(area_x, (area_x + area_w - tab.0).max(area_x));
  let clamp_y = |y: i64| y.clamp(area_y, (area_y + area_h - tab.1).max(area_y));
  match edge {
    "left" => (area_x, clamp_y(anchor.1 - tab.1 / 2)),
    "right" => (area_x + area_w - tab.0, clamp_y(anchor.1 - tab.1 / 2)),
    "top" => (clamp_x(anchor.0 - tab.0 / 2), area_y),
    _ => (clamp_x(anchor.0 - tab.0 / 2), area_y + area_h - tab.1),
  }
}

fn layout_focus_widget(
  window: &tauri::WebviewWindow,
  expanded: bool,
  snap: bool,
  dock: bool,
  cursor: Option<(i32, i32)>,
) -> Result<WidgetLayoutState, String> {
  let monitor = window.current_monitor().map_err(|e| e.to_string())?
    .or(window.primary_monitor().map_err(|e| e.to_string())?)
    .ok_or("No monitor available for focus widget")?;
  let area = monitor.work_area();
  let scale = monitor.scale_factor();
  let position = window.outer_position().map_err(|e| e.to_string())?;
  let old_size = window.outer_size().map_err(|e| e.to_string())?;
  let area_x = area.position.x as i64;
  let area_y = area.position.y as i64;
  let area_w = area.size.width as i64;
  let area_h = area.size.height as i64;
  let threshold = (24.0 * scale).round() as i64;
  if dock {
    let dock_threshold = (64.0 * scale).round() as i64;
    // Prefer the pointer position: the dragged window cannot reach the edge
    // by its own rect (the grab offset keeps it away) and may overlap it, so
    // the cursor is what reliably tells "the user pushed it into the edge".
    let (gaps, anchor) = match cursor {
      Some((cx, cy)) => (
        dock_gaps((cx as i64, cy as i64), (0, 0), (area_x, area_y, area_w, area_h)),
        (cx as i64, cy as i64),
      ),
      None => (
        dock_gaps(
          (position.x as i64, position.y as i64),
          (old_size.width as i64, old_size.height as i64),
          (area_x, area_y, area_w, area_h),
        ),
        (
          position.x as i64 + old_size.width as i64 / 2,
          position.y as i64 + old_size.height as i64 / 2,
        ),
      ),
    };
    let edge = dock_edge(gaps.0, gaps.1, gaps.2, dock_threshold);
    if let Some(edge) = edge {
      // Tab height matches the collapsed pill (76) so hover expansion does
      // not change the tab's visible height; the top tab spans the pill's
      // full width (216).
      let (tab_w, tab_h) = if edge == "left" || edge == "right" { (36.0, 76.0) } else { (216.0, 36.0) };
      let size = tauri::LogicalSize::new(tab_w, tab_h).to_physical::<u32>(scale);
      let (x, y) = docked_tab(
        edge,
        anchor,
        (area_x, area_y, area_w, area_h),
        (size.width as i64, size.height as i64),
      );
      window.set_size(size).map_err(|e| e.to_string())?;
      window.set_position(tauri::PhysicalPosition::new(x as i32, y as i32))
        .map_err(|e| e.to_string())?;
      return Ok(WidgetLayoutState { docked: true, edge: Some(edge) });
    }
  }
  let size = tauri::LogicalSize::new(216.0, if expanded { 246.0 } else { 76.0 })
    .to_physical::<u32>(scale);
  // Expanding out of a docked tab keeps the center fixed so hover
  // expand/collapse cycles do not drift the pill along the edge.
  let (x, y) = if !dock && widget_is_docked(old_size.width as i64, old_size.height as i64, scale) {
    (
      position.x as i64 + (old_size.width as i64 - size.width as i64) / 2,
      position.y as i64 + (old_size.height as i64 - size.height as i64) / 2,
    )
  } else {
    (position.x as i64, position.y as i64)
  };
  let x = widget_axis(
    x, size.width as i64, size.width as i64,
    area_x, area_w, threshold, snap,
  );
  let y = widget_axis(
    y, size.height as i64, size.height as i64,
    area_y, area_h, threshold, snap,
  );
  window.set_size(size).map_err(|e| e.to_string())?;
  window.set_position(tauri::PhysicalPosition::new(x as i32, y as i32))
    .map_err(|e| e.to_string())?;
  Ok(WidgetLayoutState::floating())
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
    .inner_size(216.0, 76.0)
    .visible(false)
    .focused(false)
    // Transparent on every platform, macOS included — the pill is painted at 85%
    // (`--widget-surface` in globals.css) and that alpha only reaches the desktop
    // when the window behind it is transparent. On macOS this method exists
    // solely under the `macos-private-api` feature, which is why both
    // `macOSPrivateApi: true` (tauri.conf.json) and the Cargo feature of the same
    // name are set; `tauri-build` fails the build if the two ever disagree. The
    // previous `#[cfg(not(target_os = "macos"))]` gate was the price of not
    // enabling it — an opaque window on macOS is what turned the 85% surface into
    // a washed-out grey there.
    .transparent(true);
  let window = builder.build().map_err(|e| e.to_string())?;
  let result = (|| -> Result<(), String> {
    window.set_min_size(None::<tauri::LogicalSize<f64>>).map_err(|e| e.to_string())?;
    let monitor = app.get_webview_window(MAIN_WINDOW)
      .and_then(|main| main.current_monitor().ok().flatten())
      .or(app.primary_monitor().map_err(|e| e.to_string())?)
      .ok_or("No monitor available for focus widget")?;
    let area = monitor.work_area();
    let scale = monitor.scale_factor();
    let size = tauri::LogicalSize::new(216.0, 76.0).to_physical::<u32>(scale);
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
      let scale = window.scale_factor().map_err(|e| e.to_string())?;
      let inner = window.inner_size().map_err(|e| e.to_string())?;
      let expanded = inner.height as f64 / scale > 150.0;
      let docked = widget_is_docked(inner.width as i64, inner.height as i64, scale);
      layout_focus_widget(window, expanded, false, docked, None)?;
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
async fn focus_widget_layout(
  window: tauri::WebviewWindow,
  expanded: bool,
  snap: bool,
  dock: Option<bool>,
  cursor_x: Option<i32>,
  cursor_y: Option<i32>,
) -> Result<WidgetLayoutState, String> {
  if window.label() != FOCUS_WIDGET {
    return Err("Only the focus widget may change its layout".into());
  }
  tauri::async_runtime::spawn_blocking(move || {
    let state = window.state::<FocusWidget>();
    let _operation = state.operation.lock().unwrap_or_else(|e| e.into_inner());
    layout_focus_widget(&window, expanded, snap, dock.unwrap_or(false), cursor_x.zip(cursor_y))
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
 * Orkest is a tray-resident app: the window can be parked in the system tray
 * (see 「关闭窗口时最小化到托盘」, which is what the close button does when it is
 * on), so the tray icon is one of the ways back to the window — and, for as long
 * as the process is up, the tray menu is the one route to everything the window
 * is not: the views, the focus switch, 退出.
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

/**
 * The channel Rust uses to ask the frontend to wrap up before the process ends.
 *
 * The tray's 退出 cannot simply call `app.exit(0)`: the focus log is a
 * localStorage record the native side cannot reach, so 「退出时自动结束专注」 is a
 * rule only the webview can carry out. The click asks, and the frontend answers
 * by calling [`quit_app`].
 */
const QUIT_REQUESTED: &str = "quit:requested";

/**
 * How long [`request_quit`] waits for that answer before ending the process
 * anyway.
 *
 * Generous next to the round trip it covers — one localStorage write and one
 * IPC call — and only ever spent in full when there is nobody left to answer:
 * a crashed renderer, or a window that never finished loading.
 */
const QUIT_FALLBACK: std::time::Duration = std::time::Duration::from_millis(1500);

/**
 * 关闭窗口: what the ✕ button does with the app.
 *
 * Two answers, one switch. With `to_tray` set, the window is hidden and the app
 * keeps running in the tray — the behaviour this used to have unconditionally.
 * Without it, closing the window leaves the app, and it leaves through
 * [`request_quit`]: 「退出应用时结束进行中的专注」 then covers the ✕ and the tray's
 * 退出 with one rule rather than two.
 *
 * Pushed down from the frontend instead of asked of it, unlike `quitStopsFocus`
 * (which lives only in `settings.ts`). A close request has to be answered
 * *inside* the window event handler — `prevent_close` is a decision taken there
 * and then, with no round trip to hide a question behind — so the webview
 * pushes the answer once on boot and again whenever the switch moves, and this
 * is where it lands.
 */
#[derive(Default)]
struct WindowClose {
  /** `Default` is the shipped answer, and it is `false`: 关闭窗口 leaves the
      app. Keeping a window that never loaded able to close is a free second
      reason. */
  to_tray: AtomicBool,
}

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
/// undone: 最小化 leaves it *visible but minimized*, while the close button (see
/// `on_window_event` below) hides it outright when 「关闭窗口时最小化到托盘」 is
/// on. `show()` alone would leave a minimized window sitting in the taskbar.
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

/**
 * 托盘里的「退出 Orkest Todo」, asked rather than taken — and the route the
 * close button now takes as well, whenever 「关闭窗口时最小化到托盘」 is off.
 *
 * This row used to end the process on the spot, and that is still what happens
 * — via the fallback below. What changed is that it is no longer the *first*
 * move: whether a session should be closed on the way out is a preference the
 * webview holds, and only the webview can close one, so the exit is the
 * frontend's answer to a question rather than a decision taken here.
 *
 * The fallback thread is armed before the ask, not after it: a webview that is
 * gone — a crashed renderer, a window that never finished loading — must not be
 * able to turn 退出 into a button that does nothing. In the ordinary case the
 * process is already gone when the sleep ends, and the thread goes with it.
 */
fn request_quit(app: &AppHandle) {
  let handle = app.clone();
  std::thread::spawn(move || {
    std::thread::sleep(QUIT_FALLBACK);
    handle.exit(0);
  });
  let _ = app.emit_to(MAIN_WINDOW, QUIT_REQUESTED, ());
}

/**
 * The frontend's answer to [`QUIT_REQUESTED`]: it has done whatever it wanted to
 * do before the process ends, so end it now.
 *
 * The main window alone, unlike the widget-facing commands. The widget may drive
 * the tray's own row (see `authorize_widget_control`), but a small floating pill
 * that can close the whole app is not a thing anything on it should mean.
 */
#[tauri::command]
fn quit_app(window: tauri::WebviewWindow, app: AppHandle) -> Result<(), String> {
  if window.label() != MAIN_WINDOW {
    return Err("Only the main window may quit the app".into());
  }
  app.exit(0);
  Ok(())
}

/**
 * The frontend's answer to "what should the ✕ do", pushed down on boot and
 * whenever the switch moves. See [`WindowClose`] for why it is pushed at all.
 *
 * Main window only, like [`quit_app`]: how the app leaves is not something the
 * floating pill should be able to decide for it.
 */
#[tauri::command]
fn set_close_to_tray(
  window: tauri::WebviewWindow,
  app: AppHandle,
  close_to_tray: bool,
) -> Result<(), String> {
  if window.label() != MAIN_WINDOW {
    return Err("Only the main window may decide how the app closes".into());
  }
  if let Some(state) = app.try_state::<WindowClose>() {
    state.to_tray.store(close_to_tray, Ordering::SeqCst);
  }
  Ok(())
}

/**
 * The OS-wide chord, registered and unregistered from here — never held open
 * behind the reader's back.
 *
 * It lands on the same [`TrayCommand`] channel the native menu uses, so a
 * keyboard shortcut and a menu click are one behaviour with two doors. The
 * settings page mirrors its switch down on boot and on every change; `false`
 * unregisters it, so the chord is dead the moment the setting says so.
 *
 * Note what is *not* here: the old `ctrl+alt+n`. 新建任务 still has two doors
 * of its own — the tray menu's row, which raises the window the way this chord
 * did (see [`build_tray`]), and the window's own Ctrl/⌘+N. A chord that raises
 * a window is the shape most likely to be taken already by something else on
 * the machine, and dropping it left the one chord that is genuinely useful
 * from behind the window: the focus switch.
 *
 * A chord another app already holds fails to register; the error travels back
 * to the caller rather than being swallowed, because a shortcut that silently
 * does nothing reads as a broken app.
 */
#[tauri::command]
fn set_global_shortcuts(
  window: tauri::WebviewWindow,
  app: AppHandle,
  enabled: bool,
) -> Result<(), String> {
  if window.label() != MAIN_WINDOW {
    return Err("Only the main window may own the global shortcuts".into());
  }
  use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

  if !enabled {
    app
      .global_shortcut()
      .unregister_all()
      .map_err(|e| e.to_string())?;
    return Ok(());
  }

  app
    .global_shortcut()
    .on_shortcut("ctrl+alt+f", |app, _shortcut, event| {
      if event.state() == ShortcutState::Pressed {
        emit_command(app, TrayCommand::ToggleFocus);
      }
    })
    .map_err(|e| e.to_string())?;
  Ok(())
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
      // Asked first rather than taken: the frontend may have a session to close
      // on the way out. See `request_quit` for the fallback that keeps a dead
      // webview from stranding the app. Deliberately NOT `window.close()`: that
      // request is intercepted below and would only hide the window again.
      MENU_QUIT => request_quit(app),
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
   * This matters whenever the window is parked rather than closed — the tray
   * toggle, and the ✕ itself under 「关闭窗口时最小化到托盘」. "我以为已经退出了、其实
   * 还在后台" is a normal state there, and the obvious
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

  /*
   * 开机自启.
   *
   * The plugin owns the whole feature, and that is the point: the login item it
   * writes *is* the state, so nothing in this crate mirrors it. The settings
   * page asks the plugin — and therefore the OS — what the answer is, and
   * writes back through it the same way. A boolean kept on our side would be a
   * second answer that can disagree with the system: 任务管理器's 启动 tab owns
   * one, so does a manual edit of the LaunchAgent.
   *
   * `LaunchAgent` is macOS's shape of that login item. It writes a plist we can
   * remove again, and unlike `AppleScript` it never asks the user for
   * Automation permission. Windows and Linux ignore the choice and use their
   * own mechanisms — the `Run` key, an autostart `.desktop`.
   *
   * Gated on desktop like the plugin itself, which is compiled out entirely on
   * Android/iOS: there is no login item there to write.
   *
   * `None` is the argument list: an autostarted launch carries no marker and is
   * an ordinary launch, window and all. Nothing in the app branches on how it
   * was started, so a marker would be an argument nobody reads.
   */
  #[cfg(desktop)]
  let builder = builder.plugin(tauri_plugin_autostart::init(
    tauri_plugin_autostart::MacosLauncher::LaunchAgent,
    None,
  ));

  builder
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_global_shortcut::Builder::new().build())
    .invoke_handler(tauri::generate_handler![
      greet, sync_tray, save_csv_files, get_focus_widget_enabled,
      set_focus_widget_enabled, focus_widget_layout, open_main_window, quit_app,
      set_close_to_tray, set_global_shortcuts,
    ])
    .setup(|app| {
      let config_path = app.path().app_config_dir()?.join("focus-widget.json");
      let enabled = read_focus_widget_preference(&config_path);
      app.manage(FocusWidget {
        enabled: AtomicBool::new(enabled),
        operation: Mutex::new(()),
        config_path,
      });
      // Defaults to the shipped answer until the webview says otherwise; the
      // window cannot be closed by anyone before it has painted, so the push
      // that follows the first render always beats the first ✕.
      app.manage(WindowClose::default());
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
         * 「关闭窗口」 — two answers, one switch, read here.
         *
         * Parked in the tray, or the ordinary exit. The tray answer is what this
         * used to do unconditionally and is still what 「关闭窗口时最小化到托盘」
         * asks for; the other answer leaves the app, and it leaves through the
         * same `request_quit` the tray's 退出 uses — so a running session is
         * closed on the way out whichever door was taken, under one rule.
         *
         * The request is prevented first either way, because the decision is
         * ours to carry out: `window.close()` and `window.destroy()` both land
         * straight back here. Both answers cover every close path — the ✕
         * button, Alt+F4 and the taskbar's 关闭窗口 menu item.
         */
        if window.label() == FOCUS_WIDGET {
          api.prevent_close();
          queue_focus_widget_change(window.app_handle(), Some(false));
        } else if window.label() == MAIN_WINDOW {
          api.prevent_close();
          let to_tray = window
            .app_handle()
            .try_state::<WindowClose>()
            .map(|state| state.to_tray.load(Ordering::SeqCst))
            .unwrap_or(false);
          if to_tray {
            let _ = window.hide();
          } else {
            request_quit(window.app_handle());
          }
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
  fn dock_gaps_clamp_overlap_and_measure_pointer_distances() {
    let area = (0, 0, 1000, 1000);
    // Pill dragged 124px past the left edge: rect overlap still counts as
    // touching the edge instead of being skipped.
    assert_eq!(dock_gaps((-124, 500), (248, 76), area), (0, 876, 500, 424));
    // Pointer gaps are just distances to each edge (size 0 rect).
    assert_eq!(dock_gaps((2, 500), (0, 0), area), (2, 998, 500, 500));
    assert_eq!(dock_gaps((998, 500), (0, 0), area), (998, 2, 500, 500));
    // Pointer or rect outside the work area clamps to zero.
    assert_eq!(dock_gaps((-50, -50), (0, 0), area), (0, 1050, 0, 1050));
  }

  #[test]
  fn dock_edge_picks_nearest_edge_within_threshold_only() {
    assert_eq!(dock_edge(0, 752, 400, 48), Some("left"));
    assert_eq!(dock_edge(8, 744, 400, 48), Some("left"));
    assert_eq!(dock_edge(48, 704, 400, 48), Some("left"));
    assert_eq!(dock_edge(49, 703, 400, 48), None);
    assert_eq!(dock_edge(752, 0, 400, 48), Some("right"));
    assert_eq!(dock_edge(400, 324, 0, 48), Some("top"));
    // Bottom-edge docking is disabled: a tiny bottom gap alone never docks.
    assert_eq!(dock_edge(400, 324, 752, 48), None);
    assert_eq!(dock_edge(400, 400, 400, 48), None);
    assert_eq!(dock_edge(12, 400, 12, 48), Some("left"));
    assert_eq!(dock_edge(400, 12, 12, 48), Some("right"));
  }

  #[test]
  fn docked_tab_flush_to_edge_and_centered_on_anchor() {
    // Anchor is the pointer (or window center): pill 248x76 at (100, 500)
    // has its center at (224, 538); 48x96 / 96x48 tab, 1000x1000 work area.
    let area = (0, 0, 1000, 1000);
    assert_eq!(docked_tab("left", (224, 538), area, (48, 96)), (0, 490));
    assert_eq!(docked_tab("right", (224, 538), area, (48, 96)), (952, 490));
    assert_eq!(docked_tab("top", (224, 538), area, (96, 48)), (176, 0));
    assert_eq!(docked_tab("bottom", (224, 538), area, (96, 48)), (176, 952));
    // Anchoring clamps inside the work area at corners.
    assert_eq!(docked_tab("left", (124, 48), area, (48, 96)), (0, 0));
    assert_eq!(docked_tab("left", (124, 1028), area, (48, 96)), (0, 904));
    assert_eq!(docked_tab("top", (86, 38), area, (96, 48)), (38, 0));
  }

  #[test]
  fn widget_is_docked_matches_tab_sizes_only() {
    // Left/right tab 36x76, top tab 216x36, pill 216x76, expanded 216x246.
    assert!(widget_is_docked(36, 76, 1.0));
    assert!(widget_is_docked(216, 36, 1.0));
    assert!(!widget_is_docked(216, 76, 1.0));
    assert!(!widget_is_docked(216, 246, 1.0));
    assert!(widget_is_docked(45, 95, 1.25));
    assert!(!widget_is_docked(270, 95, 1.25));
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
      "autostart:default", "global-shortcut:default",
    ]));
    assert_eq!(value["capabilities"][1]["permissions"], serde_json::json!([
      "core:default", "core:window:allow-set-position",
      "core:window:allow-cursor-position", "core:window:allow-set-theme",
    ]));
  }

  #[test]
  fn widget_menu_labels_follow_language_and_visibility() {
    assert_eq!(label_toggle_widget(Lang::En, false), "Show focus widget");
    assert_eq!(label_toggle_widget(Lang::En, true), "Hide focus widget");
    assert_eq!(label_toggle_widget(Lang::Zh, false), "显示专注悬浮窗");
    assert_eq!(label_toggle_widget(Lang::Zh, true), "隐藏专注悬浮窗");
  }

  /// There is no compile-time bridge between the two languages, and the one
  /// mismatch that can hide is this event's name: a rename on either side costs
  /// a stalled exit — the fallback ends the process with no session ever closed
  /// — which reads as the setting simply not working. So it is pinned here, the
  /// way the tray's view ids are pinned by the runtime guard in `tray.ts`.
  #[test]
  fn quit_event_name_matches_the_frontend_listener() {
    let source = include_str!("../../src/lib/quit.ts");
    assert!(source.contains(&format!("\"{QUIT_REQUESTED}\"")));
  }

  /// Both halves of the same silence. A rename here would not break a build
  /// either: the ✕ would simply stop consulting the switch and keep parking the
  /// app in the tray, which reads as the setting having no effect.
  #[test]
  fn close_to_tray_command_name_matches_the_frontend_caller() {
    let source = include_str!("../../src/lib/quit.ts");
    assert!(source.contains("\"set_close_to_tray\""));
  }

  /// The one chord the settings page promises — `ctrl+alt+f` flips the focus
  /// switch — pinned here the way the close behaviour is above: a rename costs
  /// nothing at build time and shows up only as a chord that stops matching
  /// its hint.
  ///
  /// Only ever asserted *forward*. A "this chord must not exist" line would
  /// read the same characters a comment explaining the removal does, and would
  /// fail on prose rather than on behaviour.
  #[test]
  fn global_shortcut_names_match_the_frontend_hint() {
    let frontend = include_str!("../../src/lib/global-shortcut.ts");
    assert!(frontend.contains("Ctrl+Alt+F"));
    let backend = include_str!("lib.rs");
    assert!(backend.contains("\"ctrl+alt+f\""));
    assert!(backend.contains("set_global_shortcuts"));
  }

  /// The shipped answer, and it has to stay `false` to match
  /// `DEFAULTS.closeToTray` in `settings.ts`: a window that closes takes the app
  /// with it unless someone asked for the tray.
  #[test]
  fn window_close_defaults_to_leaving_the_app() {
    assert!(!WindowClose::default().to_tray.load(Ordering::SeqCst));
  }
}
