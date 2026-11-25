#!/usr/bin/env bun
// Publishes the platform packages from script/build.ts, then the doket package that
// installs the matching one through optionalDependencies. Versions npm already has are
// skipped, so a failed run can be repeated.
// With --stage, versions are staged instead and go live only once approved with 2FA,
// platform packages first: npm stage list, then npm stage approve <stage-id>.
import { $ } from "bun";
import { cp, mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import manifest from "../package.json";
import { packageName, targets } from "./targets.ts";

const root = resolve(import.meta.dirname, "..");
const dist = join(root, "dist");
const { version } = manifest;
// npm rejects the unscoped name doket as too similar to dot.
const name = "@lawsonoates/doket";
const stage = process.argv.includes("--stage");

const published = async (name: string) =>
  (await $`npm view ${`${name}@${version}`} version`.quiet().nothrow())
    .exitCode === 0;

const publish = async (dir: string, name: string) => {
  if (await published(name)) {
    console.log(`already published ${name}@${version}`);
    return;
  }
  // Inherit the terminal so npm can ask for a one-time password.
  const command = stage
    ? ["npm", "stage", "publish", ".", "--access", "public"]
    : ["npm", "publish", "--access", "public"];
  const child = Bun.spawn(command, {
    cwd: dir,
    stdio: ["inherit", "inherit", "inherit"],
  });
  if ((await child.exited) !== 0) {
    throw new Error(`${command.join(" ")} failed for ${name}@${version}`);
  }
};

for (const target of targets) {
  const name = packageName(target);
  const dir = join(dist, name);
  const built = await Bun.file(join(dir, "package.json"))
    .json()
    .catch(() => undefined);
  if (built?.version !== version) {
    throw new Error(`Run script/build.ts first: ${name}@${version} is missing`);
  }
  await publish(dir, name);
}

const wrapper = join(dist, "doket");
await rm(wrapper, { recursive: true, force: true });
await mkdir(join(wrapper, "bin"), { recursive: true });
await cp(join(root, "npm", "doket.js"), join(wrapper, "bin", "doket"));
for (const file of ["README.md", "LICENSE"]) {
  const source = join(root, "..", "..", file);
  if (await Bun.file(source).exists()) {
    await cp(source, join(wrapper, file));
  }
}
await Bun.write(
  join(wrapper, "package.json"),
  `${JSON.stringify(
    {
      name,
      version,
      license: manifest.license,
      description: manifest.description,
      repository: manifest.repository,
      homepage: manifest.homepage,
      bin: { doket: "bin/doket" },
      os: [...new Set(targets.map((target) => target.os))],
      cpu: [...new Set(targets.map((target) => target.arch))],
      optionalDependencies: Object.fromEntries(
        targets.map((target) => [packageName(target), version]),
      ),
    },
    null,
    2,
  )}\n`,
);
await publish(wrapper, name);
