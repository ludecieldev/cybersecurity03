# UAV Mission Tampering Demo (Team T4, Case Study 3)

This folder has everything for the live part of our presentation:
- **`attack_simulation.py`** and **`secure_solution.py`**: our Python code from the answer sheet, which we run live.
- **`index.html`** (with `css/` and `js/`): a visualization of the same logic. It shows the attack succeeding against the vulnerable system, then the **same** attack failing against our secure solution.

Everything is a local simulation with fictional data. The page makes no network requests.

## Launch

- **Python:** `python3 attack_simulation.py`, then `python3 secure_solution.py`.
- **Page:** double-click `index.html`. It opens in Chrome, Edge or Firefox with no install, internet access, or server. Copy the whole folder to the presentation PC: the page needs `css/` and `js/` next to it. Press **F11** for full screen. The layout fits 1920×1080 and 1280×720.

## Files

| File | What it is |
|---|---|
| `index.html` | Page markup only |
| `css/style.css` | Dark, projector-friendly theme |
| `js/core.js` | Ports of `secure_solution.py` (five checks, SHA-256, audit log) and `attack_simulation.py`. No DOM, so the tests load it directly. |
| `js/content.js` | **All wording:** stage texts, scenarios 1–7, captions, and which Python lines to highlight. Edit text here. |
| `js/ui.js` | HTML helpers: gates, mission file, audit log, hashes, tables |
| `js/map.js` | Top-down map and altitude gauge (SVG) |
| `js/app.js` | Flow only: modes, stepping, animation queue, controls, keyboard |
| `js/python-sources.js` | **Generated.** Our Python for the code panel (key K) |
| `tools/embed_python.py` | Regenerates `js/python-sources.js` |
| `tests/core.test.js` | Checks the page logic against the Python |

The scripts are plain `<script>` tags, not ES modules. Browsers block modules on a double-clicked (`file://`) page, and this page has to work without a server.

## Run order (follows the Presentation Guide, sections 2 and 27)

Press **→** (or Space, or a presentation clicker) to go through the page. If you press → while an animation is running, it finishes the animation first. Press **K** at any time to show our Python next to the visualization, with the lines used in the current step highlighted.

| Guide step | What to do | What the audience sees |
|---|---|---|
| 1. Scenario | Page opens in **Vulnerable** mode, on "The system". | The system, its lab conditions, and the UAV en route to POINT_A. |
| 2. Asset, threat, vulnerability | **→** | Security-analysis table: asset, threat, vulnerability, attack, impact, CIA. |
| 3. Attack chain | **→** | Threat → Vulnerability → Asset → Attack → Impact, appearing box by box. |
| 4. Explain the attack code | **K** | `attack_simulation.py`, with the lines for each step highlighted. |
| 5. Run the attack | Run `python3 attack_simulation.py`, then **→** through stages 1–5 on the page. | The login with the stolen shared account `operator` / `shared-pass`, the mission overwritten with no gate checking it, and the UAV rerouting to UNKNOWN_POINT at 30 m (below the 45 m tower) with a collision warning. |
| 6. Why it succeeded | **→** | ATTACK SUCCESSFUL, decided by the program from the before/after mission, plus the attack summary. **→** again for the investigation: every answer is No. |
| 7–8. Security controls, defense code | **→** switches to **Secured** mode. Then **K**. | The five gates (network, account, password + MFA, RBAC, integrity) and `secure_solution.py`. |
| 9. Run the SAME attack again | Run `python3 secure_solution.py`. On the page, press **→** twice. | Scenario 1: same attacker, same stolen credentials, same two changes. Both are stopped at the account gate, because the shared account no longer exists, and both are logged. |
| 10–11. Why it's blocked, logs | **→** | ATTACK BLOCKED, with the gate-by-gate summary and the audit log. |
| Normal users still work | **2** (then → → →), **4**, **5**, **6** (then →) | Lockout after 3 failures, the RBAC block, the legit change being **allowed**, and tampering caught by `verify()`. |
| 12. Before vs. after | **B**, then **→ →** | Side by side: the same attack crashes the vulnerable UAV, while the secured one reaches POINT_A. |
| 13. Recommendations | **C** | The comparison table and the five recommendations. |

Optional extras:
- **3** shows the old account being rejected.
- **7** shows the maintenance-laptop path being denied at gate 1.
- **F** opens a custom request form for audience questions.

## Keys

| Key | Action |
|-----|--------|
| → / Space / PageDown | Next step (finishes a running animation first) |
| ← / PageUp | Previous stage (vulnerable mode) |
| K | Show or hide our Python, with the current lines highlighted |
| R | Reset the current view (mission, trusted hash, failure counters, audit log) |
| 1–7 | Run a secured-mode scenario |
| V / S / B / C | Vulnerable / Secured / Side by side / Comparison |
| A | Auto-play the vulnerable stages |
| F | Custom request form |
| I | Run `verify()` on the current secured state |

## Good to know

- **Each scenario (1–7) starts from a fresh system,** so the demo is identical every time.
- **The custom request (F) runs on the current state.** Fictional accounts: `pilot01 / pilot-pass / 246810` (pilot), `mission_manager / manager-pass / 135790` (manager), `old_operator / old-pass / 111111` (disabled). The attacker's stolen shared account is `operator / shared-pass`.
- **Deterministic.** Nothing is random. Only the audit-log timestamps change, because they are the real UTC time, as in the Python.

## What changed in our Python for the guide

Lines marked `# [guide]` were added. Everything else is the answer-sheet code unchanged, except one line in `attack_simulation.py` (see below).

`attack_simulation.py`:
- It now models the shared account and the login, with password only and no MFA.
- The program decides the result itself: ATTACK SUCCESSFUL / FAILED (guide section 11).
- It prints the attack summary (guide section 12).
- The changed line: `print("ATTACK SUCCEEDED:", mission)` became `print("MODIFIED MISSION:", mission)`, because the guide asks not to announce success before checking it.

`secure_solution.py`:
- Before the original asserts, it replays the **same** attack: same stolen `operator` account, same two changes. It then prints ATTACK BLOCKED (guide section 19).
- At the end, it prints the numbered security log (guide section 21).

If you edit either `.py` file, run `python3 tools/embed_python.py` to regenerate `js/python-sources.js`, so the page's code panel shows the new version. The tests fail if you forget.

## Checking

```
node tests/core.test.js
```

Needs Node 18+ and python3. The test checks:
- The page's logic against **running** our Python:
  - `attack_simulation.py`: same credentials, mission, changes and verdict.
  - `secure_solution.py`: the same calls produce the identical audit log and failure counters.
  - SHA-256 over `json.dumps(mission, sort_keys=True)`, compared byte-for-byte.
- The spec's acceptance asserts.
- That the same attack is blocked at the account gate.
- That the embedded code matches the `.py` files.
- That both Python files run and print ATTACK SUCCESSFUL and ATTACK BLOCKED.
