# 在手机上查看 READ

## 方式一：USB 安装最新 APK（推荐，最接近真实手机效果）

一次性准备：

1. 手机设置 → 关于手机 → 连续点「版本号」7 次。
2. 设置 → 开发者选项 → 打开「USB 调试」。
3. USB 连接电脑，手机上点「允许 USB 调试」。
4. 电脑上确认能看到设备：

```powershell
adb devices
```

之后每次改完代码，在 `D:\READ` 运行：

```powershell
.\scripts\phone.ps1
```

脚本会自动构建 APK、覆盖安装、打开 READ。只安装现成 APK、不重新构建：

```powershell
.\scripts\phone.ps1 -SkipBuild
```

APK 位置：`D:\READ\READ-debug.apk`，也可以直接发到手机安装。

如果 `adb devices` 显示 `unauthorized`，重新插拔 USB，并在手机上允许调试。

## 方式二：手机浏览器预览 Web 版（改代码立刻刷新）

手机和电脑连同一个 Wi-Fi，在 `D:\READ` 运行：

```powershell
.\scripts\phone.ps1 -Web
```

屏幕会打印类似：

```text
http://10.23.182.110:5173
```

手机浏览器打开这个地址即可。Vite 会热更新，改样式/组件后手机自动刷新。

注意：

- 这是 Web 预览，**没有 Android 原生壳**：状态栏隐藏、返回键、APK 安装行为不会完全一致。
- 打不开通常是 Windows 防火墙拦截 Node.js，允许「专用网络」即可。
- 公司/校园 Wi-Fi 可能隔离设备；改用 USB 端口转发：

```powershell
npm run dev
adb reverse tcp:5173 tcp:5173
```

然后手机浏览器打开 `http://localhost:5173`。

## 方式三：无线调试（Android 11+，不想插线）

手机开发者选项 → 无线调试 → 使用配对码配对：

```powershell
adb pair 手机IP:配对端口
adb connect 手机IP:调试端口
adb devices
.\scripts\phone.ps1 -SkipBuild
```

## 怎么选

| 目的 | 方式 |
| --- | --- |
| 看最新 APK 的真实效果 | USB + `.\scripts\phone.ps1` |
| 快速改 UI、看布局 | `.\scripts\phone.ps1 -Web` + 手机浏览器 |
| 不想插线 | 无线调试，或直接把 `READ-debug.apk` 发到手机 |
