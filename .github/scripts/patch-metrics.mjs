import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Metrics v3.34 exits its do/while loop after the first failed request because
// pushed is still zero. It also compares a page's size with the total limit,
// which stops pagination as soon as the request batch is smaller than the limit.
export function patchBase(source) {
  const changes = [
    ["        do {", "        while (true) {"],
    [
      "          if (pushed < repositories) {",
      "          if ((pushed < Math.min(repositories, {user: _batch, organization: Math.min(25, _batch)}[account])) || (!cursor) || (data.user[type].nodes.length >= repositories)) {",
    ],
    [
      "        while ((pushed) && (cursor) && ((data.user.repositories?.nodes?.length ?? 0) + (data.user.repositoriesContributedTo?.nodes?.length ?? 0) < repositories))",
      "",
    ],
  ];
  for (const [before, after] of changes) {
    if (source.split(before).length !== 2) {
      throw new Error("Metrics source changed: cannot safely apply the repository pagination fix");
    }
    source = source.replace(before, after);
  }
  return source;
}

if (process.argv[2]) {
  const actionPath = path.resolve(process.argv[2]);
  const basePath = path.join(actionPath, "source/plugins/base/index.mjs");
  await writeFile(basePath, patchBase(await readFile(basePath, "utf8")));
  // Reuse the published image and replace only the patched module. This avoids
  // rebuilding Chrome, Linguist and all other dependencies on every run.
  await writeFile(path.join(actionPath, "Dockerfile"), [
    "FROM ghcr.io/lowlighter/metrics:v3.34",
    "COPY source/plugins/base/index.mjs /metrics/source/plugins/base/index.mjs",
    "",
  ].join("\n"));
  console.log("Applied Metrics repository retry and pagination fix");
}
