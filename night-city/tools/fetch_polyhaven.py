"""Download the CC0 Poly Haven assets used by alley.html into ../assets.

Usage: python3 tools/fetch_polyhaven.py
Already-downloaded files are skipped, so the script can be re-run safely.
"""
import json
import os
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets")
UA = {"User-Agent": "night-city-demo/1.0"}

MODELS = {
    "WetFloorSign_01": "2k",
    "utility_box_02": "1k",
    "utility_box_01": "1k",
    "cardboard_box_01": "1k",
    "trashbag": "1k",
    "metal_trash_can": "1k",
    "street_lamp_02": "1k",
    "industrial_wall_lamp": "1k",
    "security_light": "1k",
    "pull_chain_light_socket": "1k",
    "exterior_aircon_unit": "1k",
    "modular_fire_escape": "1k",
    "modular_airduct_rectangular_01": "1k",
    "modular_industrial_pipes_01": "1k",
    "rollershutter_door": "1k",
    "rollershutter_window_01": "1k",
    "modular_urban_apartments_facade": "1k",
    "water_manhole_cover": "1k",
    "plastic_crate_01": "1k",
    "barrel_03": "1k",
    "potted_plant_02": "1k",
    "street_rat": "1k",
    "wooden_crate_02": "1k",
    "old_tyre": "1k",
}

# texture id -> resolution; maps: diffuse, OpenGL normal, ARM (AO/Rough/Metal)
TEXTURES = {
    # alley
    "asphalt_02": "2k",
    "brick_wall_001": "2k",
    "medieval_red_brick": "2k",
    "painted_plaster_wall": "2k",
    "worn_plaster_wall": "2k",
    "concrete_wall_006": "1k",
    # city: facades
    "concrete_tile_facade": "1k",
    "exterior_wall_cladding_03": "1k",
    "exterior_wall_cladding_02": "1k",
    "beige_wall_002": "1k",
    "rectangular_facade_tiles_02": "1k",
    "white_sandstone_blocks_02": "1k",
    # city: roofs, streets, parks, metal
    "tarred_gravel": "1k",
    "gravel_concrete": "1k",
    "aerial_asphalt_01": "1k",
    "square_concrete_pavers": "1k",
    "aerial_grass_rock": "1k",
    "metal_plate_02": "1k",
}
TEXTURE_MAPS = {"Diffuse": "diff", "nor_gl": "nor_gl", "arm": "arm"}

# HDR environments (equirectangular)
HDRIS = {
    "shanghai_bund": "1k",
}


def api(asset_id):
    req = urllib.request.Request(f"https://api.polyhaven.com/files/{asset_id}", headers=UA)
    return json.load(urllib.request.urlopen(req))


def download(url, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return 0
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    req = urllib.request.Request(url, headers=UA)
    data = urllib.request.urlopen(req).read()
    with open(dest + ".part", "wb") as f:
        f.write(data)
    os.replace(dest + ".part", dest)
    return len(data)


def jobs():
    for asset_id, res in MODELS.items():
        gl = api(asset_id)["gltf"][res]["gltf"]
        base = os.path.join(ROOT, "models", asset_id)
        yield gl["url"], os.path.join(base, f"{asset_id}.gltf")
        for rel, info in gl.get("include", {}).items():
            yield info["url"], os.path.join(base, rel)
    for asset_id, res in TEXTURES.items():
        files = api(asset_id)
        for key, short in TEXTURE_MAPS.items():
            if key == "arm" and key not in files and "Rough" in files:
                key = "Rough"  # grayscale roughness: fine where only the G (roughness) channel is read
            if key not in files:
                print(f"  ! {asset_id} has no {key}", file=sys.stderr)
                continue
            entry = files[key][res]
            url = entry["jpg"]["url"] if "jpg" in entry else entry["png"]["url"]
            ext = os.path.splitext(url)[1]
            yield url, os.path.join(ROOT, "textures", asset_id, f"{short}{ext}")
    for asset_id, res in HDRIS.items():
        url = api(asset_id)["hdri"][res]["hdr"]["url"]
        yield url, os.path.join(ROOT, "hdri", f"{asset_id}_{res}.hdr")


def main():
    todo = list(jobs())
    print(f"{len(todo)} files")
    total = 0
    with ThreadPoolExecutor(max_workers=8) as pool:
        for n in pool.map(lambda j: download(*j), todo):
            total += n
    print(f"downloaded {total / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
