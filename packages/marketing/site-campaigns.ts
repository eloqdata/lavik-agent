export type CampaignPage = {
  id: string;
  locale: string;
  canonical: string;
  title: string;
};

// Stable campaign identities span languages; destination paths retain the
// documentation version so existing share links never silently change release.
export function siteCampaigns(version: string): CampaignPage[] {
  const pages = [
    ["site-home", "", "Landing Page", "首页"],
    ["site-download", "download/", "Download", "下载"],
    [
      "install-binary",
      `docs/${version}/quick-start/`,
      "Install with Binary",
      "使用二进制安装",
    ],
    [
      "install-packages",
      `docs/${version}/install-packages/`,
      "Install from Packages",
      "使用软件包安装",
    ],
    [
      "install-docker",
      `docs/${version}/install-docker/`,
      "Install with Docker",
      "使用 Docker 安装",
    ],
    [
      "install-docker-compose",
      `docs/${version}/install-docker-compose/`,
      "Install with Docker Compose",
      "使用 Docker Compose 安装",
    ],
  ];
  return pages.flatMap(([id, path, en, zh]) =>
    ["en", "zh-CN"].map((locale) => ({
      id,
      locale,
      title: locale === "en" ? en : zh,
      canonical: `https://lavik.dev/${locale}/${path}`,
    })),
  );
}
