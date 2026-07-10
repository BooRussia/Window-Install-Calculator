import re, os
DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
html = open(os.path.join(DIR, "index.html")).read()
css = open(os.path.join(DIR, ".tw-out.css")).read()
block = '<style id="tw-compiled">\n/* Tailwind v3.4.16 utilities — compiled by scripts/build-css.sh. DO NOT hand-edit;\n   regenerate after changing classes. */\n' + css + '\n</style>'
pat = re.compile(r'<style id="tw-compiled">.*?</style>', re.S)
assert pat.search(html), "tw-compiled marker not found in index.html"
html = pat.sub(lambda m: block, html, count=1)
open(os.path.join(DIR, "index.html"), "w").write(html)
print("injected", len(css), "bytes of compiled CSS")
