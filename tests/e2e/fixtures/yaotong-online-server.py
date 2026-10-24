"""Local-only real REST/WS fixture for browser settlement regressions.

Run from the frontend checkout; VITE_API_TARGET should point to port 18012.
The extra seed endpoint exists only in this test process, never in app.main.
"""
import os
import sys
import asyncio
from contextlib import suppress
from pathlib import Path
from typing import Literal

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'backend'))
os.environ['PG_PASSWORD'] = ''
os.environ['WAKUDEMO_LOGIN_BYPASS'] = 'true'
os.environ['LOG_TO_FILE'] = '0'
os.environ['LOG_LEVEL'] = 'WARNING'

from app.storage import sqlite
sqlite.DEFAULT_DB_PATH = str(ROOT / 'tmp' / 'online-reveal' / 'browser.db')
from app.storage.db import storage
from app.api.rooms import router as rooms_router
from app.api.auth import router as auth_router
from app.ws.game_ws import router as ws_router
from app.game.room import room_registry
from app.core.yaotong.engine import StartOptions, continue_game, create_game
from app.core.yaotong.types import Meld, Player
from tests.test_yaotong_pace import CASES, state_for
from tests.test_yaotong_mode_online import scenario as mode_scenario
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn

storage.init()
app = FastAPI()
app.include_router(rooms_router)
app.include_router(auth_router)
app.include_router(ws_router)


def tiles(text):
    return ['mps'.index(part[-1]) * 9 + int(number) - 1
            for part in text.split() for number in part[:-1]]


class SeedRequest(BaseModel):
    roomId: str
    kind: Literal['self', 'discard', 'open-kong', 'added-kong', 'timeout', 'mode-chicken', 'mode-mandatory', 'four-client']
    yaotongMode: Literal['easy', 'hard'] = 'easy'


class AdvanceRequest(BaseModel):
    roomId: str


@app.post('/api/test/advance')
async def advance(body: AdvanceRequest):
    room = room_registry.get(body.roomId)
    if room is None or room.state is None or room.state.result is None:
        raise HTTPException(409)
    room._drive_task.cancel()
    with suppress(asyncio.CancelledError):
        await room._drive_task
    room.state = continue_game(room.state)
    room._apply_names()
    room._prepare_opening()
    room._continue_confirmations.clear()
    room._drive_task = asyncio.create_task(room._drive())
    return {'round': room.state.hand_number}


@app.post('/api/test/seed')
def seed(body: SeedRequest):
    room = room_registry.get(body.roomId)
    if room is None or room.status != 'lobby':
        raise HTTPException(409)
    if body.kind == 'timeout':
        room.yaotong_mode = 'hard'
    elif body.kind.startswith('mode-') or body.kind == 'four-client':
        room.yaotong_mode = body.yaotongMode

    def factory(options):
        if body.kind == 'four-client':
            # 完整合法 108 张牌墙：两家起手听牌，庄家首摸可胡且可杀原报。
            # 仅安排首局；之后完全走正常 continue_game 洗牌、轮庄与整场结束。
            state = create_game(StartOptions(length=options.length, dice=(2, 3), dealer=0))
            first = sorted(tiles('11123m 456789s 22p'))
            second = sorted(tiles('234567m 234s 66p 78s'))
            remaining = [tile for tile in range(27) for _ in range(4)]
            for tile in [*first, *second, 0]:
                remaining.remove(tile)
            # 其余两家按确定的乱序配牌，避免人为构造额外胡牌状态。
            import random
            random.Random(20261024).shuffle(remaining)
            hands = [first, second, sorted(remaining[:13]), sorted(remaining[13:26])]
            state.players = [Player(name=f'P{seat}', hand=hand) for seat, hand in enumerate(hands)]
            state.wall = [0, *remaining[26:]]
            assert len(state.wall) == 56
            all_tiles = [*state.wall, *(tile for player in state.players for tile in player.hand)]
            assert len(all_tiles) == 108 and all(all_tiles.count(tile) == 4 for tile in range(27))
            return state
        if body.kind.startswith('mode-'):
            return mode_scenario('peng-then-discard' if body.kind == 'mode-chicken' else 'kill-self-discard')[0]
        if body.kind in ('open-kong', 'added-kong'):
            return state_for(next(case for case in CASES if case['name'] == body.kind))
        state = create_game(StartOptions(length=options.length, dice=(2, 3),
                                         dealer=3 if body.kind == 'self' else 0))
        # A legal deck, with a single original-ready opponent waiting for s9.
        hands = ['147m 258p 369s 2468s', '258m 369p 147s 2589p',
                 '369m 247p 158s 1359m', '234567m 234s 66p 78s']
        state.players = [Player(name=f'P{seat}', hand=sorted(tiles(hand)))
                         for seat, hand in enumerate(hands)]
        if body.kind == 'discard':
            # 对家已明杠的结算场景：该家应亮出 10 张暗手，而不是消失或硬补成 13 张。
            for tile in (8, 8, 2):
                state.players[2].hand.remove(tile)
            state.players[2].melds = [Meld(tile=8, kind='open', from_seat=1)]
        remaining = [tile for tile in range(27) for _ in range(4)]
        for player in state.players:
            for tile in player.hand:
                remaining.remove(tile)
            for meld in player.melds:
                for _ in range(3 if meld.kind == 'peng' else 4):
                    remaining.remove(meld.tile)
        remaining.remove(26)
        state.wall = [26, *remaining]
        if body.kind == 'timeout':
            state.phase = 'discard'
            state.current = 0
            state.players[0].hand.append(state.wall.pop(0))
            state.players[0].drawn = 26
            state.players[0].draws = 2
        return state

    room.game_factory = factory
    return {'seeded': True}


@app.get('/api/health')
def health():
    return {'status': 'ok'}


if __name__ == '__main__':
    uvicorn.run(app, host='127.0.0.1', port=18012, log_level='warning')
