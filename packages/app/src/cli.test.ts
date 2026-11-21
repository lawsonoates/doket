import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const main = join(import.meta.dir, "main.ts");

let root: string;
let home: string;

const doket = (...args: string[]) => {
  const result = Bun.spawnSync([process.execPath, main, ...args], {
    env: { ...process.env, HOME: root, ISSUE_HOME: home },
  });
  return {
    code: result.exitCode,
    err: result.stderr.toString().trim(),
    out: result.stdout.toString().trim(),
  };
};

const source = (name: string, content: string) => {
  const file = join(root, name);
  writeFileSync(file, content);
  return file;
};

const add = (issue: string, name: string, content = "") => {
  const result = doket("add", issue, source(name, content));
  expect(result.err).toBe("");
  return result.out;
};

const temporary = () =>
  readdirSync(home).filter((name) => name.startsWith(".doket-"));

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "doket-test-"));
  home = join(root, "home");
});

afterEach(() => {
  rmSync(root, { force: true, recursive: true });
});

describe("new", () => {
  test("creates an empty file and prints its path", () => {
    const { code, out } = doket("new", "eng-1", "notes.md");
    expect(code).toBe(0);
    expect(out).toBe(join(home, "ENG-1", "notes.md"));
    expect(readFileSync(out, "utf8")).toBe("");
    expect(temporary()).toEqual([]);
  });

  test("refuses a name that is taken", () => {
    doket("new", "ENG-1", "notes.md");
    const { code, err } = doket("new", "ENG-1", "notes.md");
    expect(code).toBe(1);
    expect(err).toContain("Already exists");
  });

  test.each([["foo"], ["ENG-0"]])("rejects the issue %s", (issue) => {
    expect(doket("new", issue, "notes.md").code).toBe(1);
    expect(existsSync(home)).toBe(false);
  });

  test.each([["a/b.md"], ["../evil.md"], [".."]])(
    "rejects the name %s",
    (name) => {
      expect(doket("new", "ENG-1", name).code).toBe(1);
      expect(existsSync(join(home, "ENG-1"))).toBe(false);
    },
  );

  test("leaves no issue behind when the file cannot be created", () => {
    expect(doket("new", "ENG-1", "a".repeat(300)).code).toBe(1);
    expect(doket("ls").out).toBe("");
    expect(temporary()).toEqual([]);
  });

  test("does not write through a symlinked issue", () => {
    const outside = join(root, "outside");
    mkdirSync(outside);
    mkdirSync(home);
    symlinkSync(outside, join(home, "ENG-1"));
    expect(doket("new", "ENG-1", "notes.md").code).toBe(1);
    expect(readdirSync(outside)).toEqual([]);
    expect(temporary()).toEqual([]);
  });
});

describe("add", () => {
  test("copies the file and leaves the source in place", () => {
    const from = source("repro.log", "line\n");
    const { code, out } = doket("add", "ENG-1", from);
    expect(code).toBe(0);
    expect(readFileSync(out, "utf8")).toBe("line\n");
    expect(existsSync(from)).toBe(true);
    expect(lstatSync(out).nlink).toBe(1);
    expect(temporary()).toEqual([]);
  });

  test("refuses a name that is taken and keeps the original", () => {
    add("ENG-1", "repro.log", "first");
    const { code, err } = doket("add", "ENG-1", source("repro.log", "second"));
    expect(code).toBe(1);
    expect(err).toContain("Already exists");
    expect(readFileSync(join(home, "ENG-1", "repro.log"), "utf8")).toBe(
      "first",
    );
  });

  test("leaves no issue behind when the source is missing", () => {
    expect(doket("add", "ENG-1", join(root, "nope")).code).toBe(1);
    expect(doket("ls").out).toBe("");
  });

  test("leaves no issue behind when the source is a directory", () => {
    const dir = join(root, "dir");
    mkdirSync(dir);
    expect(doket("add", "ENG-1", dir).code).toBe(1);
    expect(doket("ls").out).toBe("");
  });

  // Root can read anything, so there is nothing to refuse.
  test.skipIf(process.getuid?.() === 0)(
    "leaves no issue behind when the source is unreadable",
    () => {
      const from = source("secret.txt", "x");
      chmodSync(from, 0o000);
      expect(doket("add", "ENG-1", from).code).toBe(1);
      expect(doket("ls").out).toBe("");
      expect(temporary()).toEqual([]);
    },
  );

  test("exactly one of several parallel adds wins", async () => {
    const from = source("race.txt", "race");
    const runs = Array.from({ length: 8 }, () =>
      Bun.spawn([process.execPath, main, "add", "ENG-1", from], {
        env: { ...process.env, HOME: root, ISSUE_HOME: home },
        stderr: "ignore",
        stdout: "ignore",
      }),
    );
    const codes = await Promise.all(runs.map((run) => run.exited));
    expect(codes.filter((code) => code === 0)).toHaveLength(1);
    expect(temporary()).toEqual([]);
  });
});

describe("ls and path", () => {
  test("list issues and files, including dotfiles", () => {
    add("ENG-1", "repro.log");
    add("ENG-1", ".env.sample");
    add("DES-2", "flow.png");
    expect(doket("ls").out.split("\n")).toEqual(["DES-2", "ENG-1"]);
    expect(doket("ls", "eng-1").out.split("\n")).toEqual([
      join(home, "ENG-1", ".env.sample"),
      join(home, "ENG-1", "repro.log"),
    ]);
    expect(JSON.parse(doket("ls", "--json").out)).toHaveLength(2);
  });

  test("an empty store lists nothing and is not created", () => {
    expect(doket("ls")).toEqual({ code: 0, err: "", out: "" });
    expect(doket("ls", "--json").out).toBe("[]");
    expect(existsSync(home)).toBe(false);
  });

  test("path finds what exists and fails for what does not", () => {
    const file = add("ENG-1", "repro.log");
    expect(doket("path", "ENG-1").out).toBe(join(home, "ENG-1"));
    expect(doket("path", "ENG-1", "repro.log").out).toBe(file);
    expect(doket("path", "ENG-1", "nope").code).toBe(1);
    expect(doket("path", "ENG-9").code).toBe(1);
  });

  test("path with no arguments prints the store without creating it", () => {
    expect(doket("path")).toEqual({ code: 0, err: "", out: home });
    expect(existsSync(home)).toBe(false);
  });

  test("path spells the store the same way as its issues", () => {
    const real = join(root, "real");
    mkdirSync(real);
    symlinkSync(real, home);
    add("ENG-1", "repro.log");
    expect(doket("path").out).toBe(real);
    expect(doket("path", "ENG-1").out).toBe(join(real, "ENG-1"));
  });

  test("path never prints an empty store", () => {
    const path = (value: string) =>
      Bun.spawnSync([process.execPath, main, "path"], {
        env: { ...process.env, HOME: root, ISSUE_HOME: value },
      });
    const blank = path("   ");
    expect(blank.exitCode).toBe(1);
    expect(blank.stdout.toString()).toBe("");
    expect(path("").stdout.toString().trim()).toBe(
      join(root, "Documents", "issue-files"),
    );
  });

  test("symlinks are skipped by ls and refused by path", () => {
    add("ENG-1", "repro.log");
    symlinkSync(source("outside.txt", ""), join(home, "ENG-1", "link.txt"));
    expect(doket("ls", "ENG-1").out).toBe(join(home, "ENG-1", "repro.log"));
    expect(doket("path", "ENG-1", "link.txt").code).toBe(1);
  });
});

describe("the recipes in --help", () => {
  const recipes = () =>
    doket("--help")
      .out.split("\n")
      .map((line) => line.trim())
      .filter((line) => /^(grep|rg|find) /u.test(line));

  const run = (recipe: string | undefined) => {
    const bin = join(root, "bin");
    mkdirSync(bin, { recursive: true });
    writeFileSync(
      join(bin, "doket"),
      `#!/bin/sh\nexec "${process.execPath}" "${main}" "$@"\n`,
      { mode: 0o755 },
    );
    const result = Bun.spawnSync(["sh", "-c", recipe ?? "false"], {
      env: {
        ...process.env,
        HOME: root,
        ISSUE_HOME: home,
        PATH: `${bin}:${process.env.PATH}`,
      },
    });
    return result.stdout.toString();
  };

  beforeEach(() => {
    add("ENG-123", "report.md", "text in a file\n");
    add("ENG-123", ".env.sample", "text in a dotfile\n");
    add("DES-2", "other.txt", "text elsewhere\n");
    writeFileSync(join(home, ".gitignore"), "*\n");
    writeFileSync(join(home, ".ignore"), "*\n");
  });

  test("grep searches every file, including dotfiles", () => {
    const found = run(recipes()[0]);
    expect(found).toContain(join(home, "ENG-123", "report.md"));
    expect(found).toContain(join(home, "ENG-123", ".env.sample"));
    expect(found).toContain(join(home, "DES-2", "other.txt"));
  });

  test("grep can be limited to one issue", () => {
    const found = run(recipes()[1]);
    expect(found).toContain(join(home, "ENG-123", ".env.sample"));
    expect(found).not.toContain("DES-2");
  });

  test.skipIf(Bun.which("rg") === null)(
    "ripgrep finds hidden and ignored files",
    () => {
      const found = run(recipes()[2]);
      expect(found).toContain(join(home, "ENG-123", ".env.sample"));
      expect(found).toContain(join(home, "DES-2", "other.txt"));
    },
  );

  test("find locates a file by name", () => {
    expect(run(recipes()[3]).trim()).toBe(join(home, "ENG-123", "report.md"));
  });
});

describe("the command", () => {
  test("reports its version", () => {
    const { version } = JSON.parse(
      readFileSync(join(import.meta.dir, "..", "package.json"), "utf8"),
    );
    expect(doket("--version").out).toBe(`doket v${version}`);
  });

  test("search is gone", () => {
    expect(doket("search", "anything").code).toBe(1);
  });

  test("usage errors exit 1 and write to stderr", () => {
    const { code, err, out } = doket("frobnicate");
    expect(code).toBe(1);
    expect(out).toBe("");
    expect(err).toContain("frobnicate");
  });
});
