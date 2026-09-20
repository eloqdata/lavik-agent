import type { NextConfig } from "next";

const config: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  poweredByHeader: false,
  typescript: { tsconfigPath: "../../tsconfig.json" },
};
export default config;
