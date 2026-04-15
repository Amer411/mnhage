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

def extract_buttons(block):
    """Extract buttons (title + urls) from a parsed KV block."""
    if not block: return []
    
    buttons = []
    lines = block.split('\n')
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        
        # Look for Button defs
        if line.startswith('Button:'):
            title = ""
            urls = []
            # Scan inside this button block up to 15 lines
            for j in range(i + 1, min(i + 15, len(lines))):
                ahead_line = lines[j].strip()
                if ahead_line.startswith('Button:') or ahead_line.startswith('Label:'):
                    break
                
                # Check for title
                if 'text:' in ahead_line:
                    t_match = re.search(r"text:\s*app\.reshape_text\(\s*'([^']+)'\s*\)", ahead_line)
                    if not t_match:
                        t_match = re.search(r'text:\s*app\.reshape_text\(\s*"([^"]+)"\s*\)', ahead_line)
                    if not t_match:
                        # Some might not have app.reshape_text, just 'text: '...' '
                        t_match = re.search(r"text:\s*'([^']+)'", ahead_line)
                    if not t_match:
                        t_match = re.search(r'text:\s*"([^"]+)"', ahead_line)
                    if t_match:
                        title = t_match.group(1).strip()
                
                # Check for urls
                if 'on_press' in ahead_line:
                    urls_found = re.findall(r'"(https?://[^"]+)"', ahead_line)
                    if not urls_found:
                        urls_found = re.findall(r"'(https?://[^']+)'", ahead_line)
                    urls = [u for u in urls_found if u and u.strip() and len(u) > 10 and not u.startswith('https://example.com')]
            
            if title:
                buttons.append({'title': title, 'urls': urls})
                
        i += 1
    return buttons

def read_kv(filename):
    path = os.path.join(ROOT, filename)
    if not os.path.exists(path):
        print(f"Could not find {filename}")
        return ""
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()

# Read files
fav = read_kv('favorites.kv')
fav1 = read_kv('favorites1.kv')
fav2 = read_kv('favorites2.kv')
chem = read_kv('chemistrys.kv')
bio = read_kv('biologys.kv')

# Define mappings with grouping
# Format: (Main Subject, [ (Sub Name, KV text, Screen Class Name), ... ])
data_structure = [
    ("القرآن الكريم", [
        ("القرآن", fav, "FavoritesScreen_1")
    ]),
    ("التربية الإسلامية", [
        ("أيمان", fav1, "FavoritesScreen_2"),
        ("حديث", fav1, "FavoritesScreen_3"),
        ("فقه", fav1, "FavoritesScreen_4"),
        ("سيرة", fav1, "FavoritesScreen_5"),
    ]),
    ("اللغة العربية", [
        ("أدب ونصوص", fav2, "FavoritesScreen_10"),
        ("نحو", fav2, "FavoritesScreen_12"),
        ("قراءة", fav2, "FavoritesScreen_14"),
    ]),
    ("اللغة الانجليزية", [
        ("المنهج", fav2, "EnglishsScreen"),
        ("التعاريف", fav2, "FavoritesScreen_15")
    ]),
    ("العلوم الطبيعية", [
        ("كيمياء", chem, "ChemistrysScreen"),
        ("فيزياء", fav1, "PhysicsScreen"),
        ("أحياء", bio, "BiologysScreen"),
    ]),
    ("الرياضيات", [
        ("الرياضيات", fav1, "SettingsScreen")
    ])
]

answers_data = []

for main_subj, subs in data_structure:
    if len(subs) == 1 and subs[0][0] == main_subj:
        # Simple subject, no sub-categories needed in UI
        block = extract_model_blocks(subs[0][1], subs[0][2])
        btns = extract_buttons(block)
        answers_data.append({
            'name': main_subj,
            'type': 'subject',
            'buttons': btns if btns else [{'title': 'سيتم إضافة الدروس قريباً', 'urls': []}]
        })
    else:
        # Nested subject
        sub_list = []
        for sub_name, kv_text, class_name in subs:
            block = extract_model_blocks(kv_text, class_name)
            btns = extract_buttons(block)
            sub_list.append({
                'name': sub_name,
                'buttons': btns if btns else [{'title': 'سيتم إضافة الدروس قريباً', 'urls': []}]
            })
        
        answers_data.append({
            'name': main_subj,
            'type': 'category',
            'subs': sub_list
        })

print("\n=== إجابات التقاويم (الهيكل الجديد) ===")
for s in answers_data:
    if s['type'] == 'category':
        print(f"  {s['name']} (Category): {[sub['name'] for sub in s['subs']]}")
    else:
        print(f"  {s['name']} (Subject): {len(s['buttons'])} buttons")

# Now inject this into content.js
content_js_path = os.path.join(BASE, 'js', 'content.js')
with open(content_js_path, 'r', encoding='utf-8') as f:
    js_content = f.read()

def json_urls(urls):
    return json.dumps(urls, ensure_ascii=False)

output_lines = []
output_lines.append("    // ===================== إجابات التقاويم =====================")
output_lines.append("    answers: [")

for s in answers_data:
    output_lines.append("        {")
    output_lines.append(f"            name: {json.dumps(s['name'], ensure_ascii=False)},")
    output_lines.append(f"            type: '{s['type']}',")
    
    if s['type'] == 'category':
        output_lines.append("            subs: [")
        for sub in s['subs']:
            output_lines.append("                {")
            output_lines.append(f"                    name: {json.dumps(sub['name'], ensure_ascii=False)},")
            output_lines.append("                    buttons: [")
            for b in sub['buttons']:
                if b['urls']:
                    output_lines.append(f"                        {{ title: {json.dumps(b['title'], ensure_ascii=False)}, urls: {json_urls(b['urls'])} }},")
                else:
                    output_lines.append(f"                        {{ title: {json.dumps(b['title'], ensure_ascii=False)}, urls: [], comingSoon: true }},")
            output_lines.append("                    ]")
            output_lines.append("                },")
        output_lines.append("            ]")
    else:
        output_lines.append("            buttons: [")
        for b in s['buttons']:
            if b['urls']:
                output_lines.append(f"                {{ title: {json.dumps(b['title'], ensure_ascii=False)}, urls: {json_urls(b['urls'])} }},")
            else:
                output_lines.append(f"                {{ title: {json.dumps(b['title'], ensure_ascii=False)}, urls: [], comingSoon: true }},")
        output_lines.append("            ]")
    
    output_lines.append("        },")
output_lines.append("    ],")

# Target point: between "    // ===================== إجابات التقاويم ====================="
# AND "    // ===================== الملخصات المضمونة ====================="

start_marker = "    // ===================== إجابات التقاويم ====================="
end_marker = "    // ===================== الملخصات المضمونة ====================="

if start_marker in js_content and end_marker in js_content:
    parts_start = js_content.split(start_marker)
    parts_end = parts_start[1].split(end_marker)
    
    new_js = parts_start[0] + '\n'.join(output_lines) + '\n\n' + end_marker + parts_end[1]
    
    with open(content_js_path, 'w', encoding='utf-8') as f:
        f.write(new_js)
    
    print("Done! answers array added to content.js replacing the old object stub")
else:
    print("Could not find injection markers in content.js")
