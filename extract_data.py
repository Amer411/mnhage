"""
Script to extract all lesson data (URLs, titles, screen names) from KV files
and output them as JavaScript content data for the PWA.
"""
import re
import os
import json

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def extract_from_kv(filepath):
    """Extract button data from a KV file."""
    results = []
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Find all on_button_press or on_press calls with URL arrays
    # Pattern matches: root.on_button_press(self, 'screen_name', index, [...urls...])
    # or: root.on_button_press(self, index, [...urls...])
    pattern = r"on_press:\s*root\.on_button_press\(self,\s*(?:'([^']*)',\s*)?(\d+),\s*\[(.*?)\]\)"
    
    for match in re.finditer(pattern, content, re.DOTALL):
        screen_name = match.group(1) or ""
        index = int(match.group(2))
        urls_raw = match.group(3)
        
        # Extract individual URLs
        url_pattern = r'["\']([^"\']+)["\']'
        urls = [u for u in re.findall(url_pattern, urls_raw) if u and u != ""]
        
        # Find the button text (look backwards for reshape_text)
        pos = match.start()
        text_before = content[:pos]
        text_match = re.findall(r"reshape_text\('([^']*)'\)", text_before)
        button_text = text_match[-1] if text_match else f"Lesson {index + 1}"
        
        results.append({
            'screen': screen_name,
            'index': index,
            'text': button_text,
            'urls': urls
        })
    
    return results

# Extract from all KV files
kv_files = [
    'BiologysScreen.kv',  # القرآن الكريم
    'biologys.kv',        # أحياء + نحو
    'chemistrys.kv',      # كيمياء + أدب
    'favorites.kv',       # أدب ونصوص + نحو
    'favorites1.kv',      # إيمان + حديث + فقه + سيرة + إعدادات + فيزياء + قراءة + نماذج علمي
    'favorites2.kv',      # إنجليزي + نماذج أدبي + نماذج أبين + نماذج لحج
    'myapp.kv',           # الشاشات الرئيسية
]

all_data = {}
for kv_file in kv_files:
    filepath = os.path.join(BASE_DIR, kv_file)
    if os.path.exists(filepath):
        data = extract_from_kv(filepath)
        all_data[kv_file] = data
        print(f"Extracted {len(data)} items from {kv_file}")

# Save as JSON for reference
with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'extracted_data.json'), 'w', encoding='utf-8') as f:
    json.dump(all_data, f, ensure_ascii=False, indent=2)

print(f"\nTotal items extracted: {sum(len(v) for v in all_data.values())}")
print("Data saved to extracted_data.json")
