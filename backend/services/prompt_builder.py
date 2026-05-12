QUALITY_SUFFIX = (
    "game background art, digital illustration, high quality, detailed, masterpiece"
)

# (min_progress, max_progress, atmosphere_keywords)
ATMOSPHERE_LEVELS = [
    (0.00, 0.25, "bright, cheerful, welcoming, vibrant colors, sunny, safe, beginner-friendly"),
    (0.25, 0.50, "adventurous, lush, balanced lighting, dynamic, moderate challenge, energetic"),
    (0.50, 0.75, "dramatic, intense, atmospheric, complex details, challenging, mysterious"),
    (0.75, 1.01, "epic, dark, foreboding, grand scale, dangerous, final challenge, boss territory"),
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
        total = total_worlds * total_stages
        current = (world - 1) * total_stages + stage
        progress = (current - 1) / max(total - 1, 1)

        atmosphere = ATMOSPHERE_LEVELS[-1][2]
        for min_p, max_p, atm in ATMOSPHERE_LEVELS:
            if min_p <= progress < max_p:
                atmosphere = atm
                break

        parts = [
            base_theme,
            f"world {world} stage {stage}",
            atmosphere,
            QUALITY_SUFFIX,
        ]
        if style_keywords:
            parts.append(style_keywords)
        if trend_keywords:
            parts.append(trend_keywords)

        return ", ".join(p.strip() for p in parts if p.strip())
