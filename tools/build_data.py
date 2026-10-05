"""Ubah semua data/*.json menjadi data/*.js.

File .js dipakai saat index.html dibuka langsung (file://), karena browser
melarang fetch() file lokal. Jalankan setiap kali selesai mengedit JSON:

    python tools/build_data.py
"""
import json
import pathlib

DATA = pathlib.Path(__file__).resolve().parent.parent / "data"

for src in sorted(DATA.glob("*.json")):
    data = json.loads(src.read_text(encoding="utf-8"))  # sekaligus validasi JSON
    key = src.stem
    body = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    out = src.with_suffix(".js")
    # newline="\n": hasilnya sama persis di Windows dan Linux, supaya pemeriksaan
    # sinkron di GitHub Actions tidak gagal gara-gara beda akhir baris.
    with out.open("w", encoding="utf-8", newline="\n") as fh:
        fh.write(
            "// Dibuat otomatis dari " + src.name + " oleh tools/build_data.py. Jangan diedit manual.\n"
            f"window.TKA_DATA = window.TKA_DATA || {{}};\nwindow.TKA_DATA[{json.dumps(key)}] = {body};\n"
        )
    print(f"{src.name} -> {out.name}: {len(data['soal'])} soal, {len(data['stimulus'])} stimulus")
