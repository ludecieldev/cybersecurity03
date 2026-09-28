# ==========================================
# CASE 3 - UAV DEFENSE
# ==========================================
import hashlib
import json
from datetime import datetime, timezone

mission = {
    "destination": "POINT_A",
    "altitude": 100,
    "speed": 10
}

# create authorized users
# Fictional credentials and network rules for this local model.
users = {
    "pilot01": ("pilot-pass", "246810", "pilot", True),
    "mission_manager": ("manager-pass", "135790", "manager", True),
    "old_operator": ("old-pass", "111111", "pilot", False)
}
roles = {"pilot": {"destination", "speed"},
         "manager": {"destination", "altitude", "speed"}}
failures, audit_log = {}, []
allowed_paths = {("operator", "mission_data")}

# create an integrity-checking function
def calculate_hash(data):
    text = json.dumps(data, sort_keys=True)
    return hashlib.sha256(text.encode()).hexdigest()

# record original mission integrity value
trusted_hash = calculate_hash(mission)

# record user + time + action
def log(user, action, details):
    event = (datetime.now(timezone.utc).isoformat(),
             user, action, details)
    audit_log.append(event)
    print(event)

# verify mission integrity
def verify():
    valid = calculate_hash(mission) == trusted_hash
    log("monitor", "integrity_check", valid)
    # generate alert if unauthorized change occurs
    if not valid:
        print("SECURITY ALERT: MISSION REJECTED")
    return valid

# check authorization before modification
def change(user, password, mfa, field, value, source="operator"):
    global trusted_hash
    account = users.get(user)
    if (source, "mission_data") not in allowed_paths:
        log(user, "denied", "network rule")
        return False
    if not account or not account[3] or failures.get(user, 0) >= 3:
        log(user, "denied", "unknown, disabled, or locked")
        return False
    if (password, mfa) != account[:2]:
        failures[user] = failures.get(user, 0) + 1
        log(user, "denied", "password or MFA")
        return False
    failures[user] = 0
    if field not in roles[account[2]]:
        log(user, "denied", "RBAC")
        return False
    if not verify():
        return False
    old_value = mission[field]
    mission[field] = value
    trusted_hash = calculate_hash(mission)
    log(user, "changed", (field, old_value, value))
    return True

# [guide] run the SAME attack as attack_simulation.py:
# same stolen shared account, same two changes
print("REPEATING THE ORIGINAL ATTACK")
results = [
    change("operator", "shared-pass", "000000", "destination", "UNKNOWN_POINT"),
    change("operator", "shared-pass", "000000", "altitude", 30),
]
attack_successful = any(results)
print("ATTACK SUCCESSFUL" if attack_successful else "ATTACK BLOCKED")
assert not attack_successful

# run original attack again
assert not change(
    "intruder", "wrong", "000000", "destination", "UNKNOWN_POINT")
assert change(
    "pilot01", "pilot-pass", "246810", "destination", "POINT_B")
assert verify()
mission["altitude"] = 30
assert not verify()

# [guide] show the security log
print("SECURITY LOG")
for number, event in enumerate(audit_log, start=1):
    print(f"{number}. {event}")
