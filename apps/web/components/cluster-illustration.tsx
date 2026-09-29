import { consolidationScenario as scenario } from "../../../packages/homepage/scenarios";

// Exact-count vector artwork: crisp at any viewport, with no bitmap payload.
export function ClusterIllustration({ locale }: { locale: string }) {
  const zh = locale === "zh-CN";
  return (
    <figure
      className="home-cluster-figure"
      aria-labelledby="home-cluster-caption"
    >
      <div className="home-cluster-labels">
        <div>
          <strong>{scenario.redisNodes}</strong>
          <span>{zh ? "Redis 数据节点" : "Redis data nodes"}</span>
        </div>
        <span className="home-cluster-arrow" aria-hidden="true">
          →
        </span>
        <div>
          <strong>{scenario.lavikNodes}</strong>
          <span>{zh ? "Lavik 数据节点" : "Lavik data nodes"}</span>
        </div>
      </div>
      <svg
        className="home-cluster-svg"
        viewBox="0 0 1040 360"
        role="img"
        aria-labelledby="home-cubes-title home-cubes-description"
      >
        <title id="home-cubes-title">
          {zh
            ? "容量规划示意：300 个灰色立方体与 3 个绿色立方体"
            : "Capacity illustration: 300 gray cubes and 3 green cubes"}
        </title>
        <desc id="home-cubes-description">
          {zh
            ? "假设每节点可用值容量从 32 GiB 增加到 3,200 GiB。图示不表示已验证的迁移结果或延迟 SLA。"
            : "Assumes usable value capacity rises from 32 GiB to 3,200 GiB per data node. This is not a measured migration result or a latency SLA."}
        </desc>
        <defs>
          <g id="home-redis-cube">
            <path d="M0 0 8 4 0 8 -8 4Z" fill="#9aa9b3" />
            <path d="M-8 4 0 8 0 17 -8 13Z" fill="#44535e" />
            <path d="M0 8 8 4 8 13 0 17Z" fill="#657783" />
          </g>
          <g id="home-lavik-cube">
            <path d="M0 0 8 4 0 8 -8 4Z" fill="#d4f4a5" />
            <path d="M-8 4 0 8 0 17 -8 13Z" fill="#668a45" />
            <path d="M0 8 8 4 8 13 0 17Z" fill="#9fc76e" />
          </g>
          <linearGradient id="home-migration-line">
            <stop stopColor="#60716c" />
            <stop offset="1" stopColor="#cef09a" />
          </linearGradient>
        </defs>
        {Array.from({ length: scenario.redisNodes }, (_, i) => (
          <use
            key={i}
            data-node="redis"
            href="#home-redis-cube"
            x={35 + (i % 20) * 21 + (Math.floor(i / 20) % 2) * 7}
            y={25 + Math.floor(i / 20) * 21}
          />
        ))}
        <path
          d="M500 174H630m-14-14 14 14-14 14"
          fill="none"
          stroke="url(#home-migration-line)"
          strokeWidth="2"
        />
        {[
          "translate(812 40) scale(7)",
          "translate(729 176) scale(7)",
          "translate(895 176) scale(7)",
        ].map((transform, i) => (
          // Keep layout transforms outside the animated element's transform origin.
          <g key={i} transform={transform}>
            <use data-node="lavik" href="#home-lavik-cube" />
          </g>
        ))}
      </svg>
      <figcaption id="home-cluster-caption">
        <strong>
          {zh
            ? "容量示意，不是已完成的迁移案例"
            : "Capacity illustration · not a measured migration"}
        </strong>
        <span>
          {zh
            ? "每个立方体代表一个假设的数据节点。"
            : "Each cube represents one hypothetical data node."}
        </span>
      </figcaption>
    </figure>
  );
}
