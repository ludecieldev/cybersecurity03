"""Copy attack_simulation.py and secure_solution.py into index.html.

The page shows the team's Python in its code panel (key K). It has to stay a
single offline file, so the sources are embedded. Run this after editing either
.py file:  python3 tools/embed_python.py
"""
import pathlib
import re

root = pathlib.Path(__file__).resolve().parent.parent
page = root / "index.html"
html = page.read_text(encoding="utf-8")

for name in ("attack_simulation", "secure_solution"):
    code = (root / f"{name}.py").read_text(encoding="utf-8").rstrip() + "\n"
    if "</script" in code.lower():
        raise SystemExit(f"{name}.py contains '</script', which cannot be embedded")
    pattern = re.compile(rf'(<script type="text/plain" id="py-{name}">\n).*?(</script>)', re.S)
    html, count = pattern.subn(lambda m: m.group(1) + code + m.group(2), html)
    if count != 1:
        raise SystemExit(f"placeholder for {name} not found in index.html")

page.write_text(html, encoding="utf-8")
print("embedded attack_simulation.py and secure_solution.py into index.html")
