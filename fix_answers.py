"""
Fix incorrect answer data in content.js - v3
Uses line numbers directly to target the correct section (lines 481-515)
"""
import json
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

BASE = os.path.dirname(os.path.abspath(__file__))

# Read extracted_data.json
with open(os.path.join(BASE, 'extracted_data.json'), 'r', encoding='utf-8') as f:
    data = json.load(f)

def is_valid_url(url):
    return (url and url != '' and url != ',' and
            not url.startswith('https://example.com') and
            len(url) > 10)

# Extract أدب ونصوص (favorites_10)
adab_items = []
for kv_file, items in data.items():
    for item in items:
        if item.get('screen') == 'favorites_10':
            urls = [u for u in item.get('urls', []) if is_valid_url(u)]
            if urls:
                adab_items.append({
                    'index': item['index'],
                    'title': item['text'],
                    'urls': urls
                })
adab_items.sort(key=lambda x: x['index'])

# Extract نحو (favorites_12)
nahw_items = []
for kv_file, items in data.items():
    for item in items:
        if item.get('screen') == 'favorites_12':
            urls = [u for u in item.get('urls', []) if is_valid_url(u)]
            if urls:
                nahw_items.append({
                    'index': item['index'],
                    'title': item['text'],
                    'urls': urls
                })
nahw_items.sort(key=lambda x: x['index'])

print(f"adab items: {len(adab_items)}")
print(f"nahw items: {len(nahw_items)}")

# Build JS buttons
def format_urls(urls):
    return json.dumps(urls, ensure_ascii=False)

# Read content.js
content_path = os.path.join(BASE, 'js', 'content.js')
with open(content_path, 'r', encoding='utf-8') as f:
    content = f.read()

lines = content.split('\r\n')
if len(lines) < 10:
    lines = content.split('\n')
    line_sep = '\n'
else:
    line_sep = '\r\n'

print(f"Total lines: {len(lines)}")

# Find ALL occurrences of اللغة العربية
arab_occurrences = []
for i, line in enumerate(lines):
    if '\u0627\u0644\u0644\u063a\u0629 \u0627\u0644\u0639\u0631\u0628\u064a\u0629' in line and 'name:' in line:
        arab_occurrences.append(i)
        print(f"  Found at line {i+1}: {line.strip()[:80]}")

print(f"Found {len(arab_occurrences)} occurrences of Arabic section")

# We want the SECOND occurrence (the one in the answers section, around line 478)
# or the one that contains "subs: [" with "أدب ونصوص" inside
target_idx = None
for idx in arab_occurrences:
    # Check if the next few lines contain 'subs: ['
    for j in range(idx+1, min(idx+5, len(lines))):
        if 'subs:' in lines[j] and '[' in lines[j]:
            # Check if the children contain "أدب ونصوص"
            for k in range(j+1, min(j+10, len(lines))):
                if '\u0623\u062f\u0628 \u0648\u0646\u0635\u0648\u0635' in lines[k]:
                    target_idx = idx
                    print(f"Target found at line {idx+1} (has أدب ونصوص)")
                    break
            break
    if target_idx is not None:
        break

if target_idx is None:
    print("FAILED: Could not find the target Arabic answer section")
    sys.exit(1)

# Find subs: [ start and end
subs_content_start = None
subs_end = None

for j in range(target_idx+1, min(target_idx+5, len(lines))):
    if 'subs:' in lines[j] and '[' in lines[j]:
        subs_content_start = j + 1
        print(f"subs array starts at line {j+1}, content from line {j+2}")
        break

if subs_content_start:
    depth = 1
    for j in range(subs_content_start, len(lines)):
        stripped_j = lines[j].strip()
        for ch in stripped_j:
            if ch == '[' or ch == '{':
                depth += 1
            elif ch == ']' or ch == '}':
                depth -= 1
                if depth == 0:
                    subs_end = j
                    break
        if subs_end is not None:
            print(f"subs array ends at line {j+1}")
            break

if subs_content_start is None or subs_end is None:
    print("FAILED: Could not find subs boundaries")
    sys.exit(1)

# Build replacement lines
replacement_lines = []
replacement_lines.append('                {')
replacement_lines.append('                    name: "\u0623\u062f\u0628 \u0648\u0646\u0635\u0648\u0635",')
replacement_lines.append('                    buttons: [')
for item in adab_items:
    urls_str = format_urls(item['urls'])
    title_str = json.dumps(item['title'], ensure_ascii=False)
    replacement_lines.append(f'                        {{ title: {title_str}, urls: {urls_str} }},')
replacement_lines.append('                    ]')
replacement_lines.append('                },')
replacement_lines.append('                {')
replacement_lines.append('                    name: "\u0646\u062d\u0648",')
replacement_lines.append('                    buttons: [')
for item in nahw_items:
    urls_str = format_urls(item['urls'])
    title_str = json.dumps(item['title'], ensure_ascii=False)
    replacement_lines.append(f'                        {{ title: {title_str}, urls: {urls_str} }},')
replacement_lines.append('                    ]')
replacement_lines.append('                },')
replacement_lines.append('                {')
replacement_lines.append('                    name: "\u0642\u0631\u0627\u0621\u0629",')
replacement_lines.append('                    buttons: [')
replacement_lines.append('                        { title: "\u0633\u064a\u062a\u0645 \u0625\u0636\u0627\u0641\u0629 \u0627\u0644\u062f\u0631\u0648\u0633 \u0642\u0631\u064a\u0628\u0627\u064b", urls: [], comingSoon: true },')
replacement_lines.append('                    ]')
replacement_lines.append('                },')

# Replace subs_content_start to subs_end (exclusive of subs_end because it's the closing ])
new_lines = lines[:subs_content_start]
new_lines.extend(replacement_lines)
new_lines.extend(lines[subs_end:])

new_content = line_sep.join(new_lines)

with open(content_path, 'w', encoding='utf-8') as f:
    f.write(new_content)

print(f"\nSUCCESS! Fixed content.js")
print(f"  Replaced lines {subs_content_start+1} to {subs_end+1}")
print(f"  adab (أدب ونصوص): {len(adab_items)} answers")
print(f"  nahw (نحو): {len(nahw_items)} answers")
print(f"  qiraa (قراءة): Coming soon")
