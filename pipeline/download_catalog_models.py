"""Download low-poly models from Polyfork and catalogue them by category.
Saves .glb files into assets/models/<category>/<id>.glb with category indexes.

Usage:
    python pipeline/download_catalog_models.py
"""

import json
import os
import sys
import urllib.request
import urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS_DIR = ROOT / "assets"
MODELS_DIR = ASSETS_DIR / "models"

HEADERS = {"User-Agent": "roblox-shorts/1.0"}

CATEGORIES = {
    "coroas_e_acessorios": {
        "title": "Coroas e Acessórios de Cabeça",
        "description": "Coroas reais, elmos de cavaleiro, capacetes e acessórios de cabeça.",
        "assets": [
            "crown-a294ce",
            "great-helm-2551bc",
            "steel-helmet-f5aa7d",
            "flight-helmet-56f390",
            "skate-helmet-cf1e6e",
            "call-headset-a95887",
        ],
    },
    "animais": {
        "title": "Animais",
        "description": "Animais domésticos, selvagens, de fazenda e criaturas de fantasia.",
        "assets": [
            "dog-base",
            "farm-dog-723730",
            "cat-base",
            "arched-black-cat-407cf6",
            "cow-c61a66",
            "chicken-e70282",
            "pig-868bda",
            "goat-1dedee",
            "duck-357dc6",
            "black-bear-adbdc7",
            "forest-deer-fe648d",
            "forest-rabbit-ea2da0",
            "red-fox-5c3bc0",
            "dungeon-rat-cbb03c",
            "purple-flame-dragon-base",
            "spectral-stag-base",
            "xoloitzcuintli-1cd7c8",
            "honey-moth-base",
        ],
    },
    "objetos_comuns": {
        "title": "Objetos Comuns e Props",
        "description": "Objetos do dia a dia, tecnologia, mobília, recipientes e acessórios.",
        "assets": [
            "smartphone-5f05e5",
            "righthand-item-cf3cdf",
            "desk-keyboard-6cd4d9",
            "desk-mouse-2c7d42",
            "desk-monitor-32cfce",
            "pupil-backpack-d9b5fb",
            "adventurer-s-backpack-b1365c",
            "guitar-b013ee",
            "office-mug-8afee0",
            "coffee-cup-90be67",
            "takeaway-coffee-cup-1fd6dd",
            "dorm-desk-chair-9b4076",
            "teacher-s-desk-381eeb",
            "chained-book-lectern-381597",
            "hooded-lantern-b60021",
            "miner-lantern-c13511",
            "oak-barrel-b65311",
            "timber-crate-ba0739",
            "campsite-picnic-table-361d51",
            "beehive-2e70bf",
            "clothes-line-ee47e4",
        ],
    },
    "comida": {
        "title": "Comidas e Alimentos",
        "description": "Lanches, refeições, frutas e plantações.",
        "assets": [
            "hamburger-060fd6",
            "pizza-slice-ddfb9d",
            "apple-tree-ef0ba0",
            "berry-bush-ee4812",
            "corn-crop-b71f2f",
        ],
    },
    "armas_e_tesouros": {
        "title": "Armas, Tesouros e Fantasia",
        "description": "Espadas, escudos, baús de tesouro, moedas, gemas preciosas e poções.",
        "assets": [
            "sword-0e681b",
            "greatsword-a956f3",
            "arming-sword-401972",
            "arming-sword-ab8738",
            "heater-shield-c51b76",
            "jewelled-dagger-38f556",
            "spear-e9824e",
            "hand-axe-cee9e7",
            "legendary-chest-4abed4",
            "mimic-chest-57e440",
            "gold-coin-29afc1",
            "gold-coin-stack-a9ef52",
            "gold-ingot-85e62e",
            "gold-nugget-ccd143",
            "cut-diamond-1fd38b",
            "cut-ruby-3ded3a",
            "cut-emerald-74d180",
            "cut-sapphire-04ba83",
            "potion-bottle-099ad7",
            "goblet-87c3ba",
            "chest-key-458007",
        ],
    },
    "veiculos": {
        "title": "Veículos e Transporte",
        "description": "Veículos terrestres, barcos e transporte rústico.",
        "assets": [
            "compact-tractor-35b84b",
            "ranger-pickup-truck-97057d",
            "wooden-rowboat-916981",
            "mine-cart-94bd76",
            "wooden-hand-cart-3ae5b5",
        ],
    },
}


def fetch_json(url):
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read().decode("utf-8"))
    except Exception as e:
        return None


def download_file(url, target_path):
    target_path = Path(target_path)
    if target_path.exists() and target_path.stat().st_size > 0:
        return True, "already exists"
    target_path.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=45) as r:
            content = r.read()
            if len(content) < 100 or content[:4] != b"glTF":
                return False, f"Invalid glTF header or file too small ({len(content)} bytes)"
            target_path.write_bytes(content)
            return True, f"saved ({len(content)} bytes)"
    except Exception as e:
        return False, str(e)


def main():
    print("=" * 60)
    print("Polyfork Low-Poly Asset Downloader & Cataloguer")
    print("=" * 60)

    total_downloaded = 0
    total_skipped = 0
    total_failed = 0

    catalog_index = {}

    for cat_slug, cat_info in CATEGORIES.items():
        cat_dir = MODELS_DIR / cat_slug
        cat_dir.mkdir(parents=True, exist_ok=True)
        print(f"\n📂 Processando categoria: {cat_info['title']} ({cat_slug})")

        cat_manifest = {
            "category": cat_slug,
            "title": cat_info["title"],
            "description": cat_info["description"],
            "models": [],
        }

        for asset_id in cat_info["assets"]:
            glb_path = cat_dir / f"{asset_id}.glb"
            glb_url = f"https://polyfork.dev/cdn/{asset_id}.glb"
            api_url = f"https://polyfork.dev/api/assets/{asset_id}"

            # Fetch metadata
            meta = fetch_json(api_url) or {}
            title = meta.get("title", asset_id)
            triangles = meta.get("triangles", "?")
            size_m = meta.get("size_m", {})
            description = meta.get("description", "")
            class_type = meta.get("class", "prop")

            # Download GLB
            success, msg = download_file(glb_url, glb_path)
            if success:
                if "already exists" in msg:
                    total_skipped += 1
                    status_icon = "⏩"
                else:
                    total_downloaded += 1
                    status_icon = "✅"
                print(f"  {status_icon} [{title}] ({asset_id}): {msg}")
            else:
                total_failed += 1
                print(f"  ❌ [{title}] ({asset_id}): FALHOU - {msg}")

            cat_manifest["models"].append(
                {
                    "id": asset_id,
                    "title": title,
                    "class": class_type,
                    "triangles": triangles,
                    "size_m": size_m,
                    "description": description,
                    "file": f"{asset_id}.glb",
                    "cdn_url": glb_url,
                    "polyfork_page": f"https://polyfork.dev/asset/{asset_id}",
                }
            )

        # Save category manifest
        manifest_path = cat_dir / "manifest.json"
        manifest_path.write_text(json.dumps(cat_manifest, indent=2, ensure_ascii=False), encoding="utf-8")
        catalog_index[cat_slug] = cat_manifest

    # Save master manifest
    master_manifest_path = MODELS_DIR / "manifest.json"
    master_manifest_path.write_text(json.dumps(catalog_index, indent=2, ensure_ascii=False), encoding="utf-8")

    print("\n" + "=" * 60)
    print(f"Download Concluído! Novos: {total_downloaded}, Existentes: {total_skipped}, Falhas: {total_failed}")
    print(f"Manifesto mestre salvo em: {master_manifest_path}")
    print("=" * 60)


if __name__ == "__main__":
    main()
