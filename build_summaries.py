import re, json, os

BASE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(BASE)

def extract_model_blocks(kv_text, screen_class):
    """Extract the entire screen block from KV text."""
    pattern = rf'<{screen_class}>.*?(?=\n<[A-Z]|\Z)'
    match = re.search(pattern, kv_text, re.DOTALL)
    if not match:
        return None
    return match.group(0)

def extract_summaries(block):
    """Extract subjects (Labels) and their specific summary buttons with URLs."""
    subjects = []
    current_subject = None
    
    lines = block.split('\n')
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        
        # Check for Label text
        # E.g. text: app.reshape_text('القرآن الكريم')
        # Wait, button text also uses app.reshape_text. How to distinguish?
        # We can look backwards or just keep track. The Label is usually alone, Buttons have on_press.
        # But let's check lines[i-1] or lines[i-2] to see if it's a Label or Button.
        # Actually, in KV:
        # Label:
        #     text: app.reshape_text('القرآن الكريم')
        # ...
        # Button:
        #     text: app.reshape_text('المعاني')
        
        # A simpler way: Find all app.reshape_text calls.
        # If it's a Label, it has no `on_press`.
        
        label_match = re.search(r"text:\s*app\.reshape_text\(\s*'([^']+)'\s*\)", line)
        if not label_match:
            label_match = re.search(r'text:\s*app\.reshape_text\(\s*"([^"]+)"\s*\)', line)
            
        if label_match:
            text_val = label_match.group(1).strip('.')
            
            # Is this inside a Button? Check if the next few lines have an on_press associated with this block.
            is_button = False
            urls = []
            
            # Look ahead up to 15 lines for on_press
            for j in range(i + 1, min(i + 15, len(lines))):
                ahead_line = lines[j].strip()
                if ahead_line.startswith('Button:') or ahead_line.startswith('Label:'):
                    # We hit the next UI element, stop looking
                    break
                if 'on_press' in ahead_line:
                    is_button = True
                    # Extract URLs from the on_press line
                    urls_found = re.findall(r'"(https?://[^"]+)"', ahead_line)
                    if not urls_found:
                        urls_found = re.findall(r"'(https?://[^']+)'", ahead_line)
                    # Filter invalid
                    urls = [u for u in urls_found if u and u.strip() and len(u) > 10 and not u.startswith('https://example.com')]
                    break
            
            if is_button:
                if current_subject is not None:
                    current_subject['buttons'].append({'title': text_val, 'urls': urls})
            else:
                # It's a Label / Subject Header
                ignore_headers = ['الملخصات المضمون تجي بالوزاري']
                if text_val not in ignore_headers:
                    current_subject = {'name': text_val, 'buttons': []}
                    subjects.append(current_subject)
        
        i += 1
        
    return subjects

# Read favorites2.kv
fav2_path = os.path.join(ROOT, 'favorites2.kv')
if not os.path.exists(fav2_path):
    print("Could not find favorites2.kv")
    exit(1)

with open(fav2_path, 'r', encoding='utf-8') as f:
    kv2 = f.read()

# Summaries are in FavoritesScreen_16
summary_block = extract_model_blocks(kv2, 'FavoritesScreen_16')
summaries_data = extract_summaries(summary_block) if summary_block else []

print("\n=== الملخصات المضمونة ===")
for s in summaries_data:
    buttons_summary = [(b['title'], len(b['urls'])) for b in s['buttons']]
    print(f"  {s['name']}: {buttons_summary}")

# Now inject this into content.js
content_js_path = os.path.join(BASE, 'js', 'content.js')
with open(content_js_path, 'r', encoding='utf-8') as f:
    js_content = f.read()

def json_urls(urls):
    return json.dumps(urls, ensure_ascii=False)

output_lines = []
output_lines.append("    // ===================== الملخصات المضمونة =====================")
output_lines.append("    summaries: [")

for s in summaries_data:
    output_lines.append("        {")
    output_lines.append(f"            name: {json.dumps(s['name'], ensure_ascii=False)},")
    output_lines.append("            buttons: [")
    for b in s['buttons']:
        if b['urls']:
            output_lines.append(f"                {{ title: {json.dumps(b['title'], ensure_ascii=False)}, urls: {json_urls(b['urls'])} }},")
        else:
            output_lines.append(f"                {{ title: {json.dumps(b['title'], ensure_ascii=False)}, urls: [], comingSoon: true }},")
    output_lines.append("            ]")
    output_lines.append("        },")
output_lines.append("    ],")

# Insert before "    // ===================== بيانات الدروس ====================="
injection_point = "    // ===================== بيانات الدروس ====================="
if injection_point in js_content:
    if "summaries: [" in js_content:
        # Already injected? We should probably replace it.
        print("Note: summaries might already be in content.js, please check manually.")
    
    parts = js_content.split(injection_point)
    new_js = parts[0] + '\n'.join(output_lines) + '\n\n' + injection_point + parts[1]
    
    with open(content_js_path, 'w', encoding='utf-8') as f:
        f.write(new_js)
    
    print("Done! summaries added to content.js")
else:
    print("Could not find injection point in content.js")
