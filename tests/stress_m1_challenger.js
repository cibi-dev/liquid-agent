/**
 * EMPIRICAL ADVERSARIAL STRESS TEST HARNESS — Milestone 1
 *
 * Empirical challenger test harness verifying:
 * 1. Massive Output (>200,000 characters) & UTF-8 Chunk Boundaries
 * 2. Rapid Concurrency (20 simultaneous shell commands)
 * 3. Complex Quotes, Pipes, Nested Scripts, and Multiline Commands
 * 4. AbortSignal Cancellation & Process Lifecycle
 * 5. DATA and DIRS Edge Cases & Filesystem Integrity
 */

import test, { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DATA, DIRS, shell, resolveDataDir, resolvePlatformOpen } from "../server/core.js";

describe("Adversarial Stress Suite 1: Massive Output Buffer Limits", () => {
  it("caps massive stdout (>250,000 chars) strictly at MAX_OUTPUT (200,000) without memory leak", async () => {
    const cmd = "[Console]::Out.Write('X' * 250000)";
    const res = await shell(cmd, { timeout: 30_000 });
    assert.strictEqual(typeof res, "string", "Output should be string");
    assert.strictEqual(res.length, 200_000, `Expected length exactly 200000, got ${res.length}`);
    assert.ok(/^X+$/.test(res), "Output should contain only 'X' characters");
  });

  it("caps massive stdout (>500,000 chars) in chunks strictly at 200,000", async () => {
    const cmd = "1..10 | ForEach-Object { [Console]::Out.Write('Y' * 50000) }";
    const res = await shell(cmd, { timeout: 30_000 });
    assert.strictEqual(typeof res, "string");
    assert.strictEqual(res.length, 200_000, `Expected length exactly 200000, got ${res.length}`);
    assert.ok(/^Y+$/.test(res), "Output should contain only 'Y' characters");
  });

  it("caps massive stderr (>250,000 chars) strictly at 200,000", async () => {
    const cmd = "[Console]::Error.Write('E' * 250000)";
    const res = await shell(cmd, { timeout: 30_000 });
    assert.strictEqual(typeof res, "string");
    assert.strictEqual(res.length, 200_000, `Expected length exactly 200000, got ${res.length}`);
    assert.ok(/^E+$/.test(res));
  });

  it("interleaved stdout and stderr exceeding 200,000 characters caps at 200,000", async () => {
    const cmd = "1..10 | ForEach-Object { [Console]::Out.Write('O' * 20000); [Console]::Error.Write('E' * 20000) }";
    const res = await shell(cmd, { timeout: 30_000 });
    assert.strictEqual(typeof res, "string");
    assert.strictEqual(res.length, 200_000, `Expected total output capped at 200000, got ${res.length}`);
    assert.ok(res.includes("O"));
    assert.ok(res.includes("E"));
  });

  it("preserves multibyte UTF-8 characters across chunk and cut boundaries without corruption", async () => {
    const cmd = "[Console]::Out.Write('🚀' * 50000)";
    const res = await shell(cmd, { timeout: 30_000 });
    assert.strictEqual(typeof res, "string");
    assert.strictEqual(res.length, 100_000);
    assert.ok(res.startsWith("🚀"));
    assert.ok(!res.includes("\uFFFD"), "Output should not contain replacement characters");
  });
});

describe("Adversarial Stress Suite 2: Rapid Concurrency (20 Shell Invocations)", () => {
  it("executes 20 simultaneous shell commands without spawn failures or dropped outputs", async () => {
    const N = 20;
    const promises = Array.from({ length: N }, (_, i) =>
      shell(`Write-Output "concurrency_task_${i}_token_${i * 7}"`, { timeout: 45_000 })
    );

    const results = await Promise.all(promises);
    assert.strictEqual(results.length, N);
    for (let i = 0; i < N; i++) {
      const expectedToken = `concurrency_task_${i}_token_${i * 7}`;
      assert.ok(
        results[i].includes(expectedToken),
        `Task ${i} result missing token: ${results[i]}`
      );
    }
  });

  it("executes 20 simultaneous mixed-duration commands without race conditions or deadlocks", async () => {
    const N = 20;
    const promises = Array.from({ length: N }, (_, i) => {
      if (i % 3 === 0) {
        return shell(`Start-Sleep -Milliseconds 200; Write-Output "slept_${i}"`, { timeout: 45_000 });
      } else if (i % 3 === 1) {
        return shell(`exit ${i}`, { timeout: 45_000 });
      } else {
        return shell(`Write-Output "fast_${i}"`, { timeout: 45_000 });
      }
    });

    const results = await Promise.all(promises);
    assert.strictEqual(results.length, N);

    for (let i = 0; i < N; i++) {
      if (i % 3 === 0) {
        assert.ok(results[i].includes(`slept_${i}`), `Expected slept_${i}, got: ${results[i]}`);
      } else if (i % 3 === 1) {
        assert.ok(results[i].startsWith(`exit ${i}`), `Expected exit ${i}, got: ${results[i]}`);
      } else {
        assert.ok(results[i].includes(`fast_${i}`), `Expected fast_${i}, got: ${results[i]}`);
      }
    }
  });

  it("executes concurrent memory-and-CPU-intensive commands safely", async () => {
    const N = 10;
    const promises = Array.from({ length: N }, (_, i) =>
      shell(`$a = 1..10000; ($a | Measure-Object -Sum).Sum + ${i}`, { timeout: 45_000 })
    );

    const results = await Promise.all(promises);
    for (let i = 0; i < N; i++) {
      const expectedSum = 50005000 + i;
      assert.strictEqual(results[i].trim(), String(expectedSum));
    }
  });
});

describe("Adversarial Stress Suite 3: Quotes, Pipes, Nested Scripts, and Multiline", () => {
  it("handles complex single quotes and nested quotes inside PowerShell strings", async () => {
    const cmd = "Write-Output 'It''s a single quote test with ''double-single'' quotes'";
    const res = await shell(cmd);
    assert.ok(res.includes("It's a single quote test with 'double-single' quotes"));
  });

  it("handles double quotes with PowerShell escaping", async () => {
    const cmd = 'Write-Output "`"Double Quoted String`""';
    const res = await shell(cmd);
    assert.ok(res.includes('"Double Quoted String"'));
  });

  it("handles complex pipelines with object filtering and property expansion", async () => {
    const cmd = "1..20 | Where-Object { $_ % 3 -eq 0 } | ForEach-Object { $_ * 10 } | Out-String";
    const res = await shell(cmd);
    const numbers = res.trim().split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    assert.deepStrictEqual(numbers, ["30", "60", "90", "120", "150", "180"]);
  });

  it("handles nested scriptblocks with variable scoping", async () => {
    const cmd = "& { $x = 100; & { $y = 50; return ($x + $y) } }";
    const res = await shell(cmd);
    assert.strictEqual(res.trim(), "150");
  });

  it("handles multiline here-strings (@' ... '@)", async () => {
    const multiline = [
      "$text = @'",
      "Line One: alpha",
      "Line Two: beta & gamma",
      "Line Three: $dollars and `backticks`",
      "'@",
      "$text",
    ].join("\n");

    const res = await shell(multiline);
    assert.ok(res.includes("Line One: alpha"));
    assert.ok(res.includes("Line Two: beta & gamma"));
    assert.ok(res.includes("Line Three: $dollars and `backticks`"));
  });

  it("handles complex operators and special shell characters", async () => {
    const cmd = '$x = @{ a = 1; b = 2 }; $y = @(10, 20); ($x["a"] + $y[1]) * 3';
    const res = await shell(cmd);
    assert.strictEqual(res.trim(), "63");
  });

  it("handles Unicode, emojis, and non-ASCII inside multiline script", async () => {
    const cmd = [
      "$msg = @'",
      "Español: ¡Hola mundo! Mañana, pingüino, corazón.",
      "日本語: こんにちは世界。テスト中。",
      "Emojis: 🚀 🔥 🎉 💻 🧠",
      "'@",
      "Write-Output $msg",
    ].join("\n");

    const res = await shell(cmd);
    assert.ok(res.includes("Español: ¡Hola mundo! Mañana, pingüino, corazón."));
    assert.ok(res.includes("日本語: こんにちは世界。テスト中。"));
    assert.ok(res.includes("Emojis: 🚀 🔥 🎉 💻 🧠"));
  });

  it("handles calling native binary (node.exe) with valid PowerShell quoting", async () => {
    const cmd = "node -e \"console.log(JSON.stringify({ status: 'ok', value: 42 }))\"";
    const res = await shell(cmd);
    const parsed = JSON.parse(res.trim());
    assert.strictEqual(parsed.status, "ok");
    assert.strictEqual(parsed.value, 42);
  });

  it("returns non-zero exit code string without throwing when external command fails", async () => {
    const cmd = "node -e 'console.log(undefined_variable_throws)'";
    const res = await shell(cmd);
    assert.ok(typeof res === "string");
    assert.ok(res.startsWith("exit 1\n"), `Expected start with 'exit 1\\n', got: ${res}`);
    assert.ok(res.includes("ReferenceError"));
  });

  it("captures non-zero exit codes with stderr under complex pipelines", async () => {
    const cmd = "Write-Output 'step1'; [Console]::Error.WriteLine('pipeline failed here'); exit 5";
    const res = await shell(cmd);
    assert.ok(res.startsWith("exit 5\n"), `Expected starts with 'exit 5\\n', got: ${res}`);
    assert.ok(res.includes("step1"));
    assert.ok(res.includes("pipeline failed here"));
  });

  it("handles PowerShell syntax error (unclosed quote) without throwing exception", async () => {
    const res = await shell('Write-Output "unclosed');
    assert.ok(typeof res === "string");
    assert.ok(res.startsWith("exit 1\n"));
    assert.ok(res.includes("missing the terminator") || res.includes("ParserError"));
  });
});

describe("Adversarial Stress Suite 4: AbortSignal & Process Lifecycle", () => {
  it("cancels active execution when AbortSignal triggers mid-run", async () => {
    const ac = new AbortController();
    const start = Date.now();
    const promise = shell("Start-Sleep -Seconds 10", { signal: ac.signal });

    setTimeout(() => ac.abort(), 200);

    const res = await promise;
    const elapsed = Date.now() - start;

    assert.ok(elapsed < 2000, `Expected abort within 2s, took ${elapsed}ms`);
    assert.ok(typeof res === "string");
  });

  it("handles pre-aborted AbortSignal immediately without crashing", async () => {
    const ac = new AbortController();
    ac.abort();

    const start = Date.now();
    const res = await shell("Write-Output 'should-not-run'", { signal: ac.signal });
    const elapsed = Date.now() - start;

    assert.ok(elapsed < 1000, `Expected immediate resolution, took ${elapsed}ms`);
    assert.ok(typeof res === "string");
  });

  it("cancels multiple concurrent processes via their respective AbortSignals", async () => {
    const N = 5;
    const controllers = Array.from({ length: N }, () => new AbortController());
    const start = Date.now();

    const promises = controllers.map((ac) =>
      shell("Start-Sleep -Seconds 10", { signal: ac.signal })
    );

    setTimeout(() => {
      controllers.forEach((ac) => ac.abort());
    }, 150);

    const results = await Promise.all(promises);
    const elapsed = Date.now() - start;

    assert.ok(elapsed < 3000, `All 5 aborted in ${elapsed}ms`);
    assert.strictEqual(results.length, N);
    for (const r of results) {
      assert.ok(typeof r === "string");
    }
  });

  it("verifies timeout trigger terminates command and returns formatted timeout message", async () => {
    const start = Date.now();
    const res = await shell("Start-Sleep -Seconds 5", { timeout: 400 });
    const elapsed = Date.now() - start;

    assert.ok(elapsed < 2500, `Timeout took ${elapsed}ms`);
    assert.ok(res.includes("[timed out after 0.4s]"), `Expected timeout indicator, got: ${res}`);
  });

  it("resolves error string when invalid cwd is provided without throwing", async () => {
    const res = await shell("echo 1", { cwd: "C:\\NonExistentDirectory_99999_xyz" });
    assert.ok(typeof res === "string");
    assert.ok(res.startsWith("error: spawn") || res.includes("ENOENT"));
  });
});

describe("Adversarial Stress Suite 5: DATA and DIRS Edge Cases & FS Integrity", () => {
  it("normalizes LIQUID_AGENT_HOME with spaces, slashes, and relative components", () => {
    const raw = "  temp_sandbox\\relative\\..\\folder with spaces\\sub  ";
    const res = resolveDataDir({ LIQUID_AGENT_HOME: raw }, "win32");
    assert.ok(path.isAbsolute(res), "Resolved path should be absolute");
    assert.ok(res.includes("folder with spaces"), "Spaces should be preserved");
    assert.ok(!res.includes(".."), "Relative parts should be resolved");
  });

  it("handles non-ASCII Unicode directory in LIQUID_AGENT_HOME", () => {
    const custom = "C:\\Users\\María_José\\AppData\\Local\\LiquidAgent_日本語_🚀";
    const res = resolveDataDir({ LIQUID_AGENT_HOME: custom }, "win32");
    assert.strictEqual(res, custom);
  });

  it("ignores empty string in LIQUID_AGENT_HOME and falls back to LOCALAPPDATA", () => {
    const res = resolveDataDir({ LIQUID_AGENT_HOME: "", LOCALAPPDATA: "C:\\LocalApp" }, "win32");
    assert.strictEqual(res, "C:\\LocalApp\\LiquidAgent");
  });

  it("verifies all 8 DIRS subdirectories support complete CRUD filesystem operations", () => {
    const keys = ["models", "engine", "tools", "logs", "uploads", "guardian", "bridge", "hf"];
    for (const key of keys) {
      const dir = DIRS[key];
      assert.ok(fs.existsSync(dir), `Directory ${key} exists`);

      // 1. Create file
      const testFile = path.join(dir, `crud_test_${Date.now()}_${Math.random().toString(36).slice(2)}.txt`);
      fs.writeFileSync(testFile, "initial_data", "utf8");
      assert.strictEqual(fs.readFileSync(testFile, "utf8"), "initial_data");

      // 2. Append data
      fs.appendFileSync(testFile, "_appended_unicode_¡ñ🚀", "utf8");
      assert.strictEqual(fs.readFileSync(testFile, "utf8"), "initial_data_appended_unicode_¡ñ🚀");

      // 3. Rename file
      const renamedFile = testFile + ".renamed";
      fs.renameSync(testFile, renamedFile);
      assert.ok(!fs.existsSync(testFile));
      assert.ok(fs.existsSync(renamedFile));

      // 4. Delete file
      fs.unlinkSync(renamedFile);
      assert.ok(!fs.existsSync(renamedFile));
    }
  });

  it("supports concurrent file writes across DIRS.uploads and DIRS.logs without locking errors", async () => {
    const writeCount = 50;
    const writePromises = [];

    for (let i = 0; i < writeCount; i++) {
      const targetDir = i % 2 === 0 ? DIRS.uploads : DIRS.logs;
      const filePath = path.join(targetDir, `concurrent_${i}_${Date.now()}.json`);
      const payload = JSON.stringify({ index: i, timestamp: Date.now(), data: "X".repeat(1000) });

      writePromises.push(
        fs.promises.writeFile(filePath, payload, "utf8").then(async () => {
          const readBack = await fs.promises.readFile(filePath, "utf8");
          assert.strictEqual(readBack, payload);
          await fs.promises.unlink(filePath);
        })
      );
    }

    await Promise.all(writePromises);
  });
});
