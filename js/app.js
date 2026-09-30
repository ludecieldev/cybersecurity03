/* ==========================================================================
   PRESENTATION FLOW: modes, stages, scenarios, animation queue, controls.
   Wording lives in js/content.js, HTML helpers in js/ui.js, logic in js/core.js.
   Everything is deterministic: fixed timings, no random.
   ========================================================================== */
(function () {
  "use strict";
  var C = UAVCore;
  var INITIAL = C.INITIAL_MISSION;

  var UI = UAVUI, K = UAVContent;
  var $ = UI.$, esc = UI.esc, GATE_MS = UI.GATE_MS, GATES = UI.GATES, buildGates = UI.buildGates, setGate = UI.setGate,
      gatesIdle = UI.gatesIdle, gatesAbsent = UI.gatesAbsent, gatesBypassed = UI.gatesBypassed, failText = UI.failText,
      pyArg = UI.pyArg, callHtml = UI.callHtml, requestHtml = UI.requestHtml, renderMission = UI.renderMission,
      renderLog = UI.renderLog, renderCounters = UI.renderCounters, renderHash = UI.renderHash,
      rowsTable = UI.rowsTable, changesText = UI.changesText, outcomeTable = UI.outcomeTable;
  var CONTEXT = K.CONTEXT, VSTAGES = K.VSTAGES, PRESETS = K.PRESETS, SHORT = K.SHORT, GATE_CODE = K.GATE_CODE, SPLIT_CAP = K.SPLIT_CAP;

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function assign(a, b) { var o = C.copy(a); for (var k in b) o[k] = b[k]; return o; }

  /* ---- action queue with cancellation ---- */
  var CANCELLED = { cancelled: true };
  var token = 0, busy = false, hurry = false, queue = Promise.resolve();
  function interrupt() { token++; stopAuto(); [map1, mapL, mapR].forEach(function (m) { if (m) m.cancel(); }); }
  function run(fn) {
    queue = queue.then(function () {
      var t = token; busy = true; hurry = false;
      return Promise.resolve().then(function () { return fn(t); })
        .catch(function (e) { if (e !== CANCELLED) console.error(e); })
        .then(function () { busy = false; updateControls(); });
    });
    return queue;
  }
  function pause(ms, t) { return sleep(hurry ? 0 : ms).then(function () { if (t !== token) throw CANCELLED; }); }
  function alive(t) { if (t !== token) throw CANCELLED; }

  var P = UAVMap.P, MID = UAVMap.MID, CRASH = UAVMap.CRASH, lerp = UAVMap.lerp, placeOf = UAVMap.placeOf;
  function MapView(host, statusEl) { return UAVMap.MapView(host, statusEl, function () { return hurry; }); }

  // gate animation paced by the action queue (see pause)
  function animateGates(el, tr, t) { return UI.animateGates(el, tr, function (ms) { return pause(ms, t); }); }

  function showAlert(on) { $("alert").hidden = !on; }

  /* ======================= CODE PANEL ======================= */
  // Shows the team's own Python (js/python-sources.js) and highlights the lines behind the current step.
  var codeOpen = false, codeMarks = { vuln: [], secure: [] };
  function pySource(name) { return (window.PY_SOURCES && window.PY_SOURCES[name] || "").replace(/\s+$/, ""); }
  function setCode(marks) { codeMarks[mode === "secure" ? "secure" : "vuln"] = marks || []; renderCode(); }
  function renderCode() {
    var show = codeOpen && (mode === "vuln" || mode === "secure");
    $("codePanel").hidden = !show;
    if (!show) return;
    var name = mode === "secure" ? "secure_solution" : "attack_simulation";
    var lines = pySource(name).split("\n"), hl = {};
    codeMarks[mode].forEach(function (m) {
      for (var i = 0; i < lines.length; i++) {
        if (lines[i].indexOf(m[0]) >= 0) { for (var j = 0; j < m[1]; j++) hl[i + j] = true; break; }
      }
    });
    $("codeFile").textContent = name + ".py";
    var body = $("codeBody");
    body.innerHTML = lines.map(function (l, i) {
      return '<div class="cl' + (hl[i] ? " hl" : "") + '"><span class="ln">' + (i + 1) + "</span>" + esc(l || " ") + "</div>";
    }).join("");
    var first = body.querySelector(".hl");
    body.scrollTop = first ? first.offsetTop - body.clientHeight / 3 : 0;
  }
  function toggleCode() { codeOpen = !codeOpen; renderCode(); updateControls(); }

  /* ======================= STATE ======================= */
  var mode = "vuln";
  var vStage = 0;
  var sys = C.createSecureSystem();
  var sysSplit = C.createSecureSystem();
  var map1 = MapView($("map1"), $("status1"));
  var mapL = MapView($("mapL"), $("statusL"));
  var mapR = MapView($("mapR"), $("statusR"));
  buildGates($("gates"));
  buildGates($("gatesR"));

  // secured-mode presentation state
  var sec = { preset: null, step: 0, tampered: {}, blocked: null, changed: null, shownLog: 0, custom: false, results: [] };
  var splitStep = 0;

  /* ======================= VULNERABLE MODE ======================= */
  // Ports of the two programs live in js/core.js; the tests compare them with the Python.
  var ATTACKER = C.ATTACKER;
  var VULN = C.runVulnerableAttack();

  var LAST_V = VSTAGES.length - 1;
  function vIndex(id) { for (var i = 0; i < VSTAGES.length; i++) if (VSTAGES[i].id === id) return i; }
  var ATTEMPT_AT = vIndex("attempt"), ATTACK_AT = vIndex("success"), HAZARD_AT = vIndex("impact");

  function sceneVuln(s) {
    var planned = { a: P.GS, b: P.POINT_A, tone: s >= ATTACK_AT ? "faint" : "ok" };
    if (s < ATTACK_AT) return {
      uav: { x: MID.x, y: MID.y, alt: 100 }, paths: [planned],
      notice: s === ATTEMPT_AT ? "⚠ New login: operator (shared account)" : null,
      status: { tone: "ok", text: "En route to POINT_A · 100 m · 10 m/s" }
    };
    var sc = {
      uav: { x: CRASH.x, y: CRASH.y, alt: 30 },
      paths: [planned, { a: MID, b: P.UNKNOWN_POINT, tone: "bad" }],
      notice: s === ATTACK_AT ? "⚠ Ground-station link lost briefly" : null,
      status: { tone: "bad", text: "Rerouted to UNKNOWN_POINT · descending to 30 m" }
    };
    if (s >= HAZARD_AT) {
      sc.hazard = true;
      sc.banner = { tone: "bad", text: "⚠ COLLISION WARNING", sub: "UAV at 30 m · tower is 45 m" };
      sc.status = { tone: "bad", text: "Inside the hazard zone below safe altitude: crash or injury possible" };
    }
    return sc;
  }

  function vulnExtra(id) {
    if (id === "intro") return '<div class="card">' + rowsTable([
      ["Ground-control station", "one shared <code>operator</code> login for the whole team"],
      ["Mission file", "destination · altitude · speed"],
      ["UAV", "flies whatever the mission file says"],
      ["Maintenance laptops", "connect straight to the UAVs"]], "sum") + "</div>";
    if (id === "analysis") return '<div class="card">' + rowsTable([
      ["Asset", "UAV mission plan (destination, altitude, speed)"],
      ["Threat", "attacker using a compromised operator account"],
      ["Vulnerability", "shared accounts, no MFA, no authorization or integrity check, no audit log"],
      ["Attack", "unauthorized change of the mission plan"],
      ["Impact", "wrong destination or unsafe altitude → collision, crash or injury", "bad-t"],
      ["CIA affected", "<b>Integrity</b> and <b>Availability</b>", "bad-t"]], "sum") + "</div>";
    if (id === "chain") {
      var steps = [["Threat", "Attacker"], ["Vulnerability", "Shared accounts + no MFA"], ["Asset", "Mission plan"],
                   ["Attack", "Unauthorized change"], ["Impact", "Crash or injury"]];
      return '<div class="cchain">' + steps.map(function (st, i) {
        return (i ? '<div class="carrow chain-item">↓</div>' : "") +
          '<div class="cstep chain-item' + (i === 4 ? " cimpact" : "") + '"><span class="lab">' + st[0] + "</span>" + st[1] + "</div>";
      }).join("") + "</div>";
    }
    if (id === "asset") return '<div class="card"><table class="t"><thead><tr><th>Field</th><th>Before</th><th>After</th></tr></thead><tbody>' +
      Object.keys(INITIAL).map(function (k) {
        var ch = VULN.changed[k];
        return "<tr><td>" + k + "</td><td>" + esc(INITIAL[k]) + "</td><td" + (ch ? ' class="bad-t"><b>' + esc(ch[1]) + "</b>" : ">" + esc(INITIAL[k])) + "</td></tr>";
      }).join("") + "</tbody></table>" +
      '<p class="muted" style="margin:.5rem 0 0">This diff exists only because we printed the mission before and after. The system itself noticed nothing.</p></div>';
    if (id === "impact") return '<ul class="impact">' +
      "<li><b>Wrong destination</b>: the UAV leaves its approved corridor</li>" +
      "<li><b>30 m altitude</b>: below the safe band, under the 45 m tower</li>" +
      "<li><b>Possible collision</b>: crash, damage or injury</li>" +
      "<li><b>CIA affected</b>: Integrity (plan changed) and Availability (UAV and mission lost)</li></ul>";
    if (id === "result") {
      var ok = VULN.attack_successful;
      return '<div class="verdict ' + (ok ? "bad" : "ok") + '">' + (ok ? "ATTACK SUCCESSFUL" : "ATTACK FAILED") +
        "<small>attack_successful = " + (ok ? "True" : "False") + "</small></div>" +
        '<div class="card">' + rowsTable([
          ["Attacker account", "operator (shared, stolen)"],
          ["Target", "mission plan"],
          ["Authentication", VULN.authenticated ? "PASSED (password only)" : "FAILED", VULN.authenticated ? "warn-t" : ""],
          ["MFA", "MISSING", "bad-t"],
          ["Authorization check", "MISSING", "bad-t"],
          ["Integrity check", "MISSING", "bad-t"],
          ["Changes", changesText(VULN.changed), "bad-t"],
          ["Attack successful", ok ? "True" : "False", ok ? "bad-t" : "ok-t"],
          ["CIA impact", "INTEGRITY, AVAILABILITY", "bad-t"]], "sum") + "</div>";
    }
    if (id === "investigation") {
      var rows = [
        ["Who modified it?", "no", "No"], ["When was it modified?", "no", "No"],
        ["What was changed?", "part", "Yes, only by comparing printed missions"],
        ["Was it authorized?", "no", "No"], ["Was integrity violated?", "no", "No"],
        ["Was it detected?", "no", "No"], ["Was it logged?", "no", "No"]
      ];
      return '<div class="card"><table class="t"><thead><tr><th>Can the system tell…</th><th>Answer</th></tr></thead><tbody>' +
        rows.map(function (r) { return "<tr><td>" + r[0] + '</td><td class="yn ' + r[1] + '">' + r[2] + "</td></tr>"; }).join("") +
        "</tbody></table></div>";
    }
    return "";
  }

  function renderVuln(t, animate) {
    var s = vStage, st = VSTAGES[s], id = st.id;
    showAlert(false);
    $("caption").innerHTML = '<div class="kicker">Vulnerable system · ' + st.k + "</div><h1>" + st.h + "</h1>" + st.b +
      '<p class="hint">' + (s < LAST_V ? "Press → for: " + VSTAGES[s + 1].h : "Press → to run the SAME attack on the secured system") + "</p>";
    setCode(st.code);

    var attacked = s >= ATTACK_AT;
    var annotate = {
      destination: { was: INITIAL.destination, tone: "bad", note: "no record of who" },
      altitude: { was: INITIAL.altitude, tone: "bad" }
    };
    renderMission($("mission"), attacked ? VULN.mission : INITIAL, attacked ? annotate : {});
    $("hash").innerHTML = '<div class="none">No trusted hash. The system never checks mission integrity.</div>';
    $("counters").innerHTML = "<span>No lockout: unlimited login attempts on the shared account.</span>";
    $("log").innerHTML = '<div class="empty">No audit log exists. Nothing is recorded: not the login, not the change.</div>';

    var showGates = id === "vuln" || id === "attempt" || id === "success";
    $("gates").hidden = !showGates;
    if (showGates) gatesAbsent($("gates"));
    $("request").hidden = !(id === "attempt" || id === "success");
    $("target").hidden = true;
    if (id === "attempt") {
      $("request").innerHTML = requestHtml("REQUEST", '<span class="fn">login</span>(' + pyArg(ATTACKER.user) + ", " + pyArg(ATTACKER.password) +
        ')  <span class="c"># stolen shared credentials</span>');
      setTarget("bad", "✔ LOGIN PASSED as operator<span class=\"sub\">Password only: no MFA asked, no lockout, no alert.</span>");
    }
    if (id === "success") {
      $("request").innerHTML = requestHtml("REQUEST", 'mission[<span class="s">"destination"</span>] = <span class="s">"UNKNOWN_POINT"</span><br>mission[<span class="s">"altitude"</span>] = <span class="n">30</span>');
    }
    $("extra").innerHTML = vulnExtra(id);

    if (id === "chain" && animate) {
      var items = $("extra").querySelectorAll(".chain-item"), k = 0;
      items.forEach(function (el) { el.classList.add("pending"); });
      var reveal = function () {
        if (k >= items.length) return Promise.resolve();
        items[k].classList.remove("pending"); k++;
        return pause(items[k - 1].classList.contains("carrow") ? 180 : 520, t).then(reveal);
      };
      map1.set(sceneVuln(s), 0);
      return reveal();
    }
    function finishSuccess() {
      setTarget("bad", "✔ Mission file overwritten<span class=\"sub\">No check, no alert, no log entry.</span>");
    }
    if (id === "success" && animate) {
      // show the pre-attack mission until the request has passed through
      renderMission($("mission"), INITIAL, {});
      map1.set(sceneVuln(ATTEMPT_AT), 0);
      var n = 1;
      var sweep = function () {
        if (n > 5) return Promise.resolve();
        setGate($("gates"), n, "absent checking", "not checked", "…");
        return pause(260, t).then(function () { setGate($("gates"), n, "absent", GATES[n - 1].absent, "MISSING"); n++; return sweep(); });
      };
      return sweep().then(function () {
        renderMission($("mission"), VULN.mission, annotate);
        finishSuccess();
        return map1.set(sceneVuln(s), 3200);
      }).then(function () { alive(t); });
    }
    if (id === "success") finishSuccess();
    return map1.set(sceneVuln(s), 0);
  }

  function goVuln(stage, animate) {
    run(function (t) { vStage = stage; updateControls(); return renderVuln(t, animate); });
  }

  /* ======================= SECURED MODE ======================= */
  function secCaption(extraHint) {
    var kicker, h, lead, hint = "";
    if (sec.custom) {
      kicker = "Secured system · custom request"; h = "Audience question";
      lead = "Runs on the current state: counters, log and mission carry over. Press <kbd>R</kbd> to reset.";
    } else if (sec.preset) {
      var p = PRESETS[sec.preset], st = p.steps[sec.step];
      kicker = "Secured system · scenario " + sec.preset + " of 7" + (st.label && !st.summary ? " · " + esc(st.label) : st.summary ? " · Attack result" : "");
      h = p.title; lead = p.lead;
      if (sec.step < p.steps.length - 1) hint = "Press → for " + esc(p.steps[sec.step + 1].label.replace(/^(Step|Change|Attempt) \d of \d: /, ""));
      else if (sec.preset < 7) hint = "Press → for scenario " + (sec.preset + 1) + " (" + SHORT[sec.preset + 1] + ")";
      else hint = "Press → for the comparison";
    } else {
      kicker = "Secured system"; h = "Every request passes five gates";
      lead = "Pick a scenario with <kbd>1</kbd>–<kbd>7</kbd>, or <kbd>F</kbd> for a custom request.";
      hint = "Press → to replay the same attack (scenario 1)";
    }
    $("caption").innerHTML = '<div class="kicker">' + kicker + "</div><h1>" + h + "</h1><p>" + lead + "</p>" +
      (extraHint || hint ? '<p class="hint">' + (extraHint || hint) + "</p>" : "");
  }

  function secureScene(match) {
    var m = sys.mission, dest = placeOf(m.destination), alt = Number(m.altitude) || 0;
    var sc = { uav: { x: P.GS.x, y: P.GS.y, alt: alt }, gaugeLabel: "PLANNED ALT.", uavText: " ",
               offmap: P[m.destination] ? null : String(m.destination) };
    if (sys.rejected) {
      sc.paths = [{ a: P.GS, b: dest, tone: "rejected" }];
      sc.banner = { tone: "bad", text: "MISSION REJECTED · NO FLIGHT", sub: "integrity check failed" };
      sc.status = { tone: "bad", text: "Launch refused until a trusted mission is restored and investigated" };
    } else if (!match) {
      sc.paths = [{ a: P.GS, b: dest, tone: "warn" }];
      sc.status = { tone: "warn", text: "Mission file changed outside change(). Not verified yet." };
    } else {
      sc.paths = [{ a: P.GS, b: dest, tone: "ok" }];
      sc.status = alt < 60
        ? { tone: "warn", text: "Approved plan: " + m.destination + " · " + alt + " m (below the safe band)" }
        : { tone: "ok", text: "Mission intact: " + m.destination + " · " + alt + " m · " + m.speed + " m/s, ready to launch" };
    }
    return sc;
  }

  function renderSecureState() {
    var ann = {};
    Object.keys(sec.tampered).forEach(function (f) { ann[f] = { was: sec.tampered[f], tone: "bad", note: "edited outside change()" }; });
    if (sec.changed) ann[sec.changed.field] = { was: sec.changed.old, tone: "ok", note: "by " + sec.changed.user };
    renderMission($("mission"), sys.mission, ann, sec.blocked);
    renderCounters($("counters"), sys);
    renderLog($("log"), sys.audit_log, sec.shownLog);
    sec.shownLog = sys.audit_log.length;
    return renderHash($("hash"), sys).then(function (match) { return map1.set(secureScene(match), 0); });
  }

  function secureIdle() {
    $("gates").hidden = false; $("request").hidden = false; $("target").hidden = true; $("extra").innerHTML = "";
    gatesIdle($("gates"));
    $("request").innerHTML = requestHtml("REQUEST", '<span class="c"># waiting for a request…</span>');
  }

  function setTarget(tone, html) { $("target").hidden = false; $("target").className = "target " + tone; $("target").innerHTML = html; }

  // run one change() call through the gates
  function showGatesView() {
    $("gates").hidden = false; $("request").hidden = false; $("extra").innerHTML = "";
  }
  function codeForTrace(tr) {
    var c = [["def change(", 1]];
    return c.concat(tr.ok ? [["if not verify():", 2], ["old_value = mission[field]", 5]] : GATE_CODE[tr.stoppedAt]);
  }
  function presetKind() { return sec.preset ? PRESETS[sec.preset].kind : null; }

  function doChange(args, t) {
    var user = args[0];
    var fb = sys.failCount(user);
    showGatesView();
    $("request").innerHTML = requestHtml("REQUEST", callHtml(args));
    $("target").hidden = true;
    showAlert(false);
    return sys.change.apply(null, args).then(function (ok) {
      var tr = sys.last; tr.failuresBefore = fb;
      sec.results.push({ ok: ok, tr: tr });
      return animateGates($("gates"), tr, t).then(function () {
        var kind = presetKind();
        setCode(codeForTrace(tr));
        sec.blocked = ok ? null : { field: tr.field, value: tr.value };
        sec.changed = ok ? { field: tr.field, old: tr.old, user: tr.user } : null;
        if (ok) setTarget("ok", (kind === "legit" ? "✔ LEGITIMATE CHANGE ALLOWED · " : "✔ ALLOWED · ") + esc(tr.field) + ": " + esc(C.pyDumps(tr.old)) + " → " + esc(C.pyDumps(tr.value)) +
          '<span class="sub">Logged as “changed”. New trusted hash recorded.</span>');
        else if (tr.stoppedAt === 5) { setTarget("bad", "✖ REJECTED at gate 5 · integrity check failed<span class=\"sub\">The mission file no longer matches its trusted hash. No flight.</span>"); showAlert(true); }
        else setTarget("bad", (kind === "attack" ? "✖ ATTACK BLOCKED" : kind === "misuse" ? "✖ UNAUTHORIZED CHANGE BLOCKED" : "✖ BLOCKED") +
          " at gate " + tr.stoppedAt + " · " + esc(tr.reason) +
          '<span class="sub">Mission unchanged. Attempt written to the audit log.</span>');
        return renderSecureState();
      });
    });
  }

  function doTamper(field, value) {
    showGatesView();
    setCode([["mission[\"altitude\"] = 30", 1]]);
    $("request").innerHTML = requestHtml("DIRECT FILE EDIT", 'mission[' + pyArg(field) + "] = " + pyArg(value) + '  <span class="c"># outside change()</span>');
    showAlert(false);
    if (!(field in sec.tampered)) sec.tampered[field] = field in sys.mission ? sys.mission[field] : null;
    sys.tamper(field, value);
    sec.blocked = null; sec.changed = null;
    gatesBypassed($("gates"));
    setGate($("gates"), 5, "", "not checked yet: nobody has called verify()", "");
    setTarget("warn", "⚠ File changed. No gate saw it and nothing was logged.<span class=\"sub\">But the current hash no longer matches the trusted hash.</span>");
    return renderSecureState();
  }

  function doVerify(t) {
    showGatesView();
    setCode([["def verify():", 7]]);
    $("request").innerHTML = requestHtml("PRE-FLIGHT CHECK", '<span class="fn">verify</span>()');
    $("target").hidden = true;
    showAlert(false);
    for (var n = 1; n <= 4; n++) setGate($("gates"), n, "skipped", "not involved in verify()", "");
    setGate($("gates"), 5, "checking", "hashing the mission…", "…");
    return sys.verify().then(function (valid) {
      return pause(GATE_MS * 2, t).then(function () {
        if (valid) {
          setGate($("gates"), 5, "pass", "mission hash matches trusted hash", "PASS");
          setTarget("ok", "✔ verify() returned True<span class=\"sub\">Mission is intact. Logged as integrity_check True.</span>");
        } else {
          setGate($("gates"), 5, "fail", failText({}, 5), "DENIED");
          setTarget("bad", "✖ TAMPERING DETECTED · SECURITY ALERT: MISSION REJECTED<span class=\"sub\">verify() returned False and the event is logged. The UAV does not launch.</span>");
          showAlert(true);
        }
        return renderSecureState();
      });
    });
  }

  // guide steps 16-17: let the program decide the result and summarize it
  function doSummary() {
    showAlert(false);
    $("gates").hidden = true; $("request").hidden = true; $("target").hidden = true;
    setCode([["# [guide] run the SAME attack", 10]]);
    var res = sec.results, tr = res[0].tr;
    var attack_successful = res.some(function (r) { return r.ok; });
    var denied = res.filter(function (r) { return !r.ok; }).length;
    var rows = [["Attacker account", "operator (shared, stolen)"]], stop = tr.stoppedAt || 6, later = [];
    for (var n = 1; n <= 5; n++) {
      if (n > stop) { later.push(GATES[n - 1].name); continue; }
      rows.push([GATES[n - 1].name, n < stop ? "PASSED" : "FAILED: " + esc(failText(tr, n)), n < stop ? "ok-t" : "bad-t"]);
    }
    if (later.length) rows.push([esc(later.join(", ")), "not reached", "muted"]);
    rows.push(["Unauthorized change", denied === res.length ? "DENIED (" + denied + " of " + res.length + ")" : "ALLOWED", denied === res.length ? "ok-t" : "bad-t"]);
    rows.push(["Mission", "unchanged: " + esc(C.pyDumps(sys.mission.destination)) + ", " + esc(sys.mission.altitude) + " m", "ok-t"]);
    rows.push(["Attack detected", "YES", "ok-t"]);
    rows.push(["Security logging", "YES (" + sys.audit_log.length + " events)", "ok-t"]);
    rows.push(["Attack successful", attack_successful ? "True" : "False", attack_successful ? "bad-t" : "ok-t"]);
    var stopName = tr.stoppedAt ? GATES[tr.stoppedAt - 1].name : "";
    $("extra").innerHTML = '<div class="verdict ' + (attack_successful ? "bad" : "ok") + '">' +
      (attack_successful ? "ATTACK SUCCESSFUL" : "ATTACK BLOCKED") + "<small>attack_successful = " + (attack_successful ? "True" : "False") + "</small></div>" +
      '<div class="chain defense"><span>operator</span><b>→</b><span class="ok">Network rule: PASS</span><b>→</b>' +
      '<span class="bad">' + esc(stopName) + ': FAIL</span><b>→</b><span class="bad">ACCESS DENIED</span><b>→</b><span class="ok">event logged</span></div>' +
      '<div class="card">' + rowsTable(rows, "sum") + "</div>";
    return renderSecureState();
  }

  function doStep(t) {
    var st = PRESETS[sec.preset].steps[sec.step];
    secCaption();
    if (st.summary) return doSummary();
    if (st.call) return doChange(st.call, t);
    if (st.tamper) return doTamper(st.tamper[0], st.tamper[1]);
    return doVerify(t);
  }

  function resetSecure() {
    showAlert(false);
    sec = { preset: null, step: 0, tampered: {}, blocked: null, changed: null, shownLog: 0, custom: false, results: [] };
    return sys.reset().then(function () { secureIdle(); secCaption(); return renderSecureState(); });
  }

  function runPreset(n) {
    interrupt();
    if (mode !== "secure") setMode("secure", true);
    run(function (t) {
      return resetSecure().then(function () {
        alive(t);
        sec.preset = n; sec.step = 0;
        updateControls();
        return doStep(t);
      });
    });
  }

  function enterSecure() {
    return sys.ready.then(function () {
      secCaption();
      secureIdle();
      return renderSecureState();
    });
  }

  /* ======================= SPLIT MODE ======================= */
  function secureFlyScene(pos, done) {
    return { uav: { x: pos.x, y: pos.y, alt: 100 }, paths: [{ a: P.GS, b: P.POINT_A, tone: "ok" }],
             status: { tone: "ok", text: done ? "Arrived at POINT_A · 100 m · mission intact" : "En route to POINT_A · 100 m · 10 m/s" } };
  }
  function renderSplit(t) {
    var s = splitStep;
    $("splitCap").innerHTML = "<h1>" + SPLIT_CAP[s][0] + "</h1><p>" + SPLIT_CAP[s][1] + "</p>";
    showAlert(false);
    if (s === 0) {
      return sysSplit.reset().then(function () {
        mapL.set(sceneVuln(0), 0);
        mapR.set(secureFlyScene(MID, false), 0);
        $("requestL").innerHTML = requestHtml("REQUEST", '<span class="c"># waiting for the attacker…</span>');
        renderMission($("missionL"), INITIAL, {});
        renderMission($("missionR"), sysSplit.mission, {});
        gatesIdle($("gatesR"));
        $("outcomeL").innerHTML = ""; $("outcomeR").innerHTML = "";
      });
    }
    if (s === 1) {
      $("requestL").innerHTML = requestHtml("REQUEST", '<span class="fn">login</span>(' + pyArg(ATTACKER.user) + ", " + pyArg(ATTACKER.password) + '); mission[<span class="s">"destination"</span>] = <span class="s">"UNKNOWN_POINT"</span>; mission[<span class="s">"altitude"</span>] = <span class="n">30</span>');
      var left = pause(900, t).then(function () {
        renderMission($("missionL"), assign(INITIAL, C.ATTACK), {
          destination: { was: INITIAL.destination, tone: "bad" }, altitude: { was: INITIAL.altitude, tone: "bad" } });
        $("outcomeL").innerHTML = '<div class="target bad">✔ Applied<span class="sub">no check · no log</span></div>';
        return mapL.set(sceneVuln(ATTACK_AT), 3200);
      });
      var attempt = function (field, value) {
        var fb = sysSplit.failCount(ATTACKER.user);
        return sysSplit.change(ATTACKER.user, ATTACKER.password, ATTACKER.mfa, field, value).then(function () {
          var tr = sysSplit.last; tr.failuresBefore = fb;
          return animateGates($("gatesR"), tr, t).then(function () {
            renderMission($("missionR"), sysSplit.mission, {}, { field: field, value: value });
            $("outcomeR").innerHTML = '<div class="target ok">✖ Blocked at gate ' + tr.stoppedAt + '<span class="sub">' +
              sysSplit.audit_log.length + " events logged</span></div>";
          });
        });
      };
      var right = attempt("destination", "UNKNOWN_POINT")
        .then(function () { return pause(400, t); })
        .then(function () { return attempt("altitude", 30); })
        .then(function () { return mapR.set(secureFlyScene(P.POINT_A, false), 2600); });
      // wait for both sides even when cancelled, so nothing touches sysSplit afterwards
      function settle(p) { return p.catch(function (e) { return e; }); }
      return Promise.all([settle(left), settle(right)]).then(function () { alive(t); });
    }
    mapL.set(sceneVuln(HAZARD_AT), 0);
    mapR.set(secureFlyScene(P.POINT_A, true), 0);
    $("outcomeL").innerHTML = outcomeTable([["Detected?", "no", "No"], ["Logged?", "no", "No"], ["Who?", "no", "Unknown"]]);
    $("outcomeR").innerHTML = outcomeTable([["Detected?", "yes", "Yes"], ["Logged?", "yes", "Yes (" + sysSplit.audit_log.length + ")"], ["Who?", "yes", "operator (stolen)"]]);
    return Promise.resolve();
  }
  function goSplit(step) { run(function (t) { splitStep = step; updateControls(); return renderSplit(t); }); }

  /* ======================= MODES + CONTROLS ======================= */
  function setMode(m, silent) {
    interrupt();
    mode = m;
    $("app").className = "mode-" + m;
    $("single").hidden = !(m === "vuln" || m === "secure");
    $("split").hidden = m !== "split";
    $("summary").hidden = m !== "summary";
    document.querySelectorAll(".modes button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.mode === m)); });
    showAlert(false);
    if (CONTEXT[m]) $("context").innerHTML = CONTEXT[m];
    renderCode();
    updateControls();
    if (silent) return;
    if (m === "vuln") run(function (t) { return renderVuln(t, false); });
    if (m === "secure") run(function () { return enterSecure(); });
    if (m === "split") goSplit(0);
  }

  var autoTimer = null;
  function stopAuto() { if (autoTimer) { clearInterval(autoTimer); autoTimer = null; } }
  function toggleAuto() {
    if (autoTimer) { stopAuto(); updateControls(); return; }
    if (mode !== "vuln") setMode("vuln");
    if (vStage >= LAST_V) goVuln(0, false);
    autoTimer = setInterval(function () {
      if (busy) return;
      if (vStage >= LAST_V) { stopAuto(); updateControls(); return; }
      goVuln(vStage + 1, true);
    }, 4200);
    updateControls();
  }

  function next() {
    if (busy) {   // first press finishes the running animation, the next one advances
      hurry = true;
      [map1, mapL, mapR].forEach(function (m) { m.finish(); });
      $("extra").querySelectorAll(".pending").forEach(function (el) { el.classList.remove("pending"); });
      return;
    }
    if (mode === "vuln") {
      if (vStage < LAST_V) goVuln(vStage + 1, true);
      else runPreset(1);
    } else if (mode === "secure") {
      if (sec.preset && sec.step < PRESETS[sec.preset].steps.length - 1) {
        run(function (t) { sec.step++; updateControls(); return doStep(t); });
      } else if (!sec.preset || sec.custom) runPreset(1);
      else if (sec.preset < 7) runPreset(sec.preset + 1);
      else setMode("summary");
    } else if (mode === "split") {
      if (splitStep < 2) goSplit(splitStep + 1);
      else setMode("summary");
    }
  }
  function prev() {
    if (mode === "vuln" && vStage > 0) { interrupt(); goVuln(vStage - 1, false); }
    else if (mode === "split") { interrupt(); goSplit(0); }
  }
  function reset() {
    interrupt();
    if (mode === "vuln") goVuln(0, false);
    else if (mode === "secure") run(function () { return resetSecure().then(updateControls); });
    else if (mode === "split") goSplit(0);
  }
  function verifyNow() {
    interrupt();
    if (mode !== "secure") setMode("secure", true);
    run(function (t) {
      return sys.ready.then(function () {
        sec.custom = true; sec.preset = null; secCaption();
        $("gates").hidden = false; $("request").hidden = false; $("extra").innerHTML = "";
        return doVerify(t);
      });
    });
  }

  function updateControls() {
    var h = "";
    if (mode === "vuln") {
      var dots = "";
      for (var i = 0; i <= LAST_V; i++) dots += '<span class="dot' + (i < vStage ? " done" : "") + (i === vStage ? " on" : "") + '"></span>';
      h = '<button data-act="prev"' + (vStage === 0 ? " disabled" : "") + '>◀ Back</button>' +
          '<button data-act="next" class="primary">' + (vStage < LAST_V ? "Next ▶" : "Same attack, secured ▶") + "</button>" +
          '<button data-act="auto"' + (autoTimer ? ' class="on"' : "") + ">" + (autoTimer ? "■ Stop" : "▶ Auto-play") + " <kbd>A</kbd></button>" +
          '<button data-act="reset">Reset <kbd>R</kbd></button>' +
          '<button data-act="code"' + (codeOpen ? ' class="on"' : "") + '><kbd>K</kbd> Code</button><div class="dots" title="stage">' + dots + "</div>";
    } else if (mode === "secure") {
      for (var n = 1; n <= 7; n++) h += '<button data-preset="' + n + '"' + (sec.preset === n ? ' class="on"' : "") + "><kbd>" + n + "</kbd> " + SHORT[n] + "</button>";
      h += '<span class="sep"></span><button data-act="code"' + (codeOpen ? ' class="on"' : "") + '><kbd>K</kbd> Code</button><button data-act="custom"><kbd>F</kbd> Custom</button><button data-act="verify"><kbd>I</kbd> verify()</button>' +
           '<button data-act="reset"><kbd>R</kbd> Reset</button><button data-act="next" class="primary">Next ▶</button>';
    } else if (mode === "split") {
      h = '<button data-act="next" class="primary">' + (splitStep < 2 ? "Next ▶" : "Comparison ▶") + '</button><button data-act="reset">Reset <kbd>R</kbd></button>' +
          '<span class="note">Both sides run the same attack. The secured side uses its own copy of the system.</span>';
    } else {
      h = '<button data-mode-go="vuln"><kbd>V</kbd> Vulnerable</button><button data-mode-go="secure"><kbd>S</kbd> Secured</button>' +
          '<span class="note">All data is fictional. Nothing leaves this computer.</span>';
    }
    $("controls").innerHTML = h;
  }

  $("controls").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    b.blur();
    if (b.dataset.preset) return runPreset(Number(b.dataset.preset));
    if (b.dataset.modeGo) return setMode(b.dataset.modeGo);
    ({ next: next, prev: prev, auto: toggleAuto, reset: reset, custom: openCustom, verify: verifyNow, code: toggleCode })[b.dataset.act]();
  });
  document.querySelector(".modes").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    b.blur();
    setMode(b.dataset.mode);
  });

  /* ---- custom request dialog ---- */
  var dlg = $("dlg"), form = $("dlgForm");
  function openCustom() {
    stopAuto();
    if (mode !== "secure") setMode("secure");
    dlg.returnValue = "";
    if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
    form.elements.user.focus();
    form.elements.user.select();
  }
  $("dlgCancel").addEventListener("click", function () { dlg.close("cancel"); });
  dlg.addEventListener("close", function () {
    if (dlg.returnValue !== "run") return;
    var f = form.elements;
    var raw = f.value.value.trim();
    var value = /^-?\d+$/.test(raw) ? parseInt(raw, 10) : f.value.value;
    var field = f.field.value.trim();
    var direct = f.direct.checked;
    var args = [f.user.value.trim(), f.password.value, f.mfa.value.trim(), field, value, f.source.value.trim() || "operator"];
    interrupt();
    run(function (t) {
      return sys.ready.then(function () {
        sec.custom = true; sec.preset = null; secCaption();
        $("gates").hidden = false; $("request").hidden = false; $("extra").innerHTML = "";
        updateControls();
        return direct ? doTamper(field, value) : doChange(args, t);
      });
    });
  });

  /* ---- keyboard ---- */
  document.addEventListener("keydown", function (e) {
    if (dlg.open || e.ctrlKey || e.metaKey || e.altKey) return;
    var tag = e.target && e.target.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
    var k = e.key, handled = true;
    if (k === "ArrowRight" || k === " " || k === "PageDown") next();
    else if (k === "ArrowLeft" || k === "PageUp") prev();
    else if (k === "r" || k === "R") reset();
    else if (k === "v" || k === "V") setMode("vuln");
    else if (k === "s" || k === "S") setMode("secure");
    else if (k === "b" || k === "B") setMode("split");
    else if (k === "c" || k === "C") setMode("summary");
    else if (k === "a" || k === "A") toggleAuto();
    else if (k === "f" || k === "F") openCustom();
    else if (k === "k" || k === "K") toggleCode();
    else if (k === "i" || k === "I") verifyNow();
    else if (/^[1-7]$/.test(k)) runPreset(Number(k));
    else if (k === "Escape") showAlert(false);
    else handled = false;
    if (handled) e.preventDefault();
  });

  setMode("vuln");
})();
