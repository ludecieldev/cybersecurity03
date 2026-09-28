// Checks the logic inside index.html against the SPEC acceptance checks.
// Run: node tests/core.test.js   (needs Node 18+ and python3 for the reference hashes)
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const assert = require("assert");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const src = html.match(/<script id="core">([\s\S]*?)<\/script>/)[1];
const Core = new Function("module", src + "\nreturn UAVCore;")({});

function python(code, input) {
  return execFileSync("python3", ["-c", code], { input: JSON.stringify(input) }).toString();
}

let passed = 0;
async function check(name, fn) {
  await fn();
  passed++;
  console.log("  ok  " + name);
}

(async () => {
  const INITIAL = { destination: "POINT_A", altitude: 100, speed: 10 };

  await check("json.dumps(sort_keys=True) matches the spec string", () => {
    assert.strictEqual(Core.pyDumps(INITIAL), '{"altitude": 100, "destination": "POINT_A", "speed": 10}');
  });

  const samples = [
    INITIAL,
    { destination: "UNKNOWN_POINT", altitude: 30, speed: 10 },
    { destination: "POINT_B", altitude: 100, speed: 10 },
    { destination: 'quo"te\\back\nslash\ttab\u0001', altitude: -5, speed: 0 },
    { destination: "héllo 한국 ✈ 😀", altitude: 100, speed: 10 },
  ];
  const ref = JSON.parse(python(
    "import json,sys,hashlib\n" +
    "out=[]\n" +
    "for m in json.load(sys.stdin):\n" +
    "  t=json.dumps(m,sort_keys=True); out.append([t,hashlib.sha256(t.encode()).hexdigest()])\n" +
    "print(json.dumps(out))", samples));

  await check("dumps + SHA-256 match Python byte-for-byte (Web Crypto and JS fallback)", async () => {
    for (let i = 0; i < samples.length; i++) {
      const text = Core.pyDumps(samples[i]);
      assert.strictEqual(text, ref[i][0]);
      assert.strictEqual(await Core.sha256Hex(text), ref[i][1]);
      assert.strictEqual(Core.sha256Js(Core.utf8Bytes(text)), ref[i][1]);
    }
    assert.strictEqual(Core.sha256Js(Core.utf8Bytes("")), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    assert.strictEqual(Core.sha256Js(Core.utf8Bytes("x".repeat(1000))),
      require("crypto").createHash("sha256").update("x".repeat(1000)).digest("hex"));
  });

  await check("answer-sheet asserts (secure_solution.py)", async () => {
    const s = Core.createSecureSystem(); await s.ready;
    assert.strictEqual(await s.change("intruder", "wrong", "000000", "destination", "UNKNOWN_POINT"), false);
    assert.strictEqual(s.last.stoppedAt, 2);
    assert.strictEqual(await s.change("pilot01", "pilot-pass", "246810", "destination", "POINT_B"), true);
    assert.strictEqual(await s.verify(), true);
    s.mission.altitude = 30;
    assert.strictEqual(await s.verify(), false);
  });

  await check("audit log matches the Python run event by event", async () => {
    const s = Core.createSecureSystem(); await s.ready;
    await s.change("intruder", "wrong", "000000", "destination", "UNKNOWN_POINT");
    await s.change("pilot01", "pilot-pass", "246810", "destination", "POINT_B");
    await s.verify();
    s.mission.altitude = 30;
    await s.verify();
    assert.deepStrictEqual(s.audit_log.map(e => e.slice(1)), [
      ["intruder", "denied", "unknown, disabled, or locked"],
      ["monitor", "integrity_check", true],
      ["pilot01", "changed", ["destination", "POINT_A", "POINT_B"]],
      ["monitor", "integrity_check", true],
      ["monitor", "integrity_check", false],
    ]);
    for (const e of s.audit_log) assert.match(e[0], /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}\+00:00$/);
  });

  await check("lockout on 3rd failure; 4th attempt denied with correct credentials", async () => {
    const s = Core.createSecureSystem(); await s.ready;
    for (let i = 1; i <= 3; i++) {
      assert.strictEqual(await s.change("pilot01", "pilot-pass", "999999", "destination", "UNKNOWN_POINT"), false);
      assert.strictEqual(s.last.stoppedAt, 3);
      assert.strictEqual(s.failures.pilot01, i);
    }
    assert.strictEqual(await s.change("pilot01", "pilot-pass", "246810", "destination", "POINT_B"), false);
    assert.strictEqual(s.last.stoppedAt, 2);
    assert.strictEqual(s.last.detail, "account locked");
    assert.strictEqual(s.mission.destination, "POINT_A");
  });

  await check("a correct login resets the failure counter", async () => {
    const s = Core.createSecureSystem(); await s.ready;
    await s.change("pilot01", "pilot-pass", "000000", "speed", 12);
    await s.change("pilot01", "pilot-pass", "000000", "speed", 12);
    assert.strictEqual(await s.change("pilot01", "pilot-pass", "246810", "speed", 12), true);
    assert.strictEqual(s.failures.pilot01, 0);
  });

  await check("old_operator is rejected as disabled at gate 2", async () => {
    const s = Core.createSecureSystem(); await s.ready;
    assert.strictEqual(await s.change("old_operator", "old-pass", "111111", "destination", "UNKNOWN_POINT"), false);
    assert.strictEqual(s.last.stoppedAt, 2);
    assert.strictEqual(s.last.detail, "account disabled");
  });

  await check("pilot altitude change blocked by RBAC at gate 4", async () => {
    const s = Core.createSecureSystem(); await s.ready;
    assert.strictEqual(await s.change("pilot01", "pilot-pass", "246810", "altitude", 30), false);
    assert.strictEqual(s.last.stoppedAt, 4);
    assert.strictEqual(s.mission.altitude, 100);
  });

  await check("manager may change altitude; trusted hash follows", async () => {
    const s = Core.createSecureSystem(); await s.ready;
    const before = s.trusted_hash;
    assert.strictEqual(await s.change("mission_manager", "manager-pass", "135790", "altitude", 80), true);
    assert.notStrictEqual(s.trusted_hash, before);
    assert.strictEqual(s.trusted_hash, await s.calculate_hash(s.mission));
  });

  await check("maintenance source denied at gate 1 before any account check", async () => {
    const s = Core.createSecureSystem(); await s.ready;
    assert.strictEqual(await s.change("pilot01", "pilot-pass", "246810", "destination", "POINT_B", "maintenance"), false);
    assert.strictEqual(s.last.stoppedAt, 1);
    assert.deepStrictEqual(s.audit_log.map(e => e.slice(1)), [["pilot01", "denied", "network rule"]]);
  });

  await check("after direct tampering every change() stops at gate 5", async () => {
    const s = Core.createSecureSystem(); await s.ready;
    s.tamper("altitude", 30);
    assert.strictEqual(await s.change("mission_manager", "manager-pass", "135790", "altitude", 100), false);
    assert.strictEqual(s.last.stoppedAt, 5);
    assert.strictEqual(s.rejected, true);
    assert.strictEqual(s.mission.altitude, 30);
  });

  await check("reset restores mission, hash, counters and log", async () => {
    const s = Core.createSecureSystem(); await s.ready;
    const h0 = s.trusted_hash;
    await s.change("pilot01", "x", "x", "speed", 1);
    s.tamper("altitude", 30);
    await s.verify();
    await s.reset();
    assert.deepStrictEqual(s.mission, INITIAL);
    assert.strictEqual(s.trusted_hash, h0);
    assert.deepStrictEqual(s.failures, {});
    assert.deepStrictEqual(s.audit_log, []);
    assert.strictEqual(s.rejected, false);
  });

  await check("the SAME attack (stolen shared operator account, both changes) is blocked at gate 2", async () => {
    const s = Core.createSecureSystem(); await s.ready;
    assert.strictEqual(await s.change("operator", "shared-pass", "000000", "destination", "UNKNOWN_POINT"), false);
    assert.strictEqual(s.last.stoppedAt, 2);
    assert.strictEqual(await s.change("operator", "shared-pass", "000000", "altitude", 30), false);
    assert.strictEqual(s.last.stoppedAt, 2);
    assert.deepStrictEqual(s.mission, INITIAL);
    assert.strictEqual(s.audit_log.length, 2);
  });

  await check("code panel shows exactly the .py files", () => {
    for (const name of ["attack_simulation", "secure_solution"]) {
      const re = new RegExp(`<script type="text/plain" id="py-${name}">\\n([\\s\\S]*?)</script>`);
      const embedded = html.match(re)[1];
      const file = fs.readFileSync(path.join(__dirname, "..", name + ".py"), "utf8").trimEnd() + "\n";
      assert.strictEqual(embedded, file, `${name}.py changed: run python3 tools/embed_python.py`);
    }
  });

  await check("attack_simulation.py reports success; secure_solution.py blocks the same attack", () => {
    const root = path.join(__dirname, "..");
    const a = execFileSync("python3", ["attack_simulation.py"], { cwd: root }).toString();
    assert.match(a, /^ATTACK SUCCESSFUL$/m);
    const b = execFileSync("python3", ["secure_solution.py"], { cwd: root }).toString();
    assert.match(b, /^ATTACK BLOCKED$/m);
  });

  await check("Python repr for log details", () => {
    assert.strictEqual(Core.pyRepr(["destination", "POINT_A", "POINT_B"]), "('destination', 'POINT_A', 'POINT_B')");
    assert.strictEqual(Core.pyRepr(["altitude", 100, 30]), "('altitude', 100, 30)");
    assert.strictEqual(Core.pyRepr(false), "False");
  });

  console.log(`\n${passed} checks passed`);
})().catch(e => { console.error("FAILED:", e.message); process.exit(1); });
