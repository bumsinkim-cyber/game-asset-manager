CHAR_QUALITY = (
    "2D game sprite, isolated character, transparent background, "
    "no background, full body, centered, high quality, game art style"
)

OBJECT_QUALITY = (
    "2D game asset, isolated object, transparent background, "
    "no background, centered, high quality, game art style"
)

ENEMY_ATMOSPHERE = [
    (0.00, 0.34, "small cute enemy, round shape, non-threatening, beginner level"),
    (0.34, 0.67, "medium-sized enemy, angular design, moderately threatening"),
    (0.67, 1.01, "large intimidating enemy, dark design, menacing, boss-like, epic"),
]

OBJECT_TYPE_DESC = {
    "item":     "collectible item, glowing, coin or gem or power-up, reward pickup",
    "prop":     "background decoration prop, environment detail, scenery object",
    "platform": "platform tile, ground surface, stepping stone, solid block",
    "obstacle": "obstacle or trap, hazard, danger object, blocking element",
}

OBJECT_WORLD_ATMOSPHERE = [
    (0.00, 0.34, "bright colors, friendly look, safe environment"),
    (0.34, 0.67, "vibrant colors, adventure theme, moderate challenge"),
    (0.67, 1.01, "dark colors, ominous, dangerous, final zone"),
]

EXPRESSIONS = {
    "neutral":    "",
    "happy":      "happy expression, bright smile, cheerful face",
    "angry":      "angry expression, fierce face, battle-ready scowl",
    "sad":        "sad expression, melancholic face, downcast eyes",
    "surprised":  "surprised expression, wide eyes, shocked open mouth",
    "determined": "determined expression, focused intense gaze, strong willpower",
}


class CharacterBuilder:
    def _expr(self, expression: str) -> str:
        return EXPRESSIONS.get(expression, "")

    def hero(self, theme: str, style: str = "", trend: str = "", expression: str = "neutral") -> str:
        parts = [f"hero protagonist character, {theme}, brave warrior, main character"]
        if self._expr(expression):
            parts.append(self._expr(expression))
        parts.append(CHAR_QUALITY)
        if style: parts.append(style)
        if trend: parts.append(trend)
        return ", ".join(p for p in parts if p)

    def enemy(self, theme: str, world: int, total_worlds: int,
              style: str = "", trend: str = "", expression: str = "angry") -> str:
        progress = (world - 1) / max(total_worlds - 1, 1)
        atmosphere = ENEMY_ATMOSPHERE[-1][2]
        for min_p, max_p, atm in ENEMY_ATMOSPHERE:
            if min_p <= progress < max_p:
                atmosphere = atm
                break
        parts = [f"enemy monster character, {theme}, world {world}", atmosphere]
        if self._expr(expression):
            parts.append(self._expr(expression))
        parts.append(CHAR_QUALITY)
        if style: parts.append(style)
        if trend: parts.append(trend)
        return ", ".join(p for p in parts if p)

    def npc(self, theme: str, style: str = "", trend: str = "", expression: str = "happy") -> str:
        parts = [f"friendly NPC character, {theme}, merchant or guide, welcoming"]
        if self._expr(expression):
            parts.append(self._expr(expression))
        parts.append(CHAR_QUALITY)
        if style: parts.append(style)
        return ", ".join(p for p in parts if p)


class ObjectBuilder:
    def build(self, object_type: str, theme: str, world: int, total_worlds: int,
              style: str = "", trend: str = "") -> str:
        type_desc = OBJECT_TYPE_DESC.get(object_type, object_type)
        progress = (world - 1) / max(total_worlds - 1, 1)
        atmosphere = OBJECT_WORLD_ATMOSPHERE[-1][2]
        for min_p, max_p, atm in OBJECT_WORLD_ATMOSPHERE:
            if min_p <= progress < max_p:
                atmosphere = atm
                break
        parts = [f"{type_desc}, {theme}", f"world {world}", atmosphere, OBJECT_QUALITY]
        if style: parts.append(style)
        if trend: parts.append(trend)
        return ", ".join(p for p in parts if p)
