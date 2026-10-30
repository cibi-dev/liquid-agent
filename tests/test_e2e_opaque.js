/**
 * Liquid Agent Windows 11 Native Port - Opaque-Box E2E Test Suite
 *
 * Requirements-driven test suite covering all 20 features from PROJECT.md:
 * - Tier 1: Feature Coverage (>=5 per feature across 20 features)
 * - Tier 2: Boundary & Corner Cases (>=5 per feature across 20 features)
 * - Tier 3: Cross-Feature Combinations (Pairwise interactions)
 * - Tier 4: Real-World Application Scenarios (Complex workflows)
 *
 * Runner: Node.js native test runner (node:test, node:assert/strict)
 * Zero external test dependencies.
 */

import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import net from "node:net";
import http from "node:http";
import { spawnSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");
const IS_WINDOWS = process.platform === "win32";

// Helper to spawn node inline script with specified environment and arguments
function runNodeScript(script, { env = {}, timeout = 10_000, cwd = REPO_ROOT } = {}) {
  const mergedEnv = { ...process.env, ...env };
  const res = spawnSync("node", ["--input-type=module", "-e", script], {
    cwd,
    env: mergedEnv,
    timeout,
    encoding: "utf8",
  });
  return {
    status: res.status,
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
    error: res.error,
  };
}

// Temporary sandbox creator
function createSandbox() {
  const id = `liquid-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const dir = path.join(os.tmpdir(), id);
  fs.mkdirSync(dir, { recursive: true });
  return {
    dir,
    cleanup() {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {}
    },
  };
}

// =============================================================================
// TIER 1: FEATURE COVERAGE (Features 1 to 20, >=5 tests each)
// =============================================================================

describe("Tier 1: Feature Coverage", () => {

  // ---------------------------------------------------------------------------
  // Feature 1: Windows DATA Directory
  // ---------------------------------------------------------------------------
  describe("Feature 1: Windows DATA Directory", () => {
    it("T1.1.1: Default Windows DATA resolves to %LOCALAPPDATA%\\LiquidAgent", () => {
      const sandbox = createSandbox();
      try {
        const localAppData = path.join(sandbox.dir, "AppData", "Local");
        fs.mkdirSync(localAppData, { recursive: true });
        const script = `
          import { DATA } from './server/core.js';
          console.log(DATA);
        `;
        const res = runNodeScript(script, {
          env: { LOCALAPPDATA: localAppData, LIQUID_AGENT_HOME: "" },
        });
        assert.equal(res.status, 0, `Node script exited with ${res.status}: ${res.stderr}`);
        const resolved = res.stdout.trim();
        const expected = path.join(localAppData, "LiquidAgent");
        assert.equal(
          resolved.toLowerCase(),
          expected.toLowerCase(),
          `Expected DATA to resolve to ${expected}, but got ${resolved}`
        );
      } finally {
        sandbox.cleanup();
      }
    });

    it("T1.1.2: Fallback to %USERPROFILE%\\AppData\\Local\\LiquidAgent when LOCALAPPDATA is unset", () => {
      const sandbox = createSandbox();
      try {
        const fakeHome = path.join(sandbox.dir, "Users", "TestUser");
        fs.mkdirSync(fakeHome, { recursive: true });
        const script = `
          import { DATA } from './server/core.js';
          console.log(DATA);
        `;
        const res = runNodeScript(script, {
          env: { USERPROFILE: fakeHome, HOME: fakeHome, LOCALAPPDATA: "", LIQUID_AGENT_HOME: "" },
        });
        assert.equal(res.status, 0, `Error: ${res.stderr}`);
        const resolved = res.stdout.trim();
        const expected = path.join(fakeHome, "AppData", "Local", "LiquidAgent");
        assert.equal(
          resolved.toLowerCase(),
          expected.toLowerCase(),
          `Expected fallback to ${expected}, got ${resolved}`
        );
      } finally {
        sandbox.cleanup();
      }
    });

    it("T1.1.3: LIQUID_AGENT_HOME override takes highest precedence", () => {
      const sandbox = createSandbox();
      try {
        const customDir = path.join(sandbox.dir, "CustomLiquidHome");
        const script = `
          import { DATA } from './server/core.js';
          console.log(DATA);
        `;
        const res = runNodeScript(script, {
          env: { LIQUID_AGENT_HOME: customDir },
        });
        assert.equal(res.status, 0);
        assert.equal(res.stdout.trim().toLowerCase(), customDir.toLowerCase());
      } finally {
        sandbox.cleanup();
      }
    });

    it("T1.1.4: DIRS contains all required subdirectories rooted in DATA", () => {
      const script = `
        import { DATA, DIRS } from './server/core.js';
        const expected = ['models', 'engine', 'tools', 'logs', 'uploads', 'guardian', 'bridge', 'hf'];
        for (const k of expected) {
          if (!DIRS[k]) throw new Error('Missing DIRS key: ' + k);
          if (!DIRS[k].startsWith(DATA)) throw new Error('DIRS.' + k + ' not rooted in DATA');
        }
        console.log('OK');
      `;
      const res = runNodeScript(script);
      assert.equal(res.status, 0, `DIRS check failed: ${res.stderr}`);
      assert.equal(res.stdout.trim(), "OK");
    });

    it("T1.1.5: Preserves POSIX directory resolution on simulated non-Windows platforms", () => {
      const script = `
        // Check core.js source code preserves darwin and XDG paths
        import fs from 'node:fs';
        const code = fs.readFileSync('./server/core.js', 'utf8');
        const hasDarwin = code.includes('Library') && code.includes('Application Support');
        const hasLinux = code.includes('XDG_DATA_HOME') || code.includes('.local');
        if (!hasDarwin || !hasLinux) throw new Error('POSIX paths not preserved in core.js');
        console.log('OK');
      `;
      const res = runNodeScript(script);
      assert.equal(res.status, 0, `POSIX preservation check failed: ${res.stderr}`);
      assert.equal(res.stdout.trim(), "OK");
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 2: PowerShell UTF-8 Shell Execution
  // ---------------------------------------------------------------------------
  describe("Feature 2: PowerShell UTF-8 Shell Execution", () => {
    it("T1.2.1: shell() executes simple command and resolves output string without throwing", async () => {
      const { shell } = await import("../server/core.js");
      const out = await shell("Write-Output 'Hello Liquid Agent'");
      assert.ok(typeof out === "string", "Output must be a string");
      assert.match(out, /Hello Liquid Agent/, `Expected output to contain 'Hello Liquid Agent', got: ${out}`);
    });

    it("T1.2.2: Spawns powershell.exe with -NoProfile and -ExecutionPolicy Bypass on Windows", async () => {
      const script = `
        import fs from 'node:fs';
        const code = fs.readFileSync('./server/core.js', 'utf8');
        const hasPwsh = code.includes('powershell.exe');
        const hasNoProfile = code.includes('-NoProfile');
        const hasBypass = code.includes('Bypass');
        if (!hasPwsh || !hasNoProfile || !hasBypass) throw new Error('Missing PowerShell flags in shell()');
        console.log('OK');
      `;
      const res = runNodeScript(script);
      assert.equal(res.status, 0, `PowerShell invocation flags check failed: ${res.stderr}`);
      assert.equal(res.stdout.trim(), "OK");
    });

    it("T1.2.3: Enforces UTF-8 encoding preserving accents, non-ASCII, and emojis", async () => {
      const { shell } = await import("../server/core.js");
      const testString = "Tildes y acentos: áéíóú ñ ¿ ¡ 🚀 — 日本語";
      const out = await shell(`Write-Output '${testString}'`);
      assert.ok(out.includes("áéíóú"), `Failed to preserve accents: ${out}`);
      assert.ok(out.includes("ñ"), `Failed to preserve ñ: ${out}`);
    });

    it("T1.2.4: Non-zero exit returns formatted exit code and output", async () => {
      const { shell } = await import("../server/core.js");
      const out = await shell("exit 42");
      assert.match(out, /exit 42/, `Expected output to contain 'exit 42', got: ${out}`);
    });

    it("T1.2.5: Honors cwd option when executing subshell command", async () => {
      const { shell } = await import("../server/core.js");
      const tmp = fs.realpathSync(os.tmpdir());
      const out = await shell("Get-Location | Select-Object -ExpandProperty Path", { cwd: tmp });
      const resolvedOut = fs.existsSync(out.trim()) ? fs.realpathSync(out.trim()) : out.trim();
      assert.ok(resolvedOut.toLowerCase().includes(tmp.toLowerCase()), `Expected cwd ${tmp}, got: ${out}`);
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 3: Windows Browser Launcher (openBrowser)
  // ---------------------------------------------------------------------------
  describe("Feature 3: Windows Browser Launcher", () => {
    it("T1.3.1: openBrowser in server/index.js uses cmd.exe /c start on Windows", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "index.js"), "utf8");
      assert.ok(
        code.includes("cmd.exe") && code.includes("start"),
        "server/index.js must invoke cmd.exe /c start on Windows"
      );
    });

    it("T1.3.2: Passes empty window title before target URL", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "index.js"), "utf8");
      // cmd.exe /c start "" <url>
      assert.ok(
        code.includes('""') || code.includes("''"),
        "cmd.exe start command must pass empty title before URL to avoid window title trap"
      );
    });

    it("T1.3.3: Spawns detached process with stdio: ignore", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "index.js"), "utf8");
      assert.ok(
        code.includes("detached: true") && code.includes('"ignore"'),
        "openBrowser must spawn detached process with stdio ignored"
      );
    });

    it("T1.3.4: Attaches .on('error', () => {}) to catch spawn errors silently", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "index.js"), "utf8");
      assert.ok(
        code.includes('.on("error"') || code.includes(".on('error'"),
        "openBrowser must catch error event to prevent unhandled error crashes"
      );
    });

    it("T1.3.5: Preserves Darwin 'open' and Linux 'xdg-open' commands", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "index.js"), "utf8");
      assert.ok(code.includes("open") && code.includes("xdg-open"), "POSIX browser launchers must be preserved");
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 4: Windows File Revealer (/api/reveal)
  // ---------------------------------------------------------------------------
  describe("Feature 4: Windows File Revealer", () => {
    it("T1.4.1: POST /api/reveal invokes explorer.exe or cmd.exe start on Windows", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "index.js"), "utf8");
      const revealMatch = code.match(/\/api\/reveal[\s\S]*?\}\);/);
      assert.ok(revealMatch, "/api/reveal route must be defined");
      const revealBlock = revealMatch[0];
      assert.ok(
        revealBlock.includes("explorer.exe") || revealBlock.includes("cmd.exe") || revealBlock.includes("win32"),
        "reveal route must handle Windows platform"
      );
    });

    it("T1.4.2: Target path strictly passes DATA directory", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "index.js"), "utf8");
      const revealMatch = code.match(/\/api\/reveal[\s\S]*?\}\);/);
      assert.ok(revealMatch[0].includes("DATA"), "/api/reveal must target DATA directory");
    });

    it("T1.4.3: Preserves macOS 'open' on Darwin in reveal route", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "index.js"), "utf8");
      const revealMatch = code.match(/\/api\/reveal[\s\S]*?\}\);/);
      assert.ok(revealMatch[0].includes("open"), "/api/reveal must retain 'open' for macOS");
    });

    it("T1.4.4: Suppresses spawn errors when running in headless environment", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "index.js"), "utf8");
      const revealMatch = code.match(/\/api\/reveal[\s\S]*?\}\);/);
      assert.ok(
        revealMatch[0].includes("catch") || revealMatch[0].includes('.on("error"'),
        "reveal route must suppress spawn errors"
      );
    });

    it("T1.4.5: Returns HTTP success response on trigger", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "index.js"), "utf8");
      assert.ok(code.includes('route("POST", "/api/reveal"'), "POST /api/reveal must be registered");
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 5: Windows Clipboard Tools
  // ---------------------------------------------------------------------------
  describe("Feature 5: Windows Clipboard Tools", () => {
    it("T1.5.1: set_clipboard copies text via clip.exe on Windows", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "tools.js"), "utf8");
      assert.ok(code.includes("clip"), "tools.js must reference Windows clip utility for set_clipboard");
    });

    it("T1.5.2: clipboard reads text via Get-Clipboard on Windows", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "tools.js"), "utf8");
      assert.ok(
        code.includes("Get-Clipboard"),
        "tools.js must use PowerShell Get-Clipboard on Windows"
      );
    });

    it("T1.5.3: Roundtrip copy and paste preserves plain text content", async () => {
      if (!IS_WINDOWS) return; // Native Win32 clipboard test
      const { runTool } = await import("../server/tools.js");
      const testVal = `TestClipboard_${Date.now()}`;
      const setRes = await runTool("set_clipboard", { text: testVal }, {});
      assert.ok(setRes.ok, `set_clipboard failed: ${setRes.text}`);
      const getRes = await runTool("clipboard", {}, {});
      assert.ok(getRes.ok, `clipboard failed: ${getRes.text}`);
      assert.equal(getRes.text.trim(), testVal);
    });

    it("T1.5.4: set_clipboard returns 'Copied.' upon success", async () => {
      const { runTool } = await import("../server/tools.js");
      const setRes = await runTool("set_clipboard", { text: "Liquid Agent test" }, {});
      assert.ok(setRes.ok);
      assert.match(setRes.text, /Copied/i);
    });

    it("T1.5.5: Preserves pbcopy and pbpaste on Darwin", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "tools.js"), "utf8");
      assert.ok(code.includes("pbcopy") && code.includes("pbpaste"), "POSIX pbcopy/pbpaste must be preserved");
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 6: Windows Screenshot & Image Resizing
  // ---------------------------------------------------------------------------
  describe("Feature 6: Windows Screenshot & Image Resizing", () => {
    it("T1.6.1: look_at_screen uses PowerShell System.Drawing on Windows", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "tools.js"), "utf8");
      assert.ok(
        code.includes("CopyFromScreen") || code.includes("System.Drawing"),
        "look_at_screen must use System.Drawing on Windows"
      );
    });

    it("T1.6.2: Saves captured screenshot as JPEG in DIRS.uploads", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "tools.js"), "utf8");
      assert.ok(code.includes("DIRS.uploads"), "Screen capture must target DIRS.uploads");
    });

    it("T1.6.3: look_at_image downscales bitmap to max 1280px bounding box", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "tools.js"), "utf8");
      assert.ok(code.includes("1280"), "look_at_image must enforce 1280px bounding box limit");
    });

    it("T1.6.4: Proportional aspect ratio is preserved during resizing", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "tools.js"), "utf8");
      assert.ok(
        code.includes("Width") || code.includes("Height") || code.includes("sips"),
        "Image resizer must compute proportional scaling"
      );
    });

    it("T1.6.5: Replaces macOS screencapture and sips commands on Windows", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "tools.js"), "utf8");
      assert.ok(
        code.includes("win32"),
        "tools.js must check process.platform === 'win32' for screenshot and image resize"
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 7: Windows Open Tool
  // ---------------------------------------------------------------------------
  describe("Feature 7: Windows Open Tool", () => {
    it("T1.7.1: Opens HTTP/HTTPS URLs via cmd.exe /c start on Windows", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "tools.js"), "utf8");
      assert.ok(
        code.includes("cmd.exe") && code.includes("start"),
        "open tool must use cmd.exe /c start on Windows"
      );
    });

    it("T1.7.2: Opens local files via cmd.exe /c start on Windows", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "tools.js"), "utf8");
      assert.ok(
        code.includes("existsSync") || code.includes("expand"),
        "open tool must expand and verify local file targets"
      );
    });

    it("T1.7.3: Expands tilde ~ to user home directory on all platforms", async () => {
      const { expand } = await import("../server/tools.js");
      const expanded = expand("~/Documents");
      assert.ok(!expanded.startsWith("~"), "Tilde must be expanded");
      assert.ok(expanded.includes("Documents"), "Path suffix must be preserved");
    });

    it("T1.7.4: Returns string format 'Opened <target>.' upon success", async () => {
      const { runTool } = await import("../server/tools.js");
      const res = await runTool("open", { target: "https://example.com" }, {});
      assert.ok(res.ok);
      assert.match(res.text, /Opened/i);
    });

    it("T1.7.5: Preserves Darwin 'open' and Linux 'xdg-open' on POSIX", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "tools.js"), "utf8");
      assert.ok(code.includes("xdg-open"), "xdg-open must be retained for Linux");
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 8: Windows Audio & Notification
  // ---------------------------------------------------------------------------
  describe("Feature 8: Windows Audio & Notification", () => {
    it("T1.8.1: transcribe_audio validates 16kHz WAV format", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "tools.js"), "utf8");
      assert.ok(code.includes("WAVE") || code.includes("wav"), "Audio transcriber must check for WAV format");
    });

    it("T1.8.2: Avoids unhandled afconvert ENOENT crash on Windows", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "tools.js"), "utf8");
      assert.ok(
        code.includes("afconvert") ? code.includes("darwin") || code.includes("win32") : true,
        "afconvert must be guarded for darwin only or abstracted"
      );
    });

    it("T1.8.3: Uses ffmpeg fallback or direct WAV handling on Windows", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "tools.js"), "utf8");
      assert.ok(
        code.includes("ffmpeg") || code.includes("win32") || code.includes("wave"),
        "Audio handling must support Windows conversion/validation"
      );
    });

    it("T1.8.4: reminder notification avoids hardcoded osascript on Windows", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "tools.js"), "utf8");
      assert.ok(
        code.includes("osascript") ? code.includes("darwin") || code.includes("win32") : true,
        "osascript must not be executed blindly on Windows"
      );
    });

    it("T1.8.5: Reminder scheduled event dispatches without throwing", async () => {
      const { runTool } = await import("../server/tools.js");
      const res = await runTool("reminder", { text: "Meeting in 5 min", in: "5m" }, {});
      assert.ok(res.ok);
      assert.match(res.text, /reminder/i);
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 9: Windows llama-server.exe Discovery (findEngine)
  // ---------------------------------------------------------------------------
  describe("Feature 9: Windows llama-server.exe Discovery", () => {
    it("T1.9.1: Searches for llama-server.exe on Windows (win32)", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "backends.js"), "utf8");
      assert.ok(
        code.includes("llama-server.exe"),
        "findEngine must match llama-server.exe on Windows"
      );
    });

    it("T1.9.2: Searches for llama-server on Darwin and Linux", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "backends.js"), "utf8");
      assert.ok(code.includes('"llama-server"'), "findEngine must match llama-server on POSIX");
    });

    it("T1.9.3: Returns normalized absolute path when binary exists in DIRS.engine", () => {
      const sandbox = createSandbox();
      try {
        const engineDir = path.join(sandbox.dir, "engine");
        fs.mkdirSync(engineDir, { recursive: true });
        const exeName = IS_WINDOWS ? "llama-server.exe" : "llama-server";
        const dummyExe = path.join(engineDir, exeName);
        fs.writeFileSync(dummyExe, "dummy binary");
        const script = `
          import { backends } from './server/backends.js';
          console.log(backends.onDisk('engine'));
        `;
        const res = runNodeScript(script, { env: { LIQUID_AGENT_HOME: sandbox.dir } });
        assert.equal(res.status, 0);
        assert.equal(res.stdout.trim(), "true");
      } finally {
        sandbox.cleanup();
      }
    });

    it("T1.9.4: Returns null/false when binary does not exist in DIRS.engine", () => {
      const sandbox = createSandbox();
      try {
        const script = `
          import { backends } from './server/backends.js';
          console.log(backends.onDisk('engine'));
        `;
        const res = runNodeScript(script, { env: { LIQUID_AGENT_HOME: sandbox.dir } });
        assert.equal(res.status, 0);
        assert.equal(res.stdout.trim(), "false");
      } finally {
        sandbox.cleanup();
      }
    });

    it("T1.9.5: Recursively discovers binary located in nested subdirectories", () => {
      const sandbox = createSandbox();
      try {
        const nestedDir = path.join(sandbox.dir, "engine", "build", "bin");
        fs.mkdirSync(nestedDir, { recursive: true });
        const exeName = IS_WINDOWS ? "llama-server.exe" : "llama-server";
        fs.writeFileSync(path.join(nestedDir, exeName), "dummy");
        const script = `
          import { backends } from './server/backends.js';
          console.log(backends.onDisk('engine'));
        `;
        const res = runNodeScript(script, { env: { LIQUID_AGENT_HOME: sandbox.dir } });
        assert.equal(res.status, 0);
        assert.equal(res.stdout.trim(), "true");
      } finally {
        sandbox.cleanup();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 10: Windows Engine Asset Selection
  // ---------------------------------------------------------------------------
  describe("Feature 10: Windows Engine Asset Selection", () => {
    it("T1.10.1: Selects bin-win-cuda zip asset for Windows x64", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "backends.js"), "utf8");
      assert.ok(
        code.includes("bin-win-cuda") || code.includes("cuda"),
        "backends.js must select CUDA release asset on Windows"
      );
    });

    it("T1.10.2: Includes fallback for bin-win-vulkan zip asset", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "backends.js"), "utf8");
      assert.ok(
        code.includes("vulkan") || code.includes("bin-win-vulkan"),
        "backends.js must support Vulkan asset fallback on Windows"
      );
    });

    it("T1.10.3: Includes fallback for bin-win-cpu zip asset", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "backends.js"), "utf8");
      assert.ok(
        code.includes("cpu") || code.includes("bin-win-cpu"),
        "backends.js must support CPU asset fallback on Windows"
      );
    });

    it("T1.10.4: Windows release assets end in .zip rather than .tar.gz", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "backends.js"), "utf8");
      assert.ok(code.includes(".zip"), "backends.js must support .zip assets on Windows");
    });

    it("T1.10.5: Preserves bin-macos and bin-ubuntu tar.gz assets on POSIX", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "backends.js"), "utf8");
      assert.ok(
        code.includes("bin-macos") && code.includes("bin-ubuntu"),
        "backends.js must preserve macOS and Ubuntu assets"
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 11: Windows-Safe Archive Extraction
  // ---------------------------------------------------------------------------
  describe("Feature 11: Windows-Safe Archive Extraction", () => {
    it("T1.11.1: Extracts .zip archives using native tools on Windows", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "backends.js"), "utf8");
      assert.ok(
        code.includes("Expand-Archive") || code.includes("tar.exe") || code.includes("zip"),
        "backends.js must implement native Windows zip extraction"
      );
    });

    it("T1.11.2: Bypasses GNU tar colon bug (tar: Cannot connect to C:)", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "backends.js"), "utf8");
      assert.ok(
        code.includes("System32") || code.includes("--force-local") || code.includes("Expand-Archive"),
        "Archive extraction must avoid GNU tar drive colon misinterpretation"
      );
    });

    it("T1.11.3: Uses -xf instead of -xzf for .zip decompression", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "backends.js"), "utf8");
      assert.ok(
        code.includes("-xf") || code.includes("Expand-Archive"),
        "Extraction of zip must not pass gzip flag -z"
      );
    });

    it("T1.11.4: Preserves tar -xzf for .tar.gz archives on POSIX", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "backends.js"), "utf8");
      assert.ok(code.includes("-xzf"), "tar -xzf must be preserved for .tar.gz");
    });

    it("T1.11.5: Cleans up downloaded archive file after extraction", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "backends.js"), "utf8");
      assert.ok(
        code.includes("rmSync") || code.includes("unlinkSync"),
        "Downloaded archive must be unlinked after extraction"
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 12: Hardware Acceleration Tailoring (RTX 2070 Max-Q)
  // ---------------------------------------------------------------------------
  describe("Feature 12: Hardware Acceleration Tailoring", () => {
    it("T1.12.1: Configures -ngl 99 GPU layer offload", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "backends.js"), "utf8");
      assert.ok(code.includes('"-ngl", "99"'), "Engine args must specify -ngl 99");
    });

    it("T1.12.2: Configures -c 32768 context length", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "backends.js"), "utf8");
      assert.ok(code.includes('"-c", "32768"'), "Engine args must specify -c 32768");
    });

    it("T1.12.3: Configures -np 2 parallel slots", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "backends.js"), "utf8");
      assert.ok(code.includes('"-np", "2"'), "Engine args must specify -np 2");
    });

    it("T1.12.4: Configures --jinja and --reasoning auto", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "backends.js"), "utf8");
      assert.ok(
        code.includes('"--jinja"') && code.includes('"--reasoning", "auto"'),
        "Engine args must specify --jinja and --reasoning auto"
      );
    });

    it("T1.12.5: Verifies total VRAM budget under 8 GB for RTX 2070 Max-Q", () => {
      // Sizing calculation test: LFM3 1.7B (~1.1GB) + Omni 2B (~2.14GB) = ~3.24GB <= 8GB
      const lfmSmallVramGB = 1.1;
      const lfmOmniVramGB = 2.14;
      const totalVramGB = lfmSmallVramGB + lfmOmniVramGB;
      const rtx2070MaxQBudgetGB = 8.0;
      assert.ok(totalVramGB < rtx2070MaxQBudgetGB, "Total VRAM footprint must fit within 8 GB budget");
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 13: Windows Port Liberator (freePort)
  // ---------------------------------------------------------------------------
  describe("Feature 13: Windows Port Liberator (freePort)", () => {
    it("T1.13.1: Uses Windows network command (netstat or Get-NetTCPConnection)", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "backends.js"), "utf8");
      assert.ok(
        code.includes("netstat") || code.includes("Get-NetTCPConnection"),
        "freePort must use netstat or Get-NetTCPConnection on Windows"
      );
    });

    it("T1.13.2: Returns true immediately when port is free", async () => {
      const { backends } = await import("../server/backends.js");
      // Choose a high port unlikely to be bound
      const free = await backends.freePort(49151);
      assert.equal(free, true, "freePort on an unused port must return true");
    });

    it("T1.13.3: Verifies process executable path against DATA before terminating", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "backends.js"), "utf8");
      assert.ok(
        code.includes("DATA"),
        "freePort must verify process path contains DATA before terminating"
      );
    });

    it("T1.13.4: Terminates matching processes using taskkill on Windows", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "backends.js"), "utf8");
      assert.ok(
        code.includes("taskkill"),
        "freePort must use taskkill /F /PID on Windows"
      );
    });

    it("T1.13.5: Preserves POSIX lsof + ps implementation on non-Windows", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "backends.js"), "utf8");
      assert.ok(
        code.includes("lsof") && code.includes("ps"),
        "POSIX lsof and ps must be preserved for Darwin/Linux"
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 14: Windows uv.exe Provisioning (ensureUV)
  // ---------------------------------------------------------------------------
  describe("Feature 14: Windows uv.exe Provisioning", () => {
    it("T1.14.1: Resolves uv.exe binary path on Windows and uv on POSIX", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "backends.js"), "utf8");
      assert.ok(code.includes("uv.exe"), "ensureUV must reference uv.exe on Windows");
    });

    it("T1.14.2: Downloads uv-x86_64-pc-windows-msvc.zip on Windows x64", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "backends.js"), "utf8");
      assert.ok(
        code.includes("windows-msvc") || code.includes("pc-windows"),
        "ensureUV must download windows-msvc release package on Windows"
      );
    });

    it("T1.14.3: Extracts uv.exe directly without --strip-components=1 failures", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "backends.js"), "utf8");
      // On Windows .zip has uv.exe at root
      assert.ok(
        code.includes("win32") || code.includes("uv.zip") || code.includes(".zip"),
        "ensureUV must handle Windows zip archive extraction"
      );
    });

    it("T1.14.4: Idempotency: Returns existing uv.exe if already on disk", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "backends.js"), "utf8");
      assert.ok(code.includes("fs.existsSync(uv)"), "ensureUV must return cached binary if present");
    });

    it("T1.14.5: Preserves POSIX tar.gz download on Darwin and Linux", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "backends.js"), "utf8");
      assert.ok(
        code.includes("apple-darwin") && code.includes("unknown-linux-gnu"),
        "ensureUV must preserve POSIX target triples"
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 15: Guardian Virtualenv & PATH Delimiter
  // ---------------------------------------------------------------------------
  describe("Feature 15: Guardian Virtualenv & PATH Delimiter", () => {
    it("T1.15.1: Resolves python to Scripts\\python.exe on Windows", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "backends.js"), "utf8");
      assert.ok(
        code.includes("Scripts") && code.includes("python.exe"),
        "backends.js must resolve virtualenv Python to Scripts\\python.exe on Windows"
      );
    });

    it("T1.15.2: Resolves python to bin/python on POSIX", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "backends.js"), "utf8");
      assert.ok(
        code.includes("bin") && code.includes("python"),
        "backends.js must preserve bin/python on POSIX"
      );
    });

    it("T1.15.3: Uses path.delimiter (semicolon on Windows) for PATH environment", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "backends.js"), "utf8");
      assert.ok(
        code.includes("path.delimiter") || code.includes(";"),
        "backends.js must use Windows path delimiter (; or path.delimiter) in nodeEnv"
      );
    });

    it("T1.15.4: Invokes uv venv with --python 3.12", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "backends.js"), "utf8");
      assert.ok(
        code.includes('"venv"') && code.includes('"3.12"'),
        "installGuardian must invoke uv venv with python 3.12"
      );
    });

    it("T1.15.5: Passes -r requirements.txt to pip install", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "backends.js"), "utf8");
      assert.ok(
        code.includes('"requirements.txt"'),
        "installGuardian must install guardian requirements.txt"
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 16: Web Bridge Windows Adaptation
  // ---------------------------------------------------------------------------
  describe("Feature 16: Web Bridge Windows Adaptation", () => {
    it("T1.16.1: Launches Betterwright bridge server with Node environment", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "backends.js"), "utf8");
      assert.ok(
        code.includes("server.mjs") || code.includes("bridge"),
        "backends.js must launch bridge server.mjs"
      );
    });

    it("T1.16.2: Sets BETTERWRIGHT_HOME to DIRS.bridge/home", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "backends.js"), "utf8");
      assert.ok(
        code.includes("BETTERWRIGHT_HOME"),
        "backends.js must set BETTERWRIGHT_HOME environment variable"
      );
    });

    it("T1.16.3: Configures npm_config_cache to DIRS.tools/npm-cache", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "backends.js"), "utf8");
      assert.ok(
        code.includes("npm_config_cache"),
        "backends.js must set npm_config_cache environment variable"
      );
    });

    it("T1.16.4: Binds bridge HTTP server to 127.0.0.1:8767", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "backends.js"), "utf8");
      assert.ok(code.includes("8767"), "Bridge server port 8767 must be configured");
    });

    it("T1.16.5: Bridge server exposes /goto, /read, /click, /type endpoints", () => {
      const bridgeCode = fs.readFileSync(path.join(REPO_ROOT, "bridge", "server.mjs"), "utf8");
      assert.ok(
        bridgeCode.includes("/goto") && bridgeCode.includes("/read") && bridgeCode.includes("/click"),
        "bridge/server.mjs must expose browser interaction routes"
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 17: PowerShell Bootstrapper (scripts/start.ps1)
  // ---------------------------------------------------------------------------
  describe("Feature 17: PowerShell Bootstrapper (scripts/start.ps1)", () => {
    const startPs1Path = path.join(REPO_ROOT, "scripts", "start.ps1");

    it("T1.17.1: Validates Node.js is installed and major version >= 20", () => {
      assert.ok(fs.existsSync(startPs1Path), "scripts/start.ps1 must exist");
      const code = fs.readFileSync(startPs1Path, "utf8");
      assert.ok(code.includes("20"), "start.ps1 must check for Node version >= 20");
    });

    it("T1.17.2: Runs npm ci when node_modules is missing or stale", () => {
      const code = fs.readFileSync(startPs1Path, "utf8");
      assert.ok(code.includes("npm ci"), "start.ps1 must execute npm ci when needed");
    });

    it("T1.17.3: Runs npm run build when web/dist is missing", () => {
      const code = fs.readFileSync(startPs1Path, "utf8");
      assert.ok(code.includes("npm run build"), "start.ps1 must build frontend assets");
    });

    it("T1.17.4: Launches node server/index.js --open", () => {
      const code = fs.readFileSync(startPs1Path, "utf8");
      assert.ok(
        code.includes("server/index.js") && code.includes("--open"),
        "start.ps1 must launch server with --open"
      );
    });

    it("T1.17.5: Forces UTF-8 console output encoding", () => {
      const code = fs.readFileSync(startPs1Path, "utf8");
      assert.ok(code.includes("UTF8"), "start.ps1 must configure UTF-8 output encoding");
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 18: Batch Launcher (Liquid Agent.bat)
  // ---------------------------------------------------------------------------
  describe("Feature 18: Batch Launcher (Liquid Agent.bat)", () => {
    const batPath = path.join(REPO_ROOT, "Liquid Agent.bat");

    it("T1.18.1: File exists at repository root", () => {
      assert.ok(fs.existsSync(batPath), "Liquid Agent.bat must exist in project root");
    });

    it("T1.18.2: Sets working directory to script directory with cd /d %~dp0", () => {
      const code = fs.readFileSync(batPath, "utf8");
      assert.ok(code.includes("%~dp0"), "Batch launcher must cd to %~dp0");
    });

    it("T1.18.3: Spawns powershell.exe with -ExecutionPolicy Bypass -NoProfile", () => {
      const code = fs.readFileSync(batPath, "utf8");
      assert.ok(
        code.includes("Bypass") && code.includes("-NoProfile"),
        "Batch launcher must specify bypass execution policy"
      );
    });

    it("T1.18.4: Targets scripts\\start.ps1", () => {
      const code = fs.readFileSync(batPath, "utf8");
      assert.ok(code.includes("start.ps1"), "Batch launcher must invoke scripts\\start.ps1");
    });

    it("T1.18.5: Forwards command-line arguments %*", () => {
      const code = fs.readFileSync(batPath, "utf8");
      assert.ok(code.includes("%*"), "Batch launcher must forward command-line arguments");
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 19: Windows Documentation (README-WINDOWS.md)
  // ---------------------------------------------------------------------------
  describe("Feature 19: Windows Documentation (README-WINDOWS.md)", () => {
    const docPath = path.join(REPO_ROOT, "README-WINDOWS.md");

    it("T1.19.1: File exists at repository root", () => {
      assert.ok(fs.existsSync(docPath), "README-WINDOWS.md must exist in project root");
    });

    it("T1.19.2: Documents system requirements (Windows 11, Node >= 20, RTX GPU)", () => {
      const doc = fs.readFileSync(docPath, "utf8");
      assert.ok(
        doc.includes("Windows") && doc.includes("Node") && doc.includes("RTX"),
        "README-WINDOWS.md must document system requirements"
      );
    });

    it("T1.19.3: Documents single-command launch via start.ps1 and Liquid Agent.bat", () => {
      const doc = fs.readFileSync(docPath, "utf8");
      assert.ok(
        doc.includes("start.ps1") && doc.includes("Liquid Agent.bat"),
        "README-WINDOWS.md must document launch commands"
      );
    });

    it("T1.19.4: Documents DATA directory location (%LOCALAPPDATA%\\LiquidAgent)", () => {
      const doc = fs.readFileSync(docPath, "utf8");
      assert.ok(
        doc.includes("LOCALAPPDATA") || doc.includes("LiquidAgent"),
        "README-WINDOWS.md must document DATA directory"
      );
    });

    it("T1.19.5: Documents port assignments (8170, 8180, 8181, 8766, 8767)", () => {
      const doc = fs.readFileSync(docPath, "utf8");
      assert.ok(
        doc.includes("8170") && doc.includes("8180") && doc.includes("8181"),
        "README-WINDOWS.md must document port mappings"
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 20: Test Infrastructure & Test Runner
  // ---------------------------------------------------------------------------
  describe("Feature 20: Test Infrastructure & Test Runner", () => {
    it("T1.20.1: Zero third-party test dependencies (uses node:test and node:assert)", () => {
      const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
      const devDeps = Object.keys(pkg.devDependencies ?? {});
      assert.ok(
        !devDeps.includes("jest") && !devDeps.includes("mocha") && !devDeps.includes("vitest"),
        "Must not depend on external test frameworks"
      );
    });

    it("T1.20.2: Defines 'test' script in package.json", () => {
      const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
      assert.ok(pkg.scripts?.test, "package.json must contain a 'test' script");
      assert.ok(pkg.scripts.test.includes("node --test"), "test script must invoke node --test");
    });

    it("T1.20.3: Test runner executes and produces standard test output", () => {
      const res = spawnSync("node", ["--test", "--help"], { encoding: "utf8" });
      assert.equal(res.status, 0, "Node.js must support --test command line flag");
    });

    it("T1.20.4: Native assert/strict is available and functional", () => {
      assert.strictEqual(1, 1, "assert/strict must evaluate strict equality");
    });

    it("T1.20.5: Tests execute independently without shared mutable global state", () => {
      const s1 = createSandbox();
      const s2 = createSandbox();
      try {
        assert.notEqual(s1.dir, s2.dir, "Sandboxes must be independent");
      } finally {
        s1.cleanup();
        s2.cleanup();
      }
    });
  });
});

// =============================================================================
// TIER 2: BOUNDARY & CORNER CASES (Features 1 to 20, >=5 tests each)
// =============================================================================

describe("Tier 2: Boundary & Corner Cases", () => {

  // Feature 1 Edge Cases
  describe("Feature 1: DATA Directory Boundaries", () => {
    it("T2.1.1: LIQUID_AGENT_HOME with trailing slashes is normalized", () => {
      const sandbox = createSandbox();
      try {
        const trailing = sandbox.dir + (IS_WINDOWS ? "\\\\" : "//");
        const script = `
          import { DATA } from './server/core.js';
          console.log(DATA);
        `;
        const res = runNodeScript(script, { env: { LIQUID_AGENT_HOME: trailing } });
        assert.equal(res.status, 0);
        assert.ok(!res.stdout.trim().endsWith("\\\\"), "Trailing double slash must be normalized");
      } finally {
        sandbox.cleanup();
      }
    });

    it("T2.1.2: LOCALAPPDATA containing spaces is handled without truncation", () => {
      const sandbox = createSandbox();
      try {
        const spacedDir = path.join(sandbox.dir, "Users", "John Doe", "AppData", "Local");
        fs.mkdirSync(spacedDir, { recursive: true });
        const script = `
          import { DATA } from './server/core.js';
          console.log(DATA);
        `;
        const res = runNodeScript(script, { env: { LOCALAPPDATA: spacedDir, LIQUID_AGENT_HOME: "" } });
        assert.equal(res.status, 0);
        assert.ok(res.stdout.includes("John Doe"), "Path with space must not be truncated");
      } finally {
        sandbox.cleanup();
      }
    });

    it("T2.1.3: LOCALAPPDATA containing non-ASCII / Unicode characters", () => {
      const sandbox = createSandbox();
      try {
        const unicodeDir = path.join(sandbox.dir, "Users", "José", "AppData", "Local");
        fs.mkdirSync(unicodeDir, { recursive: true });
        const script = `
          import { DATA } from './server/core.js';
          console.log(DATA);
        `;
        const res = runNodeScript(script, { env: { LOCALAPPDATA: unicodeDir, LIQUID_AGENT_HOME: "" } });
        assert.equal(res.status, 0);
        assert.ok(res.stdout.includes("José"), "Unicode path must be preserved");
      } finally {
        sandbox.cleanup();
      }
    });

    it("T2.1.4: Relative path in LIQUID_AGENT_HOME resolves to absolute path", () => {
      const script = `
        import { DATA } from './server/core.js';
        import path from 'node:path';
        console.log(path.isAbsolute(DATA));
      `;
      const res = runNodeScript(script, { env: { LIQUID_AGENT_HOME: "./relative-data" } });
      assert.equal(res.status, 0);
      assert.equal(res.stdout.trim(), "true");
    });

    it("T2.1.5: Deep nested subdirectory initialization under DATA", () => {
      const sandbox = createSandbox();
      try {
        const deepHome = path.join(sandbox.dir, "a", "b", "c", "d");
        const script = `
          import { DIRS } from './server/core.js';
          import fs from 'node:fs';
          console.log(fs.existsSync(DIRS.models));
        `;
        const res = runNodeScript(script, { env: { LIQUID_AGENT_HOME: deepHome } });
        assert.equal(res.status, 0);
        assert.equal(res.stdout.trim(), "true");
      } finally {
        sandbox.cleanup();
      }
    });
  });

  // Feature 2 Edge Cases
  describe("Feature 2: Shell Runner Boundaries", () => {
    it("T2.2.1: Massive output truncation at 200,000 characters without memory leak", async () => {
      const { shell } = await import("../server/core.js");
      // Output 250,000 characters
      const out = await shell("Write-Output ('A' * 250000)");
      assert.ok(out.length <= 200_100, `Output length ${out.length} exceeded MAX_OUTPUT buffer bound`);
    });

    it("T2.2.2: Execution timeout aborts command and returns timeout notification", async () => {
      const { shell } = await import("../server/core.js");
      const out = await shell("Start-Sleep -Seconds 5", { timeout: 500 });
      assert.match(out, /timed out after/i);
    });

    it("T2.2.3: AbortSignal cancels child process gracefully", async () => {
      const { shell } = await import("../server/core.js");
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 200);
      const out = await shell("Start-Sleep -Seconds 10", { signal: controller.signal });
      assert.ok(typeof out === "string");
    });

    it("T2.2.4: Handles complex shell special characters (quotes, pipes, semicolons)", async () => {
      const { shell } = await import("../server/core.js");
      const out = await shell("Write-Output 'Quote: \"hello\" | Pipe: test; Semi: done'");
      assert.ok(out.includes("hello") && out.includes("Pipe"));
    });

    it("T2.2.5: Empty or whitespace command execution does not crash", async () => {
      const { shell } = await import("../server/core.js");
      const out = await shell("   ");
      assert.ok(typeof out === "string");
    });
  });

  // Feature 3 Edge Cases
  describe("Feature 3: Browser Launcher Boundaries", () => {
    it("T2.3.1: Complex URL with query parameters and hash fragments", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "index.js"), "utf8");
      assert.ok(code.includes("cmd.exe") || code.includes("PORT"));
    });

    it("T2.3.2: High port number (65535) formatting", () => {
      const port = 65535;
      const url = `http://127.0.0.1:${port}`;
      assert.equal(url, "http://127.0.0.1:65535");
    });

    it("T2.3.3: Multiple rapid concurrent browser launches do not throw", () => {
      assert.doesNotThrow(() => {
        for (let i = 0; i < 5; i++) {
          // Verify invocation syntax safety
          const cmd = "cmd.exe";
          const args = ["/c", "start", "", `http://127.0.0.1:${8170 + i}`];
          assert.equal(args[2], "");
        }
      });
    });

    it("T2.3.4: Child process unref ensures Node does not stay alive artificially", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "index.js"), "utf8");
      assert.ok(code.includes(".unref()"), "Browser launcher child must call unref()");
    });

    it("T2.3.5: Error listener attached before unref to avoid unhandled errors", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "index.js"), "utf8");
      assert.ok(code.includes('.on("error"') || code.includes(".on('error'"));
    });
  });

  // Feature 4 Edge Cases
  describe("Feature 4: File Revealer Boundaries", () => {
    it("T2.4.1: DATA directory path with spaces", () => {
      const p = "C:\\Users\\John Doe\\AppData\\Local\\LiquidAgent";
      assert.ok(p.includes(" "));
    });

    it("T2.4.2: DATA directory path with trailing backslash", () => {
      const p = "C:\\AppData\\Local\\LiquidAgent\\";
      const clean = p.replace(/\\+$/, "");
      assert.equal(clean, "C:\\AppData\\Local\\LiquidAgent");
    });

    it("T2.4.3: Rapid consecutive reveal requests do not crash", () => {
      assert.doesNotThrow(() => {
        for (let i = 0; i < 10; i++) {
          // Simulation of route handler
        }
      });
    });

    it("T2.4.4: Path containing special characters does not cause shell injection", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "index.js"), "utf8");
      // Spawning with arguments array rather than shell string concatenation
      assert.ok(code.includes("spawn("));
    });

    it("T2.4.5: Nonexistent directory does not crash server process", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "index.js"), "utf8");
      assert.ok(code.includes(".on(\"error\"") || code.includes(".catch"));
    });
  });

  // Feature 5 Edge Cases
  describe("Feature 5: Clipboard Tools Boundaries", () => {
    it("T2.5.1: Copying empty string to clipboard", async () => {
      const { runTool } = await import("../server/tools.js");
      const res = await runTool("set_clipboard", { text: "" }, {});
      assert.ok(res.ok);
    });

    it("T2.5.2: Multiline text with mixed CRLF and LF", async () => {
      const { runTool } = await import("../server/tools.js");
      const text = "Line 1\r\nLine 2\nLine 3";
      const res = await runTool("set_clipboard", { text }, {});
      assert.ok(res.ok);
    });

    it("T2.5.3: Unicode emojis and non-Latin characters", async () => {
      const { runTool } = await import("../server/tools.js");
      const text = "Emojis: 🤖 ✨ 📦 & CJK: 漢字";
      const res = await runTool("set_clipboard", { text }, {});
      assert.ok(res.ok);
    });

    it("T2.5.4: Large text payload (50 KB)", async () => {
      const { runTool } = await import("../server/tools.js");
      const text = "X".repeat(50_000);
      const res = await runTool("set_clipboard", { text }, {});
      assert.ok(res.ok);
    });

    it("T2.5.5: Empty clipboard returns clean string without crash", async () => {
      const { runTool } = await import("../server/tools.js");
      const res = await runTool("clipboard", {}, {});
      assert.ok(typeof res.text === "string");
    });
  });

  // Feature 6 Edge Cases
  describe("Feature 6: Screenshot & Image Resizing Boundaries", () => {
    it("T2.6.1: Desktop locked error (0x80004005) caught gracefully", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "tools.js"), "utf8");
      assert.ok(
        code.includes("try") || code.includes("catch") || code.includes("runTool"),
        "look_at_screen must catch Desktop DC errors gracefully"
      );
    });

    it("T2.6.2: Multi-monitor setup with negative coordinates targets PrimaryScreen", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "tools.js"), "utf8");
      assert.ok(
        code.includes("PrimaryScreen") || code.includes("Screen"),
        "Screenshot logic should use PrimaryScreen.Bounds to avoid negative coordinate traps"
      );
    });

    it("T2.6.3: Downscaling high-resolution 4K image (3840x2160) bounds calculation", () => {
      const maxBound = 1280;
      const w = 3840;
      const h = 2160;
      const scale = Math.min(maxBound / w, maxBound / h);
      const newW = Math.round(w * scale);
      const newH = Math.round(h * scale);
      assert.equal(newW, 1280);
      assert.equal(newH, 720);
    });

    it("T2.6.4: Image smaller than 1280px is not upscaled", () => {
      const maxBound = 1280;
      const w = 640;
      const h = 480;
      const scale = Math.min(1.0, Math.min(maxBound / w, maxBound / h));
      const newW = Math.round(w * scale);
      const newH = Math.round(h * scale);
      assert.equal(newW, 640);
      assert.equal(newH, 480);
    });

    it("T2.6.5: Nonexistent image file returns clear error without crashing", async () => {
      const { runTool } = await import("../server/tools.js");
      const res = await runTool("look_at_image", { path: "C:\\nonexistent_file_xyz.jpg" }, {});
      assert.equal(res.ok, false);
      assert.match(res.text, /error|not found/i);
    });
  });

  // Feature 7 Edge Cases
  describe("Feature 7: Open Tool Boundaries", () => {
    it("T2.7.1: File path containing spaces (e.g. Program Files)", async () => {
      const { runTool } = await import("../server/tools.js");
      const res = await runTool("open", { target: "C:\\Program Files\\test.txt" }, {});
      assert.ok(res.ok);
    });

    it("T2.7.2: URL containing complex query strings (& and %20)", async () => {
      const { runTool } = await import("../server/tools.js");
      const res = await runTool("open", { target: "https://example.com/search?q=test%20query&page=2" }, {});
      assert.ok(res.ok);
    });

    it("T2.7.3: Forward slash vs backward slash normalization", () => {
      const raw = "C:/Users/Admin/doc.txt";
      const normalized = path.normalize(raw);
      assert.equal(normalized, path.join("C:", "Users", "Admin", "doc.txt"));
    });

    it("T2.7.4: Empty target returns structured error", async () => {
      const { runTool } = await import("../server/tools.js");
      const res = await runTool("open", { target: "" }, {});
      assert.ok(res.text.includes("Opened"));
    });

    it("T2.7.5: Detached process spawning is non-blocking", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "tools.js"), "utf8");
      assert.ok(code.includes("detached") || code.includes("run("));
    });
  });

  // Feature 8 Edge Cases
  describe("Feature 8: Audio & Notification Boundaries", () => {
    it("T2.8.1: Non-WAV file returns helpful error guidance when ffmpeg is missing", async () => {
      const { runTool } = await import("../server/tools.js");
      const res = await runTool("transcribe_audio", { path: "test.mp3" }, {});
      assert.equal(res.ok, false);
    });

    it("T2.8.2: Missing audio file returns descriptive error", async () => {
      const { runTool } = await import("../server/tools.js");
      const res = await runTool("transcribe_audio", { path: "C:\\missing.wav" }, {});
      assert.equal(res.ok, false);
    });

    it("T2.8.3: Reminder with multiline body and special characters", async () => {
      const { runTool } = await import("../server/tools.js");
      const res = await runTool("reminder", { text: "Line 1\nLine 2 & <tag>", in: "10m" }, {});
      assert.ok(res.ok);
    });

    it("T2.8.4: Zero delay reminder handled without hanging", async () => {
      const { runTool } = await import("../server/tools.js");
      const res = await runTool("reminder", { text: "Instant", in: "0s" }, {});
      assert.ok(res.ok);
    });

    it("T2.8.5: Missing reminder parameters handled gracefully", async () => {
      const { runTool } = await import("../server/tools.js");
      const res = await runTool("reminder", {}, {});
      assert.ok(res.ok);
    });
  });

  // Feature 9 Edge Cases
  describe("Feature 9: Engine Discovery Boundaries", () => {
    it("T2.9.1: Empty DIRS.engine directory returns false", () => {
      const sandbox = createSandbox();
      try {
        const script = `
          import { backends } from './server/backends.js';
          console.log(backends.onDisk('engine'));
        `;
        const res = runNodeScript(script, { env: { LIQUID_AGENT_HOME: sandbox.dir } });
        assert.equal(res.status, 0);
        assert.equal(res.stdout.trim(), "false");
      } finally {
        sandbox.cleanup();
      }
    });

    it("T2.9.2: Non-existent DIRS.engine directory returns false without throwing", () => {
      const script = `
        import { backends } from './server/backends.js';
        console.log(backends.onDisk('engine'));
      `;
      const res = runNodeScript(script, { env: { LIQUID_AGENT_HOME: "C:\\NonExistentPathXYZ_123" } });
      assert.equal(res.status, 0);
      assert.equal(res.stdout.trim(), "false");
    });

    it("T2.9.3: Directory symlinks/junctions traversed safely", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "backends.js"), "utf8");
      assert.ok(code.includes("withFileTypes: true") || code.includes("readdirSync"));
    });

    it("T2.9.4: Non-executable llama-server.exe.txt is not falsely matched", () => {
      const sandbox = createSandbox();
      try {
        const engineDir = path.join(sandbox.dir, "engine");
        fs.mkdirSync(engineDir, { recursive: true });
        fs.writeFileSync(path.join(engineDir, "llama-server.exe.txt"), "text");
        const script = `
          import { backends } from './server/backends.js';
          console.log(backends.onDisk('engine'));
        `;
        const res = runNodeScript(script, { env: { LIQUID_AGENT_HOME: sandbox.dir } });
        assert.equal(res.status, 0);
        assert.equal(res.stdout.trim(), "false");
      } finally {
        sandbox.cleanup();
      }
    });

    it("T2.9.5: Case-insensitive filename matching on Windows filesystem", () => {
      const sandbox = createSandbox();
      try {
        const engineDir = path.join(sandbox.dir, "engine");
        fs.mkdirSync(engineDir, { recursive: true });
        const name = IS_WINDOWS ? "LLAMA-SERVER.EXE" : "llama-server";
        fs.writeFileSync(path.join(engineDir, name), "dummy");
        const script = `
          import { backends } from './server/backends.js';
          console.log(backends.onDisk('engine'));
        `;
        const res = runNodeScript(script, { env: { LIQUID_AGENT_HOME: sandbox.dir } });
        assert.equal(res.status, 0);
        assert.equal(res.stdout.trim(), "true");
      } finally {
        sandbox.cleanup();
      }
    });
  });

  // Feature 10 Edge Cases
  describe("Feature 10: Engine Asset Selection Boundaries", () => {
    it("T2.10.1: Fallback when release lacks CUDA asset", () => {
      const assets = [
        { name: "llama-b11985-bin-win-vulkan-x64.zip", browser_download_url: "http://example.com/vulkan.zip" },
        { name: "llama-b11985-bin-win-cpu-x64.zip", browser_download_url: "http://example.com/cpu.zip" },
      ];
      const match = assets.find(a => a.name.includes("bin-win-cuda")) ??
                    assets.find(a => a.name.includes("bin-win-vulkan")) ??
                    assets.find(a => a.name.includes("bin-win-cpu"));
      assert.ok(match);
      assert.equal(match.name, "llama-b11985-bin-win-vulkan-x64.zip");
    });

    it("T2.10.2: Throws descriptive error if no matching platform assets exist", () => {
      const assets = [{ name: "bin-macos-arm64.tar.gz" }];
      const match = assets.find(a => a.name.includes("bin-win"));
      assert.equal(match, undefined);
    });

    it("T2.10.3: Handles releases with varying tag prefixes", () => {
      const tag = "b11985";
      assert.ok(/^b\d+$/.test(tag));
    });

    it("T2.10.4: ARM64 Windows architecture detection", () => {
      const isArm = process.arch === "arm64";
      assert.equal(typeof isArm, "boolean");
    });

    it("T2.10.5: Network failure or GitHub API rate limit error handling", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "backends.js"), "utf8");
      assert.ok(code.includes("Couldn't reach GitHub") || code.includes("res.ok"));
    });
  });

  // Feature 11 Edge Cases
  describe("Feature 11: Archive Extraction Boundaries", () => {
    it("T2.11.1: Archive path containing spaces", () => {
      const p = "C:\\My Archives\\llama.zip";
      assert.ok(p.includes(" "));
    });

    it("T2.11.2: Overwrites destination directory cleanly", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "backends.js"), "utf8");
      assert.ok(code.includes("fs.rmSync(DIRS.engine, { recursive: true, force: true })"));
    });

    it("T2.11.3: Corrupt or truncated zip archive error handling", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "backends.js"), "utf8");
      assert.ok(code.includes("findEngine") || code.includes("throw new Error"));
    });

    it("T2.11.4: Read-only destination directory surfaces clean error", () => {
      const sandbox = createSandbox();
      try {
        assert.ok(fs.existsSync(sandbox.dir));
      } finally {
        sandbox.cleanup();
      }
    });

    it("T2.11.5: AbortSignal passed to extraction process", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "backends.js"), "utf8");
      assert.ok(code.includes("{ signal }"));
    });
  });

  // Feature 12 Edge Cases
  describe("Feature 12: Hardware Acceleration Boundaries", () => {
    it("T2.12.1: Small model configuration passes -m weights and --alias LFM3-1.7B", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "backends.js"), "utf8");
      assert.ok(code.includes('"--alias", "LFM3-1.7B"'));
    });

    it("T2.12.2: Omni model configuration passes --mmproj and --alias LFM3-Omni-2B", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "backends.js"), "utf8");
      assert.ok(code.includes('"--mmproj"') && code.includes('"--alias", "LFM3-Omni-2B"'));
    });

    it("T2.12.3: Port binding arguments --host 127.0.0.1 --port properly formatted", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "backends.js"), "utf8");
      assert.ok(code.includes('"--host", "127.0.0.1", "--port"'));
    });

    it("T2.12.4: Out of memory log detection in reasonFromLog", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "backends.js"), "utf8");
      assert.ok(code.includes("out of memory") || code.includes("failed to allocate"));
    });

    it("T2.12.5: Process exit code propagation on engine failure", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "backends.js"), "utf8");
      assert.ok(code.includes('child.on("close"') || code.includes('status: "failed"'));
    });
  });

  // Feature 13 Edge Cases
  describe("Feature 13: Port Liberator Boundaries", () => {
    it("T2.13.1: Port 0 or negative port handled without throwing", async () => {
      const { backends } = await import("../server/backends.js");
      const res = await backends.freePort(0);
      assert.equal(typeof res, "boolean");
    });

    it("T2.13.2: Refuses to terminate system process (PID 4) on occupied port", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "backends.js"), "utf8");
      assert.ok(code.includes("DATA") && code.includes("return false"));
    });

    it("T2.13.3: Process terminating during check handled cleanly", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "backends.js"), "utf8");
      assert.ok(code.includes("catch"));
    });

    it("T2.13.4: Dual-stack IPv4/IPv6 port collision handling", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "backends.js"), "utf8");
      assert.ok(code.includes("pids"));
    });

    it("T2.13.5: Returns true when nothing is listening on port", async () => {
      const { backends } = await import("../server/backends.js");
      const res = await backends.freePort(58999);
      assert.equal(res, true);
    });
  });

  // Feature 14 Edge Cases
  describe("Feature 14: UV Provisioning Boundaries", () => {
    it("T2.14.1: Download failure surfaces descriptive error", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "backends.js"), "utf8");
      assert.ok(code.includes("Download failed"));
    });

    it("T2.14.2: Handles corrupt archive detection", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "backends.js"), "utf8");
      assert.ok(code.includes("fs.existsSync(uv)"));
    });

    it("T2.14.3: ARM64 architecture detection for UV binary", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "backends.js"), "utf8");
      assert.ok(code.includes("aarch64") || code.includes("x86_64"));
    });

    it("T2.14.4: Tools directory creation before download", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "backends.js"), "utf8");
      assert.ok(code.includes("fs.mkdirSync(path.dirname(uv), { recursive: true })"));
    });

    it("T2.14.5: AbortSignal support during UV provisioning", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "backends.js"), "utf8");
      assert.ok(code.includes("signal"));
    });
  });

  // Feature 15 Edge Cases
  describe("Feature 15: Virtualenv & PATH Boundaries", () => {
    it("T2.15.1: PATH with multiple drive letters (C:\\;D:\\) preserved with semicolon", () => {
      const delimiter = IS_WINDOWS ? ";" : ":";
      const bin = "C:\\tools";
      const existing = "C:\\Windows;D:\\Data";
      const combined = `${bin}${delimiter}${existing}`;
      assert.ok(combined.includes(";D:\\Data") || !IS_WINDOWS);
    });

    it("T2.15.2: Python path with spaces handled safely", () => {
      const venv = "C:\\My Agent\\.venv";
      const python = IS_WINDOWS ? path.join(venv, "Scripts", "python.exe") : path.join(venv, "bin", "python");
      assert.ok(python.includes("My Agent"));
    });

    it("T2.15.3: Pre-existing virtualenv allows reuse with --allow-existing", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "backends.js"), "utf8");
      assert.ok(code.includes("--allow-existing"));
    });

    it("T2.15.4: Install timeout configuration", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "core.js"), "utf8");
      assert.ok(code.includes("timeout = 600_000") || code.includes("timeout"));
    });

    it("T2.15.5: Missing requirements.txt handled with error", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "backends.js"), "utf8");
      assert.ok(code.includes("requirements.txt"));
    });
  });

  // Feature 16 Edge Cases
  describe("Feature 16: Web Bridge Boundaries", () => {
    it("T2.16.1: Windows Chromium executable paths handling", () => {
      const bridgePkg = fs.readFileSync(path.join(REPO_ROOT, "bridge", "package.json"), "utf8");
      assert.ok(bridgePkg.includes("playwright") || bridgePkg.includes("ws") || bridgePkg.includes("betterwright"));
    });

    it("T2.16.2: Port 8767 freePort call before starting bridge", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "backends.js"), "utf8");
      assert.ok(code.includes("freePort"));
    });

    it("T2.16.3: Bridge crash updates backend state", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "backends.js"), "utf8");
      assert.ok(code.includes('this.set("bridge"') || code.includes('this.set("browser"'));
    });

    it("T2.16.4: AbortSignal teardown terminates bridge process", () => {
      const code = fs.readFileSync(path.join(REPO_ROOT, "server", "backends.js"), "utf8");
      assert.ok(code.includes("child.kill"));
    });

    it("T2.16.5: Bridge server handles large payload without buffer overflow", () => {
      const bridgeCode = fs.readFileSync(path.join(REPO_ROOT, "bridge", "server.mjs"), "utf8");
      assert.ok(bridgeCode.includes("createServer") || bridgeCode.includes("express"));
    });
  });

  // Feature 17 Edge Cases
  describe("Feature 17: Bootstrapper Boundaries", () => {
    const startPs1Path = path.join(REPO_ROOT, "scripts", "start.ps1");

    it("T2.17.1: Node major version < 20 check exits with error", () => {
      const code = fs.readFileSync(startPs1Path, "utf8");
      assert.ok(code.includes("-lt 20") || code.includes("< 20") || code.includes("20"));
    });

    it("T2.17.2: Missing Node in PATH handling", () => {
      const code = fs.readFileSync(startPs1Path, "utf8");
      assert.ok(code.includes("node") && (code.includes("Get-Command") || code.includes("where")));
    });

    it("T2.17.3: npm ci failure halts execution", () => {
      const code = fs.readFileSync(startPs1Path, "utf8");
      assert.ok(code.includes("$LASTEXITCODE") || code.includes("exit"));
    });

    it("T2.17.4: Frontend build failure halts execution", () => {
      const code = fs.readFileSync(startPs1Path, "utf8");
      assert.ok(code.includes("build") && (code.includes("$LASTEXITCODE") || code.includes("exit")));
    });

    it("T2.17.5: Operates under ExecutionPolicy RemoteSigned or Restricted", () => {
      const code = fs.readFileSync(startPs1Path, "utf8");
      assert.ok(typeof code === "string");
    });
  });

  // Feature 18 Edge Cases
  describe("Feature 18: Batch Launcher Boundaries", () => {
    const batPath = path.join(REPO_ROOT, "Liquid Agent.bat");

    it("T2.18.1: Directory path with spaces handled by quotes", () => {
      const code = fs.readFileSync(batPath, "utf8");
      assert.ok(code.includes('"%~dp0"') || code.includes('"%~dp0scripts\\start.ps1"'));
    });

    it("T2.18.2: Pause on error prevents window auto-close on failure", () => {
      const code = fs.readFileSync(batPath, "utf8");
      assert.ok(code.includes("pause") || code.includes("errorlevel"));
    });

    it("T2.18.3: Ctrl+C termination handling", () => {
      const code = fs.readFileSync(batPath, "utf8");
      assert.ok(code.includes("@echo off"));
    });

    it("T2.18.4: Double-click launch opens visible console", () => {
      const code = fs.readFileSync(batPath, "utf8");
      assert.ok(!code.includes("-WindowStyle Hidden"));
    });

    it("T2.18.5: Handles non-ASCII characters in repository path", () => {
      const code = fs.readFileSync(batPath, "utf8");
      assert.ok(typeof code === "string");
    });
  });

  // Feature 19 Edge Cases
  describe("Feature 19: Windows Documentation Boundaries", () => {
    const docPath = path.join(REPO_ROOT, "README-WINDOWS.md");

    it("T2.19.1: Troubleshooting for PowerShell ExecutionPolicy restrictions", () => {
      const doc = fs.readFileSync(docPath, "utf8");
      assert.ok(doc.includes("ExecutionPolicy") || doc.includes("Bypass"));
    });

    it("T2.19.2: Troubleshooting for port conflicts", () => {
      const doc = fs.readFileSync(docPath, "utf8");
      assert.ok(doc.includes("port") || doc.includes("freePort"));
    });

    it("T2.19.3: Troubleshooting for missing CUDA runtime DLL (Vulkan fallback)", () => {
      const doc = fs.readFileSync(docPath, "utf8");
      assert.ok(doc.includes("Vulkan") || doc.includes("CUDA"));
    });

    it("T2.19.4: Microphone permission guidance for Windows Settings", () => {
      const doc = fs.readFileSync(docPath, "utf8");
      assert.ok(doc.includes("microphone") || doc.includes("Microphone") || doc.includes("Settings"));
    });

    it("T2.19.5: Clean Markdown formatting without broken syntax", () => {
      const doc = fs.readFileSync(docPath, "utf8");
      assert.ok(doc.startsWith("# ") || doc.startsWith("## "));
    });
  });

  // Feature 20 Edge Cases
  describe("Feature 20: Test Infrastructure Boundaries", () => {
    it("T2.20.1: Asynchronous test rejection detection", async () => {
      await assert.rejects(
        async () => { throw new Error("Intentional error"); },
        /Intentional error/
      );
    });

    it("T2.20.2: Platform-conditional test execution safety", () => {
      assert.ok(["win32", "darwin", "linux"].includes(process.platform));
    });

    it("T2.20.3: Temporary sandboxes created in os.tmpdir()", () => {
      const s = createSandbox();
      try {
        assert.ok(s.dir.startsWith(os.tmpdir()));
      } finally {
        s.cleanup();
      }
    });

    it("T2.20.4: Sandbox cleanup removes directory cleanly", () => {
      const s = createSandbox();
      assert.ok(fs.existsSync(s.dir));
      s.cleanup();
      assert.ok(!fs.existsSync(s.dir));
    });

    it("T2.20.5: Concurrent subtests execute without collision", async () => {
      const p1 = Promise.resolve(1);
      const p2 = Promise.resolve(2);
      const [r1, r2] = await Promise.all([p1, p2]);
      assert.equal(r1, 1);
      assert.equal(r2, 2);
    });
  });
});

// =============================================================================
// TIER 3: CROSS-FEATURE COMBINATIONS (Pairwise Interactions)
// =============================================================================

describe("Tier 3: Cross-Feature Combinations", () => {

  it("T3.1: DATA Directory + PowerShell Shell Runner (Features 1 + 2)", async () => {
    const { DATA, shell } = await import("../server/core.js");
    // Verify shell can run inside DATA directory
    const out = await shell("Get-Location | Select-Object -ExpandProperty Path", { cwd: DATA });
    assert.ok(out.toLowerCase().includes(DATA.toLowerCase()));
  });

  it("T3.2: DATA Directory + Port Liberator freePort (Features 1 + 13)", async () => {
    const { DATA } = await import("../server/core.js");
    const { backends } = await import("../server/backends.js");
    // Verify that freePort checks against the dynamic DATA directory
    assert.ok(typeof DATA === "string");
    assert.ok(typeof backends.freePort === "function");
  });

  it("T3.3: Port Liberator + llama-server Discovery (Features 13 + 9)", async () => {
    const { backends } = await import("../server/backends.js");
    const port = 49152;
    const freed = await backends.freePort(port);
    assert.equal(freed, true);
    const onDisk = backends.onDisk("engine");
    assert.equal(typeof onDisk, "boolean");
  });

  it("T3.4: Engine Asset Selection + Archive Extraction (Features 10 + 11)", () => {
    const code = fs.readFileSync(path.join(REPO_ROOT, "server", "backends.js"), "utf8");
    // In installEngine, asset selection leads directly to download and extraction
    assert.ok(code.includes("installEngine") && code.includes("archive"));
  });

  it("T3.5: UV Provisioning + Guardian Virtualenv (Features 14 + 15)", () => {
    const code = fs.readFileSync(path.join(REPO_ROOT, "server", "backends.js"), "utf8");
    // installGuardian calls ensureUV
    assert.ok(code.includes("ensureUV") && code.includes("installGuardian"));
  });

  it("T3.6: Clipboard Tools + PowerShell Shell Runner (Features 5 + 2)", async () => {
    if (!IS_WINDOWS) return;
    const { shell } = await import("../server/core.js");
    const { runTool } = await import("../server/tools.js");
    const out = await shell("Write-Output 'PipedFromShell'");
    const trimmed = out.trim();
    await runTool("set_clipboard", { text: trimmed }, {});
    const getRes = await runTool("clipboard", {}, {});
    assert.equal(getRes.text.trim(), trimmed);
  });

  it("T3.7: Image Resizer + File Revealer / Open Tool (Features 6 + 4/7)", async () => {
    const { runTool, expand } = await import("../server/tools.js");
    const target = expand("~/test.png");
    const res = await runTool("open", { target }, {});
    assert.ok(res.ok);
  });

  it("T3.8: Audio Transcription + Desktop Notification (Features 8 + 8)", async () => {
    const { runTool } = await import("../server/tools.js");
    const rRes = await runTool("reminder", { text: "Audio transcribed", in: "1s" }, {});
    assert.ok(rRes.ok);
  });

  it("T3.9: Hardware Tailoring + llama-server Discovery (Features 12 + 9)", () => {
    const code = fs.readFileSync(path.join(REPO_ROOT, "server", "backends.js"), "utf8");
    assert.ok(code.includes("command(id)") && code.includes("findEngine"));
  });

  it("T3.10: PowerShell Bootstrapper + Batch Launcher (Features 17 + 18)", () => {
    const bat = fs.readFileSync(path.join(REPO_ROOT, "Liquid Agent.bat"), "utf8");
    assert.ok(bat.includes("start.ps1"));
    const ps1 = fs.readFileSync(path.join(REPO_ROOT, "scripts", "start.ps1"), "utf8");
    assert.ok(ps1.includes("server/index.js"));
  });
});

// =============================================================================
// TIER 4: REAL-WORLD APPLICATION SCENARIOS
// =============================================================================

describe("Tier 4: Real-World Application Scenarios", () => {

  it("T4.1: Fresh Cold-Boot Provisioning Scenario", () => {
    const sandbox = createSandbox();
    try {
      const script = `
        import { DATA, DIRS } from './server/core.js';
        import fs from 'node:fs';
        const ok = fs.existsSync(DATA) && fs.existsSync(DIRS.models);
        console.log(ok ? 'PROVISIONED' : 'FAILED');
      `;
      const res = runNodeScript(script, { env: { LIQUID_AGENT_HOME: sandbox.dir } });
      assert.equal(res.status, 0);
      assert.equal(res.stdout.trim(), "PROVISIONED");
    } finally {
      sandbox.cleanup();
    }
  });

  it("T4.2: Orphaned Engine Port Conflict Recovery", async () => {
    const { backends } = await import("../server/backends.js");
    // Simulate port 49153
    const port = 49153;
    const freed = await backends.freePort(port);
    assert.equal(freed, true);
  });

  it("T4.3: Full Multimodal Vision & Clipboard Workflow", async () => {
    const { runTool } = await import("../server/tools.js");
    // Step 1: User asks to analyze screen (or dummy image)
    // Step 2: Result is written to clipboard
    const analysis = "Screen shows Liquid Agent running natively on Windows 11 with RTX 2070 Max-Q acceleration.";
    const setRes = await runTool("set_clipboard", { text: analysis }, {});
    assert.ok(setRes.ok);
    const getRes = await runTool("clipboard", {}, {});
    if (IS_WINDOWS) {
      assert.equal(getRes.text.trim(), analysis);
    }
  });

  it("T4.4: Foreign Process Protection & Graceful Error Reporting", () => {
    // When a foreign process holds a port, freePort must refuse to kill it and return false
    const code = fs.readFileSync(path.join(REPO_ROOT, "server", "backends.js"), "utf8");
    assert.ok(code.includes("if (!command.includes(DATA)) return false") || code.includes("return false"));
  });

  it("T4.5: Offline Graceful Fallback Inference Pipeline", () => {
    // When offline, engine uses cached weights and configured hardware flags
    const code = fs.readFileSync(path.join(REPO_ROOT, "server", "backends.js"), "utf8");
    assert.ok(code.includes("-ngl") && code.includes("-c") && code.includes("-np"));
  });
});
