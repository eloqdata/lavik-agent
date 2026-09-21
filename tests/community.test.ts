import test from "node:test";
import assert from "node:assert/strict";
import worker from "../apps/worker/index.ts";
import {
  communityLinks,
  communityRedirect,
} from "../packages/community/links.ts";

test("stable community addresses use current destinations without caching or starting admin work", async () => {
  const env = {
    ADMIN_ENABLED: "false",
    ASSETS: {
      async fetch() {
        return new Response("site");
      },
    },
    ADMIN_STORE: {
      idFromName() {
        throw new Error("must not access admin storage");
      },
      get() {
        throw new Error("must not access admin storage");
      },
    },
  };
  for (const channel of ["slack", "discord"] as const)
    for (const method of ["GET", "HEAD"])
      for (const slash of ["", "/"]) {
        const response = await worker.fetch(
          new Request(
            `https://lavik.dev/community/${channel}${slash}?next=https://example.com`,
            { method },
          ),
          env,
        );
        assert.equal(response.status, 302);
        assert.equal(response.headers.get("Location"), communityLinks[channel]);
        assert.equal(response.headers.get("Cache-Control"), "no-store");
      }
  assert.equal(
    (await worker.fetch(new Request("https://lavik.dev/api/runner/claim"), env))
      .status,
    410,
  );
  assert.equal(
    communityRedirect(new Request("https://lavik.dev/community/unknown/")),
    undefined,
  );
  assert.equal(
    communityRedirect(
      new Request("https://lavik.dev/community/slack/", { method: "POST" }),
    ),
    undefined,
  );
});
