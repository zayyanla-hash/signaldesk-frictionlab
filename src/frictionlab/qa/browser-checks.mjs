/* global taskSpace, document, window, localStorage, performance, getComputedStyle, URL, Storage, File, requestAnimationFrame */
// Run: node src/frictionlab/qa/run-browser.mjs
// Uses only the documented Ego browser API; never changes another task's tabs.
import console from "node:console";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
const config = globalThis.FRICTIONLAB_QA_CONFIG;
if (!config) throw new Error("Use node src/frictionlab/qa/run-browser.mjs");
const { base, out, root } = config;
await mkdir(out, { recursive: true });
const task = await taskSpace(
  config.space ? Number(config.space) : "FrictionLab reproducible QA",
);
console.log({ spaceId: task.spaceId, base, out });
const page = task.page("p1");
const checks = [];
function check(name, value, details) {
  checks.push({
    name,
    pass: !!value,
    ...(details === undefined ? {} : { details }),
  });
  console.log(
    `${value ? "PASS" : "FAIL"} ${name}${details === undefined ? "" : `: ${JSON.stringify(details)}`}`,
  );
}
const text = (selector) =>
  page.evaluate((s) => document.querySelector(s)?.textContent || "", selector);
const state = () =>
  page.evaluate(() => ({
    title: document.title,
    hero: document.querySelector(".fi-hero")?.textContent,
    evidence: document.querySelector("#evidence-title")?.textContent,
    pageOverflow: document.documentElement.scrollWidth > window.innerWidth,
    errorOverlay: !!document.querySelector("vite-error-overlay"),
    errors: window.__frictionErrors || [],
  }));
async function validatePass() {
  await page.click("text=Validate dataset");
  await page.waitForFunction(() =>
    document
      .querySelector(".fi-validation")
      ?.textContent.includes("Validation passed"),
  );
}
async function validateAndApply() {
  await validatePass();
  await page.waitForFunction(() =>
    [...document.querySelectorAll("button")].some(
      (b) => b.textContent.includes("Replace active dataset") && !b.disabled,
    ),
  );
  await page.click("text=Replace active dataset");
  await page.waitForFunction(() => !document.querySelector("#import-panel"));
}
await page.cdp("Emulation.setDeviceMetricsOverride", {
  width: 1440,
  height: 1150,
  deviceScaleFactor: 1,
  mobile: false,
});
await page.cdp("Page.addScriptToEvaluateOnNewDocument", {
  source: `window.__frictionErrors=[];window.addEventListener('error',e=>window.__frictionErrors.push(e.message));window.addEventListener('unhandledrejection',e=>window.__frictionErrors.push(String(e.reason)));for(const level of ['error','warn']){const original=console[level];console[level]=(...args)=>{window.__frictionErrors.push(level+': '+args.map(String).join(' '));original.apply(console,args)}}`,
});
await page.goto(`${base}/frictionlab`);
await page.waitForSelector("#analysis-title", { state: "visible" });
console.log(await page.snapshot());
check(
  "page identity",
  (await page.url()).startsWith(`${base}/frictionlab`) &&
    (await page.title()).includes("FrictionLab"),
);
check(
  "meaningful content / no overlay",
  (await text("h1")).includes("Find the friction") &&
    !(await state()).errorOverlay,
);
// Reset only this app workspace through its own visible control, preserving other app data.
await page.click("text=Clear this workspace’s local work");
await page.waitForFunction(() =>
  document.querySelector(".fi-save")?.textContent.includes("cleared"),
);
check(
  "clear removes only this workspace save",
  await page.evaluate(
    () => localStorage.getItem("frictionlab-workbench-v2") === null,
  ),
);
await page.click('loc=css:button[aria-label="Dismiss notice"]');
await page.evaluate(() => window.scrollTo(0, 0));
check("hand-checkable overall reading", (await text(".fi-hero")) === "40.0%");
await page.screenshot({
  path: path.join(out, "frictionlab-analysis-desktop.png"),
});
// Native keyboard navigation and activation, with visible focus.
await page.focus("loc=css:.fi-stage-controls button:nth-child(1)");
await page.keyboard.press("Tab");
check(
  "Tab reaches the next stage control",
  await page.evaluate(
    () =>
      document.activeElement ===
      document.querySelector(".fi-stage-controls button:nth-child(2)"),
  ),
);
await page.keyboard.press("Tab");
await page.keyboard.press("Enter");
check(
  "keyboard stage inspection updates evidence",
  (await text("#evidence-title")) === "First useful action",
);
check(
  "keyboard selection reports pressed state",
  await page.evaluate(
    () =>
      document
        .querySelector(".fi-stage-controls button:nth-child(3)")
        .getAttribute("aria-pressed") === "true",
  ),
);
check(
  "focus indication is visible",
  await page.evaluate(
    () =>
      parseFloat(getComputedStyle(document.activeElement).outlineWidth) >= 2,
  ),
);
await page.click("text=Draft a test for this stage");
check(
  "test uses selected transition",
  (
    await page.evaluate(() => document.querySelector("#primaryMetric").value)
  ).includes("first_action") &&
    (
      await page.evaluate(() => document.querySelector("#primaryMetric").value)
    ).includes("connected_data"),
);
await page.fill(
  "#hypothesis",
  "Untested: a clearer first-action prompt may improve ordered completion. Validate with usability observation first.",
);
await page.reload();
await page.waitForSelector("#hypothesis", { state: "visible" });
check(
  "draft persists after reload",
  (
    await page.evaluate(() => document.querySelector("#hypothesis").value)
  ).startsWith("Untested: a clearer first-action"),
);
await page.selectOption(".fi-segment select", "Mobile");
check(
  "segment counts use their own denominator",
  (await text(".fi-hero")) === "25.0%" &&
    (await text(".fi-primary p")).includes("400"),
);
check(
  "segment resets draft and audience",
  (
    await page.evaluate(() => document.querySelector("#audience").value)
  ).includes("segment Mobile") &&
    !(
      await page.evaluate(() => document.querySelector("#hypothesis").value)
    ).includes("a clearer first-action"),
);
await page.selectOption(".fi-segment select", "");
await page.fill("#guardrail", "");
check(
  "incomplete experiment blocks export",
  await page.evaluate(
    () =>
      [...document.querySelectorAll("button")].find((b) =>
        b.textContent.includes("Export decision brief"),
      ).disabled,
  ),
);
await page.fill(
  "#guardrail",
  "Setup-error rate per assigned user must not increase by more than +1 percentage point; audit error instrumentation first.",
);
await page.click("text=Import funnel data");
console.log(await page.snapshot());
await page.click("text=Load invalid fixture");
await page.click("text=Validate dataset");
check(
  "invalid import reports duplicate, timestamp and missing identity",
  (await text(".fi-validation")).includes("Duplicate event_id") &&
    (await text(".fi-validation")).includes("Invalid calendar date") &&
    (await text(".fi-validation")).includes("required"),
);
check(
  "invalid import preserves active data",
  (await text(".fi-hero")) === "40.0%",
);
check(
  "invalid import blocks replacement",
  await page.evaluate(
    () =>
      [...document.querySelectorAll("button")].find((b) =>
        b.textContent.includes("Replace active dataset"),
      ).disabled,
  ),
);
await page.screenshot({
  path: path.join(out, "frictionlab-validation-errors.png"),
});
await page.click("text=Load eight-user event fixture");
await page.waitForFunction(
  () =>
    document
      .querySelector(".fi-import-fields")
      ?.textContent.includes("Signup cohort") &&
    document.querySelector(".fi-csv")?.value.includes("H1,H,signed_up"),
);
await page.waitForFunction(() =>
  document.querySelector(".fi-csv")?.value.includes("H1,H,signed_up"),
);
await validatePass();
check(
  "valid event fixture passes validation",
  (await text(".fi-validation")).includes("Validation passed"),
);
// Editing a validated contract must revoke the apply action.
await page.fill('loc=css:.fi-import-fields input[type="number"]', "3");
check(
  "changing the window revokes validation",
  await page.evaluate(
    () =>
      [...document.querySelectorAll("button")].find((b) =>
        b.textContent.includes("Replace active dataset"),
      ).disabled,
  ),
);
check(
  "stale success message is removed",
  !(await text(".fi-import")).includes("Validation passed"),
);
await page.fill('loc=css:.fi-import-fields input[type="number"]', "7");
await validateAndApply();
check(
  "event fixture atomically replaces sample",
  (await text(".fi-hero")) === "42.9%" &&
    (await text(".fi-primary p")).includes("7"),
);
await page.click("loc=css:.fi-raw summary");
check(
  "path evidence includes immature and repeated events",
  (await text(".fi-raw")).includes("1 immature") &&
    (await text(".fi-raw")).includes("1 repeat"),
);
check(
  "small cohort warning rendered",
  (await text(".fi-reading")).includes("SMALL SAMPLE"),
);
await page.screenshot({
  path: path.join(out, "frictionlab-event-evidence.png"),
});
// Exercise actual file input, including read failure and >1 MB bounds.
await page.click("text=Import funnel data");
const huge = path.join(out, "oversize.csv");
await writeFile(huge, "x".repeat(1_000_001));
await page.setInputFiles("input[type=file]", [huge]);
await page.waitForFunction(() =>
  document.querySelector(".fi-import")?.textContent.includes("exceeds 1 MB"),
);
check(
  "oversize file read fails without changing active data",
  (await text(".fi-import")).includes("File exceeds 1 MB") &&
    (await text(".fi-hero")) === "42.9%",
);
const eventFixture = path.join(
  root,
  "src/frictionlab/fixtures/eight-user-events.csv",
);
await page.setInputFiles("input[type=file]", [eventFixture]);
await page.waitForFunction(
  () =>
    document.querySelector(".fi-import-fields input")?.value ===
      "eight-user-events.csv" &&
    !document
      .querySelector(".fi-import")
      ?.textContent.includes("Reading local file"),
);
check(
  "real file input reads CSV",
  (await page.evaluate(() => document.querySelector(".fi-csv").value)).includes(
    "H1,H,signed_up",
  ),
);
// A failed or superseded asynchronous read cannot replace a later choice.
await page.evaluate(() => {
  window.__fiFileText = File.prototype.text;
  File.prototype.text = async function () {
    throw new Error("QA simulated local read failure");
  };
});
await page.setInputFiles("input[type=file]", [
  path.join(root, "src/frictionlab/fixtures/independent-events.csv"),
]);
await page.waitForFunction(() =>
  document
    .querySelector(".fi-import")
    ?.textContent.includes("QA simulated local read failure"),
);
check(
  "unreadable file reports failure and preserves analysis",
  (await text(".fi-hero")) === "42.9%" &&
    (await text(".fi-import")).includes("QA simulated local read failure"),
);
await page.evaluate(() => {
  File.prototype.text = function () {
    return new Promise((resolve) => {
      window.__fiResolveRead = resolve;
    });
  };
});
await page.setInputFiles("input[type=file]", [eventFixture]);
await page.waitForFunction(() =>
  document
    .querySelector(".fi-import")
    ?.textContent.includes("Reading local file"),
);
await page.click("text=Load synthetic aggregate");
await page.waitForFunction(
  () =>
    document
      .querySelector(".fi-import-fields")
      ?.textContent.includes("Signup cohort") &&
    document.querySelector(".fi-csv")?.value.startsWith("cohort_id"),
);
await page.waitForFunction(() =>
  document.querySelector(".fi-csv")?.value.startsWith("cohort_id"),
);
await page.evaluate(async () => {
  window.__fiResolveRead("late invalid contents");
  File.prototype.text = window.__fiFileText;
  await new Promise(requestAnimationFrame);
});
check(
  "slow file read cannot overwrite a later example selection",
  (
    await page.evaluate(() => document.querySelector(".fi-csv").value)
  ).startsWith("cohort_id") &&
    !(await text(".fi-import")).includes("Reading local file"),
);
await page.click("text=Validate dataset");
check(
  "aggregate assumptions are required",
  (await text(".fi-validation")).includes("Confirm that aggregate"),
);
await page.click("loc=css:.fi-confirm input");
await validateAndApply();
check(
  "synthetic provenance survives example loading",
  (await text(".fi-dataset-title")).includes("SYNTHETIC EXAMPLE"),
);
// Independent non-monotonic counts must never be promoted into user conversion.
await page.click("text=Import funnel data");
await page.click("text=Load synthetic aggregate");
await page.waitForFunction(
  () =>
    document
      .querySelector(".fi-import-fields")
      ?.textContent.includes("Signup cohort") &&
    document.querySelector(".fi-csv")?.value.startsWith("cohort_id"),
);
await page.selectOption(".fi-import-fields select >> nth=1", "events");
await page.setInputFiles("input[type=file]", [
  path.join(root, "src/frictionlab/fixtures/independent-events.csv"),
]);
await page.waitForFunction(() =>
  document
    .querySelector(".fi-csv")
    ?.value.includes("hand,first_action,40,events"),
);
await page.click(".fi-confirm input");
await validateAndApply();
check(
  "non-monotonic independent events render an activity ratio",
  (await text(".fi-hero")) === "400.0%" &&
    (await text(".fi-primary")).includes("EVENT RATIO"),
);
check(
  "independent events have no conversion uncertainty or friction priority",
  !(await text(".fi-primary")).includes("Wilson") &&
    (await text(".fi-reading")).includes("Descriptive reach only"),
);
check(
  "independent inputs produce a coherent measurement-readiness plan",
  (
    await page.evaluate(() => document.querySelector("#decisionRule").value)
  ).includes("Accept a baseline only") &&
    !(
      await page.evaluate(() => document.querySelector("#decisionRule").value)
    ).includes("Ship only"),
);
await page.click("text=Import funnel data");
await page.click("text=Load eight-user event fixture");
await page.waitForFunction(
  () =>
    document
      .querySelector(".fi-import-fields")
      ?.textContent.includes("Signup cohort") &&
    document.querySelector(".fi-csv")?.value.includes("H1,H,signed_up"),
);
await page.selectOption(".fi-import-fields select >> nth=1", "unique_users");
await page.waitForFunction(() =>
  document
    .querySelector(".fi-import-fields")
    ?.textContent.includes("Measurement interval"),
);
await validateAndApply();
check(
  "independent unique-user reach deduplicates repeated events",
  (await text(".fi-hero")) === "37.5%" &&
    (await text(".fi-stage-controls")).includes("5 users"),
);
await page.click(".fi-raw summary");
check(
  "independent user evidence shows raw events rather than cohort paths",
  (await text(".fi-raw")).includes("6 event rows and 5 distinct users") &&
    (await text(".fi-raw")).includes("not an ordered cohort"),
);
await page.click("text=Import funnel data");
await page.click("text=Load synthetic aggregate");
await page.waitForFunction(
  () =>
    document
      .querySelector(".fi-import-fields")
      ?.textContent.includes("Signup cohort") &&
    document.querySelector(".fi-csv")?.value.startsWith("cohort_id"),
);
await page.setInputFiles("input[type=file]", [
  path.join(root, "src/frictionlab/fixtures/zero-cohort.csv"),
]);
await page.waitForFunction(() =>
  document
    .querySelector(".fi-csv")
    ?.value.includes("hand,first_action,0,cohort_users"),
);
await page.click(".fi-confirm input");
await validateAndApply();
check(
  "zero cohort renders not estimable without NaN or a false 0%",
  (await text(".fi-hero")) === "—" &&
    (await text(".fi-primary")).includes("Not estimable") &&
    !(await text(".fi-analysis")).includes("NaN"),
);
await page.click("text=Import funnel data");
await page.click("text=Load synthetic aggregate");
await page.waitForFunction(
  () =>
    document
      .querySelector(".fi-import-fields")
      ?.textContent.includes("Signup cohort") &&
    document.querySelector(".fi-csv")?.value.startsWith("cohort_id"),
);
await page.click(".fi-confirm input");
await validateAndApply();
await page.fill("#hypothesis", "W".repeat(700));
check(
  "dense text blocks export instead of clipping the brief",
  (await text(".fi-errors")).includes("print budget") &&
    (await page.evaluate(
      () =>
        [...document.querySelectorAll("button")].find((b) =>
          b.textContent.includes("Export decision brief"),
        ).disabled,
    )),
);
await page.click("text=Draft a test for this stage");
// Save the actual browser download, then inspect its contents and render it.
await page.click("loc=css:.fi-stage-controls button:nth-child(2)");
await page.click("text=Draft a test for this stage");
await page.screenshot({
  path: path.join(out, "frictionlab-experiment-desktop.png"),
});
const downloadPromise = page.waitForEvent("download");
await page.click("text=Export decision brief");
const download = await downloadPromise;
const briefFile = path.join(out, "frictionlab-sample-decision-brief.html");
await download.saveAs(briefFile);
const brief = await readFile(briefFile, "utf8");
check(
  "actual exported brief includes correct calculations and limitations",
  brief.includes("550 / 1000") &&
    brief.includes("400 / 550") &&
    brief.includes("40.0%") &&
    brief.includes("not an explanation"),
);
check(
  "export does not include hypothetical upside",
  !brief.includes("additional final completions"),
);
check(
  "no runtime errors, warnings or framework overlay",
  (await state()).errors.length === 0 && !(await state()).errorOverlay,
  (await state()).errors,
);
check(
  "no outbound resource requests",
  await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .every(
        (r) =>
          new URL(r.name).origin === window.location.origin ||
          r.name.startsWith("blob:"),
      ),
  ),
);
// Storage failure is visible and does not discard the in-memory draft.
await page.evaluate(() => {
  window.__fiSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function () {
    throw new Error("QuotaExceededError");
  };
});
await page.fill(
  "#hypothesis",
  "Untested: preserve this draft when local browser storage is full.",
);
await page.waitForFunction(() =>
  document.querySelector(".fi-save")?.textContent.includes("Not saved"),
);
check(
  "storage failure is reported while draft remains usable",
  (await text(".fi-save")).includes("Not saved") &&
    (
      await page.evaluate(() => document.querySelector("#hypothesis").value)
    ).includes("preserve this draft"),
);
await page.evaluate(() => {
  Storage.prototype.setItem = window.__fiSetItem;
});
await page.click("text=Draft a test for this stage");
await page.waitForFunction(
  () =>
    document.querySelector(".fi-save")?.textContent === "Saved on this device",
);
check(
  "saving recovers after storage becomes available",
  (await text(".fi-save")) === "Saved on this device",
);
// Phone layout and keyboard focus, without changing another task's browser.
await page.cdp("Emulation.setDeviceMetricsOverride", {
  width: 390,
  height: 844,
  deviceScaleFactor: 1,
  mobile: true,
});
await page.evaluate(() => window.scrollTo(0, 0));
check("phone layout has no page overflow", !(await state()).pageOverflow);
await page.screenshot({
  path: path.join(out, "frictionlab-analysis-mobile.png"),
  fullPage: true,
});
await page.focus("a.skip-link");
await page.keyboard.press("Enter");
check(
  "skip link targets main content",
  await page.evaluate(() => document.activeElement.id === "main"),
);
// Audit native labeling rather than claiming full WCAG certification.
check(
  "all controls have accessible labels",
  await page.evaluate(() =>
    [...document.querySelectorAll("input,select,textarea,button")]
      .filter((el) => !el.disabled)
      .every(
        (el) =>
          !!(
            el.getAttribute("aria-label") ||
            el.labels?.length ||
            el.textContent?.trim()
          ),
      ),
  ),
);
check(
  "one h1 and all aria references resolve",
  await page.evaluate(
    () =>
      document.querySelectorAll("h1").length === 1 &&
      [
        ...document.querySelectorAll("[aria-labelledby],[aria-describedby]"),
      ].every((el) =>
        ["aria-labelledby", "aria-describedby"].every((attr) =>
          (el.getAttribute(attr) || "")
            .split(/\s+/)
            .filter(Boolean)
            .every((id) => !!document.getElementById(id)),
        ),
      ),
  ),
);
await writeFile(
  path.join(out, "frictionlab-browser-checks.json"),
  JSON.stringify(
    {
      base,
      spaceId: task.spaceId,
      checks,
      total: checks.length,
      passed: checks.filter((c) => c.pass).length,
    },
    null,
    2,
  ),
);
console.log(await page.snapshot());
if (!checks.every((c) => c.pass))
  throw new Error(
    `${checks.filter((c) => !c.pass).length} FrictionLab browser checks failed`,
  );
// Caller may retain this task for PDF export QA. Standalone runs close their own space.
if (!config.space) await task.finish({ keep: [] });
