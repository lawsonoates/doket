import { FileFinder, type GrepCursor, type Result } from "@ff-labs/fff-bun";
import { Context, Effect, FileSystem, Layer, Path, Schema } from "effect";
import {
  type Artifact,
  type Issue,
  Service as Store,
  type Error as StoreError,
} from "./store.ts";

const size = 256;

export const Query = Schema.NonEmptyString.check(
  Schema.isPattern(/^[^\r\n]+$/u, {
    message: "Use a single-line search query",
  })
).pipe(Schema.brand("Query"));
export type Query = typeof Query.Type;

export type Match =
  | (Artifact & { readonly kind: "name" })
  | (Artifact & {
      readonly kind: "content";
      readonly line: number;
      readonly text: string;
    });

export class Failure extends Schema.TaggedError<Failure>()("SearchError", {
  message: Schema.String,
}) {}

export type Error = StoreError | Failure;

export interface Interface {
  readonly search: (input: {
    query: Query;
    issue?: Issue;
  }) => Effect.Effect<readonly Match[], Error>;
}

export class Search extends Context.Service<Search, Interface>()(
  "docket/Search"
) {}

const attempt = <A>(run: () => Result<A> | Promise<Result<A>>) =>
  Effect.tryPromise({
    catch: (cause) =>
      new Failure({
        message: `fff: ${cause instanceof globalThis.Error ? cause.message : String(cause)}`,
      }),
    try: () => Promise.resolve().then(run),
  }).pipe(
    Effect.flatMap((result) =>
      result.ok
        ? Effect.succeed(result.value)
        : Effect.fail(new Failure({ message: `fff: ${result.error}` }))
    )
  );

export const layer = (root: string) =>
  Layer.effect(
    Search,
    Effect.gen(function* () {
      const store = yield* Store;
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      return Search.of({
        search: Effect.fn("Search.search")(function* (input) {
          const dirs =
            input.issue === undefined
              ? yield* store.issues()
              : [
                  {
                    issue: input.issue,
                    path: yield* store.path({ issue: input.issue }),
                  },
                ];
          const files = (yield* Effect.forEach(dirs, (dir) =>
            store.list(dir.issue)
          )).flat();
          if (files.length === 0) {
            return [];
          }
          const base =
            input.issue === undefined
              ? yield* fs.realPath(path.resolve(root))
              : yield* store.path({ issue: input.issue });
          const allowed = new Map(files.map((file) => [file.path, file]));
          const query = input.query.toLowerCase();

          return yield* Effect.scoped(
            Effect.gen(function* () {
              const finder = yield* Effect.acquireRelease(
                attempt(() =>
                  FileFinder.create({
                    aiMode: true,
                    basePath: base,
                    disableMmapCache: true,
                    disableWatch: true,
                  })
                ),
                (resource) => Effect.sync(() => resource.destroy())
              );
              const ready = yield* attempt(() => finder.waitForScan(10_000));
              if (!ready) {
                return yield* new Failure({
                  message: "fff: file scan timed out after 10 seconds",
                });
              }

              const matches: Match[] = [];
              let offset = 0;
              for (;;) {
                const batch = yield* attempt(() =>
                  finder.fileSearch(query, {
                    // fff 0.11.0 names this pageIndex, but its native API expects a result offset.
                    pageIndex: offset,
                    pageSize: size,
                  })
                );
                matches.push(
                  ...batch.items.flatMap((hit) => {
                    const file = allowed.get(
                      path.resolve(base, hit.relativePath)
                    );
                    return file === undefined
                      ? []
                      : [{ ...file, kind: "name" } satisfies Match];
                  })
                );
                offset += batch.items.length;
                if (batch.items.length === 0 || offset >= batch.totalMatched) {
                  break;
                }
              }

              let cursor: GrepCursor | null = null;
              do {
                const batch = yield* attempt(() =>
                  finder.multiGrep({
                    cursor,
                    maxFileSize: 1_048_576,
                    maxMatchesPerFile: 0,
                    pageSize: size,
                    patterns: [query],
                    smartCase: true,
                  })
                );
                matches.push(
                  ...batch.items.flatMap((hit) => {
                    const file = allowed.get(
                      path.resolve(base, hit.relativePath)
                    );
                    return file === undefined
                      ? []
                      : [
                          {
                            ...file,
                            kind: "content",
                            line: hit.lineNumber,
                            text: hit.lineContent,
                          } satisfies Match,
                        ];
                  })
                );
                cursor = batch.nextCursor;
              } while (cursor !== null);

              return matches.sort(
                (a, b) =>
                  a.path.localeCompare(b.path) ||
                  (a.kind === "name" ? 0 : a.line) -
                    (b.kind === "name" ? 0 : b.line)
              );
            })
          );
        }),
      });
    })
  );
