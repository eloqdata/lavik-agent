import { hash, readText, renderingHash } from "./repository.ts";

export const publicationRenderingHash = () =>
  hash(
    JSON.stringify({
      legacy: renderingHash(),
      renderer: readText("apps/web/components/content-v2.tsx"),
    }),
  );
export const publicationPolicyHash = () =>
  hash(
    JSON.stringify(
      [
        "policies/operating-policy.json",
        "policies/writer.md",
        "policies/reviewer.md",
        "policies/manual-writer.md",
        "policies/manual-reviewer.md",
        "policies/blog-writer.md",
        "policies/blog-reviewer.md",
      ].map((file) => [file, readText(file)]),
    ),
  );
