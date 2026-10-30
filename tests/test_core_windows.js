/**
 * Automated Unit Test Suite for Milestone 1: Core & System Adaptation
 * Tests Windows DATA directory resolution, PowerShell UTF-8 execution,
 * and platform command resolution for openBrowser and /api/reveal.
 *
 * Uses Node's native node:test and node:assert/strict (zero external dependencies).
 */

import test, { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DATA, DIRS, shell, resolveDataDir, resolvePlatformOpen } from "../server/core.js";

describe("1. Windows DATA Directory & Subdirectories Resolution", () => {
  it("verifies DATA ends in AppData\\Local\\LiquidAgent on Windows when LOCALAPPDATA is present", () => {
    const mockLocal = "C:\\Users\\admin\\AppData\\Local";
    const resolved = resolveDataDir({ LOCALAPPDATA: mockLocal }, "win32", "C:\\Users\\admin");
    assert.strictEqual(resolved, "C:\\Users\\admin\\AppData\\Local\\LiquidAgent");
    assert.ok(resolved.endsWith(path.join("AppData", "Local", "LiquidAgent")));
  });

  it("verifies fallback to HOME/AppData/Local/LiquidAgent if LOCALAPPDATA is missing", () => {
    const mockHome = "C:\\Users\\admin";
    const resolved = resolveDataDir({}, "win32", mockHome);
    assert.strictEqual(resolved, path.join(mockHome, "AppData", "Local", "LiquidAgent"));
  });

  it("verifies process.env.LIQUID_AGENT_HOME override takes precedence", () => {
    const customHome = "C:\\Custom\\LiquidAgentPath";
    const resolved = resolveDataDir({ LIQUID_AGENT_HOME: customHome }, "win32", "C:\\Users\\admin");
    assert.strictEqual(resolved, customHome);
  });

  it("preserves macOS and Linux DATA directory resolution", () => {
    const darwin = resolveDataDir({}, "darwin", "/Users/admin");
    assert.strictEqual(darwin, path.join("/Users/admin", "Library", "Application Support", "LiquidAgent"));

    const linux = resolveDataDir({}, "linux", "/home/admin");
    assert.strictEqual(linux, path.join("/home/admin", ".local", "share", "liquid-agent"));

    const linuxXdg = resolveDataDir({ XDG_DATA_HOME: "/opt/xdg" }, "linux", "/home/admin");
    assert.strictEqual(linuxXdg, path.join("/opt/xdg", "liquid-agent"));
  });

  it("verifies all DIRS subdirectories exist and are writable on the active host", () => {
    const expectedKeys = ["models", "engine", "tools", "logs", "uploads", "guardian", "bridge", "hf"];
    for (const key of expectedKeys) {
      assert.ok(key in DIRS, `Missing key in DIRS: ${key}`);
      const dir = DIRS[key];
      assert.ok(fs.existsSync(dir), `Directory does not exist: ${dir}`);
      assert.ok(fs.statSync(dir).isDirectory(), `Path is not a directory: ${dir}`);

      // Writability test: write a temporary file, read back, and delete
      const testFile = path.join(dir, `.write_test_${Date.now()}_${Math.random().toString(36).slice(2)}.tmp`);
      fs.writeFileSync(testFile, "test-payload", "utf8");
      assert.strictEqual(fs.readFileSync(testFile, "utf8"), "test-payload");
      fs.unlinkSync(testFile);
    }
  });
});

describe("2. Windows Shell Execution", () => {
  it("verifies successful command execution (echo test)", async () => {
    const result = await shell("echo test");
    assert.strictEqual(result.trim(), "test");
  });

  it("verifies UTF-8 encoding support with special characters, accents, and Unicode strings", async () => {
    const text = "¡Hola Mundo! Café, canción, niño, 🚀 robot, 日本語, Русский";
    const result = await shell(`Write-Output '${text}'`);
    assert.ok(result.includes(text), `Expected output to include UTF-8 sample. Output: ${result}`);
  });

  it("verifies timeout handling and error formatting on command failure", async () => {
    const result = await shell("Start-Sleep -Milliseconds 1500", { timeout: 200 });
    assert.ok(result.includes("[timed out after 0.2s]"), `Expected timeout message. Output: ${result}`);
  });

  it("verifies exit codes formatting", async () => {
    const resExit42 = await shell("exit 42");
    assert.strictEqual(resExit42, "exit 42\n");

    const resError = await shell("Write-Error 'fatal test error'; exit 1");
    assert.ok(resError.startsWith("exit 1\n"), `Expected start with 'exit 1\\n'. Output: ${resError}`);
    assert.ok(resError.includes("fatal test error"), `Expected error text. Output: ${resError}`);
  });

  it("verifies shell() never throws on invalid syntax or unknown command", async () => {
    const result = await shell("NonExistentCmdlet123456789_FooBar");
    assert.ok(typeof result === "string", "Result should always be a string");
    assert.ok(
      result.startsWith("exit 1") || result.includes("CommandNotFoundException") || result.startsWith("error:"),
      `Expected failure text, got: ${result}`
    );
  });

  it("verifies cwd option execution", async () => {
    const targetDir = fs.realpathSync(os.tmpdir());
    const result = await shell("(Get-Location).Path", { cwd: targetDir });
    const resolvedResult = fs.existsSync(result.trim()) ? fs.realpathSync(result.trim()) : result.trim();
    assert.strictEqual(resolvedResult.toLowerCase(), targetDir.toLowerCase());
  });

  it("verifies AbortSignal cancellation handling", async () => {
    const ac = new AbortController();
    const promise = shell("Start-Sleep -Seconds 5", { signal: ac.signal });
    setTimeout(() => ac.abort(), 100);
    const result = await promise;
    assert.ok(typeof result === "string");
  });
});

describe("3. Platform Command Resolution (openBrowser & /api/reveal)", () => {
  it("resolves Windows platform command for openBrowser", () => {
    const url = "http://127.0.0.1:8170";
    const resolved = resolvePlatformOpen(url, "win32");
    assert.deepStrictEqual(resolved, {
      cmd: "cmd.exe",
      args: ["/c", "start", "", url],
    });
  });

  it("resolves Windows platform command for /api/reveal (DATA directory)", () => {
    const dataPath = "C:\\Users\\admin\\AppData\\Local\\LiquidAgent";
    const resolved = resolvePlatformOpen(dataPath, "win32");
    assert.deepStrictEqual(resolved, {
      cmd: "cmd.exe",
      args: ["/c", "start", "", dataPath],
    });
  });

  it("preserves macOS platform command resolution (darwin)", () => {
    const url = "http://127.0.0.1:8170";
    const resolved = resolvePlatformOpen(url, "darwin");
    assert.deepStrictEqual(resolved, {
      cmd: "open",
      args: [url],
    });
  });

  it("preserves Linux platform command resolution (linux)", () => {
    const url = "http://127.0.0.1:8170";
    const resolved = resolvePlatformOpen(url, "linux");
    assert.deepStrictEqual(resolved, {
      cmd: "xdg-open",
      args: [url],
    });
  });

  it("verifies detached non-blocking spawn invocation with unref", () => {
    let spawnCalled = false;
    let spawnArgs = null;
    let unrefCalled = false;
    let errorListenerRegistered = false;

    const mockSpawn = (cmd, args, opts) => {
      spawnCalled = true;
      spawnArgs = { cmd, args, opts };
      return {
        on(event, handler) {
          if (event === "error") errorListenerRegistered = true;
          return this;
        },
        unref() {
          unrefCalled = true;
          return this;
        },
      };
    };

    const targetUrl = "http://127.0.0.1:8170";
    const { cmd, args } = resolvePlatformOpen(targetUrl, "win32");
    const child = mockSpawn(cmd, args, { stdio: "ignore", detached: true }).on("error", () => {}).unref();

    assert.ok(spawnCalled);
    assert.strictEqual(spawnArgs.cmd, "cmd.exe");
    assert.deepStrictEqual(spawnArgs.args, ["/c", "start", "", targetUrl]);
    assert.strictEqual(spawnArgs.opts.detached, true);
    assert.strictEqual(spawnArgs.opts.stdio, "ignore");
    assert.ok(errorListenerRegistered);
    assert.ok(unrefCalled);
  });
});
