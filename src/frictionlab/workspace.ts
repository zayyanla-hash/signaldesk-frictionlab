import {
  analyze,
  experimentErrors,
  proposeExperiment,
  validateDataset,
  type Dataset,
  type Experiment,
} from "./workbench";
import { SYNTHETIC } from "./examples";
export const WORKSPACE_KEY = "frictionlab-workbench-v2";
export interface Workspace {
  version: 2;
  dataset: Dataset;
  experiment: Experiment;
  segment: string;
  targetIndex: number;
}
export function freshWorkspace(): Workspace {
  return {
    version: 2,
    dataset: SYNTHETIC,
    experiment: proposeExperiment(analyze(SYNTHETIC)),
    segment: "",
    targetIndex: 1,
  };
}
function record(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
export function decodeWorkspace(raw: string): Workspace | null {
  try {
    if (raw.length > 3_000_000) return null;
    const x: unknown = JSON.parse(raw);
    if (
      !record(x) ||
      x.version !== 2 ||
      !record(x.dataset) ||
      !record(x.dataset.contract) ||
      !record(x.experiment)
    )
      return null;
    const d = x.dataset;
    if (
      typeof d.name !== "string" ||
      d.name.length > 120 ||
      typeof d.csv !== "string" ||
      !["synthetic", "imported"].includes(String(d.provenance))
    )
      return null;
    const c = d.contract as Record<string, unknown>;
    if (
      typeof c.source !== "string" ||
      typeof c.grain !== "string" ||
      typeof c.windowDays !== "number" ||
      typeof c.aggregateConfirmed !== "boolean" ||
      !["cohortStart", "cohortEnd", "observedThrough"].every(
        (k) => typeof c[k] === "string",
      )
    )
      return null;
    const dataset = d as unknown as Dataset;
    const v = validateDataset(dataset);
    if (
      !v.ok ||
      typeof x.segment !== "string" ||
      (x.segment !== "" && !v.segments.includes(x.segment)) ||
      (x.targetIndex !== 1 && x.targetIndex !== 2)
    )
      return null;
    const draft = x.experiment;
    const keys: (keyof Experiment)[] = [
      "hypothesis",
      "audience",
      "intervention",
      "primaryMetric",
      "guardrail",
      "decisionRule",
      "instrumentation",
      "evidencePlan",
    ];
    // In-progress empty fields persist; shape and upper bounds are still enforced.
    if (
      !keys.every(
        (k) =>
          typeof draft[k] === "string" && (draft[k] as string).length <= 5000,
      )
    )
      return null;
    const experiment = Object.fromEntries(
      keys.map((k) => [k, draft[k]]),
    ) as unknown as Experiment;
    return {
      version: 2,
      dataset,
      experiment,
      segment: x.segment,
      targetIndex: x.targetIndex,
    };
  } catch {
    return null;
  }
}
export function loadWorkspace(storage: Pick<Storage, "getItem">): {
  workspace: Workspace;
  notice: string | null;
} {
  try {
    const raw = storage.getItem(WORKSPACE_KEY);
    if (!raw) return { workspace: freshWorkspace(), notice: null };
    const decoded = decodeWorkspace(raw);
    return decoded
      ? {
          workspace: decoded,
          notice: "Restored this device’s dataset and experiment draft.",
        }
      : {
          workspace: freshWorkspace(),
          notice:
            "Saved work was incompatible or damaged. Loaded the labeled synthetic example instead.",
        };
  } catch {
    return {
      workspace: freshWorkspace(),
      notice:
        "Browser storage is unavailable. Work is held in memory for this visit.",
    };
  }
}
// Export checks are separate from draft storage: incomplete work remains recoverable.
export const completeExperiment = (e: Experiment) =>
  experimentErrors(e).length === 0;
