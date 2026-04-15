"""
Convert extracted_data.json into a complete content.js file
by properly mapping KV screens to subject categories.
"""
import json
import os

BASE = os.path.dirname(os.path.abspath(__file__))

with open(os.path.join(BASE, 'extracted_data.json'), 'r', encoding='utf-8') as f:
    data = json.load(f)

# Mapping from KV screen names to subject IDs
screen_map = {
    # biologys.kv
    'biologys': {'id': 'biology', 'name': 'الأحياء'},
    'favorites_12': {'id': 'nahw', 'name': 'نحو'},
    
    # chemistrys.kv
    'chemistrys': {'id': 'chemistry', 'name': 'الكيمياء'},  # items with no screen => chemistry
    'favorites_10': {'id': 'adab', 'name': 'أدب ونصوص'},
    
    # favorites.kv
    'favorites_1': {'id': 'quran_t', 'name': 'القرآن الكريم'},
    
    # favorites1.kv
    'favorites_2': {'id': 'iman', 'name': 'إيمان'},
    'favorites_3': {'id': 'hadith', 'name': 'حديث'},
    'favorites_4': {'id': 'fiqh', 'name': 'فقه'},
    'favorites_5': {'id': 'sira', 'name': 'سيرة'},
    'favorites_8': {'id': 'physics', 'name': 'الفيزياء'},
    'favorites_9': {'id': 'qiraa', 'name': 'قراءة'},
    'favorites_11': {'id': 'models_scientific', 'name': 'نماذج عدن / علمي'},
    
    # favorites2.kv
    'favorites_6': {'id': 'english', 'name': 'اللغة الإنجليزية'},
    'favorites_7': {'id': 'settings', 'name': 'إعدادات'},
    'favorites_13': {'id': 'models_literary', 'name': 'نماذج عدن / أدبي'},
    'favorites_14': {'id': 'models_abyan', 'name': 'نماذج أبين'},
    'favorites_15': {'id': 'models_lahj', 'name': 'نماذج لحج'},
}

# Determine fallback screen for each KV file based on items with empty screen
kv_fallback = {
    'BiologysScreen.kv': 'quran_screen',  # Actually Quran!
    'biologys.kv': 'biologys',
    'chemistrys.kv': 'chemistrys',
}

subjects = {}  # id: [lessons]

def is_valid_url(url):
    return (url and 
            url != '' and 
            url != ',' and
            not url.startswith('https://example.com') and
            (url.startswith('https://firebasestorage.googleapis.com') or 
             url.startswith('https://raw.githubusercontent.com')))

for kv_file, items in data.items():
    for item in items:
        screen = item.get('screen', '')
        urls = [u for u in item.get('urls', []) if is_valid_url(u)]
        text = item.get('text', '')
        
        # Determine the subject ID
        subj_id = None
        if screen and screen in screen_map:
            subj_id = screen_map[screen]['id']
        elif screen == '' and kv_file == 'BiologysScreen.kv':
            subj_id = 'quran_t'
        elif screen == '' and kv_file == 'biologys.kv':
            subj_id = 'biology'
        elif screen == '' and kv_file == 'chemistrys.kv':
            subj_id = 'chemistry'
        elif screen == '' and kv_file == 'favorites.kv':
            subj_id = 'quran_t'
        else:
            continue
        
        if subj_id not in subjects:
            subjects[subj_id] = []
        
        lesson = {
            'title': text,
            'urls': urls,
        }
        if not urls:
            lesson['comingSoon'] = True
        
        subjects[subj_id].append(lesson)

# Generate JavaScript
js_lines = []
js_lines.append("// ============================")
js_lines.append("// Content Data - Auto-generated from KV files")
js_lines.append("// ============================")
js_lines.append("const ContentData = {")
js_lines.append("    answers: {")
js_lines.append("        categories: [")
js_lines.append("            { id: 'islamic', name: 'التربية الإسلامية', icon: '🕌', subs: [")
js_lines.append("                { id: 'iman', name: 'إيمان', icon: '☪️' },")
js_lines.append("                { id: 'hadith', name: 'حديث', icon: '📖' },")
js_lines.append("                { id: 'fiqh', name: 'فقه', icon: '⚖️' },")
js_lines.append("                { id: 'sira', name: 'سيرة', icon: '🌙' }")
js_lines.append("            ]},")
js_lines.append("            { id: 'arabic', name: 'اللغة العربية', icon: '✍️', subs: [")
js_lines.append("                { id: 'adab', name: 'أدب ونصوص', icon: '📝' },")
js_lines.append("                { id: 'nahw', name: 'نحو', icon: '📐' },")
js_lines.append("                { id: 'qiraa', name: 'قراءة', icon: '📚' }")
js_lines.append("            ]},")
js_lines.append("            { id: 'quran_t', name: 'القرآن الكريم', icon: '📗' },")
js_lines.append("            { id: 'english', name: 'اللغة الإنجليزية', icon: '🇬🇧' },")
js_lines.append("            { id: 'chemistry', name: 'الكيمياء', icon: '🧪' },")
js_lines.append("            { id: 'physics', name: 'الفيزياء', icon: '⚡' },")
js_lines.append("            { id: 'biology', name: 'الأحياء', icon: '🧬' }")
js_lines.append("        ]")
js_lines.append("    },")
js_lines.append("    models: {")
js_lines.append("        categories: [")
js_lines.append("            { id: 'models_scientific', name: 'نماذج عدن / علمي', icon: '🔬' },")
js_lines.append("            { id: 'models_literary', name: 'نماذج عدن / أدبي', icon: '📖' },")
js_lines.append("            { id: 'models_abyan', name: 'نماذج أبين', icon: '📋' },")
js_lines.append("            { id: 'models_lahj', name: 'نماذج لحج', icon: '📄' }")
js_lines.append("        ]")
js_lines.append("    },")
js_lines.append("    lessons: {")

for subj_id, lessons in sorted(subjects.items()):
    # Skip settings and model categories (handle models separately)
    if subj_id in ('settings',):
        continue
    
    if subj_id.startswith('models_'):
        # Models use a different structure
        model_key_map = {
            'models_scientific': 'favorites_11',
            'models_literary': 'favorites_13',
            'models_abyan': 'favorites_14',
            'models_lahj': 'favorites_15'
        }
        mk = model_key_map.get(subj_id, '')
        model_label = screen_map.get(mk, {}).get('name', subj_id)
        js_lines.append(f"        {subj_id}: {{ type: 'models', label: '{model_label}', subjects: [")
        # Group model lessons by subject name pattern
        for lesson in lessons:
            if lesson.get('urls') and not lesson.get('comingSoon'):
                js_lines.append(f"            {{ name: {json.dumps(lesson['title'], ensure_ascii=False)}, years: [{{ year: '2024', urls: {json.dumps(lesson['urls'], ensure_ascii=False)} }}] }},")
            elif not lesson.get('comingSoon'):
                js_lines.append(f"            {{ name: {json.dumps(lesson['title'], ensure_ascii=False)}, years: [{{ year: '2024', urls: [] }}] }},")
        js_lines.append("        ] },")
        continue
    
    js_lines.append(f"        {subj_id}: [")
    for lesson in lessons:
        urls_json = json.dumps(lesson['urls'], ensure_ascii=False)
        coming = ', comingSoon: true' if lesson.get('comingSoon') else ''
        title = json.dumps(lesson['title'], ensure_ascii=False)
        js_lines.append(f"            {{ title: {title}, urls: {urls_json}{coming} }},")
    js_lines.append("        ],")

js_lines.append("    }")
js_lines.append("};")

output = '\n'.join(js_lines)

with open(os.path.join(BASE, 'js', 'content.js'), 'w', encoding='utf-8') as f:
    f.write(output)

# Print summary
print("Generated content.js with subjects:")
for subj_id, lessons in sorted(subjects.items()):
    valid = sum(1 for l in lessons if not l.get('comingSoon'))
    total = len(lessons)
    print(f"  {subj_id}: {total} lessons ({valid} with content)")
