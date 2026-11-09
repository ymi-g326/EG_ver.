/** GitHub project Pages lives below /EG_ver./; normal local/Sites builds use /. */
export function joinAppPath(path: string, base: string) {
  if (!path.startsWith("/") || path.startsWith("//")) return path;
  return `${base.replace(/\/$/, "")}${path}`;
}

export const appPath = (path: string) => joinAppPath(path, process.env.NEXT_PUBLIC_EG_BASE_PATH ?? "");
export const apiPath = (path: string) => joinAppPath(path, process.env.NEXT_PUBLIC_EG_API_ORIGIN ?? "");
export const earthRequest = (path: string, options?: RequestInit) => fetch(apiPath(path), options);
