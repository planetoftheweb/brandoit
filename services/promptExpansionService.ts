/**
 * Midjourney-style brace expansion plus JSON-array prompt batches.
 *
 * Examples:
 *   "foo {a, b, c} bar"           -> ["foo a bar", "foo b bar", "foo c bar"]
 *   "A {x,y} B {1,2}"             -> ["A x B 1", "A x B 2", "A y B 1", "A y B 2"]
 *   ["tile 1", "tile {a,b}", "tile 3"] -> ["tile 1", "tile a", "tile b", "tile 3"]
 *   "foo \\{not a group\\} bar"   -> ["foo {not a group} bar"]
 *   ""                            -> [""]
 *
 * Notes:
 *   - Multiple top-level prompt tiles use a valid JSON array of strings. JSON
 *     owns escaping for commas, quotes, and square brackets inside list items.
 *   - A single brace group whose comma-separated options each look like
 *     `"Short title" paragraph...` (quoted title + body) are treated as
 *     separate tiles, not as one tile with multiple marks — e.g. OpenClaw-style
 *     stanzas: {"A" ... long text..., "B" ... long text...}
 *   - Literal braces are escaped with a backslash: "\\{" and "\\}".
 *   - Option values are trimmed individually. Consecutive whitespace (including
 *     newlines) inside the literal/option text is collapsed to single spaces so
 *     multi-line brace groups read naturally.
 *   - Empty groups ("{}" or "{ , }") are preserved as single empty options so
 *     they don't silently drop the prompt.
 *   - Unbalanced braces are treated as literals.
 */

type Segment =
  | { kind: "literal"; value: string }
  | { kind: "group"; options: string[] };

const collapseWhitespace = (value: string): string =>
  value.replace(/\s+/g, " ").trim();

const splitOptions = (raw: string): string[] => {
  const parts = raw.split(",").map((part) => collapseWhitespace(part));
  if (parts.length === 0) return [""];
  // Drop leading/trailing empty entries (from "{A, }" style typos) but keep
  // an explicit empty option if the user typed only commas.
  const allEmpty = parts.every((part) => part.length === 0);
  if (allEmpty) return [""];
  return parts;
};

const parseSegments = (input: string): Segment[] => {
  const segments: Segment[] = [];
  let literalBuffer = "";
  let i = 0;

  const pushLiteral = () => {
    if (literalBuffer.length === 0) return;
    segments.push({ kind: "literal", value: literalBuffer });
    literalBuffer = "";
  };

  while (i < input.length) {
    const ch = input[i];

    if (ch === "\\" && (input[i + 1] === "{" || input[i + 1] === "}")) {
      literalBuffer += input[i + 1];
      i += 2;
      continue;
    }

    if (ch === "{") {
      const closingIndex = findMatchingClose(input, i);
      if (closingIndex === -1) {
        // Unbalanced -> treat as literal.
        literalBuffer += ch;
        i += 1;
        continue;
      }
      const inner = input.slice(i + 1, closingIndex);
      pushLiteral();
      segments.push({ kind: "group", options: splitOptions(inner) });
      i = closingIndex + 1;
      continue;
    }

    literalBuffer += ch;
    i += 1;
  }

  pushLiteral();
  return segments;
};

const findMatchingClose = (input: string, openIndex: number): number => {
  let depth = 0;
  for (let j = openIndex; j < input.length; j += 1) {
    const ch = input[j];
    if (ch === "\\" && (input[j + 1] === "{" || input[j + 1] === "}")) {
      j += 1;
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return j;
    }
  }
  return -1;
};

const cartesian = (segments: Segment[]): string[] => {
  let results: string[] = [""];
  for (const segment of segments) {
    const nextValues =
      segment.kind === "literal" ? [segment.value] : segment.options;
    const next: string[] = [];
    for (const prefix of results) {
      for (const value of nextValues) {
        next.push(prefix + value);
      }
    }
    results = next;
  }
  return results.map((v) => collapseWhitespace(v));
};

export interface ExpansionResult {
  prompts: string[];
  hasBraces: boolean;
  hasPromptList: boolean;
  promptEntries: Array<{
    source: string;
    prompts: string[];
    hasBraces: boolean;
  }>;
}

const expandOnePrompt = (prompt: string) => {
  const segments = parseSegments(prompt);
  const hasBraces = segments.some((segment) => segment.kind === "group");
  const prompts = cartesian(segments);

  return {
    source: prompt,
    prompts: prompts.length === 0 ? [collapseWhitespace(prompt)] : prompts,
    hasBraces,
  };
};

/** Each option begins with a quoted title then more copy (not Midjourney `{a,b}` chips). */
const QUOTED_TITLE_STANZA = /^\s*"[^"]+"\s+\S/;
const MIN_STANZA_LENGTH = 80;

type PromptEntry = {
  source: string;
  prompts: string[];
  hasBraces: boolean;
};

const shouldSplitQuotedTitleStanzas = (entry: PromptEntry): boolean => {
  if (!entry.hasBraces || entry.prompts.length <= 1) return false;
  return entry.prompts.every(
    (p) => p.length >= MIN_STANZA_LENGTH && QUOTED_TITLE_STANZA.test(p)
  );
};

/**
 * Comma-separated options inside `{...}` normally become multiple *marks* in
 * one tile. When every option looks like `"Title" long body...`, treat them as
 * separate *tiles* instead (stanzas separated by `, "Next Title"`).
 */
const splitQuotedTitleStanzaEntries = (entry: PromptEntry): PromptEntry[] => {
  if (!shouldSplitQuotedTitleStanzas(entry)) return [entry];
  return entry.prompts.map((p) => ({
    source: p,
    prompts: [p],
    hasBraces: false,
  }));
};

const parsePromptList = (prompt: string): string[] | null => {
  const trimmed = prompt.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (
      !Array.isArray(parsed) ||
      parsed.length === 0 ||
      parsed.some((item) => typeof item !== "string")
    ) {
      return null;
    }
    return parsed;
  } catch {
    // Invalid JSON should behave like a normal prompt so typos are non-fatal.
    return null;
  }
};

export const expandPromptPermutations = (prompt: string): ExpansionResult => {
  if (typeof prompt !== "string") {
    return {
      prompts: [""],
      hasBraces: false,
      hasPromptList: false,
      promptEntries: [{ source: "", prompts: [""], hasBraces: false }],
    };
  }

  const promptList = parsePromptList(prompt);
  const entriesRaw = (promptList && promptList.length > 0 ? promptList : [prompt]).map(expandOnePrompt);
  const entries = entriesRaw.flatMap(splitQuotedTitleStanzaEntries);
  const prompts = entries.flatMap((entry) => entry.prompts);
  const hasBraces = entries.some((entry) => entry.hasBraces);

  // Guarantee at least one prompt string so downstream code always has work.
  if (prompts.length === 0) {
    const fallback = collapseWhitespace(prompt);
    return {
      prompts: [fallback],
      hasBraces,
      hasPromptList: promptList !== null,
      promptEntries: [{ source: prompt, prompts: [fallback], hasBraces }],
    };
  }
  return {
    prompts,
    hasBraces,
    hasPromptList: promptList !== null,
    promptEntries: entries,
  };
};

/**
 * Total number of generations a submit will produce given a prompt and
 * user-chosen "variations per prompt" count.
 */
export const estimateBatchSize = (prompt: string, copiesPerPrompt: number): number => {
  const safeCount = Math.max(1, Math.floor(copiesPerPrompt || 1));
  const { prompts } = expandPromptPermutations(prompt);
  return prompts.length * safeCount;
};
