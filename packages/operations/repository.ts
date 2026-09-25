import fs from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { readText, hash, release } from "../content/repository";
import { downloadPackages } from "../content/downloads";

const text = z
  .object({ en: z.string().min(1), "zh-CN": z.string().min(1) })
  .strict();
const block = z.discriminatedUnion("type", [
  z.object({ type: z.literal("paragraph"), text }).strict(),
  z
    .object({ type: z.literal("snippet"), name: z.string().regex(/^[a-z-]+$/) })
    .strict(),
  z.object({ type: z.literal("link"), label: text, href: z.string() }).strict(),
  z.object({ type: z.literal("list"), items: z.array(text).min(1) }).strict(),
  z
    .object({
      type: z.literal("table"),
      headers: z.array(text).min(1),
      rows: z.array(z.array(text)).min(1),
    })
    .strict(),
  z.object({ type: z.literal("promql"), text: z.string() }).strict(),
]);
const guideSchema = z
  .object({
    id: z.enum(["lavik-ctl-single-node", "lavik-ctl-ha-cluster"]),
    layout: z.enum(["single", "ha"]),
    title: text,
    summary: text,
    sections: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-z-]+$/),
            title: text,
            blocks: z.array(block).min(1),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();
export type OperationsGuide = z.infer<typeof guideSchema>;
export const operationsGuides = guideSchema
  .array()
  .parse(JSON.parse(readText("content/operations/0.1.0/guides.json")));
export const operationsRoutes = () =>
  operationsGuides.map((g) => `docs/0.1.0/${g.id}`);
export function operationSnippet(name: string) {
  if (!/^[a-z-]+$/.test(name)) throw new Error("Invalid operator snippet");
  return readText(`verification/operations/snippets/${name}.sh`).trim();
}
function filesUnder(directory: string): string[] {
  return fs
    .readdirSync(directory)
    .sort()
    .flatMap((name) => {
      const p = `${directory}/${name}`;
      return fs.statSync(p).isDirectory() ? filesUnder(p) : [p];
    });
}
export const operationsInputFiles = () =>
  [
    "scripts/verify-operations.py",
    ...filesUnder("verification/operations"),
  ].sort();
export const operationsInputHashes = () =>
  Object.fromEntries(operationsInputFiles().map((f) => [f, hash(readText(f))]));
export const operationsSourceInventory = () =>
  JSON.parse(readText("evidence/operations/0.1.0/sources.json"));
export const operationsReport = () =>
  JSON.parse(readText("evidence/operations/0.1.0/verification.json"));
export const operationsReviewedFiles = () => [
  ...operationsInputFiles(),
  ...filesUnder("evidence/operations/0.1.0"),
  "content/operations/0.1.0/guides.json",
  "packages/operations/repository.ts",
  "apps/web/components/operations.tsx",
  "apps/web/components/operations.css",
  "tests/operations.test.ts",
  "tests/browser/operations.spec.ts",
  "docs/operations-verification.md",
];

export function operationsEvidenceErrors(
  report = operationsReport(),
): string[] {
  const errors: string[] = [];
  try {
    const inventory = operationsSourceInventory();
    if (inventory.commit !== release.commit)
      errors.push("Operator sources cover a different release");
    for (const source of inventory.sources) {
      if (
        !source.file.startsWith("evidence/operations/0.1.0/sources/") ||
        source.file.includes("..") ||
        source.url !==
          `https://github.com/eloqdata/lavik/blob/${release.commit}/${source.path}` ||
        hash(readText(source.file)) !== source.sha256
      )
        errors.push(
          "Operator source snapshot does not match its pinned inventory",
        );
    }
    if (
      report.release !== release.release ||
      report.sourceCommit !== release.commit ||
      !["aarch64", "x86_64"].includes(report.nativeArch)
    )
      errors.push("Operator execution uses a different release/platform");
    if (!isDeepStrictEqual(report.fileHashes, operationsInputHashes()))
      errors.push("Operator commands or verifier changed after execution");
    if (
      !isDeepStrictEqual(
        report.packages
          .map((p: any) => `${p.variant}/${p.execution.layout}`)
          .sort(),
        ["minimal/ha", "minimal/single", "standard/ha", "standard/single"],
      )
    )
      errors.push("Operator execution matrix is incomplete or duplicated");
    for (const pkg of report.packages) {
      const asset = downloadPackages.find((p) => p.filename === pkg.filename);
      if (
        !asset ||
        asset.sha256 !== pkg.sha256 ||
        asset.arch !== pkg.arch ||
        asset.arch !== report.nativeArch ||
        asset.variant !== pkg.variant ||
        !/^sha256:[a-f0-9]{64}$/.test(pkg.imageId)
      )
        errors.push("Operator package identity is not pinned");
      const e = pkg.execution;
      const step = (name: string) =>
        e.steps.findLast(
          (s: any) => s.argv.at(-1) === `/verification/snippets/${name}.sh`,
        );
      if (
        e.status !== "passed" ||
        e.sourceCommit !== release.commit ||
        !e.platform.startsWith("Linux-") ||
        e.gracefulRestart !== "passed"
      )
        errors.push("Operator runtime or restart did not pass");
      const versions = step("versions")?.stdout.split("\n");
      if (
        versions?.length !== 3 ||
        versions[0] !== `lavik ${release.release}` ||
        !versions[1].startsWith(`lavik-meta ${release.release} (nuraft `) ||
        versions[2] !== `lavik-ctl ${release.release}`
      )
        errors.push("Operator binaries are not the same pinned version");
      for (const name of [
        `${e.layout}-init`,
        `${e.layout}-start`,
        "wait-meta",
        "create",
        "wait-ready",
        "status",
        `${e.layout}-client`,
        "inspect",
        "leader-reads",
        "stop",
      ])
        if (step(name)?.exitCode !== 0)
          errors.push(`Operator step ${name} did not pass`);
      if (
        e.initialStatus.result !== "ready" ||
        e.initialStatus.cluster_state !== "created" ||
        !e.initialStatus.serving_ready ||
        e.initialStatus.blockers.length !== 0
      )
        errors.push("Operator initialization was not ready");
      if (
        !step("create")?.stdout.includes("Cluster create accepted:") ||
        !step(`${e.layout}-client`)?.stdout.includes("hello from Lavik")
      )
        errors.push("Operator initialization/client output is missing");
      const expectedPorts = e.layout === "ha" ? [9101, 9102] : [9101];
      if (
        !isDeepStrictEqual(
          e.metrics.map((m: any) => m.port),
          expectedPorts,
        ) ||
        e.metrics.some(
          (m: any) => !m.samples.includes("lavik_cluster_control_connected 1"),
        ) ||
        e.metricCommand?.exitCode !== 0 ||
        !/^[a-f0-9]{64}$/.test(e.metricCommand?.stdoutSha256)
      )
        errors.push("Operator metrics evidence is missing");
      if (e.layout === "ha") {
        const firstFollowerCheck = e.steps.find(
          (s: any) =>
            s.argv.at(-1) === "/verification/snippets/wait-follower.sh",
        );
        if (
          typeof e.initialFollowerRecoveryNeeded !== "boolean" ||
          !firstFollowerCheck ||
          e.initialFollowerRecoveryNeeded !==
            (firstFollowerCheck.exitCode !== 0) ||
          step("restart-follower")?.exitCode !== 0
        )
          errors.push(
            "Guarded follower recovery was not recorded and verified",
          );
        if (
          !isDeepStrictEqual(
            e.restartGuardNegatives?.map((n: any) => n.case),
            [
              "cli-unavailable",
              "cli-not-ready",
              "owner-not-serving",
              "term-changed",
              "transition-active",
              "owner-stale",
              "malformed",
            ],
          ) ||
          e.restartGuardNegatives?.some(
            (n: any) => n.exitCode === 0 || n.pidLookupReached !== false,
          )
        )
          errors.push(
            "Unsafe follower restart prerequisites were not rejected",
          );
        if (
          step("wait-follower")?.exitCode !== 0 ||
          !step("wait-follower")?.stdout.includes("master_link_status:up") ||
          step("failover")?.exitCode !== 0 ||
          step("follow-operation")?.exitCode !== 0 ||
          e.controlledFailover?.stdout !== "OK completed failover-completed" ||
          e.afterFailover.groups[0].owner_node_id !== "2".repeat(40)
        )
          errors.push(
            "Controlled failover or follower synchronization did not pass",
          );
        const group = e.automaticFailover?.status?.groups[0];
        if (
          e.automaticFailover?.signal !== "SIGKILL" ||
          !group?.serving_ready ||
          group.owner_node_id === e.automaticFailover?.failedNode ||
          !e.steps.some(
            (s: any) =>
              s.argv.at(-1) === "crash-probe" && s.stdout === "replicated",
          )
        )
          errors.push("Automatic failover evidence is missing");
      }
    }
    const m = report.monitoring;
    if (
      m.status !== "passed" ||
      m.grafanaHealth.database !== "ok" ||
      m.grafanaHealth.version !== "13.1.0" ||
      m.dashboard.uid !== "lavik-overview" ||
      m.dashboard.panels < 1 ||
      m.datasourceHealth.status !== "OK" ||
      m.downloadUmask !== "077" ||
      m.credentialsMode !== "0600" ||
      !Array.isArray(m.targetRefresh) ||
      m.targetRefresh.length !== 2
    )
      errors.push("Grafana provisioning or target refresh did not pass");
    if (
      !isDeepStrictEqual(m.targets.map((t: any) => t.scrapeUrl).sort(), [
        "http://127.0.0.1:9101/metrics",
        "http://127.0.0.1:9102/metrics",
      ]) ||
      m.targets.some((t: any) => t.health !== "up" || t.lastError !== "") ||
      m.upQuery.length !== 2 ||
      m.upQuery.some((v: any) => v.value[1] !== "1")
    )
      errors.push("Prometheus did not scrape both Data nodes");
    const refreshTargets = [
      ["127.0.0.1:9101"],
      ["127.0.0.1:9101", "127.0.0.1:9102"],
    ];
    for (const [index, targets] of refreshTargets.entries()) {
      const refresh = m.targetRefresh?.[index];
      if (
        !refresh ||
        refresh.generatorStatus !== "exited" ||
        refresh.generatorExitCode !== 0 ||
        !isDeepStrictEqual(refresh.requested, targets) ||
        !isDeepStrictEqual(
          refresh.targets?.map((t: any) => t.scrapeUrl).sort(),
          targets.map((t) => `http://${t}/metrics`),
        ) ||
        refresh.targets?.some(
          (t: any) => t.health !== "up" || t.lastError !== "",
        )
      )
        errors.push("Prometheus target change/restoration was not observed");
    }
    const expectedMonitoringFiles = Object.fromEntries(
      inventory.sources
        .filter((s: any) => s.path.startsWith("deploy/monitoring/"))
        .map((s: any) => [s.path.slice("deploy/monitoring/".length), s.sha256]),
    );
    if (!isDeepStrictEqual(m.upstreamFiles, expectedMonitoringFiles))
      errors.push("Monitoring files are not the pinned upstream stack");
    if (
      !isDeepStrictEqual(operationsGuides.map((g) => g.layout).sort(), [
        "ha",
        "single",
      ])
    )
      errors.push("Operator guide editions are incomplete");
    for (const guide of operationsGuides)
      for (const section of guide.sections)
        for (const block of section.blocks)
          if (block.type === "snippet") operationSnippet(block.name);
  } catch {
    errors.push("Malformed operator-guide evidence");
  }
  return errors;
}
