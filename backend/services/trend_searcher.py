import asyncio
import os

THEME_KEYWORD_MAP = {
    "fantasy": "painterly fantasy art, epic landscape, trending on artstation, matte painting, soft ambient occlusion, volumetric fog",
    "medieval": "medieval concept art, stone textures, torchlight, cobblestone, heraldic elements, aged wood",
    "forest": "lush foliage, dappled sunlight, nature concept art, bioluminescent plants, layered depth",
    "dungeon": "dark dungeon, torchlight glow, stone bricks, atmospheric fog, dark fantasy",
    "sci-fi": "cyberpunk neon, holographic UI, hard surface design, futuristic city, glowing accents",
    "space": "nebula, starfield, cosmic art, deep space, glowing planets, sci-fi concept art",
    "horror": "gothic horror, dark atmosphere, moody lighting, eerie fog, desaturated palette",
    "ocean": "underwater caustics, coral reef, bioluminescent creatures, ocean depth, aquatic concept art",
    "desert": "arid landscape, heat haze, sandstorm, ancient ruins, warm color palette",
    "snow": "winter wonderland, ice crystals, frozen landscape, cool blue tones, snow particles",
    "volcano": "lava glow, volcanic rock, ember particles, dramatic red sky, heat distortion",
    "sky": "cloudscape, aerial perspective, golden hour, atmospheric scattering, sky island",
    "city": "urban landscape, neon signs, rainy streets, city skyline, architectural detail",
    "jungle": "tropical foliage, humidity haze, exotic wildlife, overgrown ruins, vibrant green",
    "cave": "stalactites, underground lake, crystal formations, bioluminescent mushrooms, dark cave",
    "castle": "gothic architecture, stone ramparts, stained glass, moat, dramatic sky",
    "cute": "pastel colors, chibi style, kawaii aesthetic, soft shadows, flat design, mobile game art",
    "casual": "bright flat design, clean illustration, minimal shadows, friendly colors, cartoon",
}

FALLBACK_KEYWORDS = (
    "modern mobile game art, stylized environment, trending on artstation, "
    "high quality concept art, cinematic composition, dynamic lighting"
)


class TrendSearcher:
    async def search(self, theme: str, genre: str) -> str:
        api_key = os.getenv("ANTHROPIC_API_KEY", "")
        if api_key:
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(None, self._claude_search, theme, genre, api_key)
            if result:
                return result

        return self._keyword_fallback(theme)

    def _claude_search(self, theme: str, genre: str, api_key: str) -> str:
        try:
            import anthropic

            client = anthropic.Anthropic(api_key=api_key)
            response = client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=300,
                messages=[
                    {
                        "role": "user",
                        "content": (
                            f"List 12-15 specific visual art style keywords for a {genre} with theme '{theme}'. "
                            "Focus on 2024-2025 trending game art styles. "
                            "Output only comma-separated keywords, no explanations, no numbering."
                        ),
                    }
                ],
            )
            return response.content[0].text.strip()
        except Exception:
            return ""

    def _keyword_fallback(self, theme: str) -> str:
        theme_lower = theme.lower()
        matched = []
        for key, keywords in THEME_KEYWORD_MAP.items():
            if key in theme_lower:
                matched.append(keywords)
        return matched[0] if matched else FALLBACK_KEYWORDS
