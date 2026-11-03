"""Render icons/icon.svg to the PNG sizes iOS and Android need. Needs: pip install pymupdf"""
import pathlib, pymupdf

here = pathlib.Path(__file__).resolve().parent.parent / "icons"
svg = pymupdf.open(str(here / "icon.svg"))
page = svg[0]
for size in (180, 192, 512):
    zoom = size / page.rect.width
    page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=False).save(str(here / f"icon-{size}.png"))
    print("icon", size)
