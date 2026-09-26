import test from "node:test";
import assert from "node:assert/strict";
import { waitForDeployment } from "../packages/marketing/deployment.ts";
test("pending CI cannot fall through to publication after the polling deadline", async () => {
  let now = 0,
    reads = 0,
    verified = false;
  await assert.rejects(async () => {
    await waitForDeployment({
      timeoutMs: 30_000,
      now: () => now,
      sleep: async (ms) => {
        now += ms;
      },
      readRuns: async () => {
        reads++;
        return [
          {
            status: "in_progress",
            conclusion: null,
            url: "https://example.test/run",
          },
        ];
      },
      onRun: async () => {},
    });
    verified = true;
  }, /timed out/);
  assert.equal(reads, 2);
  assert.equal(verified, false);
});
test("only a completed successful workflow unlocks live article verification", async () => {
  let now = 0,
    reads = 0;
  const result = await waitForDeployment({
    now: () => now,
    sleep: async (ms) => {
      now += ms;
    },
    readRuns: async () =>
      ++reads === 1
        ? []
        : [
            {
              status: "completed",
              conclusion: "success",
              url: "https://example.test/success",
            },
          ],
    onRun: async () => {},
  });
  assert.equal(result.conclusion, "success");
  await assert.rejects(
    waitForDeployment({
      readRuns: async () => [
        {
          status: "completed",
          conclusion: "failure",
          url: "https://example.test/failure",
        },
      ],
      onRun: async () => {},
    }),
    /workflow failure/,
  );
});
