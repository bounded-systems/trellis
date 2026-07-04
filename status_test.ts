import { assertEquals } from "@std/assert";
import { loadDecls } from "./assemble.ts";
import {
  findCycles,
  findMultiContractPairs,
  projectStatus,
  verifiedTypes,
} from "./status.ts";

const BOOTSTRAP = new URL("./bootstrap", import.meta.url).pathname;

Deno.test("projectStatus reflects the CI results per verified type", async () => {
  const decls = await loadDecls(BOOTSTRAP);
  const report = projectStatus(decls, {
    "keeper-wire": "fail",
    "sanctioned-reader-seam": "pass",
  });
  const byType = new Map(report.types.map((t) => [t.type, t]));
  assertEquals(byType.get("keeper-wire")?.result, "fail");
  assertEquals(byType.get("sanctioned-reader-seam")?.result, "pass");
  // an unverified type is always "declared", never a check result
  assertEquals(byType.get("net-egress")?.result, "declared");
});

Deno.test("a verified type with NO recorded result fails closed", async () => {
  const decls = await loadDecls(BOOTSTRAP);
  const report = projectStatus(decls, {}); // no results at all
  for (const t of report.types.filter((x) => x.verified)) {
    assertEquals(
      t.result,
      "fail",
      `${t.type} must fail-close without a result`,
    );
  }
});

Deno.test("summary counts add up and edges carry their type's result", async () => {
  const decls = await loadDecls(BOOTSTRAP);
  const report = projectStatus(decls, { "keeper-wire": "fail" });
  assertEquals(
    report.summary.passing + report.summary.failing,
    report.summary.verified,
  );
  for (const e of report.edges.filter((x) => x.type === "keeper-wire")) {
    assertEquals(e.result, "fail");
  }
});

Deno.test("verifiedTypes lists exactly the types CI must build", async () => {
  const decls = await loadDecls(BOOTSTRAP);
  const report = projectStatus(decls, {});
  assertEquals(
    verifiedTypes().sort(),
    report.types.filter((t) => t.verified).map((t) => t.type).sort(),
  );
});

Deno.test("every node is a build derivation: build output + self input", async () => {
  const decls = await loadDecls(BOOTSTRAP);
  const report = projectStatus(decls, {});
  assertEquals(report.nodes.length, report.summary.nodes);
  for (const n of report.nodes) {
    assertEquals(n.outputs[0], "build", `${n.node} must output its build`);
    assertEquals(n.inputs[0], "self", `${n.node} input must include self`);
  }
  // mapped + unmapped partition all nodes
  assertEquals(
    report.summary.mapped + report.summary.unmapped,
    report.nodes.length,
  );
});

Deno.test("findCycles detects a 2-repo dependency cycle", () => {
  // a provides X (consumed by b); b provides Y (consumed by a) → a<->b cycle
  const edges = [
    { from: "a", to: "b" }, // a's output → b consumes (b depends on a)
    { from: "b", to: "a" }, // b's output → a consumes (a depends on b)
    { from: "c", to: "d" }, // acyclic
  ];
  const cycles = findCycles(edges);
  assertEquals(cycles.length, 1);
  assertEquals([...cycles[0]].sort(), ["a", "b"]);
});

Deno.test("findCycles returns none for a DAG", () => {
  assertEquals(
    findCycles([{ from: "a", to: "b" }, { from: "b", to: "c" }]),
    [],
  );
});

Deno.test("status surfaces the one-agreement-per-pair invariant", async () => {
  const decls = await loadDecls(BOOTSTRAP);
  const report = projectStatus(decls, {});
  // the real door family violates it (a wire contract + door-kit-mirror per pair)
  assertEquals(
    report.summary.oneAgreementPerPair,
    report.multiContractPairs.length === 0,
  );
  assertEquals(
    findMultiContractPairs([
      { from: "a", to: "b", type: "x" },
      { from: "b", to: "a", type: "y" },
    ]).length,
    1,
  );
});
