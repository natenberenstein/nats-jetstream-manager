/// <reference lib="webworker" />

type DiffCellType = "equal" | "added" | "removed" | "changed" | "empty";

interface DiffCell {
  text: string;
  type: DiffCellType;
}

interface DiffRow {
  left: DiffCell;
  right: DiffCell;
}

interface DiffSummary {
  equal: number;
  added: number;
  removed: number;
  changed: number;
}

interface DiffRequest {
  id: number;
  mode: "line" | "json";
  left: string;
  right: string;
}

interface DiffResponse {
  id: number;
  rows: DiffRow[];
  summary: DiffSummary;
  error?: string;
}

function buildDiffOps(left: string, right: string): Array<{ op: "equal" | "remove" | "add"; text: string }> {
  const a = left.split("\n");
  const b = right.split("\n");
  const maxLines = 1000;

  if (a.length > maxLines || b.length > maxLines) {
    const max = Math.max(a.length, b.length);
    const ops: Array<{ op: "equal" | "remove" | "add"; text: string }> = [];
    for (let i = 0; i < max; i += 1) {
      const leftLine = a[i];
      const rightLine = b[i];
      if (leftLine === rightLine) {
        if (leftLine !== undefined) ops.push({ op: "equal", text: leftLine });
      } else {
        if (leftLine !== undefined) ops.push({ op: "remove", text: leftLine });
        if (rightLine !== undefined) ops.push({ op: "add", text: rightLine });
      }
    }
    return ops;
  }

  const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
    Array.from({ length: b.length + 1 }, () => 0)
  );
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      if (a[i] === b[j]) dp[i][j] = 1 + dp[i + 1][j + 1];
      else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const ops: Array<{ op: "equal" | "remove" | "add"; text: string }> = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      ops.push({ op: "equal", text: a[i] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ op: "remove", text: a[i] });
      i += 1;
    } else {
      ops.push({ op: "add", text: b[j] });
      j += 1;
    }
  }
  while (i < a.length) {
    ops.push({ op: "remove", text: a[i] });
    i += 1;
  }
  while (j < b.length) {
    ops.push({ op: "add", text: b[j] });
    j += 1;
  }
  return ops;
}

function summarize(rows: DiffRow[]): DiffSummary {
  const summary: DiffSummary = { equal: 0, added: 0, removed: 0, changed: 0 };
  for (const row of rows) {
    if (row.left.type === "equal" && row.right.type === "equal") {
      summary.equal += 1;
      continue;
    }
    if (row.left.type === "changed" || row.right.type === "changed") {
      summary.changed += 1;
      continue;
    }
    if (row.left.type === "removed") {
      summary.removed += 1;
      continue;
    }
    if (row.right.type === "added") {
      summary.added += 1;
    }
  }
  return summary;
}

function buildLineRows(left: string, right: string): DiffRow[] {
  const ops = buildDiffOps(left, right);
  const rows: DiffRow[] = [];

  for (let i = 0; i < ops.length; i += 1) {
    const current = ops[i];

    if (current.op === "equal") {
      rows.push({
        left: { text: current.text, type: "equal" },
        right: { text: current.text, type: "equal" },
      });
      continue;
    }

    if (current.op === "remove" && i + 1 < ops.length && ops[i + 1].op === "add") {
      rows.push({
        left: { text: current.text, type: "changed" },
        right: { text: ops[i + 1].text, type: "changed" },
      });
      i += 1;
      continue;
    }

    if (current.op === "remove") {
      rows.push({
        left: { text: current.text, type: "removed" },
        right: { text: "", type: "empty" },
      });
    } else {
      rows.push({
        left: { text: "", type: "empty" },
        right: { text: current.text, type: "added" },
      });
    }
  }

  return rows;
}

function flattenJson(value: unknown, basePath: string, out: Map<string, string>): void {
  if (Array.isArray(value)) {
    value.forEach((item, idx) => flattenJson(item, `${basePath}[${idx}]`, out));
    if (value.length === 0) out.set(basePath, "[]");
    return;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      out.set(basePath, "{}");
      return;
    }
    for (const [key, item] of entries) {
      const nextPath = basePath ? `${basePath}.${key}` : key;
      flattenJson(item, nextPath, out);
    }
    return;
  }
  out.set(basePath, JSON.stringify(value));
}

function buildJsonRows(left: string, right: string): DiffRow[] {
  let leftObj: unknown;
  let rightObj: unknown;

  try {
    leftObj = JSON.parse(left);
    rightObj = JSON.parse(right);
  } catch {
    return buildLineRows(left, right);
  }

  const leftMap = new Map<string, string>();
  const rightMap = new Map<string, string>();
  flattenJson(leftObj, "$", leftMap);
  flattenJson(rightObj, "$", rightMap);

  const paths = Array.from(new Set([...leftMap.keys(), ...rightMap.keys()])).sort();
  const rows: DiffRow[] = [];

  for (const path of paths) {
    const l = leftMap.get(path);
    const r = rightMap.get(path);
    if (l === r) {
      rows.push({
        left: { text: `${path}: ${l ?? ""}`, type: "equal" },
        right: { text: `${path}: ${r ?? ""}`, type: "equal" },
      });
    } else if (l === undefined) {
      rows.push({
        left: { text: "", type: "empty" },
        right: { text: `${path}: ${r ?? ""}`, type: "added" },
      });
    } else if (r === undefined) {
      rows.push({
        left: { text: `${path}: ${l}`, type: "removed" },
        right: { text: "", type: "empty" },
      });
    } else {
      rows.push({
        left: { text: `${path}: ${l}`, type: "changed" },
        right: { text: `${path}: ${r}`, type: "changed" },
      });
    }
  }

  return rows;
}

self.onmessage = (event: MessageEvent<DiffRequest>) => {
  const { id, mode, left, right } = event.data;
  try {
    const rows = mode === "json" ? buildJsonRows(left, right) : buildLineRows(left, right);
    const response: DiffResponse = { id, rows, summary: summarize(rows) };
    self.postMessage(response);
  } catch (error) {
    const response: DiffResponse = {
      id,
      rows: [],
      summary: { equal: 0, added: 0, removed: 0, changed: 0 },
      error: error instanceof Error ? error.message : "Diff worker failed",
    };
    self.postMessage(response);
  }
};

export {};
