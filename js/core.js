/* ==========================================================================
   CORE LOGIC: a 1:1 port of secure_solution.py (Team T4, Case 3).
   No DOM access here, so tests/core.test.js can load it in Node with require().
   ========================================================================== */
var UAVCore = (function () {
  "use strict";

  var INITIAL_MISSION = { destination: "POINT_A", altitude: 100, speed: 10 };

  // fictional credentials: (password, mfa_code, role, active)
  var USERS = {
    pilot01:         ["pilot-pass",   "246810", "pilot",   true],
    mission_manager: ["manager-pass", "135790", "manager", true],
    old_operator:    ["old-pass",     "111111", "pilot",   false]
  };
  var ROLES = {
    pilot:   ["destination", "speed"],              // least privilege: no altitude
    manager: ["destination", "altitude", "speed"]
  };
  var ALLOWED_PATHS = [["operator", "mission_data"]]; // default deny
  var LOCKOUT_THRESHOLD = 3;
  var ATTACK = { destination: "UNKNOWN_POINT", altitude: 30 };

  function own(obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); }
  function copy(obj) { var o = {}; for (var k in obj) if (own(obj, k)) o[k] = obj[k]; return o; }

  /* ---- json.dumps(data, sort_keys=True) with Python's default separators
          and ensure_ascii=True ---- */
  function pyJsonStr(s) {
    var out = '"';
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i), c = s.charCodeAt(i);
      if (ch === '"') out += '\\"';
      else if (ch === "\\") out += "\\\\";
      else if (ch === "\n") out += "\\n";
      else if (ch === "\r") out += "\\r";
      else if (ch === "\t") out += "\\t";
      else if (ch === "\b") out += "\\b";
      else if (ch === "\f") out += "\\f";
      else if (c < 0x20 || c > 0x7e) out += "\\u" + ("0000" + c.toString(16)).slice(-4);
      else out += ch;
    }
    return out + '"';
  }
  function pyDumps(v) {
    if (v === null || v === undefined) return "null";
    if (typeof v === "boolean") return v ? "true" : "false";
    if (typeof v === "number") return String(v);
    if (typeof v === "string") return pyJsonStr(v);
    if (Array.isArray(v)) return "[" + v.map(pyDumps).join(", ") + "]";
    var keys = Object.keys(v).sort();
    return "{" + keys.map(function (k) { return pyJsonStr(k) + ": " + pyDumps(v[k]); }).join(", ") + "}";
  }

  /* ---- Python repr(), used only to display audit-log details ---- */
  function pyRepr(v) {
    if (v === null || v === undefined) return "None";
    if (typeof v === "boolean") return v ? "True" : "False";
    if (typeof v === "number") return String(v);
    if (Array.isArray(v)) return "(" + v.map(pyRepr).join(", ") + (v.length === 1 ? ",)" : ")");
    var s = String(v);
    var q = (s.indexOf("'") >= 0 && s.indexOf('"') < 0) ? '"' : "'";
    var out = "";
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i), c = s.charCodeAt(i);
      if (ch === "\\") out += "\\\\";
      else if (ch === q) out += "\\" + q;
      else if (ch === "\n") out += "\\n";
      else if (ch === "\r") out += "\\r";
      else if (ch === "\t") out += "\\t";
      else if (c < 0x20 || c === 0x7f) out += "\\x" + ("00" + c.toString(16)).slice(-2);
      else out += ch;
    }
    return q + out + q;
  }

  /* ---- SHA-256: Web Crypto first, pure-JS fallback for browsers that hide
          crypto.subtle on file:// pages. Both give identical output. ---- */
  function utf8Bytes(str) {
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(str);
    var bin = unescape(encodeURIComponent(str)), b = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
    return b;
  }
  function toHex(bytes) {
    var h = "";
    for (var i = 0; i < bytes.length; i++) h += ("0" + bytes[i].toString(16)).slice(-2);
    return h;
  }
  var K = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
  ];
  function sha256Js(msg) {
    var len = msg.length, bitLenHi = Math.floor(len / 0x20000000), bitLenLo = (len << 3) >>> 0;
    var total = ((len + 9 + 63) >> 6) << 6, p = new Uint8Array(total);
    p.set(msg); p[len] = 0x80;
    p[total - 8] = bitLenHi >>> 24; p[total - 7] = bitLenHi >>> 16; p[total - 6] = bitLenHi >>> 8; p[total - 5] = bitLenHi;
    p[total - 4] = bitLenLo >>> 24; p[total - 3] = bitLenLo >>> 16; p[total - 2] = bitLenLo >>> 8; p[total - 1] = bitLenLo;
    var H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    var W = new Array(64);
    for (var off = 0; off < total; off += 64) {
      for (var t = 0; t < 16; t++) {
        var j = off + t * 4;
        W[t] = ((p[j] << 24) | (p[j + 1] << 16) | (p[j + 2] << 8) | p[j + 3]) >>> 0;
      }
      for (t = 16; t < 64; t++) {
        var w15 = W[t - 15], w2 = W[t - 2];
        var s0 = ((w15 >>> 7) | (w15 << 25)) ^ ((w15 >>> 18) | (w15 << 14)) ^ (w15 >>> 3);
        var s1 = ((w2 >>> 17) | (w2 << 15)) ^ ((w2 >>> 19) | (w2 << 13)) ^ (w2 >>> 10);
        W[t] = (W[t - 16] + s0 + W[t - 7] + s1) >>> 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (t = 0; t < 64; t++) {
        var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        var ch = (e & f) ^ (~e & g);
        var t1 = (h + S1 + ch + K[t] + W[t]) >>> 0;
        var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + maj) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }
    var out = new Uint8Array(32);
    for (var i = 0; i < 8; i++) {
      out[i * 4] = H[i] >>> 24; out[i * 4 + 1] = H[i] >>> 16; out[i * 4 + 2] = H[i] >>> 8; out[i * 4 + 3] = H[i];
    }
    return toHex(out);
  }
  var hashBackend = (typeof crypto !== "undefined" && crypto.subtle) ? "Web Crypto" : "JS fallback";
  function sha256Hex(str) {
    var bytes = utf8Bytes(str);
    if (hashBackend === "Web Crypto") {
      return crypto.subtle.digest("SHA-256", bytes).then(
        function (buf) { return toHex(new Uint8Array(buf)); },
        function () { hashBackend = "JS fallback"; return sha256Js(bytes); });
    }
    return Promise.resolve(sha256Js(bytes));
  }

  // datetime.now(timezone.utc).isoformat() (millisecond precision in JS)
  function isoUtc(d) {
    return d.toISOString().replace("Z", "+00:00");
  }

  /* ---- the secure system: one independent instance per view ---- */
  function createSecureSystem(clock) {
    clock = clock || function () { return new Date(); };
    var sys = {
      mission: copy(INITIAL_MISSION),
      trusted_hash: null,
      failures: {},          // user -> failed credential checks
      audit_log: [],         // [timestamp, user, action, details]
      last: null,            // trace of the most recent change()/verify() for the UI
      rejected: false        // set when verify() fails, like the printed alert
    };

    // create an integrity-checking function
    function calculate_hash(data) { return sha256Hex(pyDumps(data)); }

    // record user + time + action
    function log(user, action, details) {
      var event = [isoUtc(clock()), user, action, details];
      sys.audit_log.push(event);
      return event;
    }

    // verify mission integrity
    function verify() {
      return calculate_hash(sys.mission).then(function (current) {
        var valid = current === sys.trusted_hash;
        log("monitor", "integrity_check", valid);
        sys.rejected = !valid;   // "SECURITY ALERT: MISSION REJECTED" when false
        sys.lastVerify = { valid: valid, current: current, trusted: sys.trusted_hash };
        return valid;
      });
    }

    function pathAllowed(source, dest) {
      return ALLOWED_PATHS.some(function (p) { return p[0] === source && p[1] === dest; });
    }
    function failCount(user) { return own(sys.failures, user) ? sys.failures[user] : 0; }

    // check authorization before modification
    function change(user, password, mfa, field, value, source) {
      if (source === undefined) source = "operator";
      var account = own(USERS, user) ? USERS[user] : null;
      var trace = sys.last = {
        kind: "change", user: user, field: field, value: value, source: source,
        ok: false, stoppedAt: null, reason: null, before: copy(sys.mission)
      };
      function deny(gate, reason) {
        trace.stoppedAt = gate; trace.reason = reason;
        return Promise.resolve(false);
      }
      // 1. network rule (default deny)
      if (!pathAllowed(source, "mission_data")) {
        log(user, "denied", "network rule");
        return deny(1, "network rule");
      }
      // 2. account exists, active, not locked
      if (!account || !account[3] || failCount(user) >= LOCKOUT_THRESHOLD) {
        log(user, "denied", "unknown, disabled, or locked");
        trace.detail = !account ? "unknown account" : !account[3] ? "account disabled" : "account locked";
        return deny(2, "unknown, disabled, or locked");
      }
      // 3. password + MFA
      if (password !== account[0] || mfa !== account[1]) {
        sys.failures[user] = failCount(user) + 1;
        log(user, "denied", "password or MFA");
        trace.failures = sys.failures[user];
        return deny(3, "password or MFA");
      }
      sys.failures[user] = 0;
      // 4. RBAC / least privilege
      if (ROLES[account[2]].indexOf(field) < 0) {
        log(user, "denied", "RBAC");
        trace.role = account[2];
        return deny(4, "RBAC");
      }
      // 5. integrity check against the trusted hash
      return verify().then(function (valid) {
        if (!valid) {
          trace.stoppedAt = 5; trace.reason = "integrity check failed";
          return false;
        }
        var old_value = sys.mission[field];
        sys.mission[field] = value;
        return calculate_hash(sys.mission).then(function (h) {
          sys.trusted_hash = h;
          log(user, "changed", [field, old_value, value]);
          trace.ok = true; trace.old = old_value;
          return true;
        });
      });
    }

    // an edit made outside change(): nothing checks it, nothing logs it
    function tamper(field, value) {
      sys.last = { kind: "tamper", field: field, value: value, old: sys.mission[field], before: copy(sys.mission) };
      sys.mission[field] = value;
    }

    function reset() {
      sys.mission = copy(INITIAL_MISSION);
      sys.failures = {};
      sys.audit_log = [];
      sys.last = null;
      sys.lastVerify = null;
      sys.rejected = false;
      return calculate_hash(sys.mission).then(function (h) { sys.trusted_hash = h; return sys; });
    }

    sys.calculate_hash = calculate_hash;
    sys.log = log;
    sys.verify = verify;
    sys.change = change;
    sys.tamper = tamper;
    sys.reset = reset;
    sys.failCount = failCount;
    sys.ready = reset();
    return sys;
  }

  return {
    INITIAL_MISSION: INITIAL_MISSION, USERS: USERS, ROLES: ROLES, ALLOWED_PATHS: ALLOWED_PATHS,
    LOCKOUT_THRESHOLD: LOCKOUT_THRESHOLD, ATTACK: ATTACK,
    pyDumps: pyDumps, pyRepr: pyRepr, sha256Hex: sha256Hex, sha256Js: sha256Js, utf8Bytes: utf8Bytes,
    hashBackend: function () { return hashBackend; },
    createSecureSystem: createSecureSystem, copy: copy
  };
})();
if (typeof module !== "undefined" && module.exports) module.exports = UAVCore;
