# Simulasi TKA — Latihan, Kunci Jawaban & Pembuat Slide

Web statis (HTML/CSS/JS, tanpa server/backend) yang mengubah file JSON soal TKA menjadi:

1. **Kerjakan soal**: tampilan seperti ujian berbasis komputer (CBT). Ada sisa waktu,
   tombol *Ragu-ragu*, *Daftar Soal*, dan ukuran font. Progres tersimpan di browser,
   jadi aman kalau halaman tertutup.

   Setelah menekan **Selesai**, nilai langsung keluar beserta peta nomor soal
   (hijau = benar, merah = salah/kosong). Ketuk nomor mana pun untuk masuk
   **Mode Pembahasan**: jawabanmu, kunci yang benar, dan alasannya ditampilkan
   sekaligus dalam satu layar.
2. **Kunci jawaban & pembahasan**: jawaban benar sudah tercentang + alasannya.
3. **Buat slide TikTok**: slide 1080×1920 (sampul + 1 slide per soal) dengan jawaban
   tercentang, bisa diunduh satu per satu (PNG) atau semuanya sekaligus (ZIP).

## Struktur

```
index.html            halaman utama
css/style.css         tampilan
js/app.js             logika: render soal, latihan, nilai, slide, ekspor PNG
data/paket-2.json     data soal Bahasa Inggris (sumber utama)
data/matematika-gladi.json  data soal Matematika (gladi Oktober, 24 soal)
data/paket-2.js       salinan otomatis dari JSON, dipakai saat dibuka via file://
tools/build_data.py   membuat data/*.js dari data/*.json
assets/icon.svg       logo
assets/soal/          gambar soal (grafik, ilustrasi) per paket
.github/workflows/    validasi data soal otomatis di GitHub Actions
```

## Menjalankan

- **Lewat server** (disarankan): Laragon, `php -S localhost:8000`, atau GitHub Pages.
  Data dibaca dari `data/paket-2.json`.
- **Klik dua kali `index.html`**: juga bisa. Data dibaca dari `data/paket-2.js`.

## Mengubah / menambah soal

1. Edit `data/paket-2.json` (format sama seperti sekarang: `meta`, `stimulus`, `soal`).
2. Jalankan `python tools/build_data.py` supaya `data/paket-2.js` ikut terbarui.
3. Untuk paket lain, buat misalnya `data/paket-1.json`, jalankan skrip di atas,
   lalu buka `index.html?paket=paket-1`.

Tipe soal yang didukung: `single` (pilihan ganda), `multiple` (pilihan ganda kompleks),
`category` (tabel kategori/benar-salah).

## Paket Matematika

Buka beranda lalu pilih tab **Matematika** (atau `index.html?paket=matematika-gladi`).
Soal ditranskripsi dari unggahan TikTok @timtentor, dan setiap kunci dihitung ulang. Tiga hal berbeda dari sumber:
No. 15 (sumber 6 m → 10 m), No. 20 (sumber A, B, C, D → A, D), dan pilihan E No. 14 disusun ulang
karena tidak ada di tangkapan layar. Soal No. 18 tidak ada di sumber, jadi nomor diurutkan ulang.

Soal tanpa teks bacaan tampil satu kolom. Di field `question`, paragraf `[gambar]` dan `[tabel]`
diganti isi field `image` dan `table`.

## Deploy

Situs ini statis, jadi bisa langsung di-host tanpa konfigurasi apa pun:

- **Vercel**: hubungkan repo, biarkan semua setelan default (tanpa build command,
  output directory diisi `.`). Nama proyek harus huruf kecil, misalnya
  `simulasi-bahasa-inggris`.
- **GitHub Pages**: Settings - Pages - pilih *Deploy from a branch*, branch `main`, folder `/`.
- **Lokal**: Laragon atau `python -m http.server`.

Workflow `.github/workflows/ci.yml` tidak melakukan deploy. Tugasnya hanya
memvalidasi `data/*.json` dan memastikan `data/*.js` sudah sinkron; kalau lupa
menjalankan `python tools/build_data.py`, CI gagal dengan pesan yang jelas.

## Lisensi

Kode memakai lisensi MIT (lihat `LICENSE`). Isi soal dan teks bacaan di `data/`
berasal dari simulasi TKA Pusmendik dan **tidak** tercakup lisensi itu — hanya
dipakai untuk latihan/pendidikan.

## Catatan

- Gambar stimulus hanya ditampilkan untuk stimulus bertipe `"image"` (saat ini `teks-2`).
  Stimulus bertipe `text`/`text+table` memakai `summary` dan `table`, jadi field `image` di
  `teks-4` dan `teks-5` memang belum dipakai — isinya sudah terwakili teks dan tabel.
- Gambar infografis diambil langsung dari server Pusmendik. Server itu tidak mengizinkan
  gambarnya disalin ke file PNG (CORS), jadi saat **ekspor slide** infografis otomatis diganti
  daftar poin dari field `points`. Di mode latihan/kunci gambar tetap tampil.
  Kalau menambah stimulus `"image"` baru, isi juga `points` supaya slide tidak kosong.
- Teks bacaan di JSON berupa **ringkasan**. Untuk teks lengkap, tambahkan isinya ke field
  `summary` (atau sesuaikan sendiri).
- Ini latihan **tidak resmi**. Logo dan nama sengaja dibuat netral ("Simulasi TKA – Latihan
  Mandiri"), bukan logo instansi, agar tidak disangka aplikasi resmi.
- Ekspor PNG memakai [html2canvas](https://html2canvas.hertzen.com/) dan
  [JSZip](https://stuk.github.io/jszip/) dari cdnjs, jadi butuh internet saat mengunduh slide.
