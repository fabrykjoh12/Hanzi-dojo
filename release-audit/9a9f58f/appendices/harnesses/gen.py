import json,csv,sys
from collections import Counter
from findings import F
F=list(F)+[("HD-AUD-062","CNT-06","Low","H","static","Reader data model","—","Readability keyed by written form (documented in VOCAB-INGESTION §3); no live Chinese impact","docs/VOCAB-INGESTION.md §3","—","No action (latent, already tracked)","None.","—","—")]
F.sort(key=lambda f:f[0])
keys="id source_ids severity confidence evidence_type category platform title refs milestone priority fix_direction acceptance effort".split()
rows=[dict(zip(keys,f)) for f in F]
out='/home/user/Hanzi-dojo/release-audit/9a9f58f/'
json.dump({"audit":"HanziDojo release audit","commit":"9a9f58fbaf8524f53bc9b41aa721764449c153fc","date":"2026-11-09","findings":rows},open(out+'findings.json','w'),ensure_ascii=False,indent=1)
with open(out+'findings.csv','w',newline='') as fh:
  w=csv.DictWriter(fh,fieldnames=keys); w.writeheader(); w.writerows(rows)
print(len(rows),Counter(r['severity'] for r in rows)); print(Counter(r['priority'].split(' (')[0] for r in rows))
md=["# Findings register — HanziDojo @ 9a9f58f (2026-11-09)","",
"One entry per finding, deduplicated across the five domain reviews and the challenge pass. `source_ids` point to the domain appendix that holds the full reasoning (prefixes SEC/SRS/CNT/UX/ENG/CH; LEAD means the lead's own trace). Severity and confidence are rated separately. Changes made after the challenge pass are listed in `appendices/challenge.md`.","",
"Machine-readable copies: `findings.json` and `findings.csv`. They use the same IDs and the same priorities.",""]
for r in rows:
  md+=[f"## {r['id']} — {r['title']}",
  f"- **Severity:** {r['severity']} · **Confidence:** {r['confidence']} · **Evidence:** {r['evidence_type']} · **Source:** {r['source_ids']}",
  f"- **Category / platform:** {r['category']} / {r['platform']}",
  f"- **Evidence refs:** {r['refs']}",
  f"- **Milestone / priority:** {r['milestone']} — {r['priority']}",
  f"- **Fix direction:** {r['fix_direction']}",
  f"- **Acceptance:** {r['acceptance']}",
  f"- **Effort (relative, uncertain):** {r['effort']}",""]
open(out+'FINDINGS.md','w').write('\n'.join(md))
