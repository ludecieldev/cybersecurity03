# ==========================================
# CASE 3 - UAV ATTACK SIMULATION
# ==========================================

# Asset:
# fictional UAV mission plan

# Vulnerability:
# no authorization, integrity check, or audit log

# Threat:
# attacker using a compromised operator account

# Impact:
# unauthorized flight changes and possible physical harm

mission = {
    "destination": "POINT_A",
    "altitude": 100,
    "speed": 10
}

# [guide] one shared ground-control account for the whole team (fictional)
shared_accounts = {"operator": "shared-pass"}
original = dict(mission)

print("ORIGINAL MISSION")
print(mission)

# 1. Simulate unauthorized access
print("VULNERABILITY: no authorization check.")
print("ATTACK: assumed stolen operator account.")
user, password = "operator", "shared-pass"            # [guide] stolen shared credentials
authenticated = shared_accounts.get(user) == password  # [guide] password only, no MFA
print("LOGIN:", user, "PASSED" if authenticated else "FAILED", "(no MFA asked)")

# 2. Modify one or more mission values
if authenticated:  # [guide] nothing else is checked after login
    mission["destination"] = "UNKNOWN_POINT"
    mission["altitude"] = 30

# 3. Display modified mission
print("MODIFIED MISSION:", mission)

# 4. Can the original system detect the change?
print("No automatic detection or audit log.")

# 5. Display possible security impact
print("ASSET: mission plan. IMPACT: unsafe flight.")

# 6. [guide] let the program determine the result
changed = {k: (original[k], mission[k]) for k in mission if mission[k] != original[k]}
attack_successful = bool(changed)
print("ATTACK SUCCESSFUL" if attack_successful else "ATTACK FAILED")

# 7. [guide] attack summary
print("=" * 44)
print("ATTACK SUMMARY")
print("=" * 44)
print("Attacker account    :", user, "(shared, stolen)")
print("Target              : mission plan")
print("Authentication      :", "PASSED" if authenticated else "FAILED")
print("MFA                 : MISSING")
print("Authorization check : MISSING")
print("Integrity check     : MISSING")
print("Changes             :", changed)
print("Attack successful   :", attack_successful)
print("CIA impact          : INTEGRITY, AVAILABILITY")
