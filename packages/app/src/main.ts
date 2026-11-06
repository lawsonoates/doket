#!/usr/bin/env bun
import { homedir } from "node:os";
import { BunRuntime, BunServices } from "@effect/platform-bun";
import {
  Cause,
  Config,
  Console,
  Effect,
  Exit,
  Layer,
  Option,
  Path,
} from "effect";
import { CliError, Command } from "effect/cli";
import manifest from "../package.json";
import { command } from "./cli.ts";
import { layer as search } from "./search.ts";
import { layer } from "./store.ts";

const storage = Layer.unwrap(
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const root = yield* Config.String("ISSUE_HOME").pipe(
      Config.withDefault(path.join(homedir(), "Documents", "issue-files")),
    );
    return search(root).pipe(Layer.provideMerge(layer(root)));
  }),
);

Effect.gen(function* () {
  const terminal = yield* Console.Console;
  const output: (readonly unknown[])[] = [];
  // Effect renders usage before a parse failure. Commit output to the right stream on exit.
  yield* Command.run(command, {
    version: manifest.version,
  }).pipe(
    Effect.catchTag("ShowHelp", (err) =>
      err.errors.length === 0 ? Effect.void : Effect.fail(err),
    ),
    Effect.provideService(Console.Console, {
      ...terminal,
      log: (...args) => output.push(args),
    }),
    Effect.onExit((exit) =>
      Effect.forEach(
        output,
        (args) =>
          Effect.sync(() => {
            if (Exit.isSuccess(exit)) {
              terminal.log(...args);
            } else {
              terminal.error(...args);
            }
          }),
        { discard: true },
      ),
    ),
  );
}).pipe(
  Effect.provide(storage),
  Effect.provide(BunServices.layer),
  Effect.catchCause((cause) => {
    process.exitCode = Cause.hasInterruptsOnly(cause) ? 130 : 1;
    const err = Cause.findErrorOption(cause);
    if (
      Option.isSome(err) &&
      CliError.isCliError(err.value) &&
      (err.value._tag === "ShowHelp" || err.value._tag === "UserError")
    ) {
      return Effect.void;
    }
    return Console.error(
      Option.isSome(err) ? `docket: ${err.value.message}` : Cause.pretty(cause),
    );
  }),
  BunRuntime.runMain,
);
