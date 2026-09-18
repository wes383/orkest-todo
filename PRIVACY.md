# Privacy Policy

Orkest Todo · Last updated: 2026-09-18

**In one line: Orkest Todo collects nothing, uploads nothing and shares nothing.** Your tasks, lists, focus records and settings stay on your own machine, and no line of the app's code sends them anywhere.

Orkest Todo is an open-source desktop application maintained at <https://github.com/wes383/orkest-todo>. This document describes what the application does with your information. It is versioned together with the code, so the text belonging to any given release can be traced through the git history.

## What is stored on your device

| Content | Location | Purpose |
| --- | --- | --- |
| Tasks, lists, notes, completion and star state | The app's own local web storage (on Windows, inside the WebView2 user data folder, typically `%LOCALAPPDATA%\com.orkest.todo`) | It is the app's data |
| Focus records and any running focus session | Same as above | Focus timing and statistics |
| Appearance, language, sidebar visibility, focus rules | Same as above | Remembering your preferences |
| Visibility flag for the desktop focus widget | `focus-widget.json` in the OS application-config directory | Restoring the widget on the next launch |

All of it exists only on this machine. The developer has no access to it and cannot read it.

## What never leaves the device

Task text, notes, list names, focus records, settings, interface language — and any identifier that could be tied back to you.

The app contains no networking code: no account, no sign-in, no cloud sync, no crash reporting, no usage analytics, no advertising SDK, and no update check.

## The only two things that can touch the network, both triggered by you

1. **Exporting CSV** — writes your focus records and tasks as two files into a folder you choose. That is a write to your local disk, not an upload.
2. **Clicking the "Privacy policy" link in Settings** — opens this document in your default browser. That request goes to GitHub, which may record your IP address and browser identifier exactly as it would for any website visit. The same applies when you download an installer from GitHub.

## Third parties

No analytics, advertising or crash-reporting services. Fonts and icons ship inside the app and no CDN is contacted at runtime. The app uses only the web rendering engine that ships with your operating system (WebView2 on Windows, WebKit / WebKitGTK on macOS and Linux).

## Your control

- **Settings → Delete all data** clears every task, list and focus record. It takes effect immediately and cannot be undone.
- Uninstalling the app and then deleting its application-data directory removes what is left, including the widget flag and your interface preferences.
- Because nothing is ever uploaded, there is no "ask the provider to delete it" step.

## Changes to this policy

Every change to this document is recorded in the repository's git history, and changes that affect the scope of data handling will be noted in the release notes for the version that introduces them.

## Contact

For questions or problems, open an issue in the repository: <https://github.com/wes383/orkest-todo/issues>

---

## 中文

**一句话：Orkest Todo 不收集、不上传、不共享你的任何信息。** 任务、清单、专注记录和设置全部保存在你自己的电脑上，应用代码里没有任何一行会把它们发往网络。

Orkest Todo 是开源桌面应用，代码维护在 <https://github.com/wes383/orkest-todo>。本文档说明这个应用如何处理你的信息。它与代码一起版本化，因此任一发布版本对应的文本都可以在 git 历史中追溯。

### 保存在你设备上的内容

| 内容 | 位置 | 用途 |
| --- | --- | --- |
| 任务、清单、备注、完成与加星状态 | 应用自身的本地存储（Windows 上位于 WebView2 用户数据目录，通常为 `%LOCALAPPDATA%\com.orkest.todo`） | 就是应用本身的数据 |
| 专注记录与进行中的专注 | 同上 | 专注计时与统计 |
| 外观、语言、侧边栏显隐、专注规则等设置 | 同上 | 记住你的偏好 |
| 桌面专注悬浮窗的显示开关 | 系统应用配置目录下的 `focus-widget.json` | 下次启动时恢复悬浮窗 |

这些内容只存在于本机。开发者接触不到，也无法读取。

### 绝对不会离开设备的内容

任务正文、备注、清单名称、专注记录、设置、界面语言，以及任何可以关联到你个人的标识符。

本应用不含网络请求代码：没有账号、没有登录、没有云同步、没有崩溃上报、没有使用统计、没有广告 SDK，也不联网检查更新。

### 唯二可能触网的情况，都由你主动触发

1. **导出 CSV** —— 把专注记录和任务写成两个文件，存到你选择的文件夹。这是写入本机磁盘，不是上传。
2. **点击设置页里的「隐私政策」链接** —— 用你的默认浏览器打开本文档。这一次请求发往 GitHub，和用浏览器访问任何网站一样，GitHub 可能记录你的 IP 地址与浏览器标识。从 GitHub 下载安装包时同理。

### 第三方

没有分析、广告或崩溃上报服务。字体与图标已随应用打包，运行时不请求任何 CDN。应用只使用操作系统自带的网页渲染引擎（Windows 上是 WebView2，macOS 与 Linux 上分别是 WebKit / WebKitGTK）。

### 你的控制权

- **设置 → 删除所有数据**：清除全部任务、清单与专注记录。立即生效，不可撤销。
- 卸载应用后，再删除对应的应用数据目录，即可清掉剩余内容（包括悬浮窗开关与界面偏好）。
- 由于信息从不上传，不存在「向服务商申请删除」这一步。

### 政策变更

本文档的每一处改动都记录在仓库的 git 历史中；影响数据处理范围的变更，会写进引入该变更的版本的 release notes。

### 联系

有问题或疑问，请在仓库中开 issue：<https://github.com/wes383/orkest-todo/issues>
