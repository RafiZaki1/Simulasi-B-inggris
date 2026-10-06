/* Simulasi TKA — latihan, kunci jawaban, dan pembuat slide dari data JSON. */
(() => {
  'use strict';

  const PAKET = new URLSearchParams(location.search).get('paket') || 'paket-2';
  const STORE_KEY = `tka:${PAKET}`;
  const FONT_SIZES = { s: '14px', m: '15.5px', l: '18px' };
  const CDN = {
    html2canvas: 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
    jszip: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  };

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let DATA = null;
  let STIM = {};
  const S = {
    view: 'home',
    mode: 'latihan', // 'latihan' | 'kunci' | 'review'
    idx: 0,
    answers: {},
    ragu: new Set(),
    endAt: 0,
    startedAt: 0,
    finishedAt: 0,
    finished: false,
    fs: 'm',
    slideIdx: 0,
  };

  // ================= Utilitas =================
  let toastTimer;
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('is-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-show'), 2800);
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Gagal memuat ' + src));
      document.head.appendChild(s);
    });
  }

  const pad = (n) => String(n).padStart(2, '0');
  function hms(sec) {
    sec = Math.max(0, Math.round(sec));
    return `${pad(Math.floor(sec / 3600))}:${pad(Math.floor((sec % 3600) / 60))}:${pad(sec % 60)}`;
  }

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        answers: S.answers, ragu: [...S.ragu], idx: S.idx, endAt: S.endAt, startedAt: S.startedAt,
        finishedAt: S.finishedAt, finished: S.finished, fs: S.fs,
      }));
    } catch { /* penyimpanan tidak tersedia: abaikan */ }
  }

  function restore() {
    try {
      const d = JSON.parse(localStorage.getItem(STORE_KEY));
      if (!d) return;
      Object.assign(S, { answers: d.answers || {}, ragu: new Set(d.ragu || []), idx: d.idx || 0, endAt: d.endAt || 0,
        startedAt: d.startedAt || 0, finishedAt: d.finishedAt || 0, finished: !!d.finished, fs: d.fs || 'm' });
    } catch { /* data rusak: mulai baru */ }
  }

  function resetProgress() {
    Object.assign(S, { answers: {}, ragu: new Set(), idx: 0, endAt: 0, startedAt: 0, finishedAt: 0, finished: false });
    save();
  }

  // ================= Data =================
  async function loadData() {
    if (location.protocol.startsWith('http')) {
      try {
        const res = await fetch(`data/${PAKET}.json`, { cache: 'no-cache' });
        if (res.ok) return await res.json();
      } catch { /* lanjut ke cadangan .js */ }
    }
    if (!window.TKA_DATA?.[PAKET]) {
      try { await loadScript(`data/${PAKET}.js`); } catch { /* ditangani di bawah */ }
    }
    if (window.TKA_DATA?.[PAKET]) return window.TKA_DATA[PAKET];
    throw new Error(`Data "${PAKET}" tidak ditemukan. Pastikan ada data/${PAKET}.json (dan jalankan tools/build_data.py).`);
  }

  const soal = () => DATA.soal;
  const total = () => DATA.soal.length;

  function isAnswered(q, a) {
    if (q.type === 'single') return !!a;
    if (q.type === 'multiple') return Array.isArray(a) && a.length > 0;
    return !!a && Object.keys(a).length > 0;
  }

  function isCorrect(q, a) {
    if (!isAnswered(q, a)) return false;
    if (q.type === 'single') return a === q.answer;
    if (q.type === 'multiple') return a.length === q.answer.length && q.answer.every((k) => a.includes(k));
    return q.statements.every((s) => a[s.key] === q.answer[s.key]);
  }

  function formatAnswer(q, a) {
    if (!isAnswered(q, a)) return 'tidak dijawab';
    if (q.type === 'single') return a;
    if (q.type === 'multiple') return [...a].sort().join(', ');
    return q.statements.map((s) => `${s.key} → ${a[s.key] || '–'}`).join('; ');
  }

  // ================= Render soal (dipakai ujian & slide) =================
  /** Pecah teks jadi paragraf: baris kosong = paragraf baru, enter tunggal = <br>. */
  function paragraphsHTML(teks) {
    return String(teks)
      .split(/\n\s*\n/)
      .map((par) => par.trim())
      .filter(Boolean)
      .map((par) => `<p>${esc(par).replace(/\n/g, '<br>')}</p>`)
      .join('');
  }

  function stimulusHTML(st, { forSlide }) {
    if (!st) return '';
    let h = `<h3>${esc(st.title)}</h3>`;
    if (st.type === 'image' && st.image) {
      h += `<img class="stim__img" src="${esc(st.image)}" alt="${esc(st.title)}" referrerpolicy="no-referrer">`;
    } else if (!forSlide) {
      h += `<span class="stim__tag">${st.text_en ? 'Teks Bacaan (English)' : 'Ringkasan teks bacaan'}</span>`;
    }
    if (st.type !== 'image') {
      if (st.text_en) {
        // Teks asli bahasa Inggris. Terjemahan sengaja disembunyikan di balik
        // tombol supaya teks Inggrisnya dicoba lebih dulu.
        h += `<div class="stim__en">${paragraphsHTML(st.text_en)}</div>`;
        if (st.text_id && !forSlide) {
          h += '<button type="button" class="stim__trbtn" data-act="translate" aria-expanded="false">'
            + '<span class="stim__trico">🌐</span> <span class="stim__trtext">Lihat terjemahan (Translate)</span></button>'
            + '<div class="stim__id" hidden>'
            + '<span class="stim__tag stim__tag--id">Terjemahan Bahasa Indonesia</span>'
            + `${paragraphsHTML(st.text_id)}</div>`;
        }
      } else if (st.summary) {
        h += `<p>${esc(st.summary)}</p>`;
      }
    }
    if (st.points?.length) {
      // daftar poin muncul jika gambar infografis gagal dimuat
      h += `<ol class="stim__points"${st.image ? ' hidden' : ''}>${st.points.map((p) => `<li>${esc(p)}</li>`).join('')}</ol>`;
    }
    if (st.table) {
      const t = st.table;
      h += `<table class="data-table"><caption>${esc(t.caption)}</caption><thead><tr>${t.columns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>`
        + `<tbody>${t.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    }
    if (st.source_url) {
      h += `<p class="stim__src">Adapted from: <a href="${esc(st.source_url)}" target="_blank" rel="noopener">${esc(st.source_url)}</a></p>`;
    }
    return h;
  }

  function tableHTML(t) {
    return `<table class="data-table q-table">${t.caption ? `<caption>${esc(t.caption)}</caption>` : ''}`
      + `<thead><tr>${t.columns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>`
      + `<tbody>${t.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }

  /** Teks soal: paragraf dipisah baris kosong; paragraf "[gambar]" / "[tabel]" diganti gambar / tabel soal. */
  function questionHTML(q) {
    return String(q.question || '').split(/\n\s*\n/).map((par) => par.trim()).filter(Boolean).map((par) => {
      if (par === '[gambar]' && q.image) return `<img class="q-img" src="${esc(q.image)}" alt="${esc(q.image_alt || '')}">`;
      if (par === '[tabel]' && q.table) return tableHTML(q.table);
      return `<p>${esc(par).replace(/\n/g, '<br>')}</p>`;
    }).join('');
  }

  function optionsHTML(q, selected, { review, disabled }) {
    const dis = disabled ? ' disabled' : '';
    if (q.type === 'category') {
      const head = `<tr><th>${esc(q.statement_label || 'Pernyataan')}</th>${q.columns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr>`;
      const rows = q.statements.map((s) => {
        const cells = q.columns.map((col) => {
          const on = selected?.[s.key] === col;
          const key = q.answer[s.key] === col;
          const cls = ['opt', on && 'is-on', review && key && 'is-key', review && on && !key && 'is-wrong'].filter(Boolean).join(' ');
          return `<td><label class="${cls}" aria-label="${esc(s.text)}: ${esc(col)}"><input type="radio" name="q${q.no}-${s.key}" value="${esc(col)}" data-stmt="${s.key}"${on ? ' checked' : ''}${dis}><span class="mark mark--radio"></span></label></td>`;
        }).join('');
        return `<tr><td>${esc(s.text)}</td>${cells}</tr>`;
      }).join('');
      return `<table class="cat-table"><thead>${head}</thead><tbody>${rows}</tbody></table>`;
    }

    const multi = q.type === 'multiple';
    const keys = multi ? q.answer : [q.answer];
    return `<ul class="opts">${q.options.map((o) => {
      const on = multi ? (selected || []).includes(o.key) : selected === o.key;
      const key = keys.includes(o.key);
      const cls = ['opt', on && 'is-on', review && key && 'is-key', review && on && !key && 'is-wrong'].filter(Boolean).join(' ');
      return `<li><label class="${cls}"><input type="${multi ? 'checkbox' : 'radio'}" name="q${q.no}" value="${o.key}"${on ? ' checked' : ''}${dis}>`
        + `<span class="mark mark--${multi ? 'check' : 'radio'}"></span><span class="txt">${esc(o.text)}</span></label></li>`;
    }).join('')}</ul>`;
  }

  /**
   * mode: 'latihan' | 'kunci' | 'review' | 'slide'
   */
  function cardHTML(q, mode, { showKey = true, timerText = '' } = {}) {
    const idx = soal().indexOf(q);
    const userAns = S.answers[q.no];
    const useKey = mode === 'kunci' || (mode === 'slide' && showKey);
    const selected = useKey ? q.answer : mode === 'slide' ? null : userAns;
    const review = mode === 'review';
    const last = idx === total() - 1;

    let status;
    if (mode === 'latihan' || mode === 'slide') {
      status = `<span class="pill pill--outline">Sisa Waktu : <b id="timer">${timerText}</b></span>`;
    } else if (mode === 'kunci') {
      status = '<span class="pill pill--green">Kunci Jawaban</span>';
    } else {
      status = isCorrect(q, userAns) ? '<span class="pill pill--green">Benar ✓</span>' : '<span class="pill pill--outline" style="color:#b91c1c;border-color:#fca5a5">Salah ✗</span>';
    }

    const fsBtns = ['s', 'm', 'l'].map((k) => `<button type="button" data-fs="${k}" class="${S.fs === k ? 'is-active' : ''}" aria-label="Ukuran font ${k}">A</button>`).join('');
    const instr = q.instruction ? `<p class="instr">${esc(q.instruction)}</p>` : '';

    let keyBtn = '';
    if (mode === 'latihan') {
      keyBtn = '<button type="button" class="pill pill--outline" data-act="toggle-key">🔑 Kunci Jawaban</button>';
    }

    let explain = '';
    if (mode === 'kunci' || review) {
      const ok = isCorrect(q, userAns);
      explain = `<div class="explain${ok ? ' is-correct' : ''}"><strong>Jawaban: ${esc(formatAnswer(q, q.answer))}</strong>`
        + (review ? `<span class="yours">Jawabanmu: ${esc(formatAnswer(q, userAns))} ${ok ? '✓' : '✗'}</span>` : '')
        + `<div>${esc(q.pembahasan || '').replace(/\n/g, '<br>')}</div></div>`;
    } else if (mode === 'latihan') {
      explain = `<div class="explain stim__keypeek" hidden><strong>Kunci Jawaban: ${esc(formatAnswer(q, q.answer))}</strong>`
        + (userAns ? `<span class="yours">Jawabanmu: ${esc(formatAnswer(q, userAns))}</span>` : '')
        + `<div>${esc(q.pembahasan || '').replace(/\n/g, '<br>')}</div></div>`;
    }

    let middle;
    if (mode === 'latihan' || mode === 'slide') {
      const ragu = mode === 'latihan' && S.ragu.has(q.no);
      middle = `<button type="button" class="nav-btn nav-btn--yellow${ragu ? ' is-ragu' : ''}" data-act="ragu" aria-pressed="${ragu}"><span class="sq"></span> Ragu-ragu</button>`;
    } else {
      middle = '<button type="button" class="nav-btn nav-btn--yellow" data-act="list">▦ Daftar Soal</button>';
    }
    let next;
    if (last && mode === 'latihan') next = '<button type="button" class="nav-btn nav-btn--green" data-act="finish">Selesai <span class="ci">✓</span></button>';
    else if (last && review) next = '<button type="button" class="nav-btn nav-btn--green" data-act="result">Lihat nilai <span class="ci">✓</span></button>';
    else next = `<button type="button" class="nav-btn nav-btn--blue" data-act="next"${last ? ' disabled' : ''}>Soal berikutnya <span class="ci">▶</span></button>`;

    return `
      <div class="q-top">
        <h2 class="q-no">Soal nomor <b>${q.no}</b></h2>
        <div class="q-tools">
          <button type="button" class="pill pill--blue" data-act="info">INFORMASI SOAL</button>
          ${keyBtn}
          ${status}
          <button type="button" class="pill pill--blue" data-act="list">Daftar Soal <span class="grid-ico">${'<i></i>'.repeat(9)}</span></button>
        </div>
      </div>
      <div class="q-sub">
        <div class="fs">Ukuran font soal: ${fsBtns}</div>
        <div class="q-mapel">${esc(DATA.meta.mapel)}</div>
      </div>
      <div class="q-body${STIM[q.stimulus_id] ? ' has-split' : ' is-solo'}">
        ${STIM[q.stimulus_id] ? `<div class="stim">${stimulusHTML(STIM[q.stimulus_id], { forSlide: mode === 'slide' })}</div>` : ''}
        <div class="question">
          ${questionHTML(q)}${instr}
          ${optionsHTML(q, selected, { review, disabled: mode !== 'latihan' })}
          ${explain}
        </div>
      </div>
      <div class="q-nav">
        <button type="button" class="nav-btn nav-btn--red" data-act="prev"${idx === 0 ? ' disabled' : ''}><span class="ci">◀</span> Soal sebelumnya</button>
        ${middle}
        ${next}
      </div>`;
  }

  /** Jika gambar infografis gagal dimuat, tampilkan daftar poinnya. */
  function wireImageFallback(root) {
    root.querySelectorAll('.stim__img').forEach((img) => {
      const showPoints = () => {
        img.remove();
        root.querySelectorAll('.stim__points').forEach((ol) => { ol.hidden = false; });
      };
      if (img.complete && img.naturalWidth === 0) showPoints();
      else img.addEventListener('error', showPoints, { once: true });
    });
  }

  // ================= Navigasi tampilan =================
  function show(view) {
    S.view = view;
    document.querySelectorAll('.view').forEach((v) => { v.hidden = v.id !== 'view-' + view; });
    window.scrollTo(0, 0);
  }

  function route() {
    const h = location.hash.slice(1);
    stopTimer();
    if (h === 'latihan') startLatihan();
    else if (h === 'kunci') { S.mode = 'kunci'; show('exam'); renderExam(); }
    else if (h === 'review' && S.finished) { S.mode = 'review'; show('exam'); renderExam(); }
    else if (h === 'hasil') renderResult();
    else if (h === 'slide') openSlides();
    else renderHome();
  }
  const go = (hash) => { if (location.hash === '#' + hash) route(); else location.hash = hash; };

  document.addEventListener('click', (e) => {
    const target = e.target.closest('[data-go]');
    if (target) { e.preventDefault(); go(target.dataset.go === 'home' ? '' : target.dataset.go); }
  });

  // ================= Halaman awal =================
  function renderHome() {
    show('home');
    const m = DATA.meta;
    document.title = m.title;
    $('homeTitle').textContent = m.title;
    $('homeJenjang').textContent = `${m.jenis_mapel} · ${m.jenjang}`;
    $('homeMapel').textContent = m.mapel;
    $('homeTotal').textContent = `${total()} soal`;
    $('homeDurasi').textContent = `${m.durasi_menit} menit`;
    $('homeSource').href = m.source_url;
    $('homeSource').textContent = m.sumber_label || 'sumber soal';
    $('homeNote').textContent = m.catatan_beranda || '';
    document.querySelectorAll('[data-paket]').forEach((a) => a.classList.toggle('is-active', a.dataset.paket === PAKET));

    const answered = soal().filter((q) => isAnswered(q, S.answers[q.no])).length;
    const note = $('homeResume');
    if (S.finished) {
      note.hidden = false;
      note.innerHTML = `Nilai terakhir kamu: <b>${score().nilai}</b>. <a href="#hasil">Lihat hasil</a> atau pilih "Kerjakan soal" untuk mengulang.`;
    } else if (S.startedAt) {
      note.hidden = false;
      note.innerHTML = `Ada latihan yang belum selesai (${answered}/${total()} dijawab, sisa waktu ${hms((S.endAt - Date.now()) / 1000)}). Pilih "Kerjakan soal" untuk melanjutkan.`;
    } else {
      note.hidden = true;
    }
  }

  document.querySelectorAll('.mode').forEach((b) => b.addEventListener('click', () => {
    const mode = b.dataset.mode;
    if (mode === 'latihan' && S.finished) resetProgress();
    if (mode === 'kunci') S.idx = 0;
    go(mode);
  }));

  // ================= Ujian / kunci / review =================
  function startLatihan() {
    if (S.finished) { go('hasil'); return; }
    if (!S.startedAt) {
      S.startedAt = Date.now();
      S.endAt = S.startedAt + DATA.meta.durasi_menit * 60 * 1000;
      S.idx = 0;
      save();
    }
    S.mode = 'latihan';
    show('exam');
    renderExam();
    startTimer();
  }

  function renderExam() {
    S.idx = Math.min(Math.max(S.idx, 0), total() - 1);
    const q = soal()[S.idx];
    const card = $('examCard');
    const stimScroll = card.querySelector('.stim')?.scrollTop || 0;
    const sameStim = card.dataset.stim === q.stimulus_id;
    card.style.setProperty('--fs', FONT_SIZES[S.fs]);
    card.className = 'cbt-wrap';
    card.innerHTML = `<div class="cbt-card">${cardHTML(q, S.mode, { timerText: timerText() })}</div>`;
    card.dataset.stim = q.stimulus_id || '';
    const stimEl = card.querySelector('.stim');
    if (sameStim && stimEl) stimEl.scrollTop = stimScroll;
    wireImageFallback(card);
    $('examUser').textContent = S.mode === 'kunci' ? 'Mode Kunci Jawaban' : S.mode === 'review' ? 'Mode Pembahasan' : 'Peserta Latihan';
  }

  $('examCard').addEventListener('change', (e) => {
    const input = e.target;
    if (S.mode !== 'latihan' || !input.matches('input')) return;
    const q = soal()[S.idx];
    if (q.type === 'single') {
      S.answers[q.no] = input.value;
    } else if (q.type === 'multiple') {
      const set = new Set(S.answers[q.no] || []);
      input.checked ? set.add(input.value) : set.delete(input.value);
      S.answers[q.no] = [...set].sort();
    } else {
      S.answers[q.no] = { ...(S.answers[q.no] || {}), [input.dataset.stmt]: input.value };
    }
    $('examCard').querySelectorAll('.opt').forEach((label) => {
      label.classList.toggle('is-on', label.querySelector('input').checked);
    });
    save();
  });

  $('examCard').addEventListener('click', (e) => {
    const fs = e.target.closest('[data-fs]');
    if (fs) {
      S.fs = fs.dataset.fs;
      save();
      renderExam();
      return;
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    if (act === 'prev') { S.idx--; save(); renderExam(); }
    else if (act === 'next') { S.idx++; save(); renderExam(); }
    else if (act === 'ragu') {
      const no = soal()[S.idx].no;
      S.ragu.has(no) ? S.ragu.delete(no) : S.ragu.add(no);
      save();
      renderExam();
    }
    else if (act === 'list') openList();
    else if (act === 'info') openInfo();
    else if (act === 'finish') confirmFinish();
    else if (act === 'result') go('hasil');
    else if (act === 'translate') {
      const btn = e.target.closest('[data-act="translate"]');
      const box = btn?.parentElement?.querySelector('.stim__id');
      if (box) {
        const isHidden = box.hidden;
        box.hidden = !isHidden;
        btn.setAttribute('aria-expanded', String(isHidden));
        const txt = btn.querySelector('.stim__trtext') || btn;
        txt.textContent = isHidden ? 'Sembunyikan terjemahan' : 'Lihat terjemahan (Translate)';
      }
    }
    else if (act === 'toggle-key') {
      const btn = e.target.closest('[data-act="toggle-key"]');
      const box = $('examCard').querySelector('.stim__keypeek');
      if (box) {
        const isHidden = box.hidden;
        box.hidden = !isHidden;
        btn.classList.toggle('pill--green', isHidden);
        btn.classList.toggle('pill--outline', !isHidden);
        btn.textContent = isHidden ? '🔑 Tutup Kunci' : '🔑 Kunci Jawaban';
      }
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input[type=text]') || !$('modal').hidden) return;
    if (S.view === 'exam') {
      if (e.key === 'ArrowRight' && S.idx < total() - 1) { S.idx++; renderExam(); }
      if (e.key === 'ArrowLeft' && S.idx > 0) { S.idx--; renderExam(); }
    } else if (S.view === 'slide') {
      if (e.key === 'ArrowRight') stepSlide(1);
      if (e.key === 'ArrowLeft') stepSlide(-1);
    }
  });

  // ---------- Timer ----------
  let timerId = 0;
  const timerText = () => (S.mode === 'latihan' ? hms((S.endAt - Date.now()) / 1000) : '');
  function startTimer() {
    stopTimer();
    timerId = setInterval(() => {
      const left = (S.endAt - Date.now()) / 1000;
      const el = $('timer');
      if (el) el.textContent = hms(left);
      if (left <= 0) {
        stopTimer();
        finish();
        toast('Waktu habis! Jawabanmu otomatis dikumpulkan.');
      }
    }, 1000);
  }
  function stopTimer() { clearInterval(timerId); }

  // ---------- Modal ----------
  function openModal(title, html) {
    $('modalTitle').textContent = title;
    $('modalBody').innerHTML = html;
    $('modal').hidden = false;
    $('modal').querySelector('.modal__close').focus();
  }
  function closeModal() { $('modal').hidden = true; }
  $('modal').addEventListener('click', (e) => {
    if (e.target === $('modal') || e.target.closest('[data-close]')) closeModal();
    const num = e.target.closest('[data-idx]');
    if (num) { S.idx = +num.dataset.idx; closeModal(); save(); renderExam(); }
    if (e.target.closest('[data-confirm-finish]')) { closeModal(); finish(); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('modal').hidden) closeModal(); });

  function openList() {
    const review = S.mode === 'review';
    const nums = soal().map((q, i) => {
      const a = S.answers[q.no];
      let cls = 'num';
      if (review) cls += isCorrect(q, a) ? ' is-ok' : ' is-bad';
      else if (S.mode === 'latihan' && S.ragu.has(q.no)) cls += ' is-ragu';
      else if (S.mode === 'latihan' && isAnswered(q, a)) cls += ' is-answered';
      if (i === S.idx) cls += ' is-current';
      return `<button type="button" class="${cls}" data-idx="${i}">${q.no}</button>`;
    }).join('');
    const legend = review
      ? '<span><i class="dot dot--ok"></i> Benar</span><span><i class="dot dot--bad"></i> Salah</span>'
      : S.mode === 'latihan'
        ? '<span><i class="dot dot--answered"></i> Sudah dijawab</span><span><i class="dot dot--ragu"></i> Ragu-ragu</span><span><i class="dot"></i> Belum dijawab</span>'
        : '';
    openModal('Daftar Soal', `<div class="num-grid">${nums}</div><div class="legend">${legend}</div>`);
  }

  function openInfo() {
    const m = DATA.meta;
    openModal('Informasi Soal', `
      <p><b>${esc(m.title)}</b><br>${esc(m.jenis_mapel)} · ${esc(m.jenjang)}</p>
      <ul>
        <li>Jumlah soal: <b>${total()}</b></li>
        <li>Durasi: <b>${m.durasi_menit} menit</b></li>
      </ul>
      <p><b>Petunjuk:</b></p>
      <ul>
        <li><b>Pilihan ganda</b> (lingkaran): pilih satu jawaban.</li>
        <li><b>Pilihan ganda kompleks</b> (kotak): pilih semua jawaban yang benar.</li>
        <li><b>Kategori</b> (tabel): tentukan kolom yang tepat untuk setiap pernyataan.</li>
        <li>Tombol <b>Ragu-ragu</b> menandai soal yang ingin kamu periksa lagi.</li>
      </ul>
      <p class="muted">${esc(m.catatan || '')}</p>`);
  }

  function confirmFinish() {
    const answered = soal().filter((q) => isAnswered(q, S.answers[q.no])).length;
    const ragu = S.ragu.size;
    const empty = total() - answered;
    openModal('Selesai mengerjakan?', `
      <p>Sudah dijawab: <b>${answered}</b> dari ${total()} soal.</p>
      ${empty ? `<p style="color:#b91c1c">Masih ada <b>${empty}</b> soal yang belum dijawab.</p>` : ''}
      ${ragu ? `<p style="color:#b7791f">Ada <b>${ragu}</b> soal yang ditandai ragu-ragu.</p>` : ''}
      <p>Setelah selesai, jawaban tidak bisa diubah.</p>
      <div class="modal__actions">
        <button type="button" class="pill-btn pill-btn--outline" data-close>Periksa lagi</button>
        <button type="button" class="pill-btn pill-btn--blue" data-confirm-finish>Ya, selesai</button>
      </div>`);
  }

  function finish() {
    stopTimer();
    S.finished = true;
    S.finishedAt = Math.min(Date.now(), S.endAt);
    save();
    go('hasil');
  }

  // ================= Hasil =================
  function score() {
    const benar = soal().filter((q) => isCorrect(q, S.answers[q.no])).length;
    return { benar, nilai: Math.round((benar / total()) * 100) };
  }

  function renderResult() {
    if (!S.finished) { go(''); return; }
    show('result');
    const { benar, nilai } = score();
    $('resultScore').textContent = nilai;
    const durasi = Math.round((S.finishedAt - S.startedAt) / 1000);
    $('resultDetail').textContent = `Benar ${benar} dari ${total()} soal · waktu ${hms(durasi)}`;
    $('resultGrid').innerHTML = soal().map((q, i) =>
      `<button type="button" class="num ${isCorrect(q, S.answers[q.no]) ? 'is-ok' : 'is-bad'}" data-review="${i}">${q.no}</button>`).join('');
  }

  $('resultGrid').addEventListener('click', (e) => {
    const b = e.target.closest('[data-review]');
    if (!b) return;
    S.idx = +b.dataset.review;
    go('review');
  });
  $('retryBtn').addEventListener('click', () => { resetProgress(); go('latihan'); });

  // ================= Slide TikTok =================
  const slideCount = () => total() + 1; // + sampul

  function fakeTimer(q) {
    // waktu tersisa yang tampak wajar: berkurang ±37 detik per soal
    return hms(DATA.meta.durasi_menit * 60 - 6 - (q.no - 1) * 37);
  }

  function coverHTML() {
    const m = DATA.meta;
    const part = $('coverPart').value.trim();
    const handle = $('coverHandle').value.trim();
    const paket = (m.mapel.match(/\(([^)]+)\)/) || [])[1] || '';
    const mapel = m.mapel.replace(/\s*\([^)]*\)/, '');
    return `<div class="cover">
      ${part ? `<div class="cover__part">PART ${esc(part)} <i>»</i></div>` : ''}
      <div class="cover__panel">
        <div class="cover__count"><b>${total()}</b><span>SOAL &amp; JAWABAN</span></div>
        <div class="cover__kind">SIMULASI TKA</div>
        <div class="cover__mapel">${esc(mapel.toUpperCase())} ${m.jenis_mapel.includes('Wajib') ? 'WAJIB' : ''}</div>
        ${paket ? `<div class="cover__paket">${esc(paket.toUpperCase())}</div>` : ''}
        <div class="cover__jenjang">${esc(m.jenjang.replace('/MAK', '').toUpperCase())}</div>
      </div>
      <div class="cover__note">Coba kerjakan dulu, baru cocokkan jawabanmu!<small>Lengkap dengan kunci jawaban · durasi ${m.durasi_asli === false ? 'latihan' : 'asli'} ${m.durasi_menit} menit</small></div>
      <div class="cover__foot"></div>
      ${handle ? `<div class="cover__handle">${esc(handle)}</div>` : ''}
    </div>`;
  }

  function slideHTML(i) {
    if (i === 0) return coverHTML();
    const q = soal()[i - 1];
    const handle = $('coverHandle').value.trim();
    return `<div class="slide__head">
        <div class="slide__brand"><img src="assets/icon.svg" alt=""><div><strong>SIMULASI TKA</strong><small>LATIHAN MANDIRI</small></div></div>
        <div class="slide__user">Peserta Latihan</div>
      </div>
      <div class="cbt-card">${cardHTML(q, 'slide', { showKey: $('slideShowKey').checked, timerText: fakeTimer(q) })}</div>
      ${handle ? `<div class="slide__foot">${esc(handle)}</div>` : ''}`;
  }

  /** Kecilkan font sampai kartu soal muat di tinggi slide 1920px. */
  function fitSlide(el) {
    const card = el.querySelector('.cbt-card');
    if (!card) return;
    let fs = 25; // mulai besar agar mudah dibaca di HP, lalu kecilkan bila perlu
    el.style.setProperty('--fs', fs + 'px');
    const limit = 1920 - 70;
    while (card.offsetTop + card.offsetHeight > limit && fs > 12) {
      fs -= 0.5;
      el.style.setProperty('--fs', fs + 'px');
    }
  }

  function renderSlideInto(el, i) {
    el.innerHTML = slideHTML(i);
    wireImageFallback(el);
    fitSlide(el);
    el.querySelectorAll('img').forEach((img) => img.addEventListener('load', () => fitSlide(el), { once: true }));
  }

  function scaleSlide() {
    const vp = $('slideViewport');
    const avail = window.innerHeight - vp.getBoundingClientRect().top - 32;
    const s = Math.min((vp.clientWidth - 32) / 1080, avail / 1920, 1);
    const wrap = $('slideScale');
    wrap.style.width = 1080 * s + 'px';
    wrap.style.height = 1920 * s + 'px';
    $('slide').style.transform = `scale(${s})`;
    $('slide').style.transformOrigin = 'top left';
  }

  async function openSlides() {
    show('slide');
    await document.fonts.ready;
    showSlide();
  }

  function showSlide() {
    S.slideIdx = (S.slideIdx + slideCount()) % slideCount();
    renderSlideInto($('slide'), S.slideIdx);
    $('slideLabel').textContent = S.slideIdx === 0 ? 'Sampul' : `Soal ${S.slideIdx} / ${total()}`;
    scaleSlide();
  }
  function stepSlide(d) { S.slideIdx += d; showSlide(); }

  $('slidePrev').addEventListener('click', () => stepSlide(-1));
  $('slideNext').addEventListener('click', () => stepSlide(1));
  ['coverPart', 'coverHandle'].forEach((id) => $(id).addEventListener('input', showSlide));
  $('slideShowKey').addEventListener('change', showSlide);
  window.addEventListener('resize', () => { if (S.view === 'slide') scaleSlide(); });

  // ---------- Ekspor PNG ----------
  async function ensureLibs(zip) {
    if (!window.html2canvas) await loadScript(CDN.html2canvas);
    if (zip && !window.JSZip) await loadScript(CDN.jszip);
  }

  /** Gambar dari server lain hanya bisa ikut diekspor jika server mengizinkan (CORS). */
  function canUseCors(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = src;
    });
  }

  /** html2canvas tidak selalu bisa menggambar SVG, jadi logo diubah ke PNG dulu. */
  const pngCache = {};
  async function svgToPng(src, size = 160) {
    if (pngCache[src]) return pngCache[src];
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = c.height = size;
    c.getContext('2d').drawImage(img, 0, 0, size, size);
    return (pngCache[src] = c.toDataURL('image/png'));
  }

  async function renderSlidePng(i) {
    const el = $('exportSlide');
    renderSlideInto(el, i);
    for (const img of el.querySelectorAll('img[src$=".svg"]')) img.src = await svgToPng(img.getAttribute('src'));
    for (const img of [...el.querySelectorAll('.stim__img')]) {
      if (!(await canUseCors(img.src))) {
        img.remove();
        el.querySelectorAll('.stim__points').forEach((ol) => { ol.hidden = false; });
      }
    }
    await Promise.all([...el.querySelectorAll('img')].map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }))));
    fitSlide(el);
    const canvas = await window.html2canvas(el, { width: 1080, height: 1920, scale: 1, useCORS: true, backgroundColor: '#f7f8fa', logging: false });
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  }

  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  const fileName = (i) => `tka-${PAKET}-${i === 0 ? '00-sampul' : pad(i)}.png`;

  $('slideDownload').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      await ensureLibs(false);
      download(await renderSlidePng(S.slideIdx), fileName(S.slideIdx));
      toast('Slide diunduh ✓');
    } catch (err) {
      console.error(err);
      toast('Gagal membuat gambar. Periksa koneksi internet lalu coba lagi.');
    } finally {
      btn.disabled = false;
    }
  });

  $('slideDownloadAll').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const label = btn.textContent;
    btn.disabled = true;
    try {
      await ensureLibs(true);
      const zip = new window.JSZip();
      for (let i = 0; i < slideCount(); i++) {
        btn.textContent = `Membuat ${i + 1}/${slideCount()}…`;
        zip.file(fileName(i), await renderSlidePng(i));
      }
      btn.textContent = 'Mengemas ZIP…';
      download(await zip.generateAsync({ type: 'blob' }), `slide-tka-${PAKET}.zip`);
      toast(`${slideCount()} slide diunduh ✓`);
    } catch (err) {
      console.error(err);
      toast('Gagal membuat ZIP. Periksa koneksi internet lalu coba lagi.');
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  });

  // ================= Mulai =================
  (async () => {
    try {
      DATA = await loadData();
      STIM = Object.fromEntries(DATA.stimulus.map((s) => [s.id, s]));
      restore();
      window.addEventListener('hashchange', route);
      route();
    } catch (err) {
      document.body.innerHTML = `<p style="padding:24px;font-family:sans-serif">${esc(err.message)}</p>`;
    }
  })();
})();
