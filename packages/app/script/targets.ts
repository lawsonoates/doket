export const targets = [
  { os: "linux", arch: "x64" },
  { os: "linux", arch: "arm64" },
  { os: "darwin", arch: "x64" },
  { os: "darwin", arch: "arm64" },
] as const;

export type Target = (typeof targets)[number];

export const packageName = (target: Target) =>
  `doket-${target.os}-${target.arch}`;
