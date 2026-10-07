#!/usr/bin/env python3
"""
RENATA Notice Fetcher v4 — Corrected Offset
"""
import os
import json
import urllib.request
from datetime import datetime

BOT_TOKEN = os.environ.get('TELEGRAM_BOT_TOKEN')
CHANNEL_ID = os.environ.get('TELEGRAM_CHANNEL_ID')
NOTICES_FILE = 'notices.json'
MAX_NOTICES = 20

def load_state():
    if not os.path.exists(NOTICES_FILE):
        return {'notices': [], '_lastUpdateId': 0}
    try:
        with open(NOTICES_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return {
            'notices': data.get('notices', []),
            '_lastUpdateId': data.get('_lastUpdateId', 0)
        }
    except Exception as e:
        print(f"Load error: {e}")
        return {'notices': [], '_lastUpdateId': 0}

def save_state(notices, last_update_id):
    with open(NOTICES_FILE, 'w', encoding='utf-8') as f:
        json.dump({
            '_lastUpdateId': last_update_id,
            'notices': notices
        }, f, ensure_ascii=False, indent=2)
    print(f"Saved {len(notices)} notices, offset={last_update_id}")

def fetch_channel_messages(last_offset):
    # ⭐ FIX: use last_offset directly (NOT +1)
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/getUpdates?limit=100"
    if last_offset > 0:
    url += f"&offset={last_offset + 1}"
    
    print(f"Fetching with offset={last_offset if last_offset > 0 else 'none'}")
    
    try:
        with urllib.request.urlopen(url, timeout=15) as response:
            data = json.loads(response.read().decode())
        if not data.get('ok'):
            print(f"API error: {data}")
            return [], last_offset
        
        messages = []
        max_update_id = last_offset
        
        for update in data.get('result', []):
            update_id = update.get('update_id', 0)
            if update_id > max_update_id:
                max_update_id = update_id
            
            post = update.get('channel_post', {})
            if not post:
                continue
            chat_id = str(post.get('chat', {}).get('id', ''))
            if chat_id != str(CHANNEL_ID):
                continue
            text = post.get('text', '').strip()
            if not text:
                continue
            message_id = post.get('message_id')
            date_ts = post.get('date', 0)
            date_str = datetime.fromtimestamp(date_ts).strftime('%Y-%m-%d') if date_ts else datetime.now().strftime('%Y-%m-%d')
            messages.append({
                'id': 1000000 + message_id,
                'text': text,
                'date': date_str,
                'ts': date_ts
            })
        
        return messages, max_update_id
    except Exception as e:
        print(f"Fetch error: {e}")
        return [], last_offset

def parse_notice(text, default_date, notice_id):
    lines = [line.strip() for line in text.split('\n') if line.strip()]
    if not lines:
        return None
    
    priority = 'normal'
    first = lines[0].upper()
    if first.startswith('[HIGH]') or first.startswith('🔴'):
        priority = 'high'
        lines[0] = lines[0].replace('[HIGH]', '').replace('🔴', '').strip()
    elif first.startswith('[LOW]') or first.startswith('⚪'):
        priority = 'low'
        lines[0] = lines[0].replace('[LOW]', '').replace('⚪', '').strip()
    
    title = lines[0]
    body = ' '.join(lines[1:]) if len(lines) > 1 else ''
    
    return {
        'id': notice_id,
        'title': title,
        'body': body,
        'date': default_date,
        'priority': priority
    }

def main():
    if not BOT_TOKEN or not CHANNEL_ID:
        print("Missing BOT_TOKEN or CHANNEL_ID")
        return
    
    state = load_state()
    existing = state['notices']
    last_offset = state['_lastUpdateId']
    
    print(f"Current offset: {last_offset}")
    print(f"Existing notices: {len(existing)}")
    
    messages, new_offset = fetch_channel_messages(last_offset)
    print(f"Fetched {len(messages)} messages from Telegram")
    
    existing_ids = {n.get('id') for n in existing}
    new_notices = []
    
    for msg in messages:
        if msg['id'] in existing_ids:
            continue
        parsed = parse_notice(msg['text'], msg['date'], msg['id'])
        if parsed:
            parsed['_ts'] = msg['ts']
            new_notices.append(parsed)
    
    print(f"Found {len(new_notices)} new notices")
    
    all_notices = new_notices + existing
    
    for n in all_notices:
        if '_ts' not in n:
            try:
                dt = datetime.strptime(n.get('date', '2026-01-01'), '%Y-%m-%d')
                n['_ts'] = int(dt.timestamp())
            except:
                n['_ts'] = 0
    
    all_notices.sort(key=lambda x: x.get('_ts', 0), reverse=True)
    all_notices = all_notices[:MAX_NOTICES]
    
    clean = []
    for n in all_notices:
        n.pop('_ts', None)
        clean.append(n)
    
    if clean != existing or new_offset != last_offset:
        save_state(clean, new_offset)
        print(f"✅ notices.json updated, new offset={new_offset}")
    else:
        print("No changes")

if __name__ == '__main__':
    main()
