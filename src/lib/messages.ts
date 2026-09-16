/**
 * UI copy for the languages Orkest speaks.
 *
 * Deliberately a plain module with no React in it: `date.ts`, `selectors.ts`
 * and `store.ts` all produce user-visible strings but are not components, so
 * they need `translate(lang, key)` rather than a context.
 *
 * `zh` is the source of truth for the key set. `en` is typed as
 * `Record<MessageKey, Message>`, which makes the compiler reject both a missing
 * translation and a stray key that no longer exists — the two ways a dictionary
 * quietly rots.
 *
 * A message is normally a string with `{name}` placeholders. Where a language
 * needs real grammar (English plurals) the value may be a function of the
 * variables instead; Chinese never needs one, which is why only the `en` side
 * has any.
 */

export type Language = "zh" | "en";

export const LANGUAGES: Language[] = ["zh", "en"];

/**
 * Each language named in itself, never translated — the standing convention for
 * a language picker. Someone who has landed in a language they cannot read must
 * still be able to recognise their own in the list, and a translated label
 * ("Chinese", "中文") cannot promise that from the wrong side.
 */
export const LANGUAGE_LABELS: Record<Language, string> = {
  zh: "中文",
  en: "English",
};

/**
 * BCP-47 tags for `Intl` and for `<html lang>`.
 *
 * Bare `en` rather than `en-US`: nothing in the app is US-specific (dates are
 * `Sep 20`, not `9/20`), and the shorter tag is what the calendar and date
 * picker match on with `startsWith("en")`.
 */
export const LOCALES: Record<Language, string> = {
  zh: "zh-CN",
  en: "en",
};

export type MessageVars = Record<string, string | number>;
export type Message = string | ((vars: MessageVars) => string);

const zh = {
  /* ── Shared ──────────────────────────────────────────────── */
  "common.all": "全部",
  "common.cancel": "取消",
  "common.save": "保存",
  "common.undo": "撤销",
  "common.clear": "清除",
  "common.priority": "优先级",
  "common.dueDate": "截止日期",
  "common.tags": "标签",

  /* ── Priorities ──────────────────────────────────────────── */
  "priority.urgent": "紧急",
  "priority.urgent.short": "紧急",
  "priority.high": "高优先级",
  "priority.high.short": "高",
  "priority.medium": "中优先级",
  "priority.medium.short": "中",
  "priority.low": "低优先级",
  "priority.low.short": "低",

  /* ── Views ───────────────────────────────────────────────── */
  "view.all": "全部任务",
  "view.today": "今天",
  "view.upcoming": "即将到期",
  "view.overdue": "已逾期",
  "view.starred": "已加星",
  "view.completed": "已完成",

  /* ── Relative dates ──────────────────────────────────────── */
  "date.today": "今天",
  "date.tomorrow": "明天",
  "date.dayAfter": "后天",
  "date.yesterday": "昨天",
  "date.dayBefore": "前天",
  "date.inDays": "{n} 天后",
  "date.inWeek": "一周后",

  /* ── Timestamps on a task card ───────────────────────────── */
  "time.created.justNow": "刚刚创建",
  "time.created.minutes": "{n} 分钟前创建",
  "time.created.hours": "{n} 小时前创建",
  "time.created.yesterday": "昨天创建",
  "time.created.days": "{n} 天前创建",
  "time.created.onDate": "{date} 创建",
  "time.completed.justNow": "刚刚完成",
  "time.completed.minutes": "{n} 分钟前完成",
  "time.completed.hours": "{n} 小时前完成",
  "time.completed.yesterday": "昨天完成",
  "time.completed.days": "{n} 天前完成",
  "time.completed.onDate": "{date} 完成",

  /* ── Due-date buckets (grouping by sort key) ─────────────── */
  "group.overdue": "已逾期",
  "group.today": "今天",
  "group.tomorrow": "明天",
  "group.week": "本周",
  "group.later": "以后",
  "group.none": "未安排",

  /* ── Sidebar ─────────────────────────────────────────────── */
  "sidebar.sectionViews": "视图",
  "sidebar.sectionLists": "清单",
  "sidebar.newList": "新建清单",
  "sidebar.allLists": "所有清单",
  "sidebar.listActions": "{name} 的操作",
  "sidebar.renameList": "重命名",
  "sidebar.deleteList": "删除清单",
  "sidebar.overallProgress": "总体进度",
  "sidebar.overallProgressAria": "总体进度 {progress}%",
  "sidebar.percentDone": "{progress}% 已完成",
  "sidebar.deleteListTitle": "删除清单「{name}」？",
  "sidebar.deleteListBody":
    "清单会被移除，其中的任务不会被删除，而是移动到剩下的第一个清单里。",

  /* ── Lists ───────────────────────────────────────────────── */
  "list.untitled": "未命名清单",
  "list.defaultName": "默认清单",
  "listDialog.createTitle": "新建清单",
  "listDialog.editTitle": "编辑清单",
  "listDialog.description":
    "清单用来把任务按场景分开，比如工作、生活、购物。",
  "listDialog.nameLabel": "名称",
  "listDialog.namePlaceholder": "例如：阅读计划",
  "listDialog.colorLabel": "标记颜色",
  "listDialog.colorHint": "颜色会作为小圆点出现在侧边栏与任务卡片上。",
  "listDialog.preview": "预览",
  "listDialog.create": "创建清单",

  /* ── Appearance ──────────────────────────────────────────── */
  "appearance.aria": "外观设置",
  "appearance.label": "外观",
  "appearance.light": "浅色",
  "appearance.dark": "深色",
  "appearance.system": "跟随系统",
  "appearance.highContrast": "高对比度",

  /* ── Language ────────────────────────────────────────────── */
  "language.aria": "语言设置",
  "language.label": "语言",

  /* ── Toolbar ─────────────────────────────────────────────── */
  "toolbar.searchPlaceholder": "搜索任务…",
  "toolbar.searchAria": "搜索任务",
  "toolbar.sortAria": "排序方式",
  "toolbar.sortPlaceholder": "排序",
  "toolbar.sort.due": "按截止日期",
  "toolbar.sort.priority": "按优先级",
  "toolbar.sort.created": "按创建时间",
  "toolbar.sort.title": "按标题",
  "toolbar.status.all": "全部",
  "toolbar.status.active": "进行中",
  "toolbar.status.completed": "已完成",
  "toolbar.filterAria": "筛选",
  "toolbar.filter": "筛选",
  "toolbar.clearAllFilters": "清除全部筛选",

  /* ── Task card ───────────────────────────────────────────── */
  "todo.markIncomplete": "标记未完成：{title}",
  "todo.markComplete": "完成任务：{title}",
  "todo.star": "加星",
  "todo.unstar": "取消加星",
  "todo.actions": "任务操作",
  "todo.edit": "编辑任务",
  "todo.duplicate": "复制一份",
  "todo.delete": "删除任务",
  "todo.duplicateTitle": "{title}（副本）",
  "todo.duePresets": "快速设置",
  "todo.clearDueDate": "清除日期",

  /* ── Quick add ───────────────────────────────────────────── */
  "quickAdd.placeholder": "添加任务，按 Enter 保存…",
  "quickAdd.aria": "快速添加任务",
  "quickAdd.openEditor": "打开详细编辑",
  "quickAdd.detailButton": "详细",
  "quickAdd.detailHint": "设置截止日期、优先级与子任务",
  "quickAdd.intoList": "加入「{list}」",
  "quickAdd.tagSyntax": "#标签",
  "quickAdd.priorityHint": "优先级",
  "quickAdd.fullEditorHint": "完整编辑",

  /* ── Task editor ─────────────────────────────────────────── */
  "editor.createTitle": "新建任务",
  "editor.editTitle": "编辑任务",
  "editor.createDescription": "把脑子里的事情写下来，然后安排它。",
  "editor.editDescription": "调整内容、优先级与截止时间。",
  "editor.sectionContent": "内容",
  "editor.sectionSchedule": "安排",
  "editor.sectionBreakdown": "拆解",
  "editor.titleLabel": "任务标题",
  "editor.titlePlaceholder": "要做什么？",
  "editor.notesLabel": "备注",
  "editor.notesPlaceholder":
    "补充背景、验收标准，或者任何不想忘掉的细节…",
  "editor.priorityPlaceholder": "选择优先级",
  "editor.listLabel": "所属清单",
  "editor.listPlaceholder": "选择清单",
  "editor.duePlaceholder": "选择截止日期",
  "editor.tagsPlaceholder": "例如：汇报",
  "editor.subtasksLabel": "子任务",
  "editor.subtaskPlaceholder": "拆解成可执行的小步骤",
  "editor.addSubtask": "添加子任务",
  "editor.removeSubtask": "删除子任务 {title}",
  "editor.hintPress": "按",
  "editor.hintAdd": "添加",
  "editor.hintRemoveLast": "删除最后一个",
  "editor.hintSave": "保存",
  "editor.save": "保存修改",
  "editor.add": "添加任务",

  /* ── Main pane ───────────────────────────────────────────── */
  "app.emptyTitle": "还没有任何任务",
  "app.emptyBody":
    "写下第一件要做的事。任务会保存在本地，关闭应用后也不会丢失。",
  "app.noMatchTitle": "没有匹配的任务",
  "app.noMatchBody": "当前视图与筛选条件下没有结果，换个条件试试。",
  "app.clearFilters": "清除筛选",
  "app.newTask": "新建任务",
  "app.itemCount": "{n} 项",
  "app.clearCompleted": "清理已完成任务",
  "app.clearCompletedTitle": "清理 {n} 个已完成任务？",
  "app.clearCompletedBody":
    "这些任务会从列表里移除。删除后仍可用撤销按钮恢复。",
  "app.reconsider": "再想想",
  "app.clear": "清理",

  /* ── Toasts ──────────────────────────────────────────────── */
  "toast.taskAdded": "任务已添加",
  "toast.taskAddedBody": "{title} · 已加入「{list}」",
  "toast.taskCreated": "任务已创建",
  "toast.taskUpdated": "已保存修改",
  "toast.taskDeleted": "任务已删除",
  "toast.taskDuplicated": "已复制任务",
  "toast.listCreated": "清单已创建",
  "toast.listUpdated": "清单已更新",
  "toast.listDeleted": "清单已删除",
  "toast.listDeletedMoved": "其中的任务已移动到「{name}」",
  "toast.listDeletedReassigned": "其中的任务已重新分配",
  "toast.cleared": "已清理 {n} 个已完成任务",
  "toast.clearedBody": "误删了？可以在下面恢复。",
};

export type MessageKey = keyof typeof zh;

const plural = (n: number, one: string, many: string) =>
  n === 1 ? one : many;

const en: Record<MessageKey, Message> = {
  /* ── Shared ──────────────────────────────────────────────── */
  "common.all": "All",
  "common.cancel": "Cancel",
  "common.save": "Save",
  "common.undo": "Undo",
  "common.clear": "Clear",
  "common.priority": "Priority",
  "common.dueDate": "Due date",
  "common.tags": "Tags",

  /* ── Priorities ──────────────────────────────────────────── */
  "priority.urgent": "Urgent",
  "priority.urgent.short": "Urgent",
  "priority.high": "High priority",
  "priority.high.short": "High",
  "priority.medium": "Medium priority",
  "priority.medium.short": "Med",
  "priority.low": "Low priority",
  "priority.low.short": "Low",

  /* ── Views ───────────────────────────────────────────────── */
  "view.all": "All tasks",
  "view.today": "Today",
  "view.upcoming": "Due soon",
  "view.overdue": "Overdue",
  "view.starred": "Starred",
  "view.completed": "Completed",

  /* ── Relative dates ──────────────────────────────────────── */
  "date.today": "Today",
  "date.tomorrow": "Tomorrow",
  "date.dayAfter": "In 2 days",
  "date.yesterday": "Yesterday",
  "date.dayBefore": "2 days ago",
  "date.inDays": ({ n }) => `In ${n} days`,
  "date.inWeek": "In a week",

  /* ── Timestamps on a task card ───────────────────────────── */
  "time.created.justNow": "Created just now",
  "time.created.minutes": ({ n }) =>
    `Created ${n} ${plural(Number(n), "minute", "minutes")} ago`,
  "time.created.hours": ({ n }) =>
    `Created ${n} ${plural(Number(n), "hour", "hours")} ago`,
  "time.created.yesterday": "Created yesterday",
  "time.created.days": ({ n }) =>
    `Created ${n} ${plural(Number(n), "day", "days")} ago`,
  "time.created.onDate": "Created {date}",
  "time.completed.justNow": "Completed just now",
  "time.completed.minutes": ({ n }) =>
    `Completed ${n} ${plural(Number(n), "minute", "minutes")} ago`,
  "time.completed.hours": ({ n }) =>
    `Completed ${n} ${plural(Number(n), "hour", "hours")} ago`,
  "time.completed.yesterday": "Completed yesterday",
  "time.completed.days": ({ n }) =>
    `Completed ${n} ${plural(Number(n), "day", "days")} ago`,
  "time.completed.onDate": "Completed {date}",

  /* ── Due-date buckets ────────────────────────────────────── */
  "group.overdue": "Overdue",
  "group.today": "Today",
  "group.tomorrow": "Tomorrow",
  "group.week": "This week",
  "group.later": "Later",
  "group.none": "No date",

  /* ── Sidebar ─────────────────────────────────────────────── */
  "sidebar.sectionViews": "Views",
  "sidebar.sectionLists": "Lists",
  "sidebar.newList": "New list",
  "sidebar.allLists": "All lists",
  "sidebar.listActions": "Actions for {name}",
  "sidebar.renameList": "Rename",
  "sidebar.deleteList": "Delete list",
  "sidebar.overallProgress": "Overall",
  "sidebar.overallProgressAria": "Overall progress {progress}%",
  "sidebar.percentDone": "{progress}% complete",
  "sidebar.deleteListTitle": "Delete “{name}”?",
  "sidebar.deleteListBody":
    "The list is removed. Its tasks are not deleted — they move to the first remaining list.",

  /* ── Lists ───────────────────────────────────────────────── */
  "list.untitled": "Untitled list",
  "list.defaultName": "Default list",
  "listDialog.createTitle": "New list",
  "listDialog.editTitle": "Edit list",
  "listDialog.description":
    "Lists keep tasks apart by context — work, personal, shopping.",
  "listDialog.nameLabel": "Name",
  "listDialog.namePlaceholder": "e.g. Reading list",
  "listDialog.colorLabel": "Color",
  "listDialog.colorHint":
    "The color shows up as a dot in the sidebar and on task cards.",
  "listDialog.preview": "Preview",
  "listDialog.create": "Create list",

  /* ── Appearance ──────────────────────────────────────────── */
  "appearance.aria": "Appearance settings",
  "appearance.label": "Appearance",
  "appearance.light": "Light",
  "appearance.dark": "Dark",
  "appearance.system": "System",
  "appearance.highContrast": "High contrast",

  /* ── Language ────────────────────────────────────────────── */
  "language.aria": "Language settings",
  "language.label": "Language",

  /* ── Toolbar ─────────────────────────────────────────────── */
  "toolbar.searchPlaceholder": "Search tasks…",
  "toolbar.searchAria": "Search tasks",
  "toolbar.sortAria": "Sort by",
  "toolbar.sortPlaceholder": "Sort",
  "toolbar.sort.due": "By due date",
  "toolbar.sort.priority": "By priority",
  "toolbar.sort.created": "By created date",
  "toolbar.sort.title": "By title",
  "toolbar.status.all": "All",
  "toolbar.status.active": "Active",
  "toolbar.status.completed": "Completed",
  "toolbar.filterAria": "Filters",
  "toolbar.filter": "Filter",
  "toolbar.clearAllFilters": "Clear all filters",

  /* ── Task card ───────────────────────────────────────────── */
  "todo.markIncomplete": "Mark as not done: {title}",
  "todo.markComplete": "Complete task: {title}",
  "todo.star": "Star",
  "todo.unstar": "Unstar",
  "todo.actions": "Task actions",
  "todo.edit": "Edit task",
  "todo.duplicate": "Duplicate",
  "todo.delete": "Delete task",
  "todo.duplicateTitle": "{title} (copy)",
  "todo.duePresets": "Quick set",
  "todo.clearDueDate": "Clear date",

  /* ── Quick add ───────────────────────────────────────────── */
  "quickAdd.placeholder": "Add a task, press Enter to save…",
  "quickAdd.aria": "Quick add a task",
  "quickAdd.openEditor": "Open the full editor",
  "quickAdd.detailButton": "Details",
  "quickAdd.detailHint": "Set a due date, priority and subtasks",
  "quickAdd.intoList": "Into “{list}”",
  "quickAdd.tagSyntax": "#tag",
  "quickAdd.priorityHint": "priority",
  "quickAdd.fullEditorHint": "Full editor",

  /* ── Task editor ─────────────────────────────────────────── */
  "editor.createTitle": "New task",
  "editor.editTitle": "Edit task",
  "editor.createDescription": "Write it down, then schedule it.",
  "editor.editDescription": "Adjust the content, priority and due date.",
  "editor.sectionContent": "Content",
  "editor.sectionSchedule": "Schedule",
  "editor.sectionBreakdown": "Breakdown",
  "editor.titleLabel": "Title",
  "editor.titlePlaceholder": "What needs doing?",
  "editor.notesLabel": "Notes",
  "editor.notesPlaceholder":
    "Background, acceptance criteria, or any detail you would rather not forget…",
  "editor.priorityPlaceholder": "Choose a priority",
  "editor.listLabel": "List",
  "editor.listPlaceholder": "Choose a list",
  "editor.duePlaceholder": "Choose a due date",
  "editor.tagsPlaceholder": "e.g. reporting",
  "editor.subtasksLabel": "Subtasks",
  "editor.subtaskPlaceholder": "Break it into small, doable steps",
  "editor.addSubtask": "Add subtask",
  "editor.removeSubtask": "Remove subtask {title}",
  "editor.hintPress": "Press",
  "editor.hintAdd": "to add",
  "editor.hintRemoveLast": "to remove the last one",
  "editor.hintSave": "to save",
  "editor.save": "Save changes",
  "editor.add": "Add task",

  /* ── Main pane ───────────────────────────────────────────── */
  "app.emptyTitle": "No tasks yet",
  "app.emptyBody":
    "Write down the first thing you need to do. Tasks are stored locally and survive closing the app.",
  "app.noMatchTitle": "No matching tasks",
  "app.noMatchBody":
    "Nothing matches the current view and filters. Try loosening them.",
  "app.clearFilters": "Clear filters",
  "app.newTask": "New task",
  "app.itemCount": ({ n }) => `${n} ${plural(Number(n), "item", "items")}`,
  "app.clearCompleted": "Clear completed",
  "app.clearCompletedTitle": ({ n }) =>
    `Clear ${n} completed ${plural(Number(n), "task", "tasks")}?`,
  "app.clearCompletedBody":
    "These tasks are removed from the list. You can still bring them back with Undo.",
  "app.reconsider": "Keep them",
  "app.clear": "Clear",

  /* ── Toasts ──────────────────────────────────────────────── */
  "toast.taskAdded": "Task added",
  "toast.taskAddedBody": "{title} · added to “{list}”",
  "toast.taskCreated": "Task created",
  "toast.taskUpdated": "Changes saved",
  "toast.taskDeleted": "Task deleted",
  "toast.taskDuplicated": "Task duplicated",
  "toast.listCreated": "List created",
  "toast.listUpdated": "List updated",
  "toast.listDeleted": "List deleted",
  "toast.listDeletedMoved": "Its tasks moved to “{name}”",
  "toast.listDeletedReassigned": "Its tasks were reassigned",
  "toast.cleared": ({ n }) =>
    `Cleared ${n} completed ${plural(Number(n), "task", "tasks")}`,
  "toast.clearedBody": "Deleted them by mistake? Recover them below.",
};

export const DICTS: Record<Language, Record<MessageKey, Message>> = {
  zh,
  en,
};

function interpolate(template: string, vars?: MessageVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match
  );
}

/**
 * The one place a message is resolved. Kept separate from the React layer so
 * non-component modules (`date.ts`, `selectors.ts`) can use it without dragging
 * a context in.
 *
 * Missing keys fall back to the key itself rather than throwing: a stray string
 * in the UI is a far cheaper failure than a blank screen.
 */
export function translate(
  lang: Language,
  key: MessageKey,
  vars?: MessageVars
): string {
  const message = DICTS[lang]?.[key] ?? DICTS.en[key] ?? key;
  return typeof message === "function" ? message(vars ?? {}) : interpolate(message, vars);
}
