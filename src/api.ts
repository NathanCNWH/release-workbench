export async function api<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Workbench-Client": "local",
      ...options.headers,
    },
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(`服务响应异常（HTTP ${response.status}）`);
  }
  if (!response.ok)
    throw new Error(data.error || `请求失败（HTTP ${response.status}）`);
  return data as T;
}
export function post<T = any>(path: string, value: unknown = {}) {
  return api<T>(path, { method: "POST", body: JSON.stringify(value) });
}
