"""
Extract all model data from favorites1.kv (FavoritesScreen_6 = Aden/Scientific, FavoritesScreen_8 = Taiz)
and favorites2.kv for other model screens, then generate a complete content.js with proper structure.
"""
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

def extract_subjects_and_years(block):
    """Extract subjects (Labels) and their year buttons with URLs."""
    subjects = []
    current_subject = None
    
    lines = block.split('\n')
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        
        # Check for subject label
        label_match = re.search(r"text:\s*app\.reshape_text\('(.+?)'\)", line)
        if label_match and 'تقويم' not in label_match.group(1) and 'سيتم' not in label_match.group(1):
            subject_name = label_match.group(1).strip('.')
            ignore_headers = ['نماذج عدن/علمي', 'نماذج تعز', 'نماذج عدن/أدبي', 'نماذج أبين', 'نماذج لحج', 'نماذج عدن قسم الانجليزي']
            if subject_name not in ignore_headers:
                current_subject = {'name': subject_name, 'years': []}
                subjects.append(current_subject)
        
        # Check for year button text (e.g., text: '2024')
        year_match = re.search(r"text:\s*'(\d{4})'", line)
        if year_match and current_subject is not None:
            year = year_match.group(1)
            # Search ahead (up to 10 lines) for the on_press with URLs
            for j in range(i + 1, min(i + 10, len(lines))):
                press_line = lines[j]
                if 'on_press' in press_line:
                    # Extract URLs from the on_press line
                    urls = re.findall(r'"(https?://[^"]+)"', press_line)
                    if not urls:
                        urls = re.findall(r"'(https?://[^']+)'", press_line)
                    # Filter out empty/invalid URLs
                    urls = [u for u in urls if u and u.strip() and len(u) > 10 and not u.startswith('https://example.com')]
                    current_subject['years'].append({'year': year, 'urls': urls})
                    break
        i += 1
    
    return subjects

# Read favorites1.kv
with open(os.path.join(ROOT, 'favorites1.kv'), 'r', encoding='utf-8') as f:
    kv1 = f.read()

# Extract FavoritesScreen_6 (Aden/Scientific models)
aden_block = extract_model_blocks(kv1, 'FavoritesScreen_6')
aden_subjects = extract_subjects_and_years(aden_block) if aden_block else []

# Extract FavoritesScreen_8 (Taiz models)
taiz_block = extract_model_blocks(kv1, 'FavoritesScreen_8')
taiz_subjects = extract_subjects_and_years(taiz_block) if taiz_block else []

print("=== نماذج عدن / علمي ===")
for s in aden_subjects:
    years_summary = [(y['year'], len(y['urls'])) for y in s['years']]
    print(f"  {s['name']}: {years_summary}")

print("\n=== نماذج تعز ===")  
for s in taiz_subjects:
    years_summary = [(y['year'], len(y['urls'])) for y in s['years']]
    print(f"  {s['name']}: {years_summary}")

# Now read favorites2.kv for literary models, Abyan, Lahj
fav2_path = os.path.join(ROOT, 'favorites2.kv')
literary_subjects = []
abyan_subjects = []
lahj_subjects = []
english_subjects = []

if os.path.exists(fav2_path):
    with open(fav2_path, 'r', encoding='utf-8') as f:
        kv2 = f.read()
    
    # FavoritesScreen_13 = Literary models
    lit_block = extract_model_blocks(kv2, 'FavoritesScreen_13')
    literary_subjects = extract_subjects_and_years(lit_block) if lit_block else []
    
    # FavoritesScreen_14 = Abyan models
    abyan_block = extract_model_blocks(kv2, 'FavoritesScreen_14')
    abyan_subjects = extract_subjects_and_years(abyan_block) if abyan_block else []
    
    # FavoritesScreen_15 = Lahj models
    lahj_block = extract_model_blocks(kv2, 'FavoritesScreen_15')
    lahj_subjects = extract_subjects_and_years(lahj_block) if lahj_block else []

    # FavoritesScreen_21 = Aden English section (located in favorites1.kv usually, or favorites2.kv)
    # Wait, in the grep output earlier, FavoritesScreen_21 was in favorites1.kv!
    pass

# We must extract english_block from kv1 because FavoritesScreen_21 is in favorites1.kv!
english_block = extract_model_blocks(kv1, 'FavoritesScreen_21')
english_subjects = extract_subjects_and_years(english_block) if english_block else []

if os.path.exists(fav2_path):
    print("\n=== نماذج عدن / أدبي ===")
    for s in literary_subjects:
        years_summary = [(y['year'], len(y['urls'])) for y in s['years']]
        print(f"  {s['name']}: {years_summary}")
    
    print("\n=== نماذج أبين ===")
    for s in abyan_subjects:
        years_summary = [(y['year'], len(y['urls'])) for y in s['years']]
        print(f"  {s['name']}: {years_summary}")
    
    print("\n=== نماذج لحج ===")
    for s in lahj_subjects:
        years_summary = [(y['year'], len(y['urls'])) for y in s['years']]
        print(f"  {s['name']}: {years_summary}")

# Also read extracted_data.json for lesson answers
with open(os.path.join(BASE, 'extracted_data.json'), 'r', encoding='utf-8') as f:
    extracted = json.load(f)

def is_valid(url):
    return (url and url != '' and url != ',' and 
            not url.startswith('https://example.com') and
            (url.startswith('https://firebasestorage.googleapis.com') or 
             url.startswith('https://cdn.jsdelivr.net') or
             url.startswith('https://raw.githubusercontent.com')))

# Build lesson data from extracted_data.json
screen_to_subject = {
    'biologys': ('biology', 'الأحياء'),
    'favorites_2': ('iman', 'إيمان'),
    'favorites_3': ('hadith', 'حديث'),
    'favorites_4': ('fiqh', 'فقه'),
    'favorites_5': ('sira', 'سيرة'),
    'favorites_10': ('adab', 'أدب ونصوص'),
    'favorites_12': ('nahw', 'نحو'),
    'initiatives': ('qiraa', 'قراءة'),
    'physics': ('physics_lessons', 'الفيزياء - التقاويم'),
}

lessons = {}
for kv_file, items in extracted.items():
    for item in items:
        screen = item.get('screen', '')
        urls = [u for u in item.get('urls', []) if is_valid(u)]
        text = item.get('text', '')
        
        # Determine subject - try screen first
        subj_id = None
        subj_name = None
        
        if screen in screen_to_subject:
            subj_id, subj_name = screen_to_subject[screen]
        elif screen == '' and kv_file == 'chemistrys.kv':
            subj_id, subj_name = 'chemistry_lessons', 'الكيمياء - التقاويم'
        elif screen == '' and kv_file == 'biologys.kv':
            subj_id, subj_name = 'biology', 'الأحياء'
        elif screen == 'favorites_1' and 'تقويم' in text:
            subj_id, subj_name = 'quran_t', 'القرآن الكريم - التقاويم'
        
        if subj_id and (urls or 'تقويم' in text):
            if subj_id not in lessons:
                lessons[subj_id] = []
            lesson = {'title': text, 'urls': urls}
            if not urls:
                lesson['comingSoon'] = True
            lessons[subj_id].append(lesson)

# === Generate the final content.js ===
def json_urls(urls):
    return json.dumps(urls, ensure_ascii=False)

js = []
js.append("// ============================================================")
js.append("// Content Data - Complete from Kivy App (Auto-generated)")  
js.append("// ============================================================")
js.append("")
js.append("const ContentData = {")
js.append("")

# --- Models Section ---
js.append("    // ===================== النماذج الوزارية =====================")
js.append("    models: {")

def write_model_section(name, subjects_list, indent="        "):
    lines = []
    lines.append(f"{indent}// {name}")
    lines.append(f"{indent}subjects: [")
    for s in subjects_list:
        lines.append(f"{indent}    {{")
        lines.append(f"{indent}        name: {json.dumps(s['name'], ensure_ascii=False)},")
        lines.append(f"{indent}        years: [")
        for y in s['years']:
            if y['urls']:
                lines.append(f"{indent}            {{ year: '{y['year']}', urls: {json_urls(y['urls'])} }},")
            else:
                lines.append(f"{indent}            {{ year: '{y['year']}', urls: [], comingSoon: true }},")
        lines.append(f"{indent}        ]")
        lines.append(f"{indent}    }},")
    lines.append(f"{indent}]")
    return lines

js.append("        aden_scientific: {")
js.append(f"            label: 'نماذج عدن / علمي',")
js.extend(write_model_section('نماذج عدن / علمي', aden_subjects, "            "))
js.append("        },")

js.append("        taiz: {")
js.append(f"            label: 'نماذج تعز',")
js.extend(write_model_section('نماذج تعز', taiz_subjects, "            "))
js.append("        },")

if literary_subjects:
    js.append("        aden_literary: {")
    js.append(f"            label: 'نماذج عدن / أدبي',")
    js.extend(write_model_section('نماذج عدن / أدبي', literary_subjects, "            "))
    js.append("        },")

if abyan_subjects:
    js.append("        abyan: {")
    js.append(f"            label: 'نماذج أبين',")
    js.extend(write_model_section('نماذج أبين', abyan_subjects, "            "))
    js.append("        },")

if lahj_subjects:
    js.append("        lahj: {")
    js.append(f"            label: 'نماذج لحج',")
    js.extend(write_model_section('نماذج لحج', lahj_subjects, "            "))
    js.append("        },")

if english_subjects:
    js.append("        aden_english: {")
    js.append(f"            label: 'نماذج عدن / قسم الانجليزي',")
    js.extend(write_model_section('نماذج عدن / قسم الانجليزي', english_subjects, "            "))
    js.append("        },")

js.append("    },")
js.append("")

# --- Answers Section ---
js.append("    // ===================== إجابات التقاويم =====================")
js.append("    answers: {")
js.append("        categories: [")
js.append("            { id: 'islamic', name: 'التربية الإسلامية', icon: '🕌', subs: [")
js.append("                { id: 'iman', name: 'إيمان', icon: '☪️' },")
js.append("                { id: 'hadith', name: 'حديث', icon: '📖' },")
js.append("                { id: 'fiqh', name: 'فقه', icon: '⚖️' },")
js.append("                { id: 'sira', name: 'سيرة', icon: '🌙' }")
js.append("            ]},")
js.append("            { id: 'arabic', name: 'اللغة العربية', icon: '✍️', subs: [")
js.append("                { id: 'adab', name: 'أدب ونصوص', icon: '📝' },")
js.append("                { id: 'nahw', name: 'نحو', icon: '📐' },")
js.append("                { id: 'qiraa', name: 'قراءة', icon: '📚' }")
js.append("            ]},")
js.append("            { id: 'quran_t', name: 'القرآن الكريم', icon: '📗' },")
js.append("            { id: 'chemistry_lessons', name: 'الكيمياء', icon: '🧪' },")
js.append("            { id: 'physics_lessons', name: 'الفيزياء', icon: '⚡' },")
js.append("            { id: 'biology', name: 'الأحياء', icon: '🧬' }")
js.append("        ]")
js.append("    },")
js.append("")

# --- Lessons Data ---
js.append("    // ===================== بيانات الدروس =====================")
js.append("    lessons: {")

for subj_id in sorted(lessons.keys()):
    items = lessons[subj_id]
    js.append(f"        {subj_id}: [")
    for item in items:
        title = json.dumps(item['title'], ensure_ascii=False)
        urls = json_urls(item['urls'])
        cs = ', comingSoon: true' if item.get('comingSoon') else ''
        js.append(f"            {{ title: {title}, urls: {urls}{cs} }},")
    js.append("        ],")

js.append("    }")
js.append("};")

output = '\n'.join(js)
with open(os.path.join(BASE, 'js', 'content.js'), 'w', encoding='utf-8') as f:
    f.write(output)

print(f"\nDone! Generated content.js ({len(output)} bytes)")
total_models = sum(len(s['years']) for s in aden_subjects) + sum(len(s['years']) for s in taiz_subjects) + sum(len(s['years']) for s in literary_subjects) + sum(len(s['years']) for s in abyan_subjects) + sum(len(s['years']) for s in lahj_subjects)
total_lessons = sum(len(v) for v in lessons.values())
print(f"   Models: {total_models} year-entries across all sections")
print(f"   Lessons: {total_lessons} lesson entries")
