// Public documentation versions are independent of historical benchmark locks.
export const docVersions = ["0.1.0", "0.1.0-beta.1"] as const;
export type DocVersion = (typeof docVersions)[number];
export const defaultDocVersion: DocVersion = "0.1.0";
export const betaDocVersion: DocVersion = "0.1.0-beta.1";
export function isDocVersion(value: string): value is DocVersion {
  return docVersions.some((version) => version === value);
}
export function docVersionForRoute(route: string): DocVersion | undefined {
  const [section, version] = route.split("/");
  if (section === "docs" && version && isDocVersion(version)) return version;
  return route === "docs" ? defaultDocVersion : undefined;
}
export function downloadPath(locale: string, version: DocVersion) {
  return `/${locale}/download/${version === defaultDocVersion ? "" : `${version}/`}`;
}
