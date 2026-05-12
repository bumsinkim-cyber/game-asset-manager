import base64
import io
import math

from PIL import Image


# ── Internal helpers ──────────────────────────────────────────────────────────

def _load(b64: str) -> Image.Image:
    return Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGBA")


def _to_gif(frame_durations: list[tuple[Image.Image, int]]) -> bytes:
    """Convert RGBA frames with per-frame durations to a transparent GIF."""
    gif_frames = []
    for frame, _ in frame_durations:
        alpha = frame.split()[3]
        rgb = frame.convert("RGB")
        p = rgb.quantize(colors=255, method=Image.Quantize.MEDIANCUT)
        palette = p.getpalette()
        palette[255 * 3: 255 * 3 + 3] = [0, 0, 0]
        p.putpalette(palette)
        p_data = list(p.getdata())
        for j, a in enumerate(alpha.getdata()):
            if a < 128:
                p_data[j] = 255
        p.putdata(p_data)
        gif_frames.append(p)

    durations = [d for _, d in frame_durations]
    buf = io.BytesIO()
    gif_frames[0].save(
        buf, format="GIF", save_all=True,
        append_images=gif_frames[1:], loop=0,
        duration=durations, disposal=2, transparency=255, optimize=False,
    )
    return buf.getvalue()


def _offset(src: Image.Image, dx: int, dy: int) -> Image.Image:
    w, h = src.size
    frame = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    frame.paste(src, (dx, dy), mask=src.split()[3])
    return frame


def _scale(src: Image.Image, sx: float, sy: float) -> Image.Image:
    """Scale with bottom-center anchor."""
    w, h = src.size
    nw, nh = max(1, int(w * sx)), max(1, int(h * sy))
    scaled = src.resize((nw, nh), Image.LANCZOS)
    frame = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    frame.paste(scaled, ((w - nw) // 2, h - nh), mask=scaled.split()[3])
    return frame


def _red_tint(src: Image.Image, intensity: float = 0.55) -> Image.Image:
    overlay = Image.new("RGBA", src.size, (255, 40, 40, int(255 * intensity)))
    overlay.putalpha(Image.eval(src.split()[3], lambda a: int(a * intensity)))
    return Image.alpha_composite(src.copy(), overlay)


# ── Motion GIF generators ─────────────────────────────────────────────────────

def make_idle_gif(image_b64: str, frames: int = 6, delay_ms: int = 120) -> bytes:
    """Smooth floating idle animation."""
    src = _load(image_b64)
    amp = max(3, src.size[1] // 50)
    fd = [
        (_offset(src, 0, int(amp * math.sin(2 * math.pi * i / frames))), delay_ms)
        for i in range(frames)
    ]
    return _to_gif(fd)


def make_attack_gif(image_b64: str) -> bytes:
    """Quick forward thrust."""
    src = _load(image_b64)
    thrust = src.size[0] // 8
    fd = [
        (_offset(src, -(thrust // 2), 0), 100),   # lean back
        (_offset(src, thrust, 0),         60),    # thrust!
        (_offset(src, thrust, 0),         80),    # hold
        (src.copy(),                       150),   # return
    ]
    return _to_gif(fd)


def make_run_gif(image_b64: str) -> bytes:
    """Side-to-side running wobble."""
    src = _load(image_b64)
    w, h = src.size
    dx, dy = w // 12, h // 30
    fd = [
        (_offset(src, -dx, 0),   80),
        (_offset(src,  0, -dy),  80),
        (_offset(src,  dx,  0),  80),
        (_offset(src,  0, -dy // 2), 80),
    ]
    return _to_gif(fd)


def make_jump_gif(image_b64: str) -> bytes:
    """Crouch → launch → peak → land."""
    src = _load(image_b64)
    peak = src.size[1] // 3
    fd = [
        (_scale(src, 1.10, 0.85),          80),   # crouch
        (_offset(src, 0, -(peak // 2)),    80),   # rising
        (_offset(src, 0, -peak),           120),  # peak
        (_offset(src, 0, -(peak // 2)),    80),   # falling
        (_scale(src, 1.10, 0.85),          80),   # land squish
        (src.copy(),                        180),  # recover
    ]
    return _to_gif(fd)


def make_hurt_gif(image_b64: str) -> bytes:
    """Red flash + horizontal shake."""
    src = _load(image_b64)
    shake = src.size[0] // 15
    red = _red_tint(src)
    fd = [
        (_offset(red, shake,  0),   60),
        (_offset(red, -shake, 0),   60),
        (_offset(src, shake // 2, 0), 80),
        (src.copy(),                  220),
    ]
    return _to_gif(fd)


def make_victory_gif(image_b64: str) -> bytes:
    """Double bounce + squish."""
    src = _load(image_b64)
    bounce = src.size[1] // 6
    fd = [
        (src.copy(),                           80),
        (_offset(src, 0, -bounce),            80),
        (_scale(src, 1.06, 0.88),             70),   # land squish
        (src.copy(),                           60),
        (_offset(src, 0, -(bounce // 2)),     70),
        (_scale(src, 1.03, 0.94),             60),
        (src.copy(),                           220),
    ]
    return _to_gif(fd)


MOTION_MAKERS = {
    "idle":    make_idle_gif,
    "attack":  make_attack_gif,
    "run":     make_run_gif,
    "jump":    make_jump_gif,
    "hurt":    make_hurt_gif,
    "victory": make_victory_gif,
}
