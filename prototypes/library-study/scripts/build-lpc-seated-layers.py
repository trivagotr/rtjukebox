from __future__ import annotations

import os
from pathlib import Path

from PIL import Image


ROOT = Path(os.environ.get("LPC_SOURCE_ROOT", r"C:\tmp\universal-lpc-spritesheet"))
OUT = Path(__file__).resolve().parents[1] / "assets" / "avatar-lpc" / "seated"

SOURCES = {
    "body": ROOT / "spritesheets/body/bodies/male/sit.png",
    "skin": ROOT / "spritesheets/head/heads/human/male/sit.png",
    "clothing": ROOT / "spritesheets/torso/clothes/longsleeve/longsleeve2/male/sit.png",
    "hair": ROOT / "spritesheets/hair/bangslong2/adult/fg/sit.png",
    "hat": ROOT / "spritesheets/hat/cloth/leather_cap/adult/sit/navy.png",
}

FRAMES = {
    "north": (1, 0),
    "south": (1, 2),
}

TRIM_BOXES = {
    "north": (8, 2, 56, 47),
    "south": (8, 3, 56, 48),
}

PALETTES = {
    "hair": ((42, 28, 18), (72, 47, 27), (105, 70, 39), (145, 98, 55)),
    "clothing": ((16, 54, 66), (24, 116, 144), (41, 151, 181), (95, 190, 210)),
    "hat": ((10, 18, 31), (18, 32, 55), (28, 49, 82), (60, 82, 118)),
}

CLOTHING_VARIANTS = {
    "classic-shirt": ((16, 54, 66), (24, 116, 144), (41, 151, 181), (95, 190, 210)),
    "radio-hoodie": ((7, 42, 55), (19, 107, 139), (34, 159, 190), (97, 208, 226)),
    "night-hoodie": ((12, 17, 31), (24, 36, 62), (42, 65, 100), (95, 120, 160)),
}


def recolor(image: Image.Image, palette: tuple[tuple[int, int, int], ...]) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            r, g, b, a = pixels[x, y]
            if a == 0:
                continue
            luminance = int((r * 0.299) + (g * 0.587) + (b * 0.114))
            index = min(len(palette) - 1, max(0, luminance * len(palette) // 256))
            nr, ng, nb = palette[index]
            pixels[x, y] = (nr, ng, nb, a)
    return rgba


def crop_layer(sheet: Image.Image, frame: tuple[int, int], direction: str) -> Image.Image:
    fx, fy = frame
    frame_image = sheet.crop((fx * 64, fy * 64, (fx + 1) * 64, (fy + 1) * 64))
    trimmed = frame_image.crop(TRIM_BOXES[direction])
    canvas = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    canvas.alpha_composite(trimmed, ((64 - trimmed.width) // 2, 8))
    return canvas


def main() -> None:
    missing = [str(path) for path in SOURCES.values() if not path.exists()]
    if missing:
        raise FileNotFoundError("Missing LPC source files:\n" + "\n".join(missing))

    for direction, frame in FRAMES.items():
        target_dir = OUT / direction
        target_dir.mkdir(parents=True, exist_ok=True)
        for layer, source in SOURCES.items():
            image = crop_layer(Image.open(source).convert("RGBA"), frame, direction)
            if layer in PALETTES:
                image = recolor(image, PALETTES[layer])
            image.save(target_dir / f"{layer}.png")
            if layer == "clothing":
                base = crop_layer(Image.open(source).convert("RGBA"), frame, direction)
                for variant, palette in CLOTHING_VARIANTS.items():
                    recolor(base.copy(), palette).save(target_dir / f"clothing-{variant}.png")


if __name__ == "__main__":
    main()
