import { Context, Effect, FileSystem, Layer, Path, Schema } from "effect";
import type { PlatformError } from "effect/PlatformError";

export const Issue = Schema.String.check(
  Schema.isPattern(/^[A-Z][A-Z0-9]*-[1-9][0-9]*$/u, {
    message: "Use a Linear issue ID such as ENG-123",
  }),
).pipe(Schema.brand("Issue"));
export type Issue = typeof Issue.Type;

export const Name = Schema.String.check(
  Schema.isPattern(/^(?!\.{1,2}$)[^/\\\p{Cc}]+$/u, {
    message: "Use a filename without directories or control characters",
  }),
).pipe(Schema.brand("Name"));
export type Name = typeof Name.Type;

export class Missing extends Schema.TaggedError<Missing>()("Missing", {
  path: Schema.String,
}) {
  override get message() {
    return `Not found: ${this.path}`;
  }
}

export class Exists extends Schema.TaggedError<Exists>()("Exists", {
  path: Schema.String,
}) {
  override get message() {
    return `Already exists: ${this.path}. Choose another filename.`;
  }
}

export class Invalid extends Schema.TaggedError<Invalid>()("Invalid", {
  message: Schema.String,
}) {}

export type Error = Missing | Exists | Invalid | PlatformError;

export interface Directory {
  readonly issue: Issue;
  readonly path: string;
}

export interface Artifact extends Directory {
  readonly name: string;
}

export interface Interface {
  readonly add: (input: {
    issue: Issue;
    source: string;
  }) => Effect.Effect<string, Error>;
  readonly create: (input: {
    issue: Issue;
    name: Name;
  }) => Effect.Effect<string, Error>;
  readonly home: () => Effect.Effect<string, Error>;
  readonly issues: () => Effect.Effect<readonly Directory[], Error>;
  readonly list: (issue: Issue) => Effect.Effect<readonly Artifact[], Error>;
  readonly path: (input: {
    issue: Issue;
    name?: Name;
  }) => Effect.Effect<string, Error>;
}

export class Service extends Context.Service<Service, Interface>()(
  "doket/Store",
) {}

const failure =
  (path: string) =>
  <A, R>(op: Effect.Effect<A, PlatformError, R>) =>
    op.pipe(
      Effect.catchReasons("PlatformError", {
        AlreadyExists: () => Effect.fail(new Exists({ path })),
        NotFound: () => Effect.fail(new Missing({ path })),
      }),
    );

export const layer = (root: string) =>
  Layer.effect(
    Service,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      if (root.trim().length === 0) {
        return yield* new Invalid({ message: "ISSUE_HOME must not be empty" });
      }
      const home = path.resolve(root);

      const directory = Effect.fn("Store.directory")(function* (
        issue: Issue,
        create = false,
      ) {
        if (create) {
          yield* fs.makeDirectory(home, { recursive: true });
        }
        const base = yield* fs.realPath(home).pipe(failure(home));
        const dir = path.join(base, issue);
        if (create) {
          yield* fs.makeDirectory(dir, { recursive: true });
        }
        const real = yield* fs.realPath(dir).pipe(failure(dir));
        const info = yield* fs.stat(real);
        if (real !== dir || info.type !== "Directory") {
          return yield* new Invalid({
            message: `Expected an ordinary issue directory: ${dir}`,
          });
        }
        return dir;
      });

      // The issue directory is only created once the file is ready, so a failure leaves no empty issue.
      const publish = <E>(
        issue: Issue,
        name: string,
        write: (file: string) => Effect.Effect<void, E>,
      ) =>
        Effect.scoped(
          Effect.gen(function* () {
            yield* fs.makeDirectory(home, { recursive: true });
            const stage = yield* fs.makeTempDirectoryScoped({
              directory: yield* fs.realPath(home),
              prefix: ".doket-",
            });
            const copy = path.join(stage, name);
            yield* write(copy);
            const file = path.join(yield* directory(issue, true), name);
            // A hard link publishes the complete copy and fails if the name is taken.
            yield* fs.link(copy, file).pipe(failure(file));
            return file;
          }),
        );

      const issues = Effect.fn("Store.issues")(function* () {
        const names = yield* fs.readDirectory(home).pipe(failure(home));
        return (yield* Effect.forEach(
          names.filter(Schema.is(Issue)).sort(),
          (issue) =>
            directory(issue).pipe(
              Effect.map((dir) => [{ issue, path: dir }]),
              Effect.catchTags({
                Invalid: () => Effect.succeed([]),
                Missing: () => Effect.succeed([]),
              }),
            ),
        )).flat();
      });

      const list = Effect.fn("Store.list")(function* (issue: Issue) {
        const dir = yield* directory(issue);
        const names = yield* fs.readDirectory(dir);
        return (yield* Effect.forEach(names.sort(), (name) =>
          Effect.gen(function* () {
            const file = path.join(dir, name);
            const real = yield* fs.realPath(file).pipe(failure(file));
            if (real !== file) {
              return [];
            }
            const info = yield* fs.stat(file).pipe(failure(file));
            return info.type === "File" ? [{ issue, name, path: file }] : [];
          }).pipe(Effect.catchTag("Missing", () => Effect.succeed([]))),
        )).flat();
      });

      return Service.of({
        add: Effect.fn("Store.add")(function* (input) {
          const source = path.resolve(input.source);
          const name = yield* Schema.decodeUnknownEffect(Name)(
            path.basename(source),
          ).pipe(
            Effect.mapError(
              () => new Invalid({ message: `Invalid filename: ${source}` }),
            ),
          );
          const info = yield* fs.stat(source).pipe(failure(source));
          if (info.type !== "File") {
            return yield* new Invalid({
              message: `Expected a file: ${source}`,
            });
          }
          return yield* publish(input.issue, name, (copy) =>
            fs.copyFile(source, copy),
          );
        }),
        create: Effect.fn("Store.create")(function* (input) {
          return yield* publish(input.issue, input.name, (copy) =>
            fs.writeFileString(copy, ""),
          );
        }),
        // Matches the paths of issues and files, and still answers before the store exists.
        home: () =>
          fs.realPath(home).pipe(
            Effect.catchReasons("PlatformError", {
              NotFound: () => Effect.succeed(home),
            }),
          ),
        issues: () =>
          issues().pipe(Effect.catchTag("Missing", () => Effect.succeed([]))),
        list,
        path: Effect.fn("Store.path")(function* (input) {
          const dir = yield* directory(input.issue);
          if (input.name === undefined) {
            return dir;
          }
          const file = path.join(dir, input.name);
          const real = yield* fs.realPath(file).pipe(failure(file));
          const info = yield* fs.stat(file);
          if (real !== file || info.type !== "File") {
            return yield* new Invalid({
              message: `Expected an ordinary file: ${file}`,
            });
          }
          return file;
        }),
      });
    }),
  );
