# READ · Windows 桌面 / Android APK 极简平台规划

> 状态：规划稿 · 2026-10-21
> 当前仓库仍是可运行的 **Web 版**（React + Vite + IndexedDB）。
> 迁移记录：工程已迁到 `D:\READ`；旧 `PRD.md` / `AGENTS.md` / `TECH_DESIGN.md` 已备份到
> `C:\Users\14152\Desktop\read-old-docs-backup-20261021-205041` 并从仓库移除。
> 当前 Web 构建与四套 QA 已在新根目录通过。本文件是下一阶段的工程计划，不再沿用旧文档。

## 0. 极简的定义（不是功能少）

极简指的是**形态、层级和工程结构**，不是功能数量。功能可以完整，但不能把界面做满、把结构做乱。

- **一个阅读面**：书架 → 阅读页 → 覆盖层。新功能进入已有层级（抽屉 / 面板 / 手势），不新增常驻工具栏、标签页、侧栏或独立设置首页。
- **视觉安静**：纸感单列、720px 正文、三种主题、一个强调色、线性图标；留白优先，阴影和渐变只用来表达层级，不做装饰。
- **交互一条线**：打开 → 阅读 → 回到原处。低频操作收进控制层，常用操作单手可达；同一件事不提供两套入口。
- **工程薄**：一个 Vite 应用、两个薄壳；平台差异只进 `src/platform/`。不复制 UI，不引入 UI 框架、路由库、图表库；依赖少而稳定。
- **功能可以多**：笔记、搜索等后续能力都可以进路线图；前提是能安静地放进现有阅读面。需要新增常驻导航或打断阅读的，先重做入口，而不是拒绝功能。
- **数据只保留一个逻辑模型**：Web 用 IndexedDB、原生发布版用 SQLite + 文件，但共享同一套 `BookRepository` 接口和数据模型；不产生第二套业务逻辑。

> 一句话：**功能可以长，界面不能长；能力可以加，层级不能加。**

## 1. 现状

- 三种格式：EPUB / TXT 走 epub.js 流式重排，PDF 走 pdf.js 按页渲染。
- 数据：书籍 Blob、进度、书签、设置全部在浏览器 IndexedDB（`read-db`），没有后端。
- 平台边界：`src/engine/ReaderEngine.ts`、`src/storage/repository.ts`、`src/platform/fileSource.ts`。
- 现有 QA：`scripts/qa.mjs`、`qa-txt.mjs`、`qa-pdf.mjs`、`qa-mobile.mjs`，跑本机 Chrome。
- 当前 Web 构建约 **708KB / gzip 218KB**；PDF worker 与 CMap 已本地化。

## 2. 目标

交付两个真正可安装/可分发的本地阅读器，同时保持 Web 版可继续开发和回归：

1. **Windows 10/11 桌面端**：安装包、原生文件对话框、拖拽导入、文件关联、记住位置。
2. **Android APK/AAB**：系统文件选择器（SAF）导入、返回键、安全区、横竖屏、记住位置。
3. **一套代码**：阅读器内核与 UI 共用，平台差异收敛到 `src/platform/` 适配层，不复制两套阅读器。
4. **离线、本地优先**：不上传书籍、不引入账号；数据可导出/备份。

## 3. 技术路线与决策

| 决策点 | 推荐 | 理由 |
| --- | --- | --- |
| Windows 外壳 | **Tauri 2 + WebView2** | 安装包小、内存低；原生对话框/文件系统/文件关联/单实例都有插件；当前 Vite 前端可直接复用 |
| Android 外壳 | **Capacitor 8.5.3 + `@capacitor/app`** | 已接入；Android WebView 对 epub.js / pdf.js / IndexedDB 支持成熟；无需重写 React |
| 共享方式 | **单 Vite 应用 + 平台适配器** | 当前代码量约 4k 行，先不上 monorepo；只在 `src/platform/` 和构建脚本分出桌面/Android |
| 阅读引擎 | 保留 **epub.js + pdf.js** | 不为了换壳重写渲染；CFI、TXT→EPUB、PDF 缩放逻辑已经稳定 |
| 存储（第一阶段） | 继续 IndexedDB | 最小改动，先验证壳、文件导入和续读 |
| 存储（发布阶段） | **SQLite + 应用目录文件** | Android WebView 的 IndexedDB 有被清理/配额风险；书籍文件放应用目录，元数据/进度/书签进 SQLite。Web 保留 Dexie 实现，两端共用 `BookRepository` 接口与数据模型 |
| PC 替代方案 | Electron 暂不选 | 体积 100MB+；除非 WebView2 出现无法绕过的渲染问题 |
| Android 替代方案 | 不做 React Native / TWA | RN 等于重写；TWA 依赖公网 PWA，无法满足本地文件导入 |

> 建议把上述作为 ADR 写进实现阶段的提交说明：ADR-001 Tauri、ADR-002 Capacitor、ADR-003 单应用 + 适配器、ADR-004 发布版原生存储、ADR-005 同一数据模型双实现。

> **Android 状态（2026-10-21）**：Capacitor 8.5.3 + `@capacitor/app` + JDK 21 + SDK 36 已完成 debug APK 构建，并在 Pixel 7（API 34）模拟器上验证：启动、示例书导入、EPUB 阅读、DocumentsUI 选择 EPUB/PDF、PDF 渲染、硬件返回键、沉浸式全屏（隐藏状态栏，顶部下滑临时唤出）。旧 WebView 113 的 `Promise.withResolvers` / `ArrayBuffer.transfer*` 已用 polyfill 兼容。APK：`android/app/build/outputs/apk/debug/app-debug.apk`，根目录副本 `READ-debug.apk`。Windows/Tauri 尚未开始。

## 4. 目标目录结构

```
D:\READ
├─ src/                       # 共享 React 应用（现有）
│  ├─ platform/
│  │  ├─ fileSource.ts        # Web 实现
│  │  ├─ desktopFileSource.ts # Tauri 实现（规划）
│  │  ├─ androidFileSource.ts # Capacitor 实现（规划）
│  │  ├─ nativeShell.ts       # 已接入：Android 返回键
│  │  ├─ shell.ts             # 打开外链、窗口标题、分享（规划）
│  │  └─ index.ts             # 运行时/构建时选择实现（规划）
│  ├─ storage/
│  │  ├─ repository.ts        # 现有 Dexie 实现
│  │  └─ nativeRepository.ts  # SQLite + 文件（发布阶段）
│  └─ ...
├─ android/                   # 已生成：Capacitor 8 Android 工程
├─ capacitor.config.json      # appId / appName / https scheme
├─ src-tauri/                 # 规划：Windows 桌面壳（Tauri 2）
├─ public/                    # samples / pdfjs / 图标
├─ scripts/                   # 现有生成器与 QA
├─ PLAN.md
├─ README.md
├─ package.json
└─ vite.config.ts
```

不建议现在拆 `packages/core` / `apps/web`：等桌面/Android 壳稳定、两端确实出现不同构建需求后再拆。

## 5. 代码改造清单（按优先级）

### P0 · 平台无关的前置改造

1. **资源路径去根绝对化**
   - `src/formats/pdf.ts` 的 `cMapUrl`、`standardFontDataUrl` 目前写死 `/pdfjs/...`。
   - 改为 `import.meta.env.BASE_URL` 拼接；桌面/Android 构建时验证 worker、CMap、标准字体都能加载。
2. **文件来源接口**
   - 把 `src/platform/fileSource.ts` 扩展为：
     ```ts
     interface ImportSource {
       name: string;
       size: number;
       arrayBuffer(): Promise<ArrayBuffer>;
     }
     interface FileSource {
       pick(): Promise<ImportSource[]>;
     }
     ```
   - `importBook(file: File)` 改成接收 `ImportSource`；Web 的 `File` 天然满足。
   - Tauri 用 dialog 插件返回路径，再通过 fs 读取；Android 用 SAF 选择后复制到应用缓存再读取。
3. **外链与系统能力**
   - `EpubJsEngine.followLink()` 里的 `window.open` 改走 `Shell.openExternal()`。
   - 桌面用 Tauri opener，Android 用 Capacitor Browser；避免 WebView 里打开新窗口失败。
4. **平台能力接口**
   - `Shell.onBack()`：Android 返回键先关面板/抽屉/控制层，再回书架，最后退出。
   - `Shell.setTitle()`、`Shell.shareFile()`、`Shell.exportFile()` 按需实现。
5. **构建目标**
   - 用 `VITE_TARGET=web|desktop|android` 或运行时检测选择适配器；Web 行为保持不变。

### P1 · Windows（Tauri 2）

1. 初始化 `src-tauri/`，配置 `app.windows`（最小尺寸、标题、主题、窗口状态）。
2. 插件：`dialog`（打开文件）、`fs`（读取）、`opener`（外链）、`single-instance`（文件关联参数转发）。
3. 拖拽：用 Tauri 的 drag-drop 事件拿路径；HTML5 拖拽在 WebView2 里不作为主路径。
4. 文件关联：EPUB / PDF / TXT；双击文件启动后直接导入或打开阅读页。
5. 打包：NSIS 安装包 + 图标；后续再做代码签名和自动更新。
6. 数据目录：`%APPDATA%\<app-id>\`；发布阶段书籍文件放这里，SQLite 放元数据。

### P2 · Android（Capacitor 7）

1. `npm i @capacitor/core @capacitor/android`，`npx cap init`，`webDir: 'dist'`。
2. 文件选择：SAF picker（推荐 `@capawesome/capacitor-file-picker` 或自写插件），按 MIME 过滤
   `application/epub+zip`、`application/pdf`、`text/plain`；选中后复制到应用目录，避免 URI 失效。
3. 运行时：`@capacitor/app`（返回键/状态恢复）、`@capacitor/status-bar`、`@capacitor/safe-area`（或 CSS env）。
4. Intent filter：支持 `ACTION_VIEW` 打开外部传入的 EPUB/PDF/TXT。
5. 外观：横竖屏、刘海/手势区、Android 13+ 媒体权限最小化（SAF 不需要全盘权限）。
6. 打包：`assembleDebug` 先出 APK；发布用 `bundleRelease` + keystore，Play 上 AAB。

### P3 · 数据可靠性（发布前必须做）

1. 书籍文件：应用数据目录下的 `books/<sha256>.epub|pdf`，不存 IndexedDB Blob。
2. SQLite 表：
   - `books`（元数据 + 文件路径 + 封面路径）
   - `progress`（CFI / page / percent）
   - `bookmarks`（位置 + 摘要）
   - `settings`（全局设置）
3. `BookRepository` 接口化：Web 用 Dexie，桌面/Android 用 SQLite + 文件。
4. 导出/备份：JSON + 书籍文件；导入时按 hash 去重。
5. 迁移：当前 Web 数据可选“导出到桌面/Android 再导入”，不做隐式跨端同步（无后端）。

### P4 · 字体与排版

- Windows 字体齐全；Android 通常没有宋体/思源宋体，`serif` 可能回退到系统黑体。
- 建议内置一份 **中文衬线子集**（Noto Serif SC / Source Han Serif 的 woff2 子集），APK 预计 +3–8MB。
- 黑体继续用系统 `sans-serif`；先测 Android 实际字形再决定是否内置。

## 6. 里程碑

| 阶段 | 内容 | 预估 | 完成标准 |
| --- | --- | --- | --- |
| M0 | 搬家到 `D:\READ`、清理旧文档、基线构建/QA、git init | 0.5 天 | Web 版在 `D:\READ` 可跑，四套 QA 绿 |
| M1 | 平台适配层 + 资源路径改造 + Shell 接口 | 2–3 天 | Web 行为不变；Tauri/Capacitor 都能构建出空壳 |
| M2 | Windows Tauri MVP | 5–7 天 | 安装包可导入 EPUB/PDF/TXT、续读、拖拽、文件关联 |
| M3 | Android Capacitor MVP | 7–10 天 | APK 可 SAF 导入、返回键、横竖屏、续读、无横向溢出 |
| M4 | 原生存储 + 备份/导出 + 字体 | 5–7 天 | 杀进程/重启/升级后数据不丢；可导出再导入 |
| M5 | 签名、图标、发布说明 | 3–5 天 | Windows 安装包 / Android APK/AAB 可交付 |

总周期按 4–6 周估算；M2/M3 可以并行，但 M4 必须在首个对外版本前完成。

> **当前进度**：Android debug APK 已构建并验证启动、示例书导入、EPUB 阅读、EPUB/PDF 文件选择器、PDF 渲染和返回键；横竖屏、release 签名、真机仍待验证。M4/M5 未开始。

## 7. 验收标准

### Windows
- 安装、卸载、升级不丢数据；文件关联双击可打开。
- 导入 EPUB/PDF/TXT，关闭进程再打开，回到原位置。
- 拖拽文件、窗口缩放、最小窗口尺寸、键盘翻页正常。
- 没有 `console.error`；异常文件给出可读提示。

### Android
- 系统文件选择器（DocumentsUI）导入成功；返回键优先关面板。
- 旋转屏幕、切后台再回来，阅读位置不丢。
- 390 / 320 宽无横向溢出；刘海/手势区不遮挡控件。
- 冷启动、翻页、PDF 缩放可接受；大文件不 OOM。

### 通用
- Web 四套 QA 继续全绿。
- 桌面/Android 至少各有一条自动化或脚本化 smoke 路径。
- 数据导出后可在另一台设备恢复（书籍 + 进度 + 书签）。

## 8. 风险

| 风险 | 影响 | 应对 |
| --- | --- | --- |
| Android WebView 清理 IndexedDB / 配额 | 丢进度 | 发布前切 SQLite + 文件；M3 前不要承诺“永久保存” |
| PDF.js worker / CMap 路径在原生壳失效 | PDF 打不开或乱码 | P0 去根路径；两端各做一次中文 PDF 冒烟 |
| 大文件整本读入内存 | OOM | 移动端先降上限；后续用路径/URL 分块读取，PDF 用 range |
| WebView 渲染差异 | 排版/触摸不一致 | 真机测试；保留 Web QA；关键行为写平台冒烟 |
| Tauri/Rust/Android SDK 工具链 | 构建阻塞 | M0 就装好并跑通空壳；CI 只做 Windows/Android 各自构建 |
| 签名/商店 | 无法分发 | Windows 代码签名证书；Android keystore 提前生成并备份 |
| 中文字体缺失 | Android 排版回退 | 内置子集字体，先量 APK 体积 |
| 文件关联/Intent | 外部打开失败 | Windows single-instance 参数；Android ACTION_VIEW 测试 |
| 没有版本控制 | 无法回滚 | M0 立即 `git init`，`.gitignore` 已覆盖 node_modules/dist/shots |

## 9. 待定事项

- 应用 ID：建议 `app.read.reader`（Windows/Android 共用）。
- Windows 分发：官网/直装 exe，还是 Microsoft Store。
- Android 分发：Play 商店 AAB，还是只发 APK。
- 是否首版就做原生 SQLite，还是先用 IndexedDB 验证壳。
- 是否内置中文衬线字体；若内置，选 Noto Serif SC 子集。
- 最低系统：Windows 10 1803+（WebView2）；Android 7.0+（API 24）。

## 10. 下一步（按顺序）

1. `git init`，提交当前 Web + Android 基线（`.gitignore` 已忽略 `node_modules/`、`dist/`、`shots/`、Android 构建产物和 `*.apk`）。
2. 在 `D:\READ` 跑 `npm run build` 和四套 QA，确认 Web 无回归。
3. 完成 P0：`ImportSource`、`Shell`、PDF 资源路径、构建目标。
4. Android：验证横竖屏、真机、PDF 大文件；配置 release keystore，出签名 APK/AAB。
5. 初始化 `src-tauri/`，做 Windows 空壳 + 打开示例书 + 文件关联。
6. 两端壳稳定后再做原生存储和备份/导出。
