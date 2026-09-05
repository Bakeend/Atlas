from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import unquote

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "public" / "manifest.webmanifest"
RES = ROOT / "android" / "app" / "src" / "main" / "res"

DENSITIES = {
    "mdpi": 48,
    "hdpi": 72,
    "xhdpi": 96,
    "xxhdpi": 144,
    "xxxhdpi": 192,
}

# Adaptive foreground is based on a 108dp canvas.
ADAPTIVE = {
    "mdpi": 108,
    "hdpi": 162,
    "xhdpi": 216,
    "xxhdpi": 324,
    "xxxhdpi": 432,
}


def resolve_source_icon() -> Path:
    data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    icons = data.get("icons") or []
    if not icons:
        raise RuntimeError("manifest.webmanifest does not define an app icon")

    src = unquote(icons[0]["src"]).lstrip("/")
    path = ROOT / "public" / src.removeprefix("public/")
    if path.exists():
        return path

    # Fallback for legacy/mojibake filenames: select the icon referenced by
    # the manifest from the public/icons directory by matching the basename.
    basename = Path(src).name
    for candidate in (ROOT / "public" / "icons").glob("*.png"):
        if candidate.name == basename:
            return candidate

    raise FileNotFoundError(f"Atlas icon not found: {src}")


def square_rgba(image: Image.Image) -> Image.Image:
    image = image.convert("RGBA")
    size = max(image.width, image.height)
    canvas = Image.new("RGBA", (size, size), (255, 255, 255, 0))
    x = (size - image.width) // 2
    y = (size - image.height) // 2
    canvas.alpha_composite(image, (x, y))
    return canvas


def save_resized(source: Image.Image, path: Path, size: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    resized = source.resize((size, size), Image.Resampling.LANCZOS)
    resized.save(path, format="PNG", optimize=True)


def main() -> None:
    source_path = resolve_source_icon()
    source = square_rgba(Image.open(source_path))

    for density, size in DENSITIES.items():
        folder = RES / f"mipmap-{density}"
        save_resized(source, folder / "ic_launcher.png", size)
        save_resized(source, folder / "ic_launcher_round.png", size)

    for density, size in ADAPTIVE.items():
        folder = RES / f"mipmap-{density}"
        save_resized(source, folder / "ic_launcher_foreground.png", size)

    print(f"Android launcher icons generated from: {source_path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
