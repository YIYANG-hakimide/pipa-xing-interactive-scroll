export function publicAssetUrl(path: string): string {
  const normalizedPath = path.replace(/^\/+/, "");
  return new URL(`${import.meta.env.BASE_URL}${normalizedPath}`, document.baseURI).href;
}
