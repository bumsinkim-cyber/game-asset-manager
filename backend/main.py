import base64
import io
import os
import uuid
import zipfile

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from services.character_builder import CharacterBuilder, ObjectBuilder
from services.gif_maker import MOTION_MAKERS
from services.image_client import ImageClient
from services.prompt_builder import PromptBuilder
from services.trend_searcher import TrendSearcher

load_dotenv()

app = FastAPI(title="Game Asset Generator")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "output")
os.makedirs(OUTPUT_DIR, exist_ok=True)
app.mount("/output", StaticFiles(directory=OUTPUT_DIR), name="output")

image_client = ImageClient()
prompt_builder = PromptBuilder()
trend_searcher = TrendSearcher()
char_builder = CharacterBuilder()
obj_builder = ObjectBuilder()


# ── Pydantic models ──────────────────────────────────────────────────────────

class TrendSearchRequest(BaseModel):
    theme: str
    genre: str = "mobile game"


class BgGenerationPayload(BaseModel):
    base_theme: str
    style_keywords: str = ""
    negative_prompt: str = (
        "blurry, low quality, watermark, text, logo, signature, ugly, distorted"
    )
    worlds: int = 3
    stages_per_world: int = 5
    api_token: str
    model: str = "gpt-image-1.5"
    size: str = "1536x1024"
    trend_keywords: str = ""


class CharGenerationPayload(BaseModel):
    base_theme: str
    style_keywords: str = ""
    worlds: int = 3
    api_token: str
    model: str = "gpt-image-1.5"
    size: str = "1024x1024"
    generate_hero: bool = True
    generate_enemies: bool = True
    generate_npc: bool = False
    trend_keywords: str = ""
    gif_frames: int = 6
    gif_delay: int = 120
    expression: str = "neutral"
    selected_motions: list[str] = ["idle", "attack", "jump", "hurt", "victory"]


class ObjGenerationPayload(BaseModel):
    base_theme: str
    style_keywords: str = ""
    worlds: int = 3
    object_types: list[str] = ["item", "prop", "platform", "obstacle"]
    api_token: str
    model: str = "gpt-image-1.5"
    size: str = "1024x1024"
    trend_keywords: str = ""


# ── Helpers ──────────────────────────────────────────────────────────────────

def _session_dir(prefix: str) -> tuple[str, str]:
    sid = f"{prefix}_{str(uuid.uuid4())[:8]}"
    path = os.path.join(OUTPUT_DIR, sid)
    os.makedirs(path, exist_ok=True)
    return sid, path


def _zip_session(session_id: str) -> io.BytesIO:
    session_dir = os.path.join(OUTPUT_DIR, session_id)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for fname in sorted(os.listdir(session_dir)):
            zf.write(os.path.join(session_dir, fname), fname)
    buf.seek(0)
    return buf


# ── REST endpoints ───────────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.post("/api/search-trends")
async def search_trends(request: TrendSearchRequest):
    keywords = await trend_searcher.search(request.theme, request.genre)
    return {"keywords": keywords}


@app.get("/api/test-image")
async def test_image(token: str):
    try:
        result = await image_client.generate(
            api_token=token,
            prompt="medieval fantasy forest game background",
            size="1024x1024",
        )
        return {"success": True, "b64_length": len(result)}
    except Exception as e:
        import traceback
        return {"success": False, "error": str(e), "trace": traceback.format_exc()}


@app.get("/api/download/{session_id}")
async def download_session(session_id: str):
    session_dir = os.path.join(OUTPUT_DIR, session_id)
    if not os.path.exists(session_dir):
        raise HTTPException(status_code=404, detail="Session not found")
    buf = _zip_session(session_id)
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename=assets-{session_id}.zip"},
    )


# ── WebSocket: Backgrounds ────────────────────────────────────────────────────

@app.websocket("/ws/generate")
async def generate_backgrounds(websocket: WebSocket):
    await websocket.accept()
    try:
        data = await websocket.receive_json()
        req = BgGenerationPayload(**data)

        sid, sdir = _session_dir("bg")
        total = req.worlds * req.stages_per_world
        done = 0

        for world in range(1, req.worlds + 1):
            for stage in range(1, req.stages_per_world + 1):
                level = f"{world}-{stage}"
                await websocket.send_json(
                    {"type": "progress", "current": done, "total": total, "level": level}
                )
                prompt = prompt_builder.build(
                    req.base_theme, world, stage, req.worlds,
                    req.stages_per_world, req.style_keywords, req.trend_keywords,
                )
                try:
                    b64 = await image_client.generate(
                        req.api_token, prompt, req.model, req.size
                    )
                    fname = f"level_{world}_{stage:02d}.png"
                    with open(os.path.join(sdir, fname), "wb") as f:
                        f.write(base64.b64decode(b64))
                    done += 1
                    await websocket.send_json(
                        {"type": "image", "level": level, "url": f"/output/{sid}/{fname}",
                         "prompt": prompt, "current": done, "total": total}
                    )
                except Exception as e:
                    print(f"[BG ERROR] {level}: {e}")
                    await websocket.send_json(
                        {"type": "error", "level": level, "message": f"{type(e).__name__}: {e}"}
                    )

        await websocket.send_json({"type": "complete", "total": done, "session_id": sid})
    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass


# ── WebSocket: Characters ─────────────────────────────────────────────────────

@app.websocket("/ws/generate-characters")
async def generate_characters(websocket: WebSocket):
    await websocket.accept()
    try:
        data = await websocket.receive_json()
        req = CharGenerationPayload(**data)

        sid, sdir = _session_dir("char")

        jobs: list[tuple[str, int | None]] = []
        if req.generate_hero:
            jobs.append(("hero", None))
        if req.generate_enemies:
            for w in range(1, req.worlds + 1):
                jobs.append(("enemy", w))
        if req.generate_npc:
            jobs.append(("npc", None))

        total = len(jobs)
        done = 0

        for char_type, world in jobs:
            label = char_type if world is None else f"enemy_w{world}"
            await websocket.send_json(
                {"type": "progress", "current": done, "total": total, "label": label}
            )

            if char_type == "hero":
                prompt = char_builder.hero(req.base_theme, req.style_keywords, req.trend_keywords, req.expression)
            elif char_type == "enemy":
                prompt = char_builder.enemy(
                    req.base_theme, world, req.worlds, req.style_keywords, req.trend_keywords, "angry"
                )
            else:
                prompt = char_builder.npc(req.base_theme, req.style_keywords, req.trend_keywords, req.expression)

            try:
                b64 = await image_client.generate(
                    req.api_token, prompt, req.model, req.size, background="transparent"
                )

                png_name = f"{label}.png"
                with open(os.path.join(sdir, png_name), "wb") as f:
                    f.write(base64.b64decode(b64))

                gif_urls: dict[str, str] = {}
                motions = [m for m in req.selected_motions if m in MOTION_MAKERS]
                if not motions:
                    motions = ["idle"]
                for motion in motions:
                    maker = MOTION_MAKERS[motion]
                    kwargs = {"frames": req.gif_frames, "delay_ms": req.gif_delay} if motion == "idle" else {}
                    gif_bytes = maker(b64, **kwargs)
                    gif_name = f"{label}_{motion}.gif"
                    with open(os.path.join(sdir, gif_name), "wb") as f:
                        f.write(gif_bytes)
                    gif_urls[motion] = f"/output/{sid}/{gif_name}"

                done += 1
                await websocket.send_json(
                    {"type": "character", "label": label, "char_type": char_type,
                     "world": world, "prompt": prompt, "current": done, "total": total,
                     "png_url": f"/output/{sid}/{png_name}",
                     "gif_urls": gif_urls}
                )
            except Exception as e:
                print(f"[CHAR ERROR] {label}: {e}")
                await websocket.send_json(
                    {"type": "error", "label": label, "message": f"{type(e).__name__}: {e}"}
                )

        await websocket.send_json({"type": "complete", "total": done, "session_id": sid})
    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass


# ── WebSocket: Objects ────────────────────────────────────────────────────────

@app.websocket("/ws/generate-objects")
async def generate_objects(websocket: WebSocket):
    await websocket.accept()
    try:
        data = await websocket.receive_json()
        req = ObjGenerationPayload(**data)

        sid, sdir = _session_dir("obj")

        jobs = [
            (ot, w)
            for w in range(1, req.worlds + 1)
            for ot in req.object_types
        ]
        total = len(jobs)
        done = 0

        for obj_type, world in jobs:
            label = f"{obj_type}_w{world}"
            await websocket.send_json(
                {"type": "progress", "current": done, "total": total, "label": label}
            )
            prompt = obj_builder.build(
                obj_type, req.base_theme, world, req.worlds,
                req.style_keywords, req.trend_keywords,
            )
            try:
                b64 = await image_client.generate(
                    req.api_token, prompt, req.model, req.size, background="transparent"
                )
                fname = f"{label}.png"
                with open(os.path.join(sdir, fname), "wb") as f:
                    f.write(base64.b64decode(b64))
                done += 1
                await websocket.send_json(
                    {"type": "object", "label": label, "obj_type": obj_type,
                     "world": world, "prompt": prompt, "current": done, "total": total,
                     "png_url": f"/output/{sid}/{fname}"}
                )
            except Exception as e:
                print(f"[OBJ ERROR] {label}: {e}")
                await websocket.send_json(
                    {"type": "error", "label": label, "message": f"{type(e).__name__}: {e}"}
                )

        await websocket.send_json({"type": "complete", "total": done, "session_id": sid})
    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
