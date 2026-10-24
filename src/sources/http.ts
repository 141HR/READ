export interface SourceRequestOptions {
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

/**
 * 书源网络入口。当前是浏览器 fetch；以后 Tauri / Android 在这里换成原生 HTTP，
 * 其余搜索、规则、下载逻辑不需要改。
 */
export async function fetchSourceText(
  url: string,
  options: SourceRequestOptions = {},
): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: options.headers,
      signal: options.signal,
      credentials: 'omit',
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.text();
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    const message = error instanceof Error ? error.message : '网络错误';
    throw new Error(
      `访问书源失败：${message}。Web 版可能受站点跨域限制，桌面/Android 版接入原生网络后可绕过。`,
    );
  }
}
