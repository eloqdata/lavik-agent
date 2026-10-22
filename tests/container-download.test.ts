import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

test("0.2.0 container instructions stop before a stale image can run after failed verification or build", () => {
  const bundle = path.resolve(
    "apps/web/public/installation-assets/0.2.0/docker-source.tar.gz",
  );
  for (const snippet of ["docker-start.sh", "compose-download.sh"])
    for (const failure of ["checksum", "build"]) {
      const directory = fs.mkdtempSync(
          path.join(os.tmpdir(), "lavik-container-guard-"),
        ),
        bin = path.join(directory, "bin"),
        log = path.join(directory, "docker.log");
      fs.mkdirSync(bin);
      fs.writeFileSync(
        path.join(bin, "curl"),
        failure === "checksum"
          ? "#!/bin/sh\nprintf invalid > docker-source.tar.gz\n"
          : '#!/bin/sh\ncp "$FIXTURE_BUNDLE" docker-source.tar.gz\n',
        { mode: 0o755 },
      );
      fs.writeFileSync(
        path.join(bin, "docker"),
        '#!/bin/sh\nprintf "%s\\n" "$*" >> "$DOCKER_CALLS"\n[ "$1" != build ]\n',
        { mode: 0o755 },
      );
      try {
        const result = spawnSync(
          "bash",
          [path.resolve(`verification/docs/0.2.0/${snippet}`)],
          {
            cwd: directory,
            env: {
              NODE_ENV: "test",
              PATH: `${bin}:${process.env.PATH}`,
              FIXTURE_BUNDLE: bundle,
              DOCKER_CALLS: log,
            },
            encoding: "utf8",
          },
        );
        assert.notEqual(result.status, 0, `${snippet}/${failure} must fail`);
        const calls = fs.existsSync(log) ? fs.readFileSync(log, "utf8") : "";
        if (failure === "checksum") assert.equal(calls, "");
        else assert.match(calls, /^build /);
        assert.doesNotMatch(calls, /^run /m);
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
});

test("container startup polls transient readiness and stops on timeout or fatal cluster status", () => {
  for (const snippet of [
    "compose-start.sh",
    "compose-restart.sh",
    "docker-restart.sh",
  ])
    for (const scenario of ["eventually-ready", "unavailable", "fatal"]) {
      if (snippet === "docker-restart.sh" && scenario === "fatal") continue;
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lavik-ready-"));
      const bin = path.join(directory, "bin");
      fs.mkdirSync(bin);
      fs.writeFileSync(path.join(bin, "sleep"), "#!/bin/sh\nexit 0\n", {
        mode: 0o755,
      });
      fs.writeFileSync(
        path.join(bin, "docker"),
        `#!/bin/sh
case "$*" in
  *cluster-status*|*'--raw PING'*)
    count=0
    [ ! -f "$CHECK_COUNT" ] || count=$(cat "$CHECK_COUNT")
    count=$((count + 1))
    echo "$count" > "$CHECK_COUNT"
    [ "$SCENARIO" != fatal ] || exit 1
    if [ "$SCENARIO" = eventually-ready ] && [ "$count" -ge 3 ]; then
      case "$*" in *cluster-status*) echo '{"cluster_ready":true}' ;; *) echo PONG ;; esac
      exit 0
    fi
    [ "$count" -ne 1 ] || exit 3
    exit 2 ;;
esac
printf '%s\\n' "$*" >> "$AFTER_LOG"
`,
        { mode: 0o755 },
      );
      try {
        const result = spawnSync(
          "bash",
          [path.resolve(`verification/docs/0.2.0/${snippet}`)],
          {
            cwd: directory,
            env: {
              NODE_ENV: "test",
              PATH: `${bin}:${process.env.PATH}`,
              SCENARIO: scenario,
              CHECK_COUNT: path.join(directory, "count"),
              AFTER_LOG: path.join(directory, "after"),
            },
            encoding: "utf8",
            timeout: 10000,
          },
        );
        assert.equal(
          result.status,
          scenario === "eventually-ready" ? 0 : 1,
          `${snippet}/${scenario}: ${result.stderr}`,
        );
        const count = Number(
          fs.readFileSync(path.join(directory, "count"), "utf8"),
        );
        assert.equal(
          count,
          scenario === "eventually-ready" ? 3 : scenario === "fatal" ? 1 : 60,
        );
        if (snippet === "docker-restart.sh") {
          const calls = fs.readFileSync(path.join(directory, "after"), "utf8");
          assert.equal(
            calls.includes("GET greeting"),
            scenario === "eventually-ready",
          );
        }
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
});

test("container entrypoint respects both forms of the shards option and legacy worker aliases", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lavik-shards-"));
  fs.writeFileSync(
    path.join(directory, "lavik"),
    '#!/bin/sh\nprintf "%s\\n" "$@"\n',
    { mode: 0o755 },
  );
  try {
    for (const explicit of [
      ["--shards", "8"],
      ["--shards=8"],
      ["--threads", "8"],
      ["-t", "8"],
      [],
    ]) {
      const result = spawnSync(
        "bash",
        [
          path.resolve("packaging/docker/0.2.0/docker-entrypoint.sh"),
          "lavik",
          ...explicit,
          "--data-file",
          "/unused",
          "--log-dir",
          directory,
          "--bind",
          "127.0.0.1",
          "--port",
          "6379",
          "--no-pin-workers",
          "--nologtostderr",
        ],
        {
          env: {
            NODE_ENV: "test",
            PATH: `${directory}:${process.env.PATH}`,
            LAVIK_THREADS: "2",
          },
          encoding: "utf8",
        },
      );
      assert.equal(result.status, 0, result.stderr);
      const actual = result.stdout.trim().split("\n");
      const workerOptions = actual.filter((arg) =>
        /^--(?:shards|threads)(?:=|$)|^-t$/.test(arg),
      );
      assert.equal(workerOptions.length, 1, result.stdout);
      assert.equal(workerOptions[0], explicit[0] ?? "--threads");
      if (!explicit.length) assert.equal(actual.at(-1), "2");
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
