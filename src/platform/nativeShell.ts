import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

/**
 * Android 硬件返回键：先让当前页面处理（面板/抽屉/确认框），
 * 没人处理时从阅读页回书架，已在书架则退出 App。
 * Web 端不注册，保持浏览器行为不变。
 */
export function installNativeBackButton(): void {
  if (!Capacitor.isNativePlatform()) return;
  void App.addListener('backButton', () => {
    const event = new CustomEvent('read:back', { cancelable: true });
    const handled = !window.dispatchEvent(event);
    if (handled) return;

    const hash = window.location.hash;
    if (hash && hash !== '#/' && hash !== '') {
      window.location.hash = '#/';
      return;
    }
    void App.exitApp();
  }).catch(() => {
    /* 非 Android 平台或插件未注册时忽略 */
  });
}
