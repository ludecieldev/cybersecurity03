/* Top-down mission map and altitude gauge (SVG). Used by js/app.js. */
var UAVMap = (function () {
  "use strict";

  /* ======================= MAP ======================= */
  var P = {
    GS: { x: 100, y: 400 },
    POINT_A: { x: 548, y: 92 },
    POINT_B: { x: 560, y: 382 },
    UNKNOWN_POINT: { x: 250, y: 112 }
  };
  var TOWER = { x: 286, y: 140 };
  var OFFMAP = { x: 390, y: 60 };
  function lerp(a, b, k) { return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }; }
  var MID = lerp(P.GS, P.POINT_A, 0.45);          // where the UAV is when the attack lands
  var CRASH = lerp(MID, P.UNKNOWN_POINT, 0.6);   // inside the hazard zone, next to the tower
  function placeOf(dest) { return P[dest] || OFFMAP; }
  function altY(a) { return 440 - Math.max(0, Math.min(125, a)) / 120 * 360; }

  var mapCount = 0;
  function mapSvg() {
    var u = ++mapCount, trees = "", ticks = "";
    for (var i = 0; i < 11; i++) trees += '<circle cx="' + (104 + i * 19) + '" cy="' + (244 + (i % 2) * 7) + '" r="10"/>';
    [0, 30, 45, 60, 90, 120].forEach(function (a) {
      var y = altY(a);
      ticks += '<g class="g-tick' + (a === 30 ? " hz" : "") + '"><line x1="692" x2="700" y1="' + y + '" y2="' + y + '"/>' +
        '<text x="688" y="' + (y + 5) + '" text-anchor="end">' + a + '</text></g>';
    });
    return '' +
'<svg class="mapsvg" viewBox="0 0 800 480" role="img" aria-label="Top-down mission map with an altitude gauge">' +
' <defs><pattern id="grid' + u + '" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="var(--grid)" stroke-width="1.5"/></pattern></defs>' +
' <rect width="640" height="480" rx="14" fill="var(--mapbg)"/><rect width="640" height="480" rx="14" fill="url(#grid' + u + ')"/>' +
' <path d="M0 330 C 140 300, 250 370, 390 318 S 590 262, 640 276" fill="none" stroke="var(--river)" stroke-width="16" stroke-linecap="round"/>' +
' <g fill="var(--tree)">' + trees + '</g><text x="100" y="226" class="m-small">tree line · 25 m</text>' +
' <g class="zone"><circle class="hazard" cx="' + TOWER.x + '" cy="' + TOWER.y + '" r="66"/>' +
'  <circle class="ring" cx="' + TOWER.x + '" cy="' + TOWER.y + '" r="40"/></g>' +
' <text x="' + TOWER.x + '" y="' + (TOWER.y - 76) + '" class="m-hz" text-anchor="middle">HAZARD ZONE</text>' +
' <g class="tower" transform="translate(' + TOWER.x + ' ' + TOWER.y + ')"><path d="M-11 18 L0 -24 L11 18 M-7 2 H7 M-9 10 H9 M-4.5 -8 H4.5"/><circle cy="-27" r="4.5" class="beacon"/></g>' +
' <text x="' + (TOWER.x + 20) + '" y="' + (TOWER.y - 14) + '" class="m-small hz">tower 45 m</text>' +
' <g class="routes"></g>' +
' <g class="wp" transform="translate(' + P.POINT_A.x + ' ' + P.POINT_A.y + ')"><circle r="13"/><circle r="4.5" class="dotc"/></g>' +
' <text x="' + P.POINT_A.x + '" y="' + (P.POINT_A.y - 24) + '" class="m-label" text-anchor="middle">POINT_A</text>' +
' <g class="wp" transform="translate(' + P.POINT_B.x + ' ' + P.POINT_B.y + ')"><circle r="13"/><circle r="4.5" class="dotc"/></g>' +
' <text x="' + P.POINT_B.x + '" y="' + (P.POINT_B.y + 40) + '" class="m-label" text-anchor="middle">POINT_B</text>' +
' <g class="wp bad" transform="translate(' + P.UNKNOWN_POINT.x + ' ' + P.UNKNOWN_POINT.y + ')"><circle r="13"/><circle r="4.5" class="dotc"/></g>' +
' <text x="16" y="' + (P.UNKNOWN_POINT.y + 7) + '" class="m-label hz">UNKNOWN_POINT</text>' +
' <g class="offmap hide" transform="translate(' + OFFMAP.x + ' ' + OFFMAP.y + ')"><circle r="16"/><text y="7" text-anchor="middle">?</text><text class="offname" x="24" y="7"></text></g>' +
' <g class="pad" transform="translate(' + P.GS.x + ' ' + P.GS.y + ')"><rect x="-20" y="-20" width="40" height="40" rx="6"/><path d="M-8 8 L0 -8 L8 8 M0 -8 V-16"/></g>' +
' <text x="14" y="' + (P.GS.y + 56) + '" class="m-label">GROUND STATION</text>' +
' <g class="uav"><circle class="ring" r="32"/><g class="drone"><path d="M-13 -13 L13 13 M-13 13 L13 -13"/>' +
'  <circle cx="-13" cy="-13" r="8"/><circle cx="13" cy="-13" r="8"/><circle cx="-13" cy="13" r="8"/><circle cx="13" cy="13" r="8"/>' +
'  <rect x="-7" y="-7" width="14" height="14" rx="3"/></g><text class="uav-alt" y="42" text-anchor="middle"></text></g>' +
' <g class="notice hide"><rect x="262" y="428" width="366" height="40" rx="8"/><text x="445" y="454" text-anchor="middle"></text></g>' +
' <g class="banner hide"><rect x="40" y="276" width="560" height="86"/><text class="b1" x="320" y="314" text-anchor="middle"></text><text class="b2" x="320" y="346" text-anchor="middle"></text></g>' +
' <g class="gauge">' +
'  <text x="725" y="22" text-anchor="middle" class="g-title">ALTITUDE</text>' +
'  <text x="725" y="56" text-anchor="middle" class="g-read"></text>' +
'  <rect x="700" y="' + altY(120) + '" width="30" height="' + (altY(60) - altY(120)) + '" class="band-safe"/>' +
'  <rect x="700" y="' + altY(60) + '" width="30" height="' + (altY(45) - altY(60)) + '" class="band-warn"/>' +
'  <rect x="700" y="' + altY(45) + '" width="30" height="' + (altY(0) - altY(45)) + '" class="band-bad"/>' +
'  <text transform="translate(720 ' + (altY(90) + 2) + ') rotate(-90)" text-anchor="middle" class="g-band">SAFE ≥ 60 m</text>' +
'  <text transform="translate(720 ' + altY(22) + ') rotate(-90)" text-anchor="middle" class="g-band">HAZARD</text>' +
    ticks +
'  <line class="g-ground" x1="650" x2="800" y1="440" y2="440"/>' +
'  <g class="tower"><path d="M758 440 L772 ' + altY(45) + ' L786 440 M763 400 H781 M767 360 H777"/><circle cx="772" cy="' + (altY(45) - 5) + '" r="4.5" class="beacon"/></g>' +
'  <text x="772" y="' + (altY(45) - 16) + '" text-anchor="middle" class="m-small hz">45 m</text>' +
'  <g fill="var(--tree)"><ellipse cx="746" cy="' + ((altY(25) + 430) / 2) + '" rx="9" ry="' + ((430 - altY(25)) / 2) + '"/></g>' +
'  <g class="g-marker"><line x1="732" x2="796"/><path d="M748 -9 L732 0 L748 9 Z"/></g>' +
' </g>' +
'</svg>';
  }

  // isHurry(): true when the presenter asked to skip the running animation
  function MapView(host, statusEl, isHurry) {
    host.innerHTML = mapSvg();
    var svg = host.querySelector("svg");
    function q(s) { return svg.querySelector(s); }
    var uav = q(".uav"), uavTxt = q(".uav-alt"), routes = q(".routes"), marker = q(".g-marker"),
        readout = q(".g-read"), gTitle = q(".g-title"), notice = q(".notice"), banner = q(".banner"), offmap = q(".offmap");
    var cur = { x: P.GS.x, y: P.GS.y, alt: 0 }, scene = null, animId = 0, target = null;

    function draw() {
      uav.setAttribute("transform", "translate(" + cur.x.toFixed(1) + " " + cur.y.toFixed(1) + ")");
      var a = Math.round(cur.alt);
      uavTxt.textContent = scene && scene.uavText ? scene.uavText : a + " m";
      marker.setAttribute("transform", "translate(0 " + altY(cur.alt).toFixed(1) + ")");
      gTitle.textContent = scene && scene.gaugeLabel ? scene.gaugeLabel : "UAV ALTITUDE";
      readout.textContent = a + " m";
      readout.setAttribute("class", "g-read " + (cur.alt >= 60 ? "ok" : cur.alt >= 45 ? "warn" : "bad"));
    }
    function line(r) {
      var s = '<line class="route ' + r.tone + '" x1="' + r.a.x + '" y1="' + r.a.y + '" x2="' + r.b.x + '" y2="' + r.b.y + '"/>';
      if (r.tone === "rejected") {
        var m = lerp(r.a, r.b, 0.5);
        s += '<path class="xmark" d="M' + (m.x - 14) + ' ' + (m.y - 14) + ' l28 28 m0 -28 l-28 28"/>';
      }
      return s;
    }
    function set(sc, ms) {
      scene = sc;
      routes.innerHTML = (sc.paths || []).map(line).join("");
      svg.classList.toggle("alarm", !!sc.hazard);
      notice.classList.toggle("hide", !sc.notice);
      if (sc.notice) notice.querySelector("text").textContent = sc.notice;
      banner.classList.toggle("hide", !sc.banner);
      banner.classList.remove("ok", "bad");
      if (sc.banner) {
        banner.classList.add(sc.banner.tone);
        banner.querySelector(".b1").textContent = sc.banner.text;
        banner.querySelector(".b2").textContent = sc.banner.sub || "";
      }
      offmap.classList.toggle("hide", !sc.offmap);
      if (sc.offmap) offmap.querySelector(".offname").textContent = sc.offmap;
      if (statusEl) {
        statusEl.className = "flight-status " + (sc.status ? sc.status.tone : "");
        statusEl.textContent = sc.status ? sc.status.text : "";
      }
      var from = { x: cur.x, y: cur.y, alt: cur.alt }, to = sc.uav, id = ++animId;
      target = to;
      if (!ms || (isHurry && isHurry())) { cur = { x: to.x, y: to.y, alt: to.alt }; draw(); return Promise.resolve(); }
      return new Promise(function (res) {
        var t0 = null;
        function frame(now) {
          if (id !== animId) return res();
          if (t0 === null) t0 = now;
          var k = Math.min(1, (now - t0) / ms);
          var e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
          cur = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, alt: from.alt + (to.alt - from.alt) * e };
          draw();
          if (k < 1) requestAnimationFrame(frame); else res();
        }
        requestAnimationFrame(frame);
      });
    }
    return {
      set: set,
      cancel: function () { animId++; },
      finish: function () { animId++; if (target) { cur = { x: target.x, y: target.y, alt: target.alt }; draw(); } }
    };
  }

  return { P: P, MID: MID, CRASH: CRASH, lerp: lerp, placeOf: placeOf, MapView: MapView };
})();
