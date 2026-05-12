UI_QUALITY = (
    "2D game UI asset, isolated element, transparent background, "
    "no background, centered, high quality, game interface art style, "
    "clean vector-like design, suitable for game overlay"
)

UI_ITEMS: dict[str, dict[str, str]] = {
    "bubble": {
        "dialogue": (
            "dialogue speech bubble, conversation balloon, smooth rounded rectangle "
            "with a tail pointing down-left, empty white interior, clean outlined border"
        ),
        "thought": (
            "thought speech bubble, thinking balloon, fluffy cloud-like oval shape "
            "with small circle dots as tail, empty interior, soft rounded border"
        ),
        "shout": (
            "shout exclamation speech bubble, jagged spiky starburst shape, "
            "bold outline, empty interior, energetic dynamic border"
        ),
    },
    "button": {
        "normal": (
            "game UI button, default normal resting state, rectangular with rounded corners, "
            "subtle 3D bevel highlight on top, press-ready appearance"
        ),
        "hover": (
            "game UI button, highlighted mouse-hover state, bright glowing outline, "
            "slightly brighter and elevated appearance, selected focus effect"
        ),
        "disabled": (
            "game UI button, disabled inactive greyed-out state, faded muted colors, "
            "desaturated appearance, non-clickable locked look"
        ),
    },
    "panel": {
        "inventory": (
            "inventory storage panel frame, grid slots background, ornate decorative border, "
            "item container window, game bag or chest UI frame"
        ),
        "popup": (
            "popup dialog window frame, centered modal panel, decorative ornate border, "
            "game notification or confirmation window background"
        ),
        "dialog": (
            "character dialogue text panel, wide rectangular speech box, "
            "decorative side borders, NPC conversation text area background"
        ),
    },
    "hud": {
        "hp_bar": (
            "HP health bar frame, life gauge container, heart or shield icon decoration, "
            "empty fill area, game heads-up display element"
        ),
        "mp_bar": (
            "MP mana bar frame, magic power gauge container, gem or star icon decoration, "
            "empty fill area, game heads-up display element"
        ),
        "exp_bar": (
            "EXP experience progress bar frame, level-up gauge container, "
            "arrow or sparkle decoration, thin wide bar shape, game HUD element"
        ),
        "minimap": (
            "minimap frame border, small map container, compass rose decoration, "
            "circular or rounded square frame, game heads-up display map holder"
        ),
    },
    "icon": {
        "skill": (
            "skill action icon frame, ability slot, circular or diamond-shaped border, "
            "magical glowing edge effect, game skill hotbar slot"
        ),
        "item": (
            "item inventory icon frame, square item slot, decorative corner borders, "
            "rarity color glow, game item bag slot"
        ),
        "system": (
            "system menu icon, settings or options button, gear cog or menu lines design, "
            "clean minimal flat style, game pause or settings icon"
        ),
    },
}


class UIBuilder:
    def build(
        self, category: str, item: str,
        theme: str, style: str = "", trend: str = "",
    ) -> str:
        item_desc = UI_ITEMS.get(category, {}).get(item, f"{category} {item} UI element")
        parts = [item_desc, f"{theme} art style game UI", UI_QUALITY]
        if style:
            parts.append(style)
        if trend:
            parts.append(trend)
        return ", ".join(p for p in parts if p)
