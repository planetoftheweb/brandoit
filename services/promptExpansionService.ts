/**
 * Midjourney-style brace expansion for prompts.
 *
 * Examples:
 *   "foo {a, b, c} bar"           -> ["foo a bar", "foo b bar", "foo c bar"]
 *   "A {x,y} B {1,2}"             -> ["A x B 1", "A x B 2", "A y B 1", "A y B 2"]
 *   "foo \\{not a group\\} bar"   -> ["foo {not a group} bar"]
 *   ""                            -> [""]
 *
 * Notes:
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
}

export const expandPromptPermutations = (prompt: string): ExpansionResult => {
  if (typeof prompt !== "string") {
    return { prompts: [""], hasBraces: false };
  }

  const segments = parseSegments(prompt);
  const hasBraces = segments.some((segment) => segment.kind === "group");
  const prompts = cartesian(segments);

  // Guarantee at least one prompt string so downstream code always has work.
  if (prompts.length === 0) {
    return { prompts: [collapseWhitespace(prompt)], hasBraces };
  }
  return { prompts, hasBraces };
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
