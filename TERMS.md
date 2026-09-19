# Terms of Use

Orkest Todo · Version 1.0 · Last updated: 2026-09-19

**Operator and contact.** The operator is the maintainer of the Orkest Todo repository — the party that publishes the builds and runs the sync backend. Contact: https://github.com/wes383/orkest-todo/issues (request a private channel there; never post your sync code).

## 1. About the app

Orkest Todo is a free, open-source (MIT, see `LICENSE`), local-first task and focus app: no accounts, no fees, no ads. These Terms are the use contract between you and the operator named at the top of this document. Installing, launching or using the app, or opening the mobile page, constitutes acceptance of these Terms. If you do not agree, you must not use the app.

## 2. License and open source

The code is MIT-licensed: you may use, copy, modify, merge, publish, distribute and sublicense it subject to `LICENSE` (keep the copyright notice). These Terms govern *use of the running product* (including any hosted build and the Supabase sync channel); they do not diminish your MIT rights in the code itself. Built binaries may embed third-party open source components under their own licences.

## 3. Eligibility and your responsibilities

You must have capacity to accept these Terms (minors may do so only through a guardian). You agree to: (a) use the app lawfully and only for personal productivity; (b) not misuse sync — probing others' codes, flooding the backend, bypassing RLS; (c) keep your sync code private, since anyone holding it can read or change your focus window; (d) back up anything that matters (CSV export); (e) keep your device and operating system up to date and secured. You are responsible for content you enter into the app (tasks, notes, list names) and for complying with the law where you live.

## 4. How the product works

Local-first: tasks, notes, tags, subtasks and the full focus archive live only in your device's localStorage and are never transmitted over the network. Focus Sync is optional and off by default; when it is on, only a rolling focus window of approximately two days, the focus switch state, list names and order, and min/max rules traverse the Supabase channel (for details see `PRIVACY.md` §4 and `supabase-schema.sql`). Switching sync off or regenerating the code purges or abandons the cloud window; local data is unaffected. Polling cadence (about 5 seconds on desktop, 10 seconds on the phone), backoff, and weekly server expiry (30-day idle spaces, orphan rows, 7-day span floor) are part of the design, not a service-level promise.

## 5. Acceptable use

The following are prohibited: breaking the law; infringing others' rights; uploading malware or unlawful content into any synced field; attacking, scraping or overloading the Supabase project, the mobile page host or the GitHub repository; disclosing your sync code publicly and then holding the operator responsible for what it opens; misrepresenting the app as someone else's product or removing licence notices. We may rate-limit, block abusive codes or spaces, or change the backend to protect it, without prior notice.

## 6. Availability, changes, no SLA

Provided "as is", without uptime, compatibility or fitness promises: OS updates, WebView changes, Supabase maintenance or pausing, or network conditions can interrupt sync; local features keep working offline. We may add, change or remove features (including sync mechanics and retention windows) in new releases; material adverse changes are noted in release notes. No service credits.

## 7. Your data and IP

You retain ownership of everything you enter into the app. Using the app grants us no intellectual-property licence: the only channel through which such content can leave your device is the sync window you control, and even that window cannot be attributed to you by the operator without your code. You warrant that your content does not infringe any third party's rights. If you contribute code or documentation to the repository, the repository's contribution terms (and MIT on merge) apply to the contribution.

## 8. Disclaimers

To the maximum extent permitted by law: the software is provided "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED (INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT), per `LICENSE`. We do not promise that your tasks or focus data will never be lost (hardware failure, deleted localStorage, lost sync code), that sync is instantaneous, or that the app will meet any deadline you may have. Back up via CSV export.

## 9. Limitation of liability

To the maximum extent permitted by law, the operator and contributors are not liable for indirect, incidental, special, consequential or punitive damages, or for loss of profits, data, goodwill or work time, arising from or related to the app — even if advised of the possibility. Direct-damage liability, if any cannot be excluded, is capped at the amount you paid for the app (zero for the free build) or the minimum the law requires, whichever is higher. Nothing here limits liability that cannot be limited by law (e.g. intent, gross negligence, personal injury where non-excludable).

## 10. Termination

You may stop at any time: turn sync off (purges the cloud window), delete local data (Settings → Danger zone → Delete all data), or uninstall. We may suspend or terminate abusive sync spaces or backend access under §5 without notice; local app functions already installed are unaffected. §§7–9 and 11–14 survive termination.

## 11. Governing law and disputes

We will first seek an amicable resolution through https://github.com/wes383/orkest-todo/issues. If that fails, the laws and courts of the country in which the operator is established apply, to the maximum extent permitted by your local mandatory law; the operator will confirm that country on request through the same channel. Non-waivable consumer rights are unaffected.

## 12. EU/EEA and UK consumers

Mandatory consumer law — including the Unfair Contract Terms Directive, the UK Consumer Rights Act 2015 and the consumer rules of your country of residence — prevails over any conflicting provision; the remainder stands.

- **Price and withdrawal.** The app and the mobile page are free; no payment and no personal data are required as counter-performance. Downloading does not engage distance-selling withdrawal rights, and the optional sync can be switched off at any time, purging the cloud window (§4).
- **Complaints.** Contact the operator first (see `PRIVACY.md` §15); thereafter consumer redress bodies, national enforcement authorities or the courts. The European ODR platform was discontinued on 20 July 2025. Data-protection complaints: the national supervisory authority, or the ICO in the UK.
- **Choice of law and forum (§11).** Article 6 of the Rome I Regulation, and Brussels I or the equivalent UK rules, preserve the mandatory protections of the consumer's country of residence; section 11 applies only to the extent it does not remove them.

## 13. US state residents

Sections 8 and 9 apply only as far as the law of your state permits; where a provision is unenforceable for a resident, it is severed as to that resident, the remainder continues, and liability is limited to the greatest extent permitted. No arbitration clause, class-action waiver or distant-forum clause is used to cut off a state-law remedy.

Exercising a privacy right (see `PRIVACY.md` §13) does not affect service, support or access; no fee is charged to exercise a privacy right, and no financial incentive is offered in exchange for personal information.

## 14. Changes to these Terms

Versioned with the code (`Version 1.0`, effective date above); material changes are noted in release notes before they take effect. Continued use after the effective date means acceptance — except where a change widens what the sync window carries, in which case acceptance is given by keeping sync on rather than by continued use alone (see `PRIVACY.md` §12).

---

## 中文

**运营者与联系。** 运营者是 Orkest Todo 仓库的维护者——即发布构建并运行同步后端的一方。联系方式：https://github.com/wes383/orkest-todo/issues（请在彼处索取私密渠道，切勿公开同步码）。

### 一、产品与接受

Orkest Todo 是免费、开源（MIT，见 `LICENSE`）、本地优先的待办与专注应用：无账号、无收费、无广告。本协议是你与文首所列运营者之间的使用合同。安装、启动、使用本应用或打开手机页，即构成对本协议的接受；若不同意，请勿使用本应用。

### 二、许可与开源

代码按 MIT 许可：可使用、复制、修改、合并、出版、发行、再许可，须保留版权声明（见 `LICENSE`）。本协议管的是“运行中产品的使用”（含托管构建与 Supabase 同步通道），不影响你对代码本身的 MIT 权利。构建产物可能内嵌第三方开源组件，适用其各自许可。

### 三、资格与你的责任

须具备接受本协议的行为能力（未成年人仅可通过监护人代为接受）。你承诺：(a) 合法、仅为个人效率目的使用；(b) 不滥用同步（猜测他人同步码、泛洪后端、绕过 RLS 窥探他人空间）；(c) 妥善保管同步码——持有同步码即可读写该专注窗口；(d) 重要内容自行备份（CSV 导出）；(e) 保持设备与操作系统更新并加锁。你对录入本应用的内容（任务、备注、清单名）负责，并应遵守所在地法律。

### 四、产品事实（构成以下条款的前提）

本地优先：任务、备注、标签、子任务与完整专注档案只存于本机 localStorage，从不经由网络传输。专注同步可选、默认关闭；开启后，仅约 2 天滚动窗口内的专注记录、开关状态、清单名称/顺序与最短/最长规则经 Supabase 通道传输（详见 `PRIVACY.md` 第四条与 `supabase-schema.sql`）。关闭同步或更换同步码即清空或抛弃云端窗口，本机数据不受影响。轮询节奏（桌面约 5 秒、手机 10 秒）、退避与服务端每周过期（30 天无心跳空间、孤儿行、7 天段下限）是设计的一部分，不构成服务等级（SLA）承诺。

### 五、禁止行为

下列行为予以禁止：违法；侵害他人权利；向任何同步字段写入恶意或违法内容；攻击、抓取、压垮 Supabase 项目、手机页托管方或 GitHub 仓库；公开同步码后又就该码所打开的内容追究运营者责任；冒充他人产品或移除许可声明。为保护后端，我们可限流、封禁滥用同步码或空间、变更后端，无须事先通知。

### 六、可用性、变更、无 SLA

“按原样”提供，不承诺在线率、兼容性或特定用途适用性：系统更新、WebView 变化、Supabase 维护或暂停、或网络状况都可能中断同步；本地功能离线照常可用。新版本可增删改功能（含同步机制与保留窗口）；不利的实质变更将在 release notes 说明。无服务补偿。

### 七、你的数据与知识产权

你在本应用中录入的一切内容归你所有。使用本应用不向我们授予任何知识产权许可：除你自行掌控的同步窗口外，应用不存在其他上传此类内容的途径；而该窗口在缺少同步码时，运营者亦无法将其归属到你。你保证所录内容不侵犯他人权利。向仓库贡献代码或文档的，该贡献适用仓库贡献规则（合并后按 MIT）。

### 八、免责

在法律允许的最大范围内：软件“按原样”提供，不作任何明示或默示保证（包括适销性、特定用途适用性、非侵权），见 `LICENSE`。我们不承诺任务或专注数据永不丢失（硬件故障、localStorage 被清、同步码遗失）、同步实时到达，或能满足你的任何时限。请使用 CSV 导出备份。

### 九、责任限制

在法律允许的最大范围内，运营者与贡献者不对间接、附带、特殊、后果性或惩罚性损害，或利润、数据、商誉、工时损失负责——即使已被告知可能发生。确不能排除的直接损害，以你为本应用支付的金额（免费构建为零）或法律要求的最低额中较高者为上限。本条不限制依法不能限制的责任（如故意、重大过失、依法不能排除的人身损害）。

### 十、终止

你可随时终止使用：关闭同步（清空云端窗口）、删除本机数据（设置 → 危险区 → 删除所有数据）、卸载。滥用同步空间或后端访问的，我们可按第五条不经通知暂停或终止；已安装的本地功能不受影响。第七至九条与第十一至十四条在终止后继续有效。

### 十一、准据法与争议

争议将先经 https://github.com/wes383/orkest-todo/issues 友好协商；协商不成的，在当地强制法允许的最大范围内，适用运营者设立地国家的法律并由其法院管辖——该国家可经同一渠道询问确认。不可放弃的消费者权利不受影响。

### 十二、欧盟/欧洲经济区及英国消费者

本协议不排除或限制你依强制性消费者法享有的权利，包括《不公平合同条款指令》、英国《2015 年消费者权益法》以及惯常居所地国的消费者保护规则；若某条款与之冲突，以该法为准，其余部分继续有效。

- **价格与撤回权。** 桌面应用与手机页免费提供，无需付款，也不以个人信息作为对价。下载不触发远程销售规则下的撤回权；可选同步可随时关闭，关闭即清空云端窗口（见第四条）。
- **投诉途径。** 请先联系运营者（见 `PRIVACY.md` 第十五条）；此后可向所在国消费者救济机构、执法机关或法院求助。欧盟在线争议解决（ODR）平台已于 2025 年 7 月 20 日停止运营。数据保护投诉：可向本国监管机构提出，英国为 ICO。
- **准据法与管辖（第十一条）。** 《罗马条例 I》第 6 条及布鲁塞尔条例 I（或英国相应规则）保留消费者惯常居所地国的强制性保护；第十一条仅在不妨碍上述保护的范围内适用。

### 十三、美国各州居民

第八条与第九条仅在你所在州法律允许的范围内适用；相关条款对某居民不具执行力时，仅对该居民部分无效，其余部分继续有效，责任限于法律允许的最大限度。本协议不使用仲裁条款、集体诉讼弃权或异地管辖条款限制州法救济。

行使隐私权（见 `PRIVACY.md` 第十三条）不影响服务、支持或访问；行使隐私权不收费，也不以个人信息换取任何财务激励。

### 十四、协议变更

随代码版本管理（版本号 1.0，以文首生效日期为准）；实质变更将在 release notes 中提前说明。生效后继续使用即表示接受——但若变更扩大了同步窗口所传输的内容，则接受方式为保持同步开启，而非仅凭继续使用应用（见 `PRIVACY.md` 第十二条）。
