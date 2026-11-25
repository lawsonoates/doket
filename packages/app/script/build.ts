#!/usr/bin/env bun
// Compiles a standalone doket binary per target into dist/<package>/bin/doket,
// each with the package.json npm needs, plus a dist/<package>.tar.gz for GitHub Releases.
// Pass --single to build only the current platform.
import { $ } from "bun";
import { mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import manifest from "../package.json";
import { packageName, targets } from "./targets.ts";

const root = resolve(import.meta.dirname, "..");
const dist = join(root, "dist");
const single = process.argv.includes("--single");

const selected = single
  ? targets.filter(
      (target) =>
        target.os === process.platform && target.arch === process.arch,
    )
  : targets;
if (selected.length === 0) {
  throw new Error(`No target for ${process.platform}-${process.arch}`);
}

await rm(dist, { recursive: true, force: true });

for (const target of selected) {
  const name = packageName(target);
  const dir = join(dist, name);
  const binary = join(dir, "bin", "doket");
  console.log(`building ${name}`);
  await mkdir(join(dir, "bin"), { recursive: true });

  const result = await Bun.build({
    entrypoints: [join(root, "src", "main.ts")],
    minify: true,
    compile: {
      target: `bun-${target.os}-${target.arch}`,
      outfile: binary,
      autoloadBunfig: false,
      autoloadDotenv: false,
    },
  });
  if (!result.success) {
    throw new AggregateError(result.logs, `Build failed for ${name}`);
  }

  if (target.os === process.platform && target.arch === process.arch) {
    const version = (await $`${binary} --version`.text()).trim();
    if (version !== `doket v${manifest.version}`) {
      throw new Error(`Smoke test failed for ${name}: ${version}`);
    }
    console.log(`smoke test passed: ${version}`);
  }

  await Bun.write(
    join(dir, "package.json"),
    `${JSON.stringify(
      {
        name,
        version: manifest.version,
        license: manifest.license,
        description: `The doket binary for ${target.os} ${target.arch}`,
        repository: manifest.repository,
        os: [target.os],
        cpu: [target.arch],
        preferUnplugged: true,
      },
      null,
      2,
    )}\n`,
  );
  await $`tar -czf ${join(dist, `${name}.tar.gz`)} -C ${join(dir, "bin")} doket`;
}
