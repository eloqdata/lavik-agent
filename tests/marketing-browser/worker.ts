// Local integration harness only. This file is never a production Worker entrypoint.
import consoleWorker from "../../apps/marketing/worker";
import { AnalyticsStore as BaseStore } from "../../packages/marketing/analytics";
import { PlacementStore } from "../../packages/marketing/placements";
export class AnalyticsStore extends BaseStore {
  constructor(
    private fixtureState: ConstructorParameters<typeof BaseStore>[0],
    env: ConstructorParameters<typeof BaseStore>[1],
  ) {
    super(fixtureState, env);
  }
  async fetch(request: Request) {
    if (new URL(request.url).pathname === "/reset-fixture") {
      for (const table of [
        "marketing_account",
        "marketing_sessions",
        "marketing_attempts",
        "marketing_links",
        "marketing_placements",
        "marketing_schema",
        "metrics",
      ])
        this.fixtureState.storage.sql.exec(`DELETE FROM ${table}`);
      new PlacementStore(this.fixtureState.storage);
      return new Response(null, { status: 204 });
    }
    return super.fetch(request);
  }
}
export default {
  async fetch(
    request: Request,
    env: Parameters<typeof consoleWorker.fetch>[1],
  ) {
    const url = new URL(request.url);
    if (
      url.origin === "http://127.0.0.1:4175" &&
      url.pathname.startsWith("/test/") &&
      request.method === "POST"
    ) {
      const store = env.ANALYTICS_STORE.get(
        env.ANALYTICS_STORE.idFromName("lavik-marketing-v1"),
      );
      const action =
        url.pathname === "/test/reset"
          ? "reset-fixture"
          : url.pathname === "/test/bootstrap"
            ? "platform/bootstrap"
            : "event";
      return store.fetch(
        new Request(`https://internal/${action}`, {
          method: "POST",
          body: await request.text(),
        }),
      );
    }
    return consoleWorker.fetch(request, env);
  },
};
