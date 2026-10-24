# READ · 极简本地阅读器

一个极简的本地阅读器：**导入书，读完，下次打开还在那一行。**

当前支持 **EPUB**、**PDF** 与 **TXT**。EPUB 走流式重排引擎；PDF 走独立的按页渲染管线；TXT 在导入时转换为 EPUB，复用流式引擎。三者共用书架、进度、书签与主题。

当前仓库是 **Web 版**，**Android debug APK 已经可以构建并安装**；Windows 桌面端仍按 [`PLAN.md`](./PLAN.md) 的 Tauri 路线推进。

## 原则

极简指**形态、层级和工程结构**，不是功能少。功能可以完整，界面不能变满。

- 一个阅读面：书架 → 阅读页 → 覆盖层；新功能进入抽屉 / 面板 / 手势，不新增常驻工具栏、标签页或侧栏。
- 视觉安静：纸感单列、720px 正文、三种主题、一个强调色、线性图标；留白优先，阴影和渐变只表达层级。
- 交互一条线：打开 → 阅读 → 回到原处；同一件事不提供两套入口。
- 工程薄：一个代码库、两个薄壳；平台差异进 `src/platform/`；依赖少而稳定。
- 功能可以多，但必须能安静地放进现有阅读面。

## 文档

| 文档 | 内容 |
| --- | --- |
| [`PLAN.md`](./PLAN.md) | Windows 桌面 / Android APK 的极简平台规划、改造清单、里程碑与风险 |
| [`PHONE.md`](./PHONE.md) | 在手机上查看 / 调试 READ 的几种方式 |
| `README.md` | 本文：怎么跑、目录结构、已知限制 |

## 快速开始

```bash
npm install
npm run dev          # http://127.0.0.1:5173
```

空书架点「选择文件」，或直接把下面这些示例拖进窗口：

`public/samples/` 里还有几本可以直接拖进窗口的书：

| 文件 | 格式 | 说明 |
| --- | --- | --- |
| `西游记.epub` | EPUB | 古登堡公版文本转成 EPUB，91 章带完整目录 |
| `三国演义.txt` | TXT | 古登堡公版文本，108 回，导入时自动切章 |
| `fixed-layout.pdf` | PDF | 6 页中文样本，含 7 项大纲（其中一项为整数页码目标），验证渲染、页码与大纲跳转 |
| `night-boat.epub` | EPUB | 自制《夜行船》，8 章，含插图与脚注 |
| `shanhai-utf8.txt` / `shanhai-gbk.txt` | TXT | 同一内容的两种编码，验证 GBK 不乱码 |

```bash
npm run build        # 类型检查 + 生产构建
npm run preview      # 预览构建产物
npm run sample       # 重新生成示例 EPUB
node scripts/make-sample-pdf.mjs   # 重新生成示例 PDF（需 Windows 字体）
node scripts/make-sample-txt.mjs   # 重新生成 UTF-8 / GBK 两份 TXT
```

## 技术栈

| 层 | 选择 | 说明 |
| --- | --- | --- |
| 框架 | React 19 + TypeScript + Vite | 纯前端，无后端、无账号 |
| EPUB 引擎 | [epub.js](https://github.com/futurepress/epub.js) 0.3.x | 解析、CFI、分页、定位 |
| PDF 引擎 | [pdf.js](https://mozilla.github.io/pdf.js/) (pdfjs-dist 6) | 按页渲染到 canvas、大纲、封面 |
| 状态 | Zustand | 全局排版设置与提示 |
| 存储 | Dexie（IndexedDB） | 书籍 Blob、进度、书签、设置 |
| 样式 | 手写 CSS + 设计变量 | 阅读器需要精确的排版控制 |
| 桌面壳 | Tauri 2（规划） | Windows 安装包、原生文件对话框、文件关联 |
| Android 壳 | Capacitor 8.5.3 + `@capacitor/app` | Android 工程、返回键；debug APK 已跑通 |

PDF 的 CMap 与标准字体已复制到 `public/pdfjs/`，用于中文 PDF 与未嵌入字体的文件，不依赖 CDN。

## 平台计划

当前先保持 Web 版可运行、四套 QA 可回归；Windows 与 Android 共用同一套 React 阅读器，通过 `src/platform/` 适配文件、外链和系统能力，不复制平台专属阅读界面。详细决策、改造顺序、验收标准与风险表见 [`PLAN.md`](./PLAN.md)。

```bash
npm run android:sync    # 构建 Web 并同步到 Android 工程
npm run android:debug   # 生成 debug APK
npm run dev:desktop     # 规划：Tauri 开发窗口
npm run build:desktop   # 规划：Windows 安装包
```

## Android 构建

当前环境已验证：**JDK 21**（`D:\dev\jdk21`）+ **Android SDK 36 / build-tools 36** + Gradle 8.13。

> Capacitor 8 的 Android 库用 Java 21 编译，JDK 17 会报 `invalid source release`。不要用系统里旧的 JDK 17；`JAVA_HOME` 必须指向 JDK 21。

```powershell
$env:JAVA_HOME = 'D:\dev\jdk21'
$env:ANDROID_HOME = 'C:\Users\14152\Android\Sdk'
npm run android:debug
```

APK 输出：

```
android/app/build/outputs/apk/debug/app-debug.apk
D:\READ\READ-debug.apk              # 方便安装的副本
```

- `appId` 为 `app.read.reader`，`appName` 为 `READ`，`targetSdkVersion = 36`。
- 当前是 **debug 签名**，可直接侧载测试；上架/分发前需要配置 release keystore 并生成 AAB。
- **沉浸式全屏**：Android 状态栏已隐藏（顶部下滑可临时唤出），保留底部手势/导航栏；`windowLayoutInDisplayCutoutMode = shortEdges` 避免刘海区出现黑边。
- Android 返回键已经接入：先关面板/控制层，再回书架，最后退出 App。
- 手机连接 USB 后，可以一条命令构建、安装并打开：`.\scripts\phone.ps1`；详见 [`PHONE.md`](./PHONE.md)。
- 文件导入走 WebView 原生 `<input type="file">`（系统 DocumentsUI），暂未接独立的 SAF 插件。
- 已在 Pixel 7 / API 34 模拟器验证：启动、示例书导入、EPUB 阅读、DocumentsUI 选 EPUB/PDF、PDF 渲染、返回键。
- 旧 WebView 113 缺 `Promise.withResolvers` 与 `ArrayBuffer.transfer*`，已通过 `src/lib/polyfills.ts` 和 PDF.js legacy build 兼容。

## 目录结构

```
src/
├── engine/
│   ├── ReaderEngine.ts      # EPUB 阅读引擎接口
│   └── EpubJsEngine.ts      # epub.js 实现：CFI、分页、注入样式、点按区域
├── formats/
│   ├── detect.ts            # 扩展名 + 魔数识别 EPUB / PDF / TXT
│   ├── pdf.ts               # pdf.js 封装：打开、封面、大纲、错误归类
│   └── txt.ts               # 编码探测、章节切分、生成 EPUB
├── pages/
│   ├── LibraryPage.tsx      # 书架、继续阅读、拖拽导入、重命名 / 删除菜单
│   ├── ReaderPage.tsx       # 按格式分发到下面两个阅读器
│   ├── EpubReaderPage.tsx   # EPUB：分页、排版、目录、书签
│   └── PdfReaderPage.tsx    # PDF：按页渲染、缩放、页码进度
├── storage/                 # Dexie 表结构与读写
├── platform/fileSource.ts   # 文件来源（Web 实现；桌面/Android 适配见 PLAN.md）
├── lib/                     # 导入流程、主题、工具函数
├── components/
└── styles.css

src-tauri/                   # 规划：Windows 桌面壳（Tauri 2）
android/                     # Capacitor 8 Android 工程（debug APK 已跑通）
capacitor.config.json        # appId / appName / https://localhost
PLAN.md                      # 平台迁移计划
```

三个可替换边界：`ReaderEngine`（EPUB 渲染）、`repository`（存储）、`fileSource`（文件访问）。桌面/Android 只扩展后两者和外壳，不复制阅读器。

## 已实现

**通用**
- 导入：选择 / 拖拽 · EPUB / PDF / TXT · SHA-256 去重 · 封面 · 元数据 · 失败给出原因
- 书架：封面墙 · 进度 · 继续阅读 · 重命名 / 删除菜单（删除连带清理进度与书签）
- 书签：添加 / 列表 / 跳转 / 删除（带撤销）
- 主题：日间 / 护眼 / 夜间

**EPUB**
- 分页、按章加载、目录跳转、脚注与内链（可返回原处）
- 字号 5 档、行距 4 档、页边距 3 档、宋体/黑体
- 点击区 30/40/30、键盘、触摸滑动、进度条拖拽
- 导入时直接读 zip 统计各节字数，不生成全书定位索引：300 章的书导入约 0.13s（原先约 32s）

**TXT**
- 自动识别 UTF-8 / UTF-16 / GB18030，GBK 文件不乱码
- 按「第 X 章 / 回 / 卷」「序章 / 番外」「Chapter N」切分章节，认不出时按 4200 字分节
- 单章超过 16000 字自动拆成「（续 N）」
- 解析「书名：」「作者：」，缺失时用文件名
- 导入即转成 EPUB，排版、续读、书签与 EPUB 完全一致；进度按章节字数权重计算，30 万字导入约 0.2s

**PDF**
- 按页渲染（canvas）、导入时用首页生成封面
- 整页 / 100%（实际大小）/ 适宽三档缩放；桌面默认 100%、手机默认适宽，选择会记住
- 适宽模式下先滚动到页尾再翻页，不会跳过未读内容
- 大纲目录（换算为页码）、页码进度与续读、页码书签
- 夜间对整页做反色，扫描件同样生效

## 已知限制

- PDF 不支持选中文字、全文搜索、批注、重排；扫描件没有文本层，也无法 OCR。
- PDF 的夜间模式是整页反色，彩色插图会随之变色（设置面板中已注明）。
- TXT 不还原空格对齐、分栏与插图；超过 30MB 会被拒绝。
- 不支持 MOBI / AZW3 / CBZ / FB2；导入时会明确提示。
- 排版设置（字号等）只作用于 EPUB / TXT，PDF 只保留主题与缩放。
- 只有分页模式，竖向连续滚动尚未实现。
- 同一 XHTML 内含多个目录锚点时，当前章节名与「上一章 / 下一章」按文件粒度判断，可能显示该文件的第一个标题。
- 尚未接入 PWA 离线缓存；单书排版覆盖、数据导出/清空入口、存储配额提示留到 1.1。
- 导入暂不区分 DRM、缺失 `container.xml` 等具体原因，统一提示「可能已损坏、加密或不是 EPUB」。

## 验证脚本

```bash
node scripts/qa.mjs         # EPUB 桌面全流程 + 脚注回跳 + 完成状态
node scripts/qa-pdf.mjs     # PDF 导入、渲染、滚动/翻页、缩放、大纲、续读
node scripts/qa-txt.mjs     # TXT 导入（UTF-8 / GBK）、章节、续读
node scripts/qa-mobile.mjs  # 390×844 触摸 + 320 窄屏溢出检查
```

截图输出到 `shots/`。脚本使用本机 Chrome（`playwright-core`，不额外下载浏览器）。

## 数据与隐私

书籍、封面、进度、书签全部保存在浏览器 IndexedDB（`read-db`），不上传、不统计、无第三方 SDK。
清除浏览器站点数据会一并清除书库，请勿在隐私模式下长期使用。
