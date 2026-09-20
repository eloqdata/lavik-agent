import type { DispatchStatus } from "./contracts.ts";
import type { TaskStore } from "./store.ts";

export interface AlarmStorage {
  getAlarm(): Promise<number | null>;
  setAlarm(at: number): Promise<void>;
  deleteAlarm(): Promise<void>;
}
export type DispatchConfig = { GITHUB_DISPATCH_TOKEN?: string };
const repository = "eloqdata/lavik-agent";
const workflow = "admin-worker.yml";
const api = `https://api.github.com/repos/${repository}/actions`;
const runUrl = (id: number) =>
  `https://github.com/${repository}/actions/runs/${id}`;
const minute = 60_000;

class DispatchError extends Error {}

/** Alarms own retries; neither browser polling nor GitHub cron is required. */
export class WorkerDispatcher {
  private scheduling?: Promise<void>;
  constructor(
    private store: TaskStore,
    private alarms: AlarmStorage,
    private config: DispatchConfig,
    // Workerd requires the native fetch receiver; storing it directly as a
    // class method binds `this` to the dispatcher and throws Illegal invocation.
    private http: typeof fetch = (...args) => fetch(...args),
    private time: () => number = Date.now,
  ) {}

  // Schedule before queue mutations, so a crash after saving a task cannot lose
  // its wake-up. Concurrent requests share this operation and cannot postpone it.
  ensureAlarm(): Promise<void> {
    if (!this.scheduling) {
      this.scheduling = (async () => {
        const alarm = await this.alarms.getAlarm();
        if (
          alarm === null ||
          (this.config.GITHUB_DISPATCH_TOKEN &&
            this.store.dispatchStatus().state === "unconfigured" &&
            alarm > this.time() + 1000)
        )
          await this.alarms.setAlarm(this.time() + 1000);
      })().finally(() => {
        this.scheduling = undefined;
      });
    }
    return this.scheduling;
  }

  private async github(path: string, body?: unknown) {
    const response = await this.http(`${api}/${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${this.config.GITHUB_DISPATCH_TOKEN}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "lavik-agent-worker-dispatch",
        "X-GitHub-Api-Version": "2026-03-10",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15_000),
      redirect: "error",
    });
    if (!response.ok) {
      const detail = [401, 403, 404].includes(response.status)
        ? "Check the dispatch credential's expiry, repository access and Actions permission."
        : "Check the worker workflow and GitHub availability.";
      // Never persist provider response bodies or credentials in task history.
      throw new DispatchError(`GitHub returned ${response.status}. ${detail}`);
    }
    return response;
  }

  private async save(status: DispatchStatus, delay: number) {
    status.nextAttemptAt = new Date(this.time() + delay).toISOString();
    this.store.saveDispatch(status);
    await this.alarms.setAlarm(Date.parse(status.nextAttemptAt));
  }

  async alarm() {
    // Persist recovery before network I/O. It survives process restarts and
    // supplements the platform's bounded retries if an alarm handler fails.
    await this.alarms.setAlarm(this.time() + minute);
    this.store.refreshLeases();
    const work = this.store.workStatus();
    const previous = work.dispatch;
    if (work.running) {
      await this.save(
        {
          state: "running",
          message: "Worker running",
          attempts: 0,
          ...(work.running.runUrl ? { runUrl: work.running.runUrl } : {}),
        },
        minute,
      );
      return;
    }
    if (!work.queued && !work.probe) {
      this.store.saveDispatch({
        state: "idle",
        message: "Worker idle",
        attempts: 0,
      });
      await this.alarms.deleteAlarm();
      return;
    }
    if (!this.config.GITHUB_DISPATCH_TOKEN) {
      await this.save(
        {
          state: "unconfigured",
          attempts: 0,
          message:
            "Automatic worker startup needs its GitHub connection. Queued tasks are saved; a manually started worker can still process them.",
        },
        5 * minute,
      );
      return;
    }
    // Ignore a prior missing-credential delay once configuration is supplied.
    if (
      previous.state !== "unconfigured" &&
      previous.nextAttemptAt &&
      Date.parse(previous.nextAttemptAt) > this.time()
    ) {
      await this.alarms.setAlarm(Date.parse(previous.nextAttemptAt));
      return;
    }
    try {
      const response = await this.github(
        `workflows/${workflow}/runs?branch=main&per_page=100`,
      );
      const data = (await response.json()) as {
        workflow_runs: { id: number; status: string; created_at: string }[];
      };
      if (!Array.isArray(data.workflow_runs))
        throw new DispatchError("GitHub returned an invalid workflow list.");
      const active = data.workflow_runs.find(
        (run) => run.status !== "completed",
      );
      if (active) {
        const delayed =
          this.time() - Date.parse(active.created_at) > 5 * minute;
        await this.save(
          {
            ...previous,
            state: "starting",
            runUrl: runUrl(active.id),
            message: delayed
              ? "GitHub has an active worker run, but this task is still queued. Check the run for startup delays; automatic monitoring continues."
              : "GitHub worker is starting. The task will be claimed after setup.",
          },
          30_000,
        );
        return;
      }
      // A dispatch response can be lost after GitHub accepts it. Reconcile run
      // listings and allow two minutes for visibility before another dispatch.
      const sinceAttempt =
        this.time() - Date.parse(previous.lastAttemptAt ?? "1970-01-01");
      if (sinceAttempt < 2 * minute) {
        await this.save(
          {
            ...previous,
            state: "retrying",
            message:
              "Waiting for GitHub to confirm worker startup; retry is scheduled.",
          },
          2 * minute - sinceAttempt,
        );
        return;
      }
      // Re-read after network I/O: a runner may have claimed the work meanwhile.
      const current = this.store.workStatus();
      if (current.running || (!current.queued && !current.probe)) return;
      const intent: DispatchStatus = {
        state: "starting",
        message: "Requesting a GitHub worker",
        attempts: previous.attempts + 1,
        lastAttemptAt: new Date(this.time()).toISOString(),
      };
      await this.save(intent, 2 * minute);
      // No task title, brief, feedback, or other private data leaves Cloudflare.
      const dispatched = await this.github(`workflows/${workflow}/dispatches`, {
        ref: "main",
      });
      let url: string | undefined;
      if (dispatched.status !== 204) {
        const result = (await dispatched.json()) as {
          workflow_run_id?: number;
        };
        if (
          !Number.isSafeInteger(result.workflow_run_id) ||
          result.workflow_run_id! <= 0
        )
          throw new DispatchError(
            "GitHub accepted the request without a valid run ID; checking before retrying.",
          );
        url = runUrl(result.workflow_run_id!);
      }
      await this.save(
        {
          ...intent,
          state: "starting",
          ...(url ? { runUrl: url } : {}),
          message:
            "GitHub accepted worker startup. Waiting for the worker to claim the task.",
        },
        30_000,
      );
    } catch (error) {
      const latest = this.store.dispatchStatus();
      const attempts = Math.max(previous.attempts + 1, latest.attempts);
      await this.save(
        {
          ...latest,
          state: "retrying",
          attempts,
          message:
            error instanceof DispatchError
              ? error.message
              : "Could not reach GitHub. Worker startup will retry automatically.",
        },
        Math.min(5 * minute, minute * 2 ** Math.min(attempts - 1, 3)),
      );
    }
  }
}
