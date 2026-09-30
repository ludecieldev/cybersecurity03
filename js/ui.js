/* ==========================================================================
   VIEW HELPERS: build the gates, mission file, audit log, hashes and tables.
   They only turn data into HTML; the presentation flow lives in js/app.js.
   ========================================================================== */
var UAVUI = (function () {
  "use strict";
  var C = UAVCore;
  var GATE_MS = 420;   // time each gate spends "checking"

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ---- the five gates of change() ---- */
  var GATES = [
    { name: "Network rule", sub: "source → mission_data allowed?", absent: "no segmentation: any laptop reaches mission data" },
    { name: "Account", sub: "exists · active · not locked", absent: "shared account · old accounts active · no lockout" },
    { name: "Password + MFA", sub: "both factors must match", absent: "one shared password · no MFA" },
    { name: "RBAC", sub: "may this role change this field?", absent: "no authorization check" },
    { name: "Integrity", sub: "SHA-256 vs trusted hash", absent: "no integrity check · no audit log" }
  ];
  function buildGates(el) {
    el.innerHTML = GATES.map(function (g, i) {
      return '<div class="gate" data-n="' + (i + 1) + '"><div class="num">' + (i + 1) + '</div>' +
        '<div><div class="name">' + g.name + '</div><div class="why"></div></div><div class="badge"></div></div>';
    }).join("");
  }
  function setGate(el, n, state, why, badge) {
    var g = el.querySelector('[data-n="' + n + '"]');
    g.className = "gate " + (state || "");
    g.querySelector(".why").textContent = why == null ? GATES[n - 1].sub : why;
    g.querySelector(".badge").textContent = badge || "";
    g.title = g.querySelector(".why").textContent;
  }
  function gatesIdle(el) { for (var n = 1; n <= 5; n++) setGate(el, n, "", null, ""); }
  function gatesAbsent(el) { for (var n = 1; n <= 5; n++) setGate(el, n, "absent", GATES[n - 1].absent, "MISSING"); }

  function roleOf(user) { return Object.prototype.hasOwnProperty.call(C.USERS, user) ? C.USERS[user][2] : null; }
  function passText(tr, n) {
    switch (n) {
      case 1: return tr.source + " → mission_data: allowed";
      case 2: return tr.user + ": active, " + tr.failuresBefore + "/3 failed attempts";
      case 3: return "password and MFA code correct · counter reset to 0";
      case 4: return "role " + roleOf(tr.user) + " may change " + tr.field;
      case 5: return "mission hash matches trusted hash";
    }
  }
  function failText(tr, n) {
    switch (n) {
      case 1: return tr.source + " → mission_data is not in allowed_paths (default deny)";
      case 2:
        if (tr.detail === "unknown account" && tr.user === "operator") return '"operator" does not exist: the shared account was removed';
        if (tr.detail === "unknown account") return 'no account named "' + tr.user + '"';
        if (tr.detail === "account disabled") return '"' + tr.user + '" is a disabled old account';
        return '"' + tr.user + '" is locked after ' + tr.failuresBefore + " failed attempts";
      case 3: return "wrong password or MFA · failure " + tr.failures + "/3" + (tr.failures >= 3 ? " → account LOCKED" : "");
      case 4: return "role " + tr.role + " may not change " + tr.field + " (least privilege)";
      case 5: return "hash ≠ trusted hash → SECURITY ALERT: MISSION REJECTED";
    }
  }
  // walk a change() trace through the gates, one at a time; wait(ms) paces the animation
  function animateGates(el, tr, wait) {
    gatesIdle(el);
    var n = 1;
    function step() {
      if (n > 5) return Promise.resolve();
      setGate(el, n, "checking", "checking…", "…");
      return wait(GATE_MS).then(function () {
        if (tr.stoppedAt === n) {
          setGate(el, n, "fail", failText(tr, n), "DENIED");
          for (var m = n + 1; m <= 5; m++) setGate(el, m, "skipped", "not reached", "");
          return;
        }
        setGate(el, n, "pass", passText(tr, n), "PASS");
        n++;
        return step();
      });
    }
    return step();
  }
  function gatesBypassed(el) {
    for (var n = 1; n <= 4; n++) setGate(el, n, "bypass", "bypassed: the edit did not go through change()", "BYPASSED");
  }

  /* ---- code snippets, mission file, audit log, hashes ---- */
  function pyArg(v) { return typeof v === "number" ? '<span class="n">' + v + '</span>' : '<span class="s">' + esc(JSON.stringify(String(v))) + '</span>'; }
  function callHtml(args) {
    var a = args.slice(0, 5).map(pyArg).join(", ");
    if (args[5] !== undefined && args[5] !== "operator") a += ', source=' + pyArg(args[5]);
    return '<span class="fn">change</span>(' + a + ')';
  }
  function requestHtml(label, code) { return '<span class="lbl">' + label + '</span>' + code; }

  var ORDER = ["destination", "altitude", "speed"];
  function renderMission(el, mission, ann, blocked) {
    ann = ann || {};
    var keys = ORDER.filter(function (k) { return k in mission; })
      .concat(Object.keys(mission).filter(function (k) { return ORDER.indexOf(k) < 0; }));
    var lines = keys.map(function (k, i) {
      var a = ann[k], note = "";
      if (a) note += '<span class="was ' + a.tone + '">was ' + esc(C.pyDumps(a.was)) + (a.note ? " · " + esc(a.note) : "") + "</span>";
      if (blocked && blocked.field === k) note += '<span class="blk">✖ <s>' + esc(C.pyDumps(blocked.value)) + "</s> blocked</span>";
      return '<div class="ml' + (a ? " chg " + a.tone : "") + '">  <span class="k">' + esc(JSON.stringify(k)) + '</span>: <span class="v">' +
        esc(C.pyDumps(mission[k])) + "</span>" + (i < keys.length - 1 ? "," : "") + note + "</div>";
    });
    if (blocked && !(blocked.field in mission)) {
      lines.push('<div class="ml"><span class="blk">✖ new field ' + esc(JSON.stringify(blocked.field)) + " blocked</span></div>");
    }
    el.innerHTML = '<div class="ml">mission = {</div>' + lines.join("") + '<div class="ml">}</div>';
  }

  function evClass(e) {
    if (e[2] === "denied") return "bad";
    if (e[2] === "changed") return "ok";
    if (e[2] === "integrity_check") return e[3] ? "ev-chk" : "bad";
    return "";
  }
  function renderLog(el, log, fresh) {
    if (!log.length) { el.innerHTML = '<div class="empty" style="color:var(--dim)">No events yet.</div>'; return; }
    el.innerHTML = log.map(function (e, i) {
      return '<div class="ev ' + evClass(e) + (i >= fresh ? " new" : "") + '">(<span class="ts">' + esc(C.pyRepr(e[0])) +
        '</span>, <span class="u">' + esc(C.pyRepr(e[1])) + '</span>, <span class="a">' + esc(C.pyRepr(e[2])) +
        '</span>, <span class="d">' + esc(C.pyRepr(e[3])) + "</span>)</div>";
    }).join("");
    el.scrollTop = el.scrollHeight;
  }

  function renderCounters(el, sys) {
    el.innerHTML = '<span>Failed logins (locks at 3):</span>' + Object.keys(C.USERS).map(function (u) {
      if (!C.USERS[u][3]) return '<span class="ctr off">' + u + "</span>";
      var f = sys.failCount(u), pips = "";
      for (var i = 0; i < 3; i++) pips += '<span class="pip' + (i < f ? " on" : "") + '"></span>';
      return '<span class="ctr' + (f >= 3 ? " bad" : "") + '">' + u + pips + (f >= 3 ? " LOCKED" : "") + "</span>";
    }).join("");
  }

  function renderHash(el, sys) {
    return sys.calculate_hash(sys.mission).then(function (cur) {
      var match = cur === sys.trusted_hash;
      el.innerHTML =
        '<div class="hrow"><span class="hl">Trusted SHA-256</span><code>' + sys.trusted_hash.slice(0, 12) + "…</code></div>" +
        '<div class="hrow"><span class="hl">Current SHA-256</span><code class="' + (match ? "ok" : "bad") + '">' + cur.slice(0, 12) +
        '…</code><span class="pill ' + (match ? "ok" : "bad") + '">' + (match ? "✓ match" : "✖ MISMATCH") + "</span></div>" +
        '<div class="canon">sha256(json.dumps(mission, sort_keys=True)) of <code>' + esc(C.pyDumps(sys.mission)) + "</code> · " + C.hashBackend() + "</div>";
      return match;
    });
  }

  /* ---- small tables ---- */
  function rowsTable(rows, cls) {
    return '<table class="t ' + (cls || "") + '"><tbody>' + rows.map(function (r) {
      return "<tr><td>" + r[0] + '</td><td class="' + (r[2] || "") + '">' + r[1] + "</td></tr>";
    }).join("") + "</tbody></table>";
  }
  function changesText(changed) {
    var ks = Object.keys(changed);
    if (!ks.length) return "none";
    return ks.map(function (k) { return esc(k) + ": " + esc(C.pyDumps(changed[k][0])) + " → " + esc(C.pyDumps(changed[k][1])); }).join("<br>");
  }
  function outcomeTable(rows) {
    return '<table class="t">' + rows.map(function (r) { return "<tr><td>" + r[0] + '</td><td class="yn ' + r[1] + '">' + r[2] + "</td></tr>"; }).join("") + "</table>";
  }

  return {
    GATE_MS: GATE_MS, $: $, esc: esc,
    GATES: GATES, buildGates: buildGates, setGate: setGate, gatesIdle: gatesIdle, gatesAbsent: gatesAbsent,
    gatesBypassed: gatesBypassed, passText: passText, failText: failText, animateGates: animateGates,
    pyArg: pyArg, callHtml: callHtml, requestHtml: requestHtml,
    renderMission: renderMission, renderLog: renderLog, renderCounters: renderCounters, renderHash: renderHash,
    rowsTable: rowsTable, changesText: changesText, outcomeTable: outcomeTable
  };
})();
