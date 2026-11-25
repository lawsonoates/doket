#!/usr/bin/env node
// Runs the doket binary from the platform package npm installed alongside this one.
"use strict";

const { spawn } = require("node:child_process");

const name = `doket-${process.platform}-${process.arch}`;
let binary = process.env.DOKET_BIN_PATH;
if (!binary) {
  try {
    binary = require.resolve(`${name}/bin/doket`);
  } catch {
    console.error(
      `doket: the ${name} package is missing. doket supports linux and macOS on x64 and arm64.\n` +
        "If you installed with --no-optional or --omit=optional, reinstall without it.",
    );
    process.exit(1);
  }
}

const child = spawn(binary, process.argv.slice(2), { stdio: "inherit" });
const signals = ["SIGINT", "SIGTERM", "SIGHUP"];
const forward = (signal) => child.kill(signal);
for (const signal of signals) process.on(signal, forward);

child.on("error", (error) => {
  console.error(`doket: ${error.message}`);
  process.exit(1);
});
child.on("exit", (code, signal) => {
  for (const s of signals) process.off(s, forward);
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
