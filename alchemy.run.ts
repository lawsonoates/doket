import { resolve } from "node:path";
import * as Alchemy from "alchemy";
import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Effect from "effect/Effect";

export const Website = Cloudflare.Website.Astro("Website", {
  rootDir: resolve(import.meta.dirname, "packages/web"),
  domain: "doket.dev",
  astro: { output: "static", site: "https://doket.dev" },
  assets: { notFoundHandling: "single-page-application" },
});

export type WebsiteEnv = Cloudflare.InferEnv<typeof Website>;

export default Alchemy.Stack(
  "doket",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const site = yield* Website;
    return { url: site.url };
  }),
);
