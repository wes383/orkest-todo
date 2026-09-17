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
  "sidebar.hideView": "隐藏视图",
  "sidebar.sectionLists": "清单",
  "sidebar.newList": "新建清单",
  "sidebar.allLists": "所有清单",
  "sidebar.listActions": "{name} 的操作",
  "sidebar.renameList": "重命名",
  "sidebar.deleteList": "删除清单",
  "sidebar.deleteListTitle": "删除清单「{name}」？",
  "sidebar.deleteListBody":
    "清单会被移除，其中的任务不会被删除，而是移动到剩下的第一个清单里。这个清单的专注记录会保留，但会变为未归类。",

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

  /* ── Screens & settings page ─────────────────────────────── */
  "screen.stats": "统计",
  "screen.settings": "设置",
  "settings.sectionAppearance": "外观",
  "settings.sectionLanguage": "语言",
  "settings.sectionSidebar": "侧边栏",
  "settings.sidebarHint": "选择在侧边栏中显示哪些视图。",
  "settings.sectionFocus": "专注",
  "settings.focusWidget": "桌面专注小组件",
  "settings.focusWidgetHint": "始终置顶，可拖拽吸附到屏幕边缘；下次启动保留开关状态。",
  "settings.focusWidgetDesktopOnly": "仅桌面应用支持。",
  "widget.idle": "休息中",
  "widget.useful": "专注中",
  "widget.start": "开始专注",
  "widget.stop": "结束专注",
  "widget.openMain": "打开主窗口",
  "widget.hide": "隐藏小组件",
  "widget.expand": "展开操作",
  "widget.collapse": "收起操作",
  "widget.dockHint": "已吸附屏幕边缘 · 鼠标靠近自动展开",
  "widget.list": "所属清单",
  "widget.loading": "正在同步…",
  "widget.error": "操作失败，请重试",
  "widget.disconnected": "等待主窗口连接",
  "settings.minSpan": "最短专注片段",
  "settings.minSpanHint": "关闭时短于此时长（分钟）的片段会被丢弃；已记录的专注不受影响。",
  "settings.maxSpan": "进行中片段的上限",
  "settings.maxSpanHint": "进行中的片段最多计此时长（小时）；已结束的片段不受影响。",
  "settings.sectionData": "数据",
  "settings.sectionDanger": "危险区",
  "settings.deleteAll": "删除所有数据",
  "settings.deleteAllHint":
    "清除全部任务、清单与专注记录，无法撤销。设置（外观、语言等）会保留。",
  "settings.deleteAllAction": "删除",
  "settings.deleteAllTitle": "删除所有数据？",
  "settings.deleteAllBody":
    "全部任务、清单和专注记录将被永久删除，此操作无法撤销。",
  "settings.deleteAllType": "输入 {keyword} 以确认",
  "settings.deleteAllDone": "已删除所有数据",
  "settings.theme": "主题",

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
  "blank.filterStatus": "筛选状态",
  "blank.filterPriority": "筛选优先级",
  "blank.filterTag": "筛选标签",
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
  "recur.label": "重复",
  "recur.none": "不重复",
  "recur.dailyItem": "每 x 天",
  "recur.everyDay": "每天",
  "recur.everyNDays": "每 {n} 天",
  "recur.weekly": "每周",
  "recur.weekdaysItem": "每周的几天",
  "recur.weeklyOn": "每周{days}",
  "recur.monthly": "每月",
  "recur.yearly": "每年",
  "recur.intervalLabel": "间隔（天）",
  "recur.weekdaysLabel": "周几",
  "recur.hint": "完成后会自动创建下一次任务",
  "recur.needsDue": "先设置截止日期，才能设置重复",
  "toast.recurSpawned": "已完成，已生成下一次任务",
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

  /* ── Focus ───────────────────────────────────────────────── */
  "focus.title": "专注",
  "focus.state.idle": "我在休息。",
  "focus.state.useful": "我在做有用的事。",
  "focus.rail.aria": "打开专注日志",
  "focus.rail.band": "从 {from} 到 {to}，我在做有用的事。",
  "focus.today.none": "今天还没有记录有用时间",
  "focus.today.total": "今天：{value} 花在有用的事上，占一天的 {pct}%",
  "focus.keys": "← → 拨动开关",

  /* ── Focus · the list a stretch belongs to ───────────────── */
  "focus.unassigned": "未归类",
  "focus.session.label": "归属清单",
  "focus.session.elapsed": "已进行 {value}",

  /* ── Focus · durations, clocks and hour names ────────────── */
  "focus.duration.seconds": "{n} 秒",
  "focus.duration.minutes": "{n} 分钟",
  "focus.duration.hours": "{n} 小时",
  "focus.duration.hoursMinutes": "{h} 小时 {m} 分",
  "focus.hour.am": "上午{h}点",
  "focus.hour.pm": "下午{h}点",
  "focus.hour.h24": "{h}时",
  "focus.midnight": "午夜",
  "focus.weekNumber": "{n}周",
  "focus.delta.none": "没有变化",

  "focus.period.day": "今天",
  "focus.period.week": "本周",
  "focus.period.month": "本月",
  "focus.period.year": "今年",
  "focus.period.all": "全部",

  /* ── Focus · the log sheet ───────────────────────────────── */
  "focus.log.title": "专注日志",
  "focus.log.stretches": "专注逐段记录",
  "focus.log.emptyToday": "今天还没有记录有用时间。",
  "focus.log.emptyDay": "那天没有记录有用时间。",
  "focus.log.foot": "不足 {min} 分钟的片段会被丢弃；仍在进行的片段最多计 {max} 小时。",
  "focus.log.prevDay": "前一天",
  "focus.log.nextDay": "后一天",
  "focus.log.day": "日期",
  "focus.log.running": "进行中",
  "focus.log.prevRung": "上一级",
  "focus.log.nextRung": "下一级",
  "focus.log.delete": "删除",
  "focus.log.keep": "保留",
  "focus.log.deleteAria": "删除 {start} 开始的片段",
  "focus.log.endAria": "修改 {start} 开始、属于 {date} 的片段的结束时间",
  "focus.log.listAria": "修改 {start} 开始的片段所属清单",
  "focus.log.fragment.before": "这段开始于前一天。",
  "focus.log.fragment.after": "这段延续到第二天。",
  "focus.log.refuse.notTime": "这不是一个时间。",
  "focus.log.refuse.beforeStart": "早于这段的开始时间。",
  "focus.log.refuse.tooShort": "一段至少需要 5 分钟。",
  "focus.log.refuse.future": "这个时间还没到。",
  "focus.log.refuse.overlap": "与下一段重叠了。",
  "focus.log.averages": "专注平均值",
  "focus.log.days": "{n} 天",
  "focus.log.period": "周期",
  "focus.log.perDay": "每日有用",
  "focus.log.share": "占一天",
  "focus.log.switches": "每日切换",
  "focus.log.perStretch": "单次时长",
  "focus.log.best": "个人最佳",
  "focus.log.bestStretch": "最长单次专注",
  "focus.log.bestDay": "最佳专注一天",
  "focus.log.bestDayTasks": "单日最多完成任务",
  "focus.log.bestNone": "还没有任何记录。",
  "focus.log.trend": "趋势",
  "focus.log.chart.week": "周",
  "focus.log.chart.month": "月",
  "focus.log.chart.day": "日",
  "focus.log.chart.range": "趋势范围",
  "focus.log.thisWeek": "本周",
  "focus.log.thisMonth": "本月",
  "focus.log.today": "今日",
  "focus.log.range.day": "14 天",
  "focus.log.trend.none": "上一个{range}的相同时段也没有记录。",
  "focus.log.trend.compare": "对比上一个{range}的相同时段：{delta}",
  "focus.log.trend.day.none": "昨日也没有记录。",
  "focus.log.trend.day": "对比昨日：{delta}",
  "focus.log.trend.tasks.same": "任务数与上一个{range}的相同时段相同。",
  "focus.log.trend.tasks.compare": "对比上一个{range}的相同时段：任务{delta} 个",
  "focus.log.trend.tasks.day.same": "任务数与昨日相同。",
  "focus.log.trend.tasks.day": "对比昨日：任务{delta} 个",
  "focus.log.weeks": "8 周",
  "focus.log.months": "12 个月",
  "focus.log.days14": "14 天",
  "focus.log.byList": "按清单",
  "focus.log.byList.time": "专注时间去向",
  "focus.log.byList.timeByList": "各清单专注时长",
  "focus.log.byList.empty": "这段时间的记录都还没有归属清单。",
  "focus.log.when": "专注高效时段",
  "focus.log.allHistory": "全部历史",
  "focus.log.when.none": "记录还太少，看不出一天的形状。",
  "focus.log.when.peak": "最高效的一小时是{days}的 {from}–{to}，累计 {value}。",
  "focus.log.export": "导出全部数据",
  "focus.log.exportAction": "下载",
  "focus.log.exportSaved": "已导出到 {folder}",
  "focus.log.exportFailed": "导出失败：{error}",
  "focus.log.scope": "清单",
  "focus.log.scopeAll": "全部清单",

  /* ── Focus · milestones ──────────────────────────────────── */
  "focus.ms.of": "{have} / {target}",
  "focus.ms.toastTitle": "解锁成就「{name}」",
  "focus.ms.focusTitle": "专注里程碑",
  "focus.ms.firstStep.name": "第一步",
  "focus.ms.firstStep.goal": "第一次拨动开关。",
  "focus.ms.firstStep.rule": "拨动一次",
  "focus.ms.early.name": "早起鸟",
  "focus.ms.early.goal": "在{hour}之前进入有用状态。",
  "focus.ms.early.rule": "{hour}之前就有用",
  "focus.ms.late.name": "夜猫子",
  "focus.ms.late.goal": "在{hour}之后仍处于有用状态。",
  "focus.ms.late.rule": "{hour}之后仍然有用",
  "focus.ms.streak.name": "连续 {n} 天",
  "focus.ms.streak.goal": "连续 {n} 天都有有用时间。",
  "focus.ms.streak.detail": "{have} / {target} 天",
  "focus.ms.streak.top": "最长 {have} 天",
  "focus.ms.stretch.name": "{value}的专注",
  "focus.ms.stretch.goal": "一次保持有用 {value} 不中断。",
  "focus.ms.totals.name": "累计 {value}",
  "focus.ms.totals.goal": "累计记录 {value}。",
  "focus.ms.totals.top": "共 {value}",
  "focus.ms.moves.name": "切换 {n} 次",
  "focus.ms.moves.goal": "一共拨动开关 {n} 次。",
  "focus.ms.moves.top": "共 {n} 次",
  "focus.ms.perfect.name": "1 个完美日",
  "focus.ms.perfect.namePlural": "{n} 个完美日",
  "focus.ms.perfect.goal": "让超过 {pct}% 的一天用于有用的事，共 {days} 天。",
  "focus.ms.perfect.top": "共 {n} 个完美日",
  "focus.ms.perfect.rule": "完美日：一天中超过 {pct}% 的时间花在有用的事上。",
  "focus.ms.flash.name": "速战速决",
  "focus.ms.flash.goal": "在 {value} 内开关一次。",
  "focus.ms.flash.rule": "{value} 或更短",
  "focus.ms.flash.detail": "最短 {value}",
  "focus.ms.fortress.name": "堡垒",
  "focus.ms.fortress.goal": "一天中的有用时间超过 {value}，且开关少于 {moves} 次。",
  "focus.ms.fortress.rule": "{moves} 次以下 · {value} 以上",
  "focus.ms.fortress.detail": "{moves} 次切换 · {value}",
  "focus.ms.weekend.name": "周末战士",
  "focus.ms.weekend.goal": "让某个周六或周日占自己一天的比例，超过同一周的任何工作日。",
  "focus.ms.weekend.rule": "超过自己那周的工作日",
  "focus.ms.weekend.detail": "最高达到工作日的 {pct}%",
  "focus.ms.midnight.name": "跨过午夜",
  "focus.ms.midnight.goal": "让一次专注从一天延续到第二天。",
  "focus.ms.midnight.rule": "一次专注，两天",
  "focus.ms.midnight.detail": "最晚 {time}",
  "focus.ms.seamless.name": "无缝衔接",
  "focus.ms.seamless.goal": "离开后 {value} 内回到有用状态。",
  "focus.ms.seamless.rule": "{value} 内回来",
  "focus.ms.fidget.name": "手痒",
  "focus.ms.fidget.goal": "一天内拨动开关超过 {n} 次。",
  "focus.ms.fidget.rule": "一天超过 {n} 次",
  "focus.ms.fidget.detail": "最多 {n} 次",

  /* ── Task statistics（统计页的任务侧） ───────────────────── */
  "stats.tasks.title": "任务完成",
  "stats.tasks.today": "今日完成",
  "stats.tasks.week": "本周完成",
  "stats.tasks.total": "累计完成",
  "stats.tasks.count": "{n} 个",
  "stats.tasks.doneCount": "{n} 个任务",
  "stats.tasks.byList": "各清单完成情况",
  "stats.tasks.ofCount": "{done} / {total}",
  "stats.tasks.pct": "{pct}%",
  "stats.tasks.empty": "还没有完成的任务。",
  "stats.split.filed": "已归入清单",
  "stats.split.unfiled": "未标记",
  "stats.split.share": "归档占比",
  "stats.compare.focus": "专注时长",
  "stats.compare.done": "完成任务",
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
  "sidebar.hideView": "Hide view",
  "sidebar.sectionLists": "Lists",
  "sidebar.newList": "New list",
  "sidebar.allLists": "All lists",
  "sidebar.listActions": "Actions for {name}",
  "sidebar.renameList": "Rename",
  "sidebar.deleteList": "Delete list",
  "sidebar.deleteListTitle": "Delete “{name}”?",
  "sidebar.deleteListBody":
    "The list is removed. Its tasks are not deleted — they move to the first remaining list. Focus sessions logged under it are kept but become unassigned.",

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

  /* ── Screens & settings page ─────────────────────────────── */
  "screen.stats": "Statistics",
  "screen.settings": "Settings",
  "settings.sectionAppearance": "Appearance",
  "settings.sectionLanguage": "Language",
  "settings.sectionSidebar": "Sidebar",
  "settings.sidebarHint": "Choose which views appear in the sidebar.",
  "settings.sectionFocus": "Focus",
  "settings.focusWidget": "Desktop focus widget",
  "settings.focusWidgetHint": "Always on top. Drag to snap to screen edges. Visibility is remembered on restart.",
  "settings.focusWidgetDesktopOnly": "Available in the desktop app only.",
  "widget.idle": "Resting",
  "widget.useful": "Focusing",
  "widget.start": "Start focus",
  "widget.stop": "Stop focus",
  "widget.openMain": "Open main window",
  "widget.hide": "Hide widget",
  "widget.expand": "Show actions",
  "widget.collapse": "Hide actions",
  "widget.dockHint": "Docked to the edge · Hover to expand",
  "widget.list": "List",
  "widget.loading": "Syncing…",
  "widget.error": "Action failed. Try again.",
  "widget.disconnected": "Waiting for main window",
  "settings.minSpan": "Shortest focus span",
  "settings.minSpanHint": "Spans shorter than this, in minutes, are dropped when they close; recorded focus is unaffected.",
  "settings.maxSpan": "Running span cap",
  "settings.maxSpanHint": "A span still running is credited up to this, in hours; finished spans are unaffected.",
  "settings.sectionData": "Data",
  "settings.sectionDanger": "Danger zone",
  "settings.deleteAll": "Delete all data",
  "settings.deleteAllHint":
    "Clears every task, list and focus record. This cannot be undone. Settings (appearance, language, …) are kept.",
  "settings.deleteAllAction": "Delete",
  "settings.deleteAllTitle": "Delete all data?",
  "settings.deleteAllBody":
    "Every task, list and focus record will be permanently deleted. This cannot be undone.",
  "settings.deleteAllType": "Type {keyword} to confirm",
  "settings.deleteAllDone": "All data deleted",
  "settings.theme": "Theme",

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
  "blank.filterStatus": "Filter by status",
  "blank.filterPriority": "Filter by priority",
  "blank.filterTag": "Filter by tag",
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
  "recur.label": "Repeat",
  "recur.none": "No repeat",
  "recur.dailyItem": "Every N days",
  "recur.everyDay": "Every day",
  "recur.everyNDays": "Every {n} days",
  "recur.weekly": "Every week",
  "recur.weekdaysItem": "On set days",
  "recur.weeklyOn": "Weekly on {days}",
  "recur.monthly": "Every month",
  "recur.yearly": "Every year",
  "recur.intervalLabel": "Interval (days)",
  "recur.weekdaysLabel": "Days of week",
  "recur.hint": "The next occurrence is created automatically on completion",
  "recur.needsDue": "Set a due date first to make it repeat",
  "toast.recurSpawned": "Completed — next occurrence added",
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

  /* ── Focus ───────────────────────────────────────────────── */
  "focus.title": "Focus",
  "focus.state.idle": "I’m taking a break.",
  "focus.state.useful": "I’m doing something useful.",
  "focus.rail.aria": "Open your focus log",
  "focus.rail.band": "I was doing something useful from {from} to {to}.",
  "focus.today.none": "Nothing logged as useful yet today",
  "focus.today.total":
    "Today: {value} spent doing something useful, {pct}% of the day",
  "focus.keys": "← → flips the switch",

  /* ── Focus · the list a stretch belongs to ───────────────── */
  "focus.unassigned": "Unassigned",
  "focus.session.label": "Filed under",
  "focus.session.elapsed": "Running {value}",

  /* ── Focus · durations, clocks and hour names ────────────── */
  // Abbreviated units ("13 min", "2 h") — the full words overflow the narrow
  // metric tiles in English and break their padding.
  "focus.duration.seconds": "{n} sec",
  "focus.duration.minutes": "{n} min",
  "focus.duration.hours": "{n} h",
  "focus.duration.hoursMinutes": "{h} h {m} min",
  "focus.hour.am": "{h} am",
  "focus.hour.pm": "{h} pm",
  "focus.hour.h24": "{h}:00",
  "focus.midnight": "midnight",
  "focus.weekNumber": "W{n}",
  "focus.delta.none": "no change",

  "focus.period.day": "Today",
  "focus.period.week": "Week",
  "focus.period.month": "Month",
  "focus.period.year": "Year",
  "focus.period.all": "All",

  /* ── Focus · the log sheet ───────────────────────────────── */
  "focus.log.title": "Your focus log",
  "focus.log.stretches": "Focus stretch by stretch",
  "focus.log.emptyToday": "Nothing logged as useful yet today.",
  "focus.log.emptyDay": "Nothing logged as useful that day.",
  "focus.log.foot":
    "Stretches under {min} minutes are dropped; a stretch still running is capped at {max} hours.",
  "focus.log.prevDay": "Previous day",
  "focus.log.nextDay": "Next day",
  "focus.log.day": "Day",
  "focus.log.running": "Running",
  "focus.log.prevRung": "Previous milestone",
  "focus.log.nextRung": "Next milestone",
  "focus.log.delete": "Delete",
  "focus.log.keep": "Keep",
  "focus.log.deleteAria": "Delete the stretch starting {start}",
  "focus.log.endAria":
    "End of the stretch starting {start} on {date}",
  "focus.log.listAria": "List for the stretch starting {start}",
  "focus.log.fragment.before": "The stretch began the day before.",
  "focus.log.fragment.after": "The stretch runs on into the next day.",
  "focus.log.refuse.notTime": "That is not a time.",
  "focus.log.refuse.beforeStart": "That is before the stretch started.",
  "focus.log.refuse.tooShort": "A stretch needs at least 5 minutes.",
  "focus.log.refuse.future": "That has not happened yet.",
  "focus.log.refuse.overlap": "That runs into the next stretch.",
  "focus.log.averages": "Focus averages",
  "focus.log.days": ({ n }) => `${n} ${plural(Number(n), "day", "days")}`,
  "focus.log.period": "Period",
  "focus.log.perDay": "Useful / day",
  "focus.log.share": "Share of day",
  "focus.log.switches": "Switches / day",
  "focus.log.perStretch": "Per stretch",
  "focus.log.best": "Personal best",
  "focus.log.bestStretch": "Longest focus stretch",
  "focus.log.bestDay": "Best focus day",
  "focus.log.bestDayTasks": "Most tasks in a day",
  "focus.log.bestNone": "No stretch logged yet.",
  "focus.log.trend": "Trend",
  "focus.log.chart.week": "Week",
  "focus.log.chart.month": "Month",
  "focus.log.chart.day": "Day",
  "focus.log.chart.range": "Trend range",
  "focus.log.thisWeek": "This week",
  "focus.log.thisMonth": "This month",
  "focus.log.today": "Today",
  "focus.log.range.day": "14 days",
  "focus.log.trend.none": "Nothing logged in the same days last {range} either.",
  "focus.log.trend.compare": "vs same days last {range}: {delta}",
  "focus.log.trend.day.none": "Nothing logged yesterday either.",
  "focus.log.trend.day": "vs yesterday: {delta}",
  "focus.log.trend.tasks.same": "Same task count as the same days last {range}.",
  "focus.log.trend.tasks.compare": "vs same days last {range}: {delta} tasks",
  "focus.log.trend.tasks.day.same": "Same task count as yesterday.",
  "focus.log.trend.tasks.day": "vs yesterday: {delta} tasks",
  "focus.log.weeks": "8 weeks",
  "focus.log.months": "12 months",
  "focus.log.days14": "14 days",
  "focus.log.byList": "By list",
  "focus.log.byList.time": "Where focus time went",
  "focus.log.byList.timeByList": "Focus time by list",
  "focus.log.byList.empty": "Nothing in this stretch of days is filed yet.",
  "focus.log.when": "When you focus best",
  "focus.log.allHistory": "All history",
  "focus.log.when.none": "Not enough logged yet to see a shape to the day.",
  "focus.log.when.peak":
    "Your most effective hour is {from}–{to} on {days}, holding {value} of useful time.",
  "focus.log.export": "Export all data",
  "focus.log.exportAction": "Download",
  "focus.log.exportSaved": "Saved to {folder}",
  "focus.log.exportFailed": "Export failed: {error}",
  "focus.log.scope": "List",
  "focus.log.scopeAll": "All lists",

  /* ── Focus · milestones ──────────────────────────────────── */
  "focus.ms.of": "{have} / {target}",
  "focus.ms.toastTitle": "Achievement unlocked: {name}",
  "focus.ms.focusTitle": "Focus milestones",
  "focus.ms.firstStep.name": "First step",
  "focus.ms.firstStep.goal": "Move the switch for the first time.",
  "focus.ms.firstStep.rule": "Switch once",
  "focus.ms.early.name": "Early bird",
  "focus.ms.early.goal": "Switch onto useful before {hour}.",
  "focus.ms.early.rule": "Useful before {hour}",
  "focus.ms.late.name": "Night owl",
  "focus.ms.late.goal": "Still be useful after {hour}.",
  "focus.ms.late.rule": "Useful after {hour}",
  "focus.ms.streak.name": "{n}-day streak",
  "focus.ms.streak.goal": "Hold a run of useful time across {n} days in a row.",
  "focus.ms.streak.detail": "{have} / {target} days",
  "focus.ms.streak.top": "Longest {have} days",
  "focus.ms.stretch.name": "{value} stretch",
  "focus.ms.stretch.goal": "Stay useful for {value} without switching off.",
  "focus.ms.totals.name": "{value} logged",
  "focus.ms.totals.goal": "Log {value} in total.",
  "focus.ms.totals.top": "Total {value}",
  "focus.ms.moves.name": "{n} switches",
  "focus.ms.moves.goal": "Move the switch {n} times in all.",
  "focus.ms.moves.top": "Total {n} switches",
  "focus.ms.perfect.name": "1 perfect day",
  "focus.ms.perfect.namePlural": "{n} perfect days",
  "focus.ms.perfect.goal":
    "Give more than {pct}% of a day to useful time, on {days} days.",
  "focus.ms.perfect.top": "Total {n} perfect days",
  "focus.ms.perfect.rule":
    "A perfect day gives over {pct}% of itself to useful time.",
  "focus.ms.flash.name": "Flash",
  "focus.ms.flash.goal": "Switch on and off again within {value}.",
  "focus.ms.flash.rule": "{value} or less",
  "focus.ms.flash.detail": "Shortest {value}",
  "focus.ms.fortress.name": "Fortress",
  "focus.ms.fortress.goal":
    "Give more than {value} to one day, on fewer than {moves} moves of the switch.",
  "focus.ms.fortress.rule": "Under {moves} switches, {value}+",
  "focus.ms.fortress.detail": "{moves} switches · {value}",
  "focus.ms.weekend.name": "Weekend warrior",
  "focus.ms.weekend.goal":
    "Give a Saturday or Sunday a larger share of itself than any weekday of the same week.",
  "focus.ms.weekend.rule": "Beat its own weekdays",
  "focus.ms.weekend.detail": "Best {pct}% of a weekday",
  "focus.ms.midnight.name": "Across midnight",
  "focus.ms.midnight.goal": "Let a single stretch run from one day into the next.",
  "focus.ms.midnight.rule": "One stretch, two days",
  "focus.ms.midnight.detail": "Latest {time}",
  "focus.ms.seamless.name": "Seamless",
  "focus.ms.seamless.goal": "Come back to useful within {value} of leaving it.",
  "focus.ms.seamless.rule": "Back within {value}",
  "focus.ms.fidget.name": "Switch-happy",
  "focus.ms.fidget.goal": "Move the switch more than {n} times in one day.",
  "focus.ms.fidget.rule": "Over {n} switches a day",
  "focus.ms.fidget.detail": "Longest {n} switches",

  /* ── Task statistics (the task side of the stats page) ──── */
  "stats.tasks.title": "Task completion",
  "stats.tasks.today": "Done today",
  "stats.tasks.week": "This week",
  "stats.tasks.total": "All time",
  "stats.tasks.count": "{n}",
  "stats.tasks.doneCount": "{n} tasks",
  "stats.tasks.byList": "Completion by list",
  "stats.tasks.ofCount": "{done} / {total}",
  "stats.tasks.pct": "{pct}%",
  "stats.tasks.empty": "No completed tasks yet.",
  "stats.split.filed": "Filed to lists",
  "stats.split.unfiled": "Unfiled",
  "stats.split.share": "Filed share",
  "stats.compare.focus": "Focus time",
  "stats.compare.done": "Tasks done",
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
