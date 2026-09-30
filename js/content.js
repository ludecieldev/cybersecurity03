/* ==========================================================================
   CONTENT: everything the audience reads that is not computed.
   Edit wording, stages and scenarios here; js/app.js decides when each is shown.
   `code` entries are [text to find in our Python, number of lines to highlight].
   ========================================================================== */
var UAVContent = (function () {
  "use strict";

  /* ---- card under the map ---- */
  var CONTEXT = {
    vuln: '<h3>Lab conditions (worksheet)</h3><ul><li>Shared ground-control accounts</li><li>No MFA</li>' +
      '<li>Old accounts still active</li><li>Irregular firmware updates</li><li>Poor logging</li><li>Maintenance laptops connect straight to UAVs</li></ul>' +
      '<div class="chain"><span>attacker</span><b>→</b><span>shared account, no MFA</span><b>→</b><span>mission plan</span><b>→</b>' +
      '<span>unauthorized change</span><b>→</b><span class="end">crash or injury</span></div>',
    secure: '<h3>Controls inside change()</h3><ul><li>Default-deny network rule</li><li>Individual accounts, lockout after 3</li>' +
      '<li>Password + MFA</li><li>RBAC: pilots may not change altitude</li><li>SHA-256 integrity check</li><li>Every decision logged (UTC)</li></ul>' +
      '<div class="chain"><span>pilot: destination, speed</span><span>manager: destination, altitude, speed</span></div>'
  };

  /* ---- vulnerable mode: one entry per → press ---- */
  var HEADER_CODE = [["# Asset:", 2], ["# Vulnerability:", 2], ["# Threat:", 2], ["# Impact:", 2]];
  var VSTAGES = [
    { id: "intro", k: "The system", h: "UAV mission under normal operation",
      b: "<p>Mission loaded: <b>POINT_A</b>, <b>100 m</b>, <b>10 m/s</b>. The UAV is en route and flies whatever the mission file says.</p>",
      code: [["mission = {", 5], ["shared_accounts = ", 1]] },
    { id: "analysis", k: "Security analysis", h: "Asset, threat, vulnerability, impact",
      b: "<p>What we protect, who attacks it, and what goes wrong.</p>", code: HEADER_CODE },
    { id: "chain", k: "Attack chain", h: "How the attack unfolds",
      b: "<p>Threat → Vulnerability → Asset → Attack → Impact</p>", code: HEADER_CODE },
    { id: "vuln", k: "Stage 1 of 5", h: "The vulnerability exists",
      b: '<ul class="vlist"><li>Shared ground-control account</li><li>No MFA</li><li>No authorization check</li><li>No integrity check</li><li>No audit log</li><li>Old accounts still active</li></ul>',
      code: [['print("VULNERABILITY', 1], ["shared_accounts = ", 1]] },
    { id: "attempt", k: "Stage 2 of 5", h: "Attack attempted",
      b: "<p>The attacker signs in with the <b>stolen shared operator account</b>. The operator gets an unexpected login notification, but nothing blocks the session.</p>",
      code: [['print("ATTACK: assumed', 1], ["user, password =", 3]] },
    { id: "success", k: "Stage 3 of 5", h: "Attack succeeds",
      b: "<p>The request passes straight through: <b>destination → UNKNOWN_POINT</b>, <b>altitude → 30 m</b>. The UAV briefly loses its ground-station link and reroutes.</p>",
      code: [["if authenticated:", 3]] },
    { id: "asset", k: "Stage 4 of 5", h: "Asset affected: the mission plan",
      b: "<p>Integrity is lost: the plan now says something nobody authorized.</p>",
      code: [['print("MODIFIED MISSION', 1]] },
    { id: "impact", k: "Stage 5 of 5", h: "Security impact",
      b: "<p>The UAV flies to the wrong point, below the 45 m tower. <b>Possible collision → crash or injury.</b></p>",
      code: [['print("ASSET: mission plan', 1]] },
    { id: "result", k: "Attack result", h: "Did the attack succeed?",
      b: "<p>The program compares the mission before and after and decides for itself.</p>",
      code: [["# 6. [guide]", 4], ["# 7. [guide]", 14]] },
    { id: "investigation", k: "After the incident", h: "Investigation",
      b: "<p>The mission file is later found modified. What can the system tell us?</p>",
      code: [['print("No automatic detection', 1]] }
  ];

  /* ---- secured mode: scenarios 1-7 ---- */
  var PILOT = ["pilot01", "pilot-pass", "246810"];
  var PRESETS = {
    1: { kind: "attack", title: "The same attack, replayed",
         lead: "Same attacker, same stolen shared credentials (<code>operator</code> / <code>shared-pass</code>), same two changes. Now every request has to go through <code>change()</code>.",
         steps: [
           { call: ["operator", "shared-pass", "000000", "destination", "UNKNOWN_POINT"], label: "Change 1 of 2: destination → UNKNOWN_POINT" },
           { call: ["operator", "shared-pass", "000000", "altitude", 30], label: "Change 2 of 2: altitude → 30" },
           { summary: true, label: "the attack result" }
         ] },
    2: { kind: "attack", title: "Stolen password, no MFA code", lead: "The attacker has pilot01's real password but not the MFA code.",
         steps: [
           { call: ["pilot01", "pilot-pass", "000000", "destination", "UNKNOWN_POINT"], label: "Attempt 1 of 4: guessed MFA code" },
           { call: ["pilot01", "pilot-pass", "123456", "destination", "UNKNOWN_POINT"], label: "Attempt 2 of 4: guessed MFA code" },
           { call: ["pilot01", "pilot-pass", "999999", "destination", "UNKNOWN_POINT"], label: "Attempt 3 of 4: third failure locks the account" },
           { call: ["pilot01", "pilot-pass", "246810", "destination", "UNKNOWN_POINT"], label: "Attempt 4 of 4: correct password AND correct MFA code" }
         ] },
    3: { kind: "attack", title: "Old account", lead: "A former operator's account, used with its real credentials.",
         steps: [{ call: ["old_operator", "old-pass", "111111", "destination", "UNKNOWN_POINT"] }] },
    4: { kind: "misuse", title: "Pilot tries to change altitude", lead: "A real pilot with correct credentials, but pilots may not change altitude.",
         steps: [{ call: PILOT.concat(["altitude", 30]) }] },
    5: { kind: "legit", title: "Legitimate change", lead: "The real pilot reroutes to POINT_B. The system still works for authorized users.",
         steps: [{ call: PILOT.concat(["destination", "POINT_B"]) }] },
    6: { kind: "tamper", title: "Direct file tampering", lead: "Someone edits the mission file directly, bypassing <code>change()</code>.",
         steps: [
           { tamper: ["altitude", 30], label: 'Step 1 of 2: mission["altitude"] = 30, outside change()' },
           { verify: true, label: "Step 2 of 2: the pre-flight verify()" }
         ] },
    7: { kind: "attack", title: "Maintenance laptop path", lead: "A compromised maintenance laptop sends a change, even with valid pilot credentials.",
         steps: [{ call: PILOT.concat(["destination", "UNKNOWN_POINT", "maintenance"]) }] }
  };
  var SHORT = { 1: "Same attack", 2: "Stolen password", 3: "Old account", 4: "Pilot → altitude", 5: "Legit change", 6: "Tampering", 7: "Maintenance" };

  /* ---- lines of secure_solution.py behind each gate ---- */
  var GATE_CODE = {
    1: [['if (source, "mission_data") not in allowed_paths:', 3]],
    2: [["if not account or not account[3]", 3]],
    3: [["if (password, mfa) != account[:2]:", 4]],
    4: [["if field not in roles[account[2]]:", 3]],
    5: [["if not verify():", 2], ["def verify():", 7]]
  };

  /* ---- side-by-side captions, one per step ---- */
  var SPLIT_CAP = [
    ["Same attack, two systems", "Stolen shared credentials, then destination → UNKNOWN_POINT and altitude → 30. Press → to launch."],
    ["The attack lands", "Left: written straight into the mission. Right: stopped at the account gate and logged, twice."],
    ["Outcome", "Left: collision risk, and nobody knows who did it. Right: the UAV reaches POINT_A, the attempt is on record."]
  ];

  return { CONTEXT: CONTEXT, VSTAGES: VSTAGES, PRESETS: PRESETS, SHORT: SHORT, GATE_CODE: GATE_CODE, SPLIT_CAP: SPLIT_CAP };
})();
