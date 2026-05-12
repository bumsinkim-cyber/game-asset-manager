QUALITY_SUFFIX = (
    "game background art, digital illustration, high quality, detailed, masterpiece"
)

# Overall atmosphere by total game progress
ATMOSPHERE_LEVELS = [
    (0.00, 0.25, "bright, cheerful, welcoming, vibrant colors, sunny, safe, beginner-friendly"),
    (0.25, 0.50, "adventurous, lush, balanced lighting, dynamic, moderate challenge, energetic"),
    (0.50, 0.75, "dramatic, intense, atmospheric, complex details, challenging, mysterious"),
    (0.75, 1.01, "epic, dark, foreboding, grand scale, dangerous, final challenge, boss territory"),
]

# Color identity per world — all stages in the same world share this palette
WORLD_COLOR_PROFILES = [
    (0.00, 0.20, "warm golden-hour lighting, amber and honey tones, warm soft shadows, sun-drenched color grading"),
    (0.20, 0.40, "vibrant midday lighting, saturated emerald greens and sky blues, high clarity, vivid color grading"),
    (0.40, 0.60, "adventurous late-afternoon lighting, rich ochre and deep green tones, warm-cool balanced color grading"),
    (0.60, 0.80, "cool twilight lighting, blue-violet atmospheric haze, long shadows, moody cool color grading"),
    (0.80, 1.01, "dark ominous lighting, deep crimson and near-black tones, stark high-contrast color grading"),
]

# Composition variation per stage — changes within a world to add variety
STAGE_COMPOSITIONS = [
    "wide panoramic vista, expansive open horizon, sweeping landscape",
    "layered depth scene, rich foreground elements, detailed midground, distant background",
    "dramatic vertical composition, towering elements, tall structures filling frame",
    "intimate balanced view, focused midground detail, symmetrical layout",
    "dynamic diagonal flow, sweeping curves, directional leading lines",
    "aerial overhead perspective, bird's-eye view of environment",
    "close environmental detail, textured surfaces, immersive ground-level view",
]


class PromptBuilder:
    def build(
        self,
        base_theme: str,
        world: int,
        stage: int,
        total_worlds: int,
        total_stages: int,
        style_keywords: str = "",
        trend_keywords: str = "",
    ) -> str:
        # Overall game progress (determines atmosphere difficulty)
        total = total_worlds * total_stages
        current = (world - 1) * total_stages + stage
        game_progress = (current - 1) / max(total - 1, 1)

        atmosphere = ATMOSPHERE_LEVELS[-1][2]
        for min_p, max_p, atm in ATMOSPHERE_LEVELS:
            if min_p <= game_progress < max_p:
                atmosphere = atm
                break

        # World progress (determines color palette — same for all stages in this world)
        world_progress = (world - 1) / max(total_worlds - 1, 1)
        color_profile = WORLD_COLOR_PROFILES[-1][2]
        for min_p, max_p, cp in WORLD_COLOR_PROFILES:
            if min_p <= world_progress < max_p:
                color_profile = cp
                break

        # Stage composition variant (cycles through variations within a world)
        composition = STAGE_COMPOSITIONS[(stage - 1) % len(STAGE_COMPOSITIONS)]

        parts = [
            base_theme,
            f"world {world} stage {stage}",
            color_profile,
            composition,
            atmosphere,
            QUALITY_SUFFIX,
        ]
        if style_keywords:
            parts.append(style_keywords)
        if trend_keywords:
            parts.append(trend_keywords)

        return ", ".join(p.strip() for p in parts if p.strip())
