# Privacy Policy

Orkest Todo · Version 1.0 · Last updated: 2026-09-19

**Controller and contact.** The controller is the operator of the app: the maintainer of the Orkest Todo repository, who publishes the builds and runs the sync backend. Contact: https://github.com/wes383/orkest-todo/issues — request a private channel there; never post your sync code.

## 1. Summary

Orkest Todo is **local-first**. Tasks, lists, settings and the full focus history live on your own device (browser `localStorage`) and never leave it unless you turn on **Focus Sync**. Sync is **off by default**. When it is on, only a rolling window of approximately two days of focus records, the focus switch state, list names and order, and focus rules are relayed through Supabase, which acts solely as a transfer channel, so that the phone page can observe the focus state and switch it remotely. Tasks, notes, tags and subtasks are **never** synced. No accounts, no analytics, no ads, no trackers.

## 2. Scope

Applies to: the Orkest Todo desktop app (Tauri 2 + React, Windows / macOS / Linux builds from this repository); the optional mobile page (`orkest-focus.wesluma.com`, static page in `mobile/`); the optional Supabase tables in `supabase-schema.sql` (`focus_spans`, `focus_state`, `lists`, `app_settings`) when sync is on. It does not cover the providers themselves — Supabase, Vercel and GitHub each handle what reaches them under their own policies — nor operating-system vendors, nor sites opened from the app.

## 3. What stays on your device (default)

- Tasks (title, notes, due date, priority, tags, subtasks, repeat rules, stars): key `orkest-todo.v1`. Never synced, never uploaded.
- Full focus log and switch: keys `orkest-todo.focus.log.v1` / `orkest-todo.focus.state`; ids of milestones already celebrated: `orkest-achievements.v1`. Only the last approximately two days of the log are mirrored when sync is on.
- Settings (hidden views, min/max focus rules, widget opacity, tray/quit behaviour, global shortcuts switch, shortcut-hint visibility), interface language and colour theme: `orkest-settings.v1`, `orkest-todo.language`, and `theme` (written by the theme library the app embeds). Only min/max rules leave the device when sync is on (see section 4).
- Sync on/off and sync code: `orkest-sync.v1` (desktop), `orkest-mobile.v1` (phone); on the phone also the interface language `orkest-mobile.lang` and the list chosen for the session `orkest-mobile.list.v1`. The code travels only as the `x-sync-code` request header.
- CSV exports: written by you to a folder you choose; shared only if you share the file.

This list is complete rather than illustrative: it is every key the app writes, plus the single key written by the theme library it embeds. Nothing else is stored.

We collect no name, phone number, email address, precise location, contacts, photos, microphone or camera input, or advertising identifiers. No registration is required.

## 4. What sync transmits (only when you turn it on)

Enabling sync mints a random 24-character code (alphabet `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`, approximately 2^120 combinations). The code constitutes both the identity and the data space: every request carries it in `x-sync-code`, and row-level security (RLS) compares it with each row's `owner_code`. The anon key baked into the build is public by Supabase's design; RLS confines a request to the rows under the code it presents, and the confidentiality of the window rests on the entropy of that code, not on the key.

Only the following travels, and only while sync stays on:

- `focus_spans`: start and end timestamps (epoch ms), list id, frozen min-duration floor — limited to approximately the last two days;
- `focus_state`: one row, `idle` or `useful`;
- `lists`: list id, name, sidebar position;
- `app_settings`: `min_span_minutes`, `max_span_hours`, and the heartbeat `updated_at` (which is also the marker that makes the space exist).

The desktop polls about every 5 seconds (10 seconds on the phone); no Realtime socket is used, because it cannot present the header RLS requires. Each poll reads the newest row and the row count first, and pulls the full window only on change; failures back off (doubling, capped at 5 minutes). Turning sync off purges the cloud space on a best-effort basis; regenerating the code abandons the old space. Neither operation touches local data. Weekly server jobs expire spaces idle for 30 days, sweep orphan rows, and delete any span that has remained in the cloud for more than 7 days. If a code leaks, at most a few days of focus start and end times are exposed — never task content, and never years of history.

## 5. What we never do

- No analytics, telemetry, crash reporting or A/B testing.
- No ads, no profiling, no sale of personal information.
- No task content in the cloud: the schema has no column for it.
- No remote access to your device; the phone page touches only the sync window described above, never your localStorage.
- No tracking code embedded anywhere: the mobile page is a static file, and the only party that sees a request for it is the host, acting in the ordinary course of serving it (section 6).

## 6. Processors and OS permissions

- **Supabase (Postgres + PostgREST):** only while sync is on; stores the section-4 rows under your sync code until deleted or expired. The project address comes from your build's `VITE_SUPABASE_URL`. In transit over HTTPS.
- **Vercel:** serves the mobile page (`orkest-focus.wesluma.com`). That page is static and runs no server-side code of ours, but the host necessarily sees every request for it — IP address, user-agent, timestamp — whether or not sync is on, and handles that under its own policy.
- **GitHub:** hosts the repository, this document and the release builds; reaching any of them is a request to GitHub under GitHub's policy.
- **OS features you toggle:** login-item autostart, tray menu (counts and focus state only), the file-save picker for CSV export, and the external-link opener (privacy policy, terms of use, mobile page address). Each of these can be left disabled.
- No other SDKs. The Tauri runtime is embedded and sends nothing by itself.

## 7. Retention

- Local data: kept until you delete it (per-item delete, clear completed, delete all data, or uninstall plus clearing app data).
- Sync window: approximately two days server-side on a rolling basis, plus weekly auto-expiry (30-day idle spaces, orphan rows, 7-day span floor). After you switch sync off or a space expires, any leftovers die on the next sweep. No cloud backup exists — the desktop log is the archive and rebuilds the window when sync is re-enabled.
- Mobile-page and repository requests: access metadata (IP address, user-agent, timestamp) is held by Vercel and GitHub under their own retention policies, not by us. We do not use it for anything, and an erasure request for it has to be addressed to them.

## 8. Your rights

Access, correct, export and delete inside the app at any time: edit tasks, lists and rules directly; export via the Settings CSV; delete via per-item delete, clear completed or delete all data; purge the cloud by switching sync off or regenerating the code. There is no account, so we cannot identify your data without the sync code; keep it private, because anyone who obtains it can read or change the window. Where the law grants rights to know, decide, access, copy, correct, complete, delete, withdraw consent or request an explanation (including under the PRC Personal Information Protection Law, where that law applies), exercise them via the contact in section 15; we answer within statutory limits and free of charge. That channel is a public issue tracker, so a request that has to identify a sync window should ask there for a private channel rather than posting the code itself. EU/EEA and UK users: see section 12 for the GDPR/UK GDPR specifics; US residents: see section 13.

## 9. Security

Local data relies on the protection of your device (OS login, disk encryption, screen lock). Sync relies on the entropy of the code (approximately 2^120) together with RLS, HTTPS and short retention — but anyone you share the code with, or who photographs your screen, can read or change the window until you regenerate the code. No password recovery exists: a lost code is replaced, not retrieved. Serving the mobile page reveals your IP address and user-agent to Vercel, as any web request does; the page itself contains no data until a valid code is entered.

## 10. Children

A general-purpose productivity tool; it contains no child-directed content and applies no age gate. Minors should use it under guardian supervision. We do not knowingly collect children's data beyond what sections 3 and 4 describe, and will delete a sync space on a verified guardian request.

## 11. Cross-border transfer

If the Supabase project serving your build sits outside your country, the section-4 window is routed there when sync is on. Turning sync on consents to that routing; leaving sync off keeps all data on the device. Opening the mobile page separately reaches Vercel's edge network, which is distributed, but carries none of your focus data. EU/EEA and UK users: the transfer safeguards and legal bases are set out in section 12; US residents: section 13.

## 12. EU/EEA and UK users (GDPR / UK GDPR)

**Controller:** the operator of the app — the maintainer of the Orkest Todo repository, named in the header of this document; no EU or UK establishment.

Data-protection contact: https://github.com/wes383/orkest-todo/issues (request a private channel there; do not post the sync code, and do not open a public issue containing it).

No Art 27 representative and no DPO is appointed: the server-side processing is opt-in, covers an approximately two-day window and contains no special-category data.

**Legal bases (Art 6).** The app's data stays in the device's `localStorage` and is not processed by us. Sync window: **Art 6(1)(a)** consent, withdrawn by switching sync off; **Art 6(1)(b)** for providing the feature. Backend security and abuse prevention: **Art 6(1)(f)**. Requests: Art 6(1)(f), and Art 6(1)(c) where the law requires retention or disclosure.

**Rights (Art 15, 16, 17, 18, 20, 21, 7(3), 77; UK: ICO).** Access, rectification, erasure and portability are available in-app (edit, CSV export, Delete all data; switching sync off purges the cloud window). We cannot identify you without the sync code (Art 11); a request concerning a window requires demonstrating control of that code through a private channel. Response within one month, extendable by two months, free of charge (Art 12).

**International transfers.** The window is stored in the Supabase project configured for the build, possibly outside the EU/EEA/UK, under the provider's safeguards (Standard Contractual Clauses and/or an adequacy decision) or the user's explicit consent (Art 49(1)(a)). Loading the mobile page is a separate transfer of request metadata (IP address, user-agent) to Vercel, handled under Vercel's own safeguards.

**Automated decisions.** None (Art 22). No special-category data is requested or needed; do not enter such data in a list name, the only free-text field the window carries.

**ePrivacy.** `localStorage` is strictly necessary to provide the app's features; there are no cookies, trackers or non-essential storage, and no consent banner is used.

## 13. California and other US state residents

**Scope.** The CCPA/CPRA applies to for-profit businesses doing business in California that exceed a threshold. This app is free, has no accounts and keeps tasks on the device, so those thresholds and the comparable thresholds of other states (Virginia, Colorado, Connecticut, Utah, Texas and others) are not met. No personal information is sold or shared; no advertising is run.

**Baseline commitments** — voluntary, not statutory duties:

- **Categories handled in the past 12 months:** the pseudonymous sync code and list ids; focus start and end timestamps; list names and order; focus min/max rules. No sensitive personal information. Separately, an IP address and user-agent reach Supabase and Vercel as ordinary request metadata; we do not use them to identify anyone.
- **Purposes:** operating the sync window. No behavioural advertising, profiling or automated decisions with legal or similarly significant effects.
- **Disclosures:** Supabase (storage and access control) and Vercel (serving the mobile page) as processors; GitHub hosts the repository and the release builds. No other recipients; tasks, notes, tags and subtasks remain on the device.
- **Sale and sharing:** none; no financial incentive programme is offered.
- **Rights:** know/access, delete, correct, portability (CSV export), opt out of sale and sharing, limit use of sensitive personal information, non-discrimination, authorised agent. Exercisable in-app or through the contact in section 15.
- **Verification and timing:** control of the sync code through a private channel; response within 45 days, extendable by a further 45 with notice; state-law appeal rights are handled in the same channel.
- **Opt-out signals** (e.g. Global Privacy Control): no tracking, sale or sharing to opt out of.

## 14. Changes

This file is versioned with the code (`Version 1.0`, effective date above); material changes are noted in release notes before taking effect. Continued use after the effective date means acceptance — except where a change widens what the sync window carries: consent to that transmission is given and withdrawn with the sync switch (section 12), so such a change is accepted by keeping sync on, not by continued use of the app alone. Settings always links to the current version.

## 15. Contact

Questions, requests, complaints and rights requests: https://github.com/wes383/orkest-todo/issues. That tracker is public — if your request has to identify a sync window, ask there for a private channel first, and never post the code.

---

## 中文

**控制者与联系。** 控制者即本应用的运营者：Orkest Todo 仓库的维护者，负责发布构建并运行同步后端。联系方式：https://github.com/wes383/orkest-todo/issues ——请在彼处索取私密渠道，切勿公开同步码。

### 一、概述

Orkest Todo 是**本地优先**的待办与专注应用。任务、清单、设置与完整专注记录默认只保存在你自己的设备上（浏览器 `localStorage`），开启「专注同步」之前不会离开设备。同步**默认关闭**；开启后，仅约 2 天滚动窗口内的专注记录、专注开关状态、清单名称/顺序与专注规则经 Supabase 中转（其仅充当传输通道），供手机页查看专注状态并远程切换。任务标题、备注、标签、子任务**永不同步**。无账号体系，无统计、无广告、无第三方追踪。

### 二、适用范围

适用于：Orkest Todo 桌面端（Tauri 2 + React，Windows / macOS / Linux 构建）；可选手机专注遥控页（`orkest-focus.wesluma.com`，`mobile/` 静态页）；开启同步后 `supabase-schema.sql` 中的四张表（`focus_spans`、`focus_state`、`lists`、`app_settings`）。Supabase、Vercel、GitHub 等托管方对到达其服务的数据各自适用其自身政策；操作系统厂商及应用内打开的外部网站同理。

### 三、留在本机的数据（默认状态）

- 任务（标题、备注、截止日、优先级、标签、子任务、重复规则、星标）：`orkest-todo.v1`。永不同步、不上传。
- 完整专注记录与开关：`orkest-todo.focus.log.v1` / `orkest-todo.focus.state`；已庆祝里程碑的 id：`orkest-achievements.v1`。开启同步后仅镜像最近约 2 天。
- 设置（隐藏视图、专注最短/最长规则、悬浮窗透明度、托盘/退出行为、全局快捷键开关、快捷键提示开关）、界面语言与配色主题：`orkest-settings.v1`、`orkest-todo.language`，以及 `theme`（由应用内嵌的主题库写入）。仅最短/最长规则在同步开启后离开本机（见第四条）。
- 同步开关与同步码：桌面 `orkest-sync.v1`、手机 `orkest-mobile.v1`；手机另有界面语言 `orkest-mobile.lang` 与当次所选清单 `orkest-mobile.list.v1`。同步码仅以 `x-sync-code` 请求头传给所连 Supabase 项目。
- CSV 导出：由你选择目录保存；仅当你自行分享该文件才会外传。

以上清单是**穷举**而非举例：应用写入的全部键，加上内嵌主题库写入的那一个键，就是全部。除此之外不存储任何内容。

不收集姓名、电话、邮箱、精确位置、通讯录、照片、麦克风或摄像头输入及广告标识符。无注册、无登录。

### 四、开启同步后传输的内容（仅此时）

开启即生成随机 24 位同步码（字符集 `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`，约 2^120 种组合）。同步码即身份与数据空间：每次请求以 `x-sync-code` 头携带，行级安全策略（RLS）将其与每行的 `owner_code` 比对。构建中内嵌的 Supabase anon key 按 Supabase 的设计本就是公开的；RLS 的作用是把请求限定在它所出示的同步码名下的行，窗口的保密性来自该同步码的熵，而非该公开密钥。

仅传输以下内容，且仅在同步保持开启期间：

- `focus_spans`：开始/结束时间戳（毫秒）、所属清单 id、冻结的最短时长下限——仅限最近约 2 天；
- `focus_state`：一行，`idle` 或 `useful`；
- `lists`：清单 id、名称、侧栏顺序；
- `app_settings`：`min_span_minutes`、`max_span_hours`、心跳 `updated_at`（同时是该数据空间存在的标记）。

桌面约每 5 秒轮询（手机 10 秒）；不使用 Realtime 订阅，因为其 WebSocket 无法携带 RLS 所需的请求头。每次先只读最新一行与精确行数，有变化才拉取全量；失败按指数退避（翻倍，5 分钟封顶）。关闭同步即尽力清空云端该空间；更换同步码即抛弃旧空间。上述任一操作均不影响本机数据。服务端每周执行兜底任务：30 天无心跳的空间过期、孤儿行清扫、任何专注段在云端存留超过 7 天即被删除。同步码一旦泄露，最多只有数天的专注起止时间被暴露——既不含任务内容，也不含多年历史。

### 五、我们不做的事

无数据分析、埋点、崩溃上报或 AB 测试；无广告、无用户画像、无个人信息买卖；云端无任务字段（表结构中没有相应列）；不远程访问你的设备，手机页只能读写上述同步窗口，绝不触碰你的 localStorage。页面内也没有任何追踪代码——它是静态文件，唯一会看到对它的请求的，是托管方在常规服务过程中的处理（见第六条）。

### 六、处理者与系统权限

- **Supabase（Postgres + PostgREST）：** 仅在同步开启时，以你的同步码隔离存储第四条所列数据，删除或过期即清除。项目地址取自构建的 `VITE_SUPABASE_URL`。传输经 HTTPS。
- **Vercel：** 托管手机页（`orkest-focus.wesluma.com`）。该页是静态页，不含我们的服务端代码，但托管方必然会看到对它的每一次请求——IP 地址、User-Agent、时间戳，无论同步是否开启；这些由其自身政策处理。
- **GitHub：** 托管代码仓库、本文件与发布构建；访问其中任一地址即构成对 GitHub 的请求，适用 GitHub 的政策。
- **你手动开启的系统能力：** 开机自启、托盘菜单（仅计数与专注状态）、CSV 保存目录选择、外部链接打开（隐私政策、用户协议、手机页地址）。以上均可保持关闭。
- 无其他 SDK。Tauri 运行时内嵌于应用，自身不对外发送任何数据。

### 七、保存期限

- 本机数据：保留至你删除（单条删除、清除已完成、删除所有数据，或卸载并清除应用数据）。
- 同步窗口：服务端约 2 天滚动，另加每周自动过期（30 天无心跳空间、孤儿行、7 天段下限）。关闭同步或空间过期后，残留行将在下一次清扫时删除。云端不存在备份——桌面日志即档案，重新开启同步即重建窗口。
- 手机页与仓库访问：访问元数据（IP 地址、User-Agent、时间戳）由 Vercel 与 GitHub 按其各自的保留策略持有，不在我们手中。我们不将其用于任何用途；如需删除此类记录，须向相应托管方提出。

### 八、你的权利

你可在应用内随时访问、更正、导出与删除：直接编辑任务、清单与规则；通过设置页导出 CSV；单条删除、清除已完成或删除所有数据；关闭同步或更换同步码即清除云端窗口。由于不存在账号，无同步码我们无法定位你的数据——请妥善保管同步码，因为持有同步码者即可读写该窗口。依法（包括《中华人民共和国个人信息保护法》）享有的知情权、决定权、查阅复制权、更正补充权、删除权、撤回同意权、解释说明权等，可通过上述应用内控件或第十五条的联系方式行使；我们将在法定期限内免费答复。该联系方式是公开的 issue 区，因此凡需指明某个同步窗口的请求，请先在彼处索取私密渠道，不要把同步码发布在公开区。欧盟/欧洲经济区及英国用户见第十二条（GDPR / UK GDPR 具体规则）；美国用户见第十三条。

### 九、安全

本机数据依赖设备自身的保护（系统登录、磁盘加密、锁屏）。同步依赖同步码的熵（约 2^120）、RLS、HTTPS 与短保留期限——但与你共享同步码者（或拍下你屏幕者）在你更换同步码之前，均可读写该窗口。本应用无密码找回机制：同步码遗失只能更换，无法找回。打开手机页会像任何网页请求一样，把你的 IP 地址与 User-Agent 交给 Vercel；页面本身不含任何数据，未输入有效同步码前不会显示任何内容。

### 十、未成年人

本应用是通用效率工具，不含儿童定向内容，不设年龄门。未成年人应在监护人指导下使用。除第三、四条所述范围外，我们不会主动收集儿童信息；经核实的监护人删除请求将及时清空相关同步空间。

### 十一、跨境传输

若构建所连 Supabase 项目位于你所在国家之外，开启同步即表示同意将第四条窗口数据路由至该节点；保持同步关闭则全部数据留在本机。另行打开手机页会经过 Vercel 的全球边缘网络，但该请求不携带任何专注数据。欧盟/欧洲经济区及英国用户的传输保障与合法性基础见第十二条；美国用户见第十三条。

### 十二、欧盟/欧洲经济区及英国用户（GDPR / UK GDPR）

**控制者：** 本应用的运营者，即 Orkest Todo 仓库的维护者（见本文文首）；在欧盟/英国无设立机构。

数据保护联系：https://github.com/wes383/orkest-todo/issues （请在彼处索取私密渠道，勿公开同步码，也不要在公开 issue 中出现它）。

未指定第 27 条代表及数据保护官（DPO）：服务端处理为选择性开启、仅约 2 天窗口、不含特殊类别数据。

**合法性基础（第 6 条）：** 应用数据留在设备 `localStorage`，不由我们处理。同步窗口：**第 6(1)(a) 条**同意，关闭同步即撤回；**第 6(1)(b) 条**为提供该功能。后端安全与滥用防护：**第 6(1)(f) 条**。答复请求：第 6(1)(f) 条；法律要求留存或披露时：第 6(1)(c) 条。

**权利（第 15、16、17、18、20、21、7(3)、77 条；英国为 ICO）：** 查阅、更正、删除、可携带均可在应用内完成（编辑、导出 CSV、删除所有数据；关闭同步即清空云端窗口）。无同步码无法识别你（第 11 条）；涉及窗口的请求须通过私密渠道证明对该同步码的控制。一个月内答复，可延长两个月，不收费（第 12 条）。

**跨境传输：** 窗口存储于构建所配置的 Supabase 项目，可能位于欧盟/欧洲经济区/英国之外，依据服务商的保障措施（标准合同条款 SCC 和/或充分性认定）或用户明示同意（第 49(1)(a) 条）。加载手机页则是把请求元数据（IP 地址、User-Agent）单独交给 Vercel，适用 Vercel 自身的保障措施。

**自动化决策：** 无（第 22 条）。我们不要求特殊类别数据；请勿在清单名称中填写此类数据——它是窗口携带的唯一自由文本字段。

**ePrivacy：** `localStorage` 属提供应用功能所严格必需；无 Cookie、无追踪、无非必要存储，也不使用同意横幅。

### 十三、美国加州及其他州居民

**适用范围。** CCPA/CPRA 适用于在加州开展业务且触及门槛的营利性企业。本应用免费、无账号、任务存于设备，未触及上述门槛，亦未触及各州同类门槛（弗吉尼亚、科罗拉多、康涅狄格、犹他、得州等）。不出售或共享个人信息，不投放广告。

**基线承诺**——属自愿承诺，非法定义务：

- **近 12 个月处理的类别：** 伪匿名同步码与清单 id；专注起止时间戳；清单名称及顺序；专注最短/最长规则。不含敏感个人信息。此外，IP 地址与 User-Agent 会作为常规请求元数据到达 Supabase 与 Vercel；我们不据此识别任何人。
- **目的：** 运行同步窗口。无行为广告、用户画像，也无产生法律或类似重大影响的自动化决策。
- **披露：** Supabase（存储与访问控制）与 Vercel（托管手机页）作为处理者；GitHub 托管仓库与发布构建。无其他接收方。任务、备注、标签、子任务留存于设备。
- **出售与共享：** 无；不提供任何财务激励计划。
- **权利：** 知情/查阅、删除、更正、可携带（CSV 导出）、选择退出出售与共享、限制使用敏感个人信息、不受歧视、委托授权代理。可在应用内或通过第十五条的联系方式行使。
- **验证与时限：** 通过私密渠道验证对同步码的控制；45 日内答复，可经通知再延长 45 日；州法申诉权在同一渠道处理。
- **退出信号**（如 Global Privacy Control）：本应用无追踪、出售或共享，故无需退出。

### 十四、变更

本文件随代码版本管理（版本号 1.0，以文首生效日期为准）；实质变更将在 release notes 中提前说明。生效后继续使用即表示接受——但若变更扩大了同步窗口所传输的内容：对该传输的同意由同步开关给出与撤回（见第十二条），因此这类变更以你保持同步开启为接受方式，而非仅凭继续使用应用。设置页始终链接当前版本。

### 十五、联系方式

问题、请求、投诉、权利行使：https://github.com/wes383/orkest-todo/issues 。该 issue 区是公开的——若你的请求需指明某个同步窗口，请先在彼处索取私密渠道，切勿公开同步码。
