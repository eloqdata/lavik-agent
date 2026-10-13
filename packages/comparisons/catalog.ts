export const comparisonProducts = [
  { id: "redis", name: "Redis", group: "memory" },
  { id: "valkey", name: "Valkey", group: "memory" },
  { id: "dragonfly", name: "DragonflyDB", group: "storage" },
  { id: "garnet", name: "Garnet", group: "storage" },
  { id: "pika", name: "Pika", group: "historical" },
  { id: "kvrocks", name: "Apache Kvrocks", group: "historical" },
  { id: "tendis", name: "Tendis", group: "historical" },
  { id: "keydb", name: "KeyDB", group: "historical" },
] as const;
export type ComparisonProduct = (typeof comparisonProducts)[number];
export type ProductId = ComparisonProduct["id"];
export const comparisonRoute = (id: ProductId) => `compare/lavik-vs-${id}`;
export const comparisonForRoute = (route: string) =>
  comparisonProducts.find((p) => comparisonRoute(p.id) === route);
