import { assertEquals } from "@std/assert";
import { loadDecls } from "./assemble.ts";
import { projectStatus, verifiedTypes } from "./status.ts";

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
