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

Deno.test("repos roll up red/green from the edges touching them", async () => {
  const decls = await loadDecls(BOOTSTRAP);
  const report = projectStatus(decls, {
    "keeper-wire": "fail",
    "scout-wire": "pass",
  });
  const byRepo = new Map(report.repos.map((r) => [r.node, r]));

  // keeperd provides keeper-wire (failing) → its consumers + provider roll up RED.
  const red = report.repos.filter((r) => r.result === "fail");
  for (const r of red) {
    assertEquals(
      r.failing.length > 0,
      true,
      `${r.node} is red but lists no failing type`,
    );
  }
  // A repo touched by a passing verified edge and no failing one rolls up GREEN.
  const green = report.repos.filter((r) => r.result === "pass");
  for (const r of green) assertEquals(r.failing, []);

  // Every repo is classified, and the summary counts match.
  assertEquals(report.repos.length, report.summary.nodes);
  assertEquals(
    report.summary.reposRed,
    report.repos.filter((r) => r.result === "fail").length,
  );
  assertEquals(
    report.summary.reposGreen,
    report.repos.filter((r) => r.result === "pass").length,
  );
  // A repo with no verified edge is neither red nor green.
  for (const r of report.repos) {
    if (r.result === "declared") assertEquals(r.failing, []);
  }
  // sanity: at least one repo went red off the failing keeper-wire.
  assertEquals(byRepo.size, report.repos.length);
  assertEquals(report.summary.reposRed >= 1, true);
});

Deno.test("a repo with only declared edges is neither red nor green", async () => {
  const decls = await loadDecls(BOOTSTRAP);
  const report = projectStatus(decls, {}); // nothing verified-passing
  // With no passes recorded, no repo can be green.
  assertEquals(report.summary.reposGreen, 0);
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
