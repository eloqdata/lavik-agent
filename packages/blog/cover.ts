import type { CoverMotif } from "./presentation.ts";

const palettes = [
  ["#153f36", "#438470", "#d9efb2"],
  ["#193e52", "#56879e", "#c4e9ef"],
  ["#443e2b", "#a29358", "#f3dda3"],
  ["#3b304c", "#857091", "#edd5e9"],
  ["#503831", "#aa745c", "#f5d0a5"],
  ["#15474b", "#388d87", "#bce7d4"],
];
const seedFor = (id: string) =>
  [...id].reduce(
    (seed, char) => Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0,
    2166136261,
  );
const line = (x1: number, y1: number, x2: number, y2: number, opacity = 0.7) =>
  `<path d="M${x1} ${y1}L${x2} ${y2}" opacity="${opacity}"/>`;
const orb = (x: number, y: number, radius = 10) =>
  `<circle cx="${x}" cy="${y}" r="${radius}" fill="var(--light)" stroke="none"/><circle cx="${x}" cy="${y}" r="${radius + 8}" opacity=".25"/>`;
const panel = (
  x: number,
  y: number,
  width: number,
  height: number,
  radius = 12,
) =>
  `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="url(#glass)"/>`;
const tile = (x: number, y: number, size = 38, opacity = 0.7) =>
  `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="6" fill="var(--light)" fill-opacity="${opacity}" stroke="none"/>`;
const stack = (x: number, y: number, width = 150) =>
  [2, 1, 0].map((n) => panel(x, y + n * 34, width, 50, 9)).join("");

function illustration(motif: CoverMotif, seed: number) {
  const shift = seed % 13;
  switch (motif) {
    case "flow":
      return `<path d="M170 228H410Q450 228 450 188V128H780Q825 128 825 173V228H1030"/><path d="M240 330H730Q765 330 765 295V228H920" opacity=".4"/>
        ${[205, 365, 885, 1000].map((x) => orb(x, 228, 7)).join("")}
        ${panel(485, 180, 245, 125, 18)}${[0, 1, 2].map((n) => line(527, 214 + n * 27, 690 - n * 25, 214 + n * 27)).join("")}
        ${orb(580 + shift * 5, 128, 13)}${orb(560 - shift * 3, 330, 9)}<circle cx="607" cy="242" r="168" opacity=".12"/>`;
    case "index":
      return `${panel(250, 133, 195, 184, 16)}${Array.from({ length: 9 }, (_, n) => tile(277 + (n % 3) * 51, 160 + Math.floor(n / 3) * 48, 29, 0.25 + (n % 3) * 0.2)).join("")}
        ${[0, 1, 2].map((n) => `<path d="M465 ${174 + n * 52}H565L640 ${148 + n * 65}H705" opacity="${0.35 + n * 0.2}"/>`).join("")}
        ${stack(700, 128, 220)}${line(725, 153, 878, 153)}${line(725, 187, 878, 187)}${line(725, 221, 835, 221)}${orb(590, 220, 11)}
        <ellipse cx="799" cy="319" rx="151" ry="29" opacity=".2"/>`;
    case "transactions": {
      const corners = [
        [342, 125],
        [778, 125],
        [342, 290],
        [778, 290],
      ];
      return `<circle cx="600" cy="225" r="121" opacity=".17"/>${corners.map(([x, y]) => `${line(x + 40, y + 25, 600, 225, 0.5)}${panel(x, y, 80, 50, 8)}`).join("")}
        <path d="M450 84H750M450 365H750" opacity=".35"/>${panel(531, 156, 138, 138, 26)}<circle cx="600" cy="225" r="40"/>${orb(600, 225, 12)}${corners.map(([x, y], n) => orb(x + 40, y + 25, 5 + n)).join("")}`;
    }
    case "checkpoint":
      return `<path d="M793 305A190 190 0 1 0 393 224" opacity=".65"/><path d="M373 205L393 226L414 205"/>
        ${panel(501, 110, 222, 256, 18)}${panel(478, 90, 222, 256, 18)}${[0, 1, 2, 3, 4].map((n) => line(510, 133 + n * 36, 661 - (n % 2) * 45, 133 + n * 36, 0.35 + n * 0.12)).join("")}
        <circle cx="726" cy="306" r="44" fill="var(--base)"/><path d="M706 307L720 321L749 289" stroke-width="4"/>${orb(812, 149, 9)}`;
    case "replication":
      return `${[250, 525, 800].map((x, i) => `${stack(x, 148, 150)}${orb(x + 75, 115, 7 + i * 2)}`).join("")}
        ${[0, 1, 2].map((n) => `<path d="M414 ${166 + n * 35}H510M689 ${166 + n * 35}H785" opacity="${0.35 + n * 0.25}"/>${orb(444 + ((shift + n * 21) % 54), 166 + n * 35, 4)}${orb(720 + ((shift + n * 17) % 48), 166 + n * 35, 4)}`).join("")}
        <path d="M325 316V343H875V316" opacity=".3"/>`;
    case "failover":
      return `<path d="M399 285L601 105L806 285Z" opacity=".3"/><path d="M404 221Q600 0 800 221" stroke-dasharray="7 10" opacity=".55"/>
        ${stack(318, 216, 160)}${stack(724, 216, 160)}${panel(534, 65, 134, 94, 16)}${orb(601, 109, 22)}
        <path d="M500 294H699M680 280L700 294L680 308" stroke-width="3"/><circle cx="803" cy="177" r="25" fill="var(--light)" stroke="none"/>`;
    case "collections":
      return `${[
        [325, 88],
        [635, 88],
        [325, 246],
        [635, 246],
      ]
        .map(
          ([x, y], i) =>
            `${panel(x, y, 245, 117, 14)}${Array.from({ length: 5 + i }, (_, n) => tile(x + 23 + (n % 4) * 51, y + 23 + Math.floor(n / 4) * 43, 27, 0.3 + (n % 4) * 0.16)).join("")}`,
        )
        .join("")}
        <path d="M293 147H256V304H293M912 147H948V304H912" opacity=".4"/>`;
    case "functions":
      return `${panel(520, 92, 275, 251, 18)}${panel(476, 113, 275, 251, 18)}${panel(432, 134, 275, 251, 18)}
        <path d="M514 202L478 235L514 268M625 202L661 235L625 268M582 191L555 280" stroke-width="4"/>
        ${line(478, 318, 661, 318, 0.35)}${line(478, 340, 603, 340, 0.35)}${orb(821, 133, 14)}<path d="M821 166V222H764" opacity=".5"/>`;
    case "throughput":
      return `<circle cx="600" cy="225" r="143" opacity=".22"/><circle cx="600" cy="225" r="104" opacity=".18"/>
        ${[0, 1, 2, 3, 4].map((n) => `<path d="M208 ${145 + n * 40}H${385 + shift}L${465 + shift} ${105 + n * 40}H${758 + shift}L${838 + shift} ${145 + n * 40}H1012" opacity="${0.3 + n * 0.13}"/>${orb(552 + n * 41, 105 + n * 40, 6)}`).join("")}`;
    case "inspection":
      return `${panel(350, 113, 374, 234, 14)}${Array.from({ length: 24 }, (_, n) => tile(375 + (n % 6) * 52, 138 + Math.floor(n / 6) * 49, 25, 0.13 + (n % 5) * 0.13)).join("")}
        <circle cx="728" cy="211" r="107" fill="var(--base)" fill-opacity=".78" stroke-width="3"/><circle cx="728" cy="211" r="86" opacity=".35"/>
        <path d="M804 288L885 363" stroke-width="15"/><path d="M685 212L715 237L769 180" stroke-width="4"/>`;
  }
}

// Original, decorative editorial art. No external assets, text, measurements,
// secrets or model calls. Stable IDs give both translations the same cover.
export function blogCoverSvg(id: string, motif: CoverMotif) {
  const seed = seedFor(id);
  const [base, middle, light] = palettes[seed % palettes.length];
  const glowX = 30 + (seed % 45);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="450" viewBox="0 0 1200 450" style="--base:${base};--light:${light}">
  <defs>
    <linearGradient id="field" x1="0" y1="1" x2="1" y2="0"><stop stop-color="${base}"/><stop offset=".62" stop-color="${middle}"/><stop offset="1" stop-color="${base}"/></linearGradient>
    <radialGradient id="glow"><stop stop-color="${light}" stop-opacity=".5"/><stop offset="1" stop-color="${light}" stop-opacity="0"/></radialGradient>
    <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${light}" stop-opacity=".2"/><stop offset="1" stop-color="${light}" stop-opacity=".04"/></linearGradient>
    <pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".8" fill="${light}" opacity=".18"/></pattern>
  </defs>
  <rect width="1200" height="450" fill="url(#field)"/><ellipse cx="${glowX}%" cy="15%" rx="500" ry="360" fill="url(#glow)"/>
  <rect width="1200" height="450" fill="url(#grid)"/>
  <g fill="none" stroke="${light}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${illustration(motif, seed)}</g>
  <path d="M40 40h18M40 40v18M1160 410h-18M1160 410v-18" fill="none" stroke="${light}" stroke-opacity=".35"/>
  </svg>`;
}
