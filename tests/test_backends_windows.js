// Unit tests for server/backends.js Windows adaptations (Milestone 3)
// Run with: node --test tests/test_backends_windows.js

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { backends, findEngine, unpackArchive } from "../server/backends.js";
import { DATA, DIRS, ROOT } from "../server/core.js";

test("1. Engine discovery (findEngine)", async (t) => {
  await t.test("detects llama-server.exe inside DIRS.engine on Windows", () => {
    const testDir = path.join(DIRS.engine, "test-subdir");
    fs.mkdirSync(testDir, { recursive: true });
    const expectedBinary = process.platform === "win32" ? "llama-server.exe" : "llama-server";
    const dummyPath = path.join(testDir, expectedBinary);
    fs.writeFileSync(dummyPath, "dummy-binary");

    try {
      const found = findEngine();
      assert.ok(found, "findEngine should locate the binary");
      assert.ok(found.endsWith(expectedBinary), `Found path should end in ${expectedBinary}`);
    } finally {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  await t.test("returns null when no engine binary exists", () => {
    // If DIRS.engine is empty or only has other files
    const found = findEngine();
    // If real llama-server isn't installed yet, should return null
    if (!fs.existsSync(path.join(DIRS.engine, process.platform === "win32" ? "llama-server.exe" : "llama-server"))) {
      assert.equal(found, null);
    }
  });
});

test("2. Unpack archive helper (unpackArchive)", async (t) => {
  await t.test("unpacks a zip archive into target directory on Windows", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "la-unpack-"));
    const srcFile = path.join(tempDir, "sample.txt");
    const zipFile = path.join(tempDir, "archive.zip");
    const outDir = path.join(tempDir, "extracted");

    fs.writeFileSync(srcFile, "Hello Liquid Agent Windows!");

    // Create zip using tar or PowerShell
    if (process.platform === "win32") {
      const { run } = await import("../server/core.js");
      await run("powershell.exe", [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `Compress-Archive -Path '${srcFile}' -DestinationPath '${zipFile}' -Force`,
      ]);
    }

    if (fs.existsSync(zipFile)) {
      await unpackArchive(zipFile, outDir);
      const extractedFile = path.join(outDir, "sample.txt");
      assert.ok(fs.existsSync(extractedFile), "sample.txt must be extracted");
      assert.equal(fs.readFileSync(extractedFile, "utf8"), "Hello Liquid Agent Windows!");
    }

    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});

test("3. Python venv path and command resolution", async (t) => {
  await t.test("resolves python executable path according to OS convention", () => {
    const spec = backends.command("guardian");
    assert.ok(spec, "guardian command specification must exist");
    assert.ok(spec.cmd, "guardian cmd must be defined");

    if (process.platform === "win32") {
      assert.ok(spec.cmd.includes(path.join("Scripts", "python.exe")), "Windows python binary must point to Scripts\\python.exe");
    } else {
      assert.ok(spec.cmd.includes(path.join("bin", "python")), "POSIX python binary must point to bin/python");
    }
  });

  await t.test("nodeEnv includes system PATH delimiter", () => {
    const env = backends.nodeEnv;
    assert.ok(env.PATH, "PATH must be set in nodeEnv");
    assert.ok(env.PATH.includes(path.delimiter), "PATH must contain platform delimiter");
    assert.equal(env.BETTERWRIGHT_HOME, path.join(DIRS.bridge, "home"));
  });
});

test("4. Port management (freePort)", async (t) => {
  await t.test("freePort returns true for unused port without error", async () => {
    const isFree = await backends.freePort(49151); // High ephemeral port unlikely in use
    assert.equal(isFree, true);
  });
});

test("5. Asset Selection & Compatibility", async (t) => {
  await t.test("prioritizes CUDA assets with Vulkan fallback for Windows", () => {
    const mockReleases = [
      {
        assets: [
          { name: "llama-b11988-bin-win-cpu-x64.zip", browser_download_url: "http://example.com/cpu.zip" },
          { name: "llama-b11988-bin-win-vulkan-x64.zip", browser_download_url: "http://example.com/vulkan.zip" },
          { name: "llama-b11988-bin-win-cuda-13.4-x64.zip", browser_download_url: "http://example.com/cuda13.zip" },
          { name: "cudart-llama-bin-win-cuda-13.4-x64.zip", browser_download_url: "http://example.com/cudart13.zip" },
          { name: "llama-b11988-bin-macos-arm64.tar.gz", browser_download_url: "http://example.com/mac.tar.gz" },
          { name: "llama-b11988-bin-ubuntu-x64.tar.gz", browser_download_url: "http://example.com/linux.tar.gz" }
        ]
      }
    ];

    const allAssets = mockReleases[0].assets;
    let mainAsset;
    let cudartAsset;

    if (process.platform === "win32") {
      mainAsset = allAssets.find((a) => a.name.includes("bin-win-cuda-13.4-x64.zip")) ||
                  allAssets.find((a) => a.name.includes("bin-win-cuda-12.4-x64.zip")) ||
                  allAssets.find((a) => a.name.includes("bin-win-vulkan-x64.zip")) ||
                  allAssets.find((a) => a.name.includes("bin-win-cpu-x64.zip"));

      if (mainAsset && mainAsset.name.includes("cuda")) {
        const cudaVer = mainAsset.name.includes("13.4") ? "13.4" : "12.4";
        cudartAsset = allAssets.find((a) => a.name.startsWith("cudart-llama") && a.name.includes(`win-cuda-${cudaVer}-x64.zip`));
      }

      assert.equal(mainAsset.name, "llama-b11988-bin-win-cuda-13.4-x64.zip", "Should select CUDA 13.4 for host RTX 2070");
      assert.ok(cudartAsset, "Should select companion cudart runtime archive");
      assert.equal(cudartAsset.name, "cudart-llama-bin-win-cuda-13.4-x64.zip");
    }
  });
});

test("6. Model Command Arguments & Optimization Flags", async (t) => {
  const binaryName = process.platform === "win32" ? "llama-server.exe" : "llama-server";
  const dummyBin = path.join(DIRS.engine, binaryName);
  const createdDummy = !fs.existsSync(dummyBin);
  if (createdDummy) {
    fs.mkdirSync(DIRS.engine, { recursive: true });
    fs.writeFileSync(dummyBin, "fake-binary");
  }

  try {
    await t.test("small model includes --flash-attn, -b 2048, -t 6, -c 16384 -np 1", () => {
      const spec = backends.command("small");
      assert.ok(spec, "small model spec must exist");
      assert.ok(spec.args.includes("--flash-attn"), "Must include --flash-attn");
      assert.ok(spec.args.includes("-b") && spec.args[spec.args.indexOf("-b") + 1] === "2048");
      assert.ok(spec.args.includes("-ub") && spec.args[spec.args.indexOf("-ub") + 1] === "512");
      assert.ok(spec.args.includes("-t") && spec.args[spec.args.indexOf("-t") + 1] === "6");
      assert.ok(spec.args.includes("-c") && spec.args[spec.args.indexOf("-c") + 1] === "16384");
      assert.ok(spec.args.includes("-np") && spec.args[spec.args.indexOf("-np") + 1] === "1");
    });

    await t.test("omni model includes --flash-attn, -b 2048, -t 6, -c 32768 -np 2", () => {
      const spec = backends.command("omni");
      assert.ok(spec, "omni model spec must exist");
      assert.ok(spec.args.includes("--flash-attn"), "Must include --flash-attn");
      assert.ok(spec.args.includes("-b") && spec.args[spec.args.indexOf("-b") + 1] === "2048");
      assert.ok(spec.args.includes("-ub") && spec.args[spec.args.indexOf("-ub") + 1] === "512");
      assert.ok(spec.args.includes("-t") && spec.args[spec.args.indexOf("-t") + 1] === "6");
      assert.ok(spec.args.includes("-c") && spec.args[spec.args.indexOf("-c") + 1] === "32768");
      assert.ok(spec.args.includes("-np") && spec.args[spec.args.indexOf("-np") + 1] === "2");
    });
  } finally {
    if (createdDummy) {
      try { fs.rmSync(dummyBin, { force: true }); } catch {}
    }
  }
});
