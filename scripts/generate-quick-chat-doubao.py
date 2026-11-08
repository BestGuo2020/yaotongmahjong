#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Generate the 12 quick-chat clips with Volcengine Doubao TTS (TTS 2.0).

Runtime never calls Volcengine: this script writes Ogg Vorbis into
`public/audio/sounds/chat-<id>.ogg`, and the app plays them locally.

Credential: the default points at the lianhua backend's Volcengine key file.
Use the backend venv (it has httpx):
  D:\\vueprojects\\lianhua_guangma\\backend\\.venv\\Scripts\\python.exe ^
    scripts/generate-quick-chat-doubao.py --credential-file <path-to-火山apikey.txt>

Requires ffmpeg on PATH. Keep ids/text in sync with quickChat.ts.
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import json
import pathlib
import shutil
import subprocess
import sys
import tempfile
import uuid

import httpx

ENDPOINT = 'https://openspeech.bytedance.com/api/v3/tts/unidirectional/sse'
RESOURCE_ID = 'seed-tts-2.0'
UID = 'yaotong-quick-chat'
VOICE = 'S_T1cyNvVc2'  # 用户的 ICL 2.0 复刻音色
DEFAULT_CREDENTIAL = pathlib.Path(
    r'D:\vueprojects\lianhua_guangma\backend\config\secrets\火山apikey.txt')
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'audio' / 'sounds'

# 统一使用“来啊，互相伤害啊”那一版的语速/音高/响度，12 句保持同一股冲劲。
UNIFORM_PROSODY = (12, 1, 9)

# id, spoken text
PHRASES = [
    ('follow', '能不能跟？'),
    ('listen', '听没听啊～'),
    ('draw', '这把赔不起，流局加一'),
    ('hurry', '快点吧，我等的花都谢了'),
    ('praise', '你的牌打得太好了'),
    ('think', '让我再想想'),
    ('hello', '大家好，很高兴见到各位'),
    ('stay', '朋友，不要走，再打几盘吧'),
    ('let-draw', '还让不让我摸牌啦'),
    ('feed-peng', '打一张来碰嘛'),
    ('hurt', '来啊，互相伤害啊'),
    ('oops-hu', '哎呀，一不小心就胡了'),
]


def read_api_key(path: pathlib.Path) -> str:
    if not path.exists():
        raise SystemExit(f'credential file not found: {path}')
    for line in path.read_text(encoding='utf-8').splitlines():
        if ':' in line:
            key, value = line.split(':', 1)
            if key.strip().lower() in ('apikey', 'api_key'):
                return value.strip()
    raise SystemExit('apikey not found in credential file')


def body(text: str, rate: int, pitch: int, loudness: int, voice: str) -> dict:
    additions = {
        'post_process': {'pitch': pitch},
        'disable_markdown_filter': True,
        'enable_latex_tn': False,
    }
    return {
        'user': {'uid': UID},
        'req_params': {
            'text': text,
            'speaker': voice,
            'sample_rate': 24000,
            'audio_params': {
                'format': 'mp3',
                'speech_rate': rate,
                'loudness_rate': loudness,
                'bit_rate': 64000,
            },
            'additions': json.dumps(additions, separators=(',', ':')),
        },
    }


async def synthesize(client: httpx.AsyncClient, api_key: str, text: str,
                     rate: int, pitch: int, loudness: int, voice: str,
                     resource_id: str) -> bytes:
    headers = {
        'Content-Type': 'application/json',
        'X-Api-Resource-Id': resource_id,
        'X-Api-Request-Id': str(uuid.uuid4()),
        'X-Api-Key': api_key,
    }
    chunks: list[bytes] = []
    async with client.stream('POST', ENDPOINT, headers=headers,
                             json=body(text, rate, pitch, loudness, voice)) as response:
        if response.status_code >= 400:
            await response.aread()
            raise RuntimeError(f'HTTP {response.status_code}: {response.text[:200]}')
        async for line in response.aiter_lines():
            if not line.startswith('data:'):
                continue
            raw = line[5:].strip()
            if not raw or raw == '[DONE]':
                continue
            payload = json.loads(raw)
            code = payload.get('code', 0)
            if code not in (0, 20000000, '0', '20000000'):
                raise RuntimeError(f"code={code}: {str(payload.get('message', ''))[:160]}")
            encoded = payload.get('data')
            if encoded:
                chunks.append(base64.b64decode(encoded))
    if not chunks:
        raise RuntimeError('no audio returned')
    return b''.join(chunks)


def ffmpeg(source: pathlib.Path, target: pathlib.Path) -> None:
    if not shutil.which('ffmpeg'):
        raise SystemExit('ffmpeg not found on PATH')
    target.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ['ffmpeg', '-y', '-loglevel', 'error', '-i', str(source),
         '-c:a', 'libvorbis', '-q:a', '4', str(target)],
        check=True,
    )


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--credential-file', type=pathlib.Path, default=DEFAULT_CREDENTIAL)
    parser.add_argument('--only', help='only generate one phrase id')
    parser.add_argument('--voice', default=VOICE, help='Volcengine speaker id')
    parser.add_argument('--resource-id', default=None,
                        help='default: seed-icl-2.0 for S_ cloned voices, else seed-tts-2.0')
    parser.add_argument('--out-dir', type=pathlib.Path, default=OUT)
    args = parser.parse_args()
    resource_id = args.resource_id or (
        'seed-icl-2.0' if args.voice.startswith('S_') else RESOURCE_ID)
    api_key = read_api_key(args.credential_file)
    args.out_dir.mkdir(parents=True, exist_ok=True)

    async with httpx.AsyncClient(trust_env=False, timeout=30) as client:
        with tempfile.TemporaryDirectory(prefix='yaotong-doubao-') as tmp:
            tmp_dir = pathlib.Path(tmp)
            for phrase_id, text in PHRASES:
                if args.only and args.only != phrase_id:
                    continue
                print(f'doubao {phrase_id}: {text}', flush=True)
                rate, pitch, loudness = UNIFORM_PROSODY
                audio = await synthesize(client, api_key, text, rate, pitch, loudness,
                                         args.voice, resource_id)
                mp3 = tmp_dir / f'{phrase_id}.mp3'
                mp3.write_bytes(audio)
                ogg = args.out_dir / f'chat-{phrase_id}.ogg'
                ffmpeg(mp3, ogg)
                try:
                    label = ogg.relative_to(ROOT)
                except ValueError:
                    label = ogg
                print(f'  -> {label} ({ogg.stat().st_size} bytes)', flush=True)
    return 0


if __name__ == '__main__':
    sys.exit(asyncio.run(main()))
