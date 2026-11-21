import { Console, Effect, Option } from "effect";
import { Argument, Command, Flag } from "effect/cli";
import { Issue, Name, Service as Store } from "./store.ts";

const issue = Argument.String("issue").pipe(
  Argument.map((value) => value.toUpperCase()),
  Argument.withSchema(Issue),
);
const name = Argument.String("name").pipe(Argument.withSchema(Name));
const json = Flag.Boolean("json").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Print a JSON array"),
);

const print = <A>(
  items: readonly A[],
  structured: boolean,
  line: (item: A) => string,
) =>
  items.length === 0 && !structured
    ? Effect.void
    : Console.log(
        structured ? JSON.stringify(items) : items.map(line).join("\n"),
      );

const create = Command.make("new", { issue, name }, (input) =>
  Effect.gen(function* () {
    const store = yield* Store;
    yield* Console.log(yield* store.create(input));
  }),
).pipe(
  Command.withDescription("Create an empty file and print its absolute path"),
);

const add = Command.make(
  "add",
  { issue, source: Argument.String("source") },
  (input) =>
    Effect.gen(function* () {
      const store = yield* Store;
      yield* Console.log(yield* store.add(input));
    }),
).pipe(
  Command.withDescription(
    "Copy a file into an issue and print its absolute path",
  ),
);

const list = Command.make(
  "ls",
  { issue: issue.pipe(Argument.optional), json },
  (input) =>
    Effect.gen(function* () {
      const store = yield* Store;
      if (Option.isSome(input.issue)) {
        yield* print(
          yield* store.list(input.issue.value),
          input.json,
          (file) => file.path,
        );
        return;
      }
      yield* print(yield* store.issues(), input.json, (dir) => dir.issue);
    }),
).pipe(
  Command.withDescription("List an issue's files, or list all stored issues"),
);

const path = Command.make(
  "path",
  {
    issue: issue.pipe(Argument.optional),
    name: name.pipe(Argument.optional),
  },
  (input) =>
    Effect.gen(function* () {
      const store = yield* Store;
      yield* Console.log(
        Option.isSome(input.issue)
          ? yield* store.path({
              issue: input.issue.value,
              name: Option.getOrUndefined(input.name),
            })
          : yield* store.home(),
      );
    }),
).pipe(
  Command.withDescription(
    "Print the absolute path of the store, or of an existing issue or file",
  ),
);

export const command = Command.make("doket").pipe(
  Command.withDescription("Keep the files for each Linear issue together"),
  Command.withSubcommands([create, add, list, path]),
  Command.withExamples([
    {
      command: 'grep -rn "text" "$(doket path)"',
      description: "Search the text of every file",
    },
    {
      command: 'grep -rn "text" "$(doket path ENG-123)"',
      description: "Search the text of one issue's files",
    },
    {
      command: 'rg --hidden --no-ignore "text" "$(doket path)"',
      description:
        "Use ripgrep, which otherwise skips hidden and ignored files",
    },
    {
      command: 'find "$(doket path)" -type f -iname "*report*"',
      description: "Find files by name",
    },
  ]),
);
