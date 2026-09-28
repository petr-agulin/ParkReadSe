// A live run of the set: ask the model about the photographs again. A port of
// `cli.py run` (step 8, stage 4).
//
// **The developer runs this command, not the AI:** it spends the key and the quota.
// Node reads the key and the address from `.env` itself.
//
//     npm run ask -- testset/photos/005-2tim-8-18-parentes-8-15-dubbelpil.jpg
//     npm run ask -- --refresh testset/photos/*.jpg
//
// It is the only way to ask the model again after a prompt edit: without it "did not
// get worse" cannot be checked — the measurement counts saved answers, and they answer
// the PREVIOUS question.
//
// One model for both stages (decision 134): `VISION_MODEL`.

import { readFileSync, readdirSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { run } from "../src/lib/pipeline";
import { extractPrompt, triagePrompt } from "../src/lib/prompts";
import { ok } from "../src/lib/validation";
import { RUN_PATIENCE, type Pause, type Photo, type Provider } from "../src/lib/vision";
import { refused, save, stale } from "./fixtures";

export const ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const ANSWERS = join(ROOT, "testset", "answers");

/** The key, the address and the model from the environment. An empty field is not a
 *  default but a refusal: quietly asking the wrong model costs more than not asking. */
export function providerFromEnv(env: NodeJS.ProcessEnv = process.env): Provider {
  const provider: Provider = {
    baseUrl: env.VISION_API_BASE_URL ?? "",
    apiKey: env.VISION_API_KEY ?? "",
    visionModel: env.VISION_MODEL ?? "",
  };
  const missing = [
    ["VISION_API_BASE_URL", provider.baseUrl],
    ["VISION_API_KEY", provider.apiKey],
    ["VISION_MODEL", provider.visionModel],
  ].filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) throw new Error("not set in .env: " + missing.join(", "));
  return provider;
}

/** PowerShell does not expand `*.jpg` for an external program — so we expand it.
 *  Otherwise the command from the README quietly finds no file at all. */
export function expand(args: string[]): string[] {
  const out: string[] = [];
  for (const raw of args) {
    const full = isAbsolute(raw) ? raw : resolve(ROOT, raw);
    if (!/[*?[]/.test(raw)) {
      out.push(full);
      continue;
    }
    const dir = dirname(full);
    const rule = new RegExp("^" + basename(full)
      .replace(/[.+^${}()|\\]/g, "\\$&")
      .replace(/\*/g, ".*")
      .replace(/\?/g, ".") + "$");
    out.push(...readdirSync(dir).filter((f) => rule.test(f)).sort()
      .map((f) => join(dir, f)));
  }
  return out;
}

const MIME: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg",
                                       ".jpeg": "image/jpeg" };

/** A photograph from disk. Into memory and nowhere else: no temporary file appears. */
export function photoOf(path: string): Photo {
  const bytes = readFileSync(path);
  return { name: basename(path),
           data: new Blob([bytes], { type: MIME[extname(path).toLowerCase()] ?? "image/jpeg" }) };
}

export type AskDeps = {
  fetchImpl?: typeof fetch;
  pause?: (ms: number) => Promise<unknown>;
  fixturesDir?: string;
  out?: (line: string) => void;
  provider?: Provider;
};

/** How many photographs could not be read. One failure does not stop the run: the
 *  provider may answer `429` halfway, and the answers already received are saved. */
export async function ask(paths: string[], { refresh = false } = {},
                          deps: AskDeps = {}): Promise<number> {
  const out = deps.out ?? ((line: string) => console.log(line));
  // Every wait is said aloud, with its reason. Silent, a provider over quota and a
  // hung connection look alike - one line on screen for minutes on end.
  const wait = deps.pause ?? ((ms: number) => new Promise((done) => setTimeout(done, ms)));
  const announced: Pause = (ms, why, attempt, info) => {
    out(`  attempt ${attempt ?? "?"} of ${info?.of ?? RUN_PATIENCE.pausesMs.length + 1} failed `
        + `(${why || "no answer"}) - waiting ${Math.round(ms / 1000)} s`);
    return wait(ms);
  };
  const dir = deps.fixturesDir ?? ANSWERS;
  const provider = deps.provider ?? providerFromEnv();
  const triage = triagePrompt();
  const extract = extractPrompt();
  let bad = 0;

  for (const path of paths) {
    out(`\n=== ${basename(path)} ===`);

    // A refused photograph had and will have no extraction stage: the pipeline never
    // reaches it, and its absence is no reason to ask about the photograph for ever.
    const wasRefused = refused(dir, path);
    const stages: [string, string][] = wasRefused
      ? [["triage", triage]]
      : [["triage", triage], ["extract", extract]];

    if (!refresh) {
      const flags = await Promise.all(stages.map(([stage, prompt]) =>
        stale(dir, path, stage, prompt)));
      if (!flags.some(Boolean)) {
        out(wasRefused ? "  the triage already refused this photograph — skipped"
                       : "  answers to the same prompts exist — skipped");
        continue;
      }
    }

    let outcome;
    try {
      outcome = await run(photoOf(path), provider,
                          // The run can wait: nobody is standing at a pole.
                          { fetchImpl: deps.fetchImpl, pause: announced,
                            patience: RUN_PATIENCE });
    } catch (e) {
      // One failure must not bring the whole run down.
      out(`  CALL FAILED: ${(e as Error).name}: ${String((e as Error).message).slice(0, 200)}`);
      // A reply that is not JSON: show where it starts and where it ends - that is
      // where a reply goes wrong, cut short or wrapped in prose (photograph `005`).
      const raw = (e as { raw?: unknown }).raw;
      if (typeof raw === "string") {
        out(`  the reply begins: ${JSON.stringify(raw.slice(0, 300))}`);
        out(`  the reply ends:   ${JSON.stringify(raw.slice(-300))}`);
      }
      bad += 1;
      continue;
    }

    // Only what passed the check is saved: a rejected answer written into a fixture
    // would be read by the measurement as a real one.
    const tri = outcome.triage;
    if (tri && tri.validation && ok(tri.validation) && tri.validation.data) {
      await save(dir, path, "triage", tri.validation.data, provider.visionModel,
                 tri.usage, triage);
    }
    const ext = outcome.extraction;
    if (ext && ok(ext.validation) && ext.data) {
      await save(dir, path, "extract", ext.data, provider.visionModel, ext.usage, extract);
    }

    if (tri) {
      out(`  triage:     ${tri.category} | panels counted: ${tri.panelsBelowMainSign}`);
      const repairs = tri.validation?.repairs ?? [];
      if (repairs.length) out("  triage repairs: " + repairs.join("; "));
      if (tri.validation && !ok(tri.validation)) {
        out("  TRIAGE REJECTED, answer not saved: "
            + tri.validation.schemaErrors.slice(0, 3).join("; "));
      }
    }
    if (outcome.stoppedAt === "triage") {
      out(`  STOPPED: ${outcome.reason}`);
      continue;
    }
    if (outcome.stoppedAt === "extraction") {
      out(`  REJECTED by validation: ${outcome.reason}`);
      bad += 1;
      continue;
    }

    const doc = ext!.data!;
    const main = doc.main_sign;
    out(`  sign:       ${main.type} / ${main.form} / ${main.background_color}`);
    out(`  panels:     ${doc.panel_count}`);
    for (const panel of doc.panels ?? []) {
      const keys = outcome.recognised?.panelKeys[panel.index as number] ?? [];
      const text = (panel.lines ?? []).join(" | ") || "(no text)";
      out(`    ${panel.index}. [${String(panel.kind).padEnd(10)}] ${text}`);
      out(`       reference:  ${keys.length ? keys.join(", ") : "no match"}`);
    }
    for (const [index, lines] of Object.entries(outcome.recognised?.uninterpreted ?? {})) {
      out(`  not interpreted, panel ${index}: ${(lines as string[]).join("; ")}`);
    }
    const repairs = ext!.validation.repairs;
    if (repairs.length) out("  validation repairs: " + repairs.join("; "));
    out(`  signals:    ${outcome.flags.length ? outcome.flags.join(", ") : "clean"}`);
  }
  return bad;
}

if (process.argv[1] && process.argv[1].endsWith("ask.ts")) {
  const args = process.argv.slice(2);
  const refresh = args.includes("--refresh");
  const paths = expand(args.filter((a) => a !== "--refresh"));
  if (!paths.length) {
    console.error("name at least one photograph: npm run ask -- testset/photos/<photo>");
    process.exitCode = 2;
  } else {
    ask(paths, { refresh })
      .then((bad) => { process.exitCode = bad ? 1 : 0; })
      .catch((e) => { console.error(String(e.message ?? e)); process.exitCode = 1; });
  }
}
