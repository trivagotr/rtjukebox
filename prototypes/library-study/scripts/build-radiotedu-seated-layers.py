from __future__ import annotations

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "seated-models"
OUT = ROOT / "assets" / "avatar-radiotedu" / "seated"

DIRECTIONS = ("north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west")
OUTFITS = {
    "classic-shirt": "classic",
    "radio-hoodie": "radio",
    "night-hoodie": "night",
    "break-shirt": "break",
}


def transparent_like(image: Image.Image) -> Image.Image:
    return Image.new("RGBA", image.size, (0, 0, 0, 0))


def classify_pixel(r: int, g: int, b: int, a: int) -> str:
    if a == 0:
        return "empty"
    brightness = max(r, g, b)
    if r > 150 and g > 85 and b < 95:
        return "skin"
    if r > 36 and g > 24 and b > 14 and r >= g >= b and brightness < 140:
        return "hair"
    if b > 65 and g > 45 and b >= r + 18:
        return "clothing"
    if g > 70 and b > 58 and r < 75:
        return "clothing"
    return "body"


def extract_layers(image: Image.Image) -> dict[str, Image.Image]:
    rgba = image.convert("RGBA")
    layers = {
        "body": transparent_like(rgba),
        "skin": transparent_like(rgba),
        "hair": transparent_like(rgba),
        "clothing": transparent_like(rgba),
    }
    source = rgba.load()
    targets = {name: layer.load() for name, layer in layers.items()}
    for y in range(rgba.height):
        for x in range(rgba.width):
            r, g, b, a = source[x, y]
            bucket = classify_pixel(r, g, b, a)
            if bucket in targets:
                targets[bucket][x, y] = (r, g, b, a)
    return layers


def write_direction(direction: str) -> None:
    target_dir = OUT / direction
    target_dir.mkdir(parents=True, exist_ok=True)
    classic_source = Image.open(SOURCE / f"avatar-classic-{direction}-sit.png")
    classic_layers = extract_layers(classic_source)
    for name in ("body", "skin", "hair"):
        classic_layers[name].save(target_dir / f"{name}.png")
    transparent_like(classic_source).save(target_dir / "hat.png")

    for clothing_name, source_name in OUTFITS.items():
        image = Image.open(SOURCE / f"avatar-{source_name}-{direction}-sit.png")
        extract_layers(image)["clothing"].save(target_dir / f"clothing-{clothing_name}.png")


def main() -> None:
    missing = [
        SOURCE / f"avatar-{source_name}-{direction}-sit.png"
        for source_name in set(OUTFITS.values()) | {"classic"}
        for direction in DIRECTIONS
        if not (SOURCE / f"avatar-{source_name}-{direction}-sit.png").exists()
    ]
    if missing:
        raise FileNotFoundError("Missing RadioTEDU seated model sources:\n" + "\n".join(str(path) for path in missing))

    for direction in DIRECTIONS:
        write_direction(direction)


if __name__ == "__main__":
    main()
