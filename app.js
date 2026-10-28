/* Dagsorg — offline daycare app: learners, parents, attendance, nappy book, diary, incidents, accounts and money.
 * Everything is stored on this device only (IndexedDB in the browser). Nothing is uploaded.
 * Excel and PDF files (reports, invoices, incident reports) are built on the device by export.js.
 */
(function () {
  'use strict';

  var VERSION = '1.7.0';
  var I18N = window.DS_I18N;
  var FX = window.FX;
  var app = document.getElementById('app');

  var D = null;          // all data
  var V = 'today';       // current view (a tab, or a sub view)
  var TAB = 'today';     // current main tab
  var F = {};            // state for the current screen / form
  var STACK = [];        // sub views opened on top of the tab: [{V, F}]
  var LS = { day: null, careDay: null, careKid: '', kidsSub: 'kids', booksSub: 'diary', moneySub: 'acc', ym: null, showOld: false, q: '' };
  var confirmKey = '';   // "tap again" confirmations

  var TABS = ['today', 'care', 'kids', 'books', 'money'];
  var TAB_COLOR = { today: '#ff7a00', care: '#00a6d6', kids: '#ff3d8b', books: '#8338ec', money: '#05a66b' };
  var KID_COLORS = ['#ff3d8b', '#ff7a00', '#f5b700', '#00b39f', '#3a86ff', '#8338ec', '#06c167', '#ef476f', '#00a6d6', '#e75bd2', '#fb5607', '#4361ee'];

  /* Lists ------------------------------------------------------------- */
  var OUT_CATS = ['food', 'nappies', 'cleaning', 'toys', 'stationery', 'wages', 'rent', 'utilities', 'gas', 'phone', 'repairs', 'equipment',
                  'insurance', 'bank', 'medical', 'transport', 'training', 'marketing', 'admin', 'other_out'];
  var PAY_METHODS = ['eft', 'cash', 'card', 'other'];
  var RELS = ['mother', 'father', 'guardian', 'gran', 'grandpa', 'aunt', 'uncle', 'sibling', 'nanny', 'driver', 'other'];
  var CARE_TYPES = ['nappy', 'accident', 'eat', 'bottle', 'activity', 'med', 'toilet', 'sleep', 'other'];
  var CARE_ICON = { nappy: '🧷', accident: '💦', eat: '🍎', bottle: '🍼', activity: '🎨', med: '💊', toilet: '🚽', sleep: '😴', other: '✏️' };
  var CARE_COLOR = { nappy: '#00a6d6', accident: '#4361ee', eat: '#ff7a00', bottle: '#00b39f', activity: '#f5a300', med: '#ef476f', toilet: '#8338ec', sleep: '#e75bd2', other: '#05a66b' };
  var CLOTHES = ['pants', 'shirt', 'full'];
  var ACTIVITIES = ['read', 'tummy', 'outside', 'blocks', 'swim', 'water', 'paint', 'draw', 'relax', 'ball', 'sand', 'swing', 'trampoline', 'bike',
                    'gross_motor', 'sit', 'stand', 'roll', 'music', 'reach'];
  var DRINKS = ['formula', 'juice', 'cordial', 'fizzy', 'water'];
  var DRANK = ['all', 'three_q', 'half', 'quarter'];
  var NAPPY = ['wet', 'dirty', 'both', 'dry'];
  var AMOUNTS = ['all', 'most', 'half', 'little', 'none'];
  var SLEEP = ['asleep', 'awake'];
  var WEATHER = ['sunny', 'cloudy', 'rain', 'cold', 'hot', 'wind'];
  var WEATHER_ICON = { sunny: '☀️', cloudy: '⛅', rain: '🌧️', cold: '🥶', hot: '🔥', wind: '🌬️' };
  var INC_TYPES = ['fall', 'bite', 'scratch', 'bump', 'allergy', 'ill', 'behaviour', 'other'];
  var SEVERITY = ['minor', 'moderate', 'serious'];
  var SEV_COLOR = { minor: '#06c167', moderate: '#f5a300', serious: '#e5383b' };

  /* ================================================================ */
  /* Language                                                          */
  /* ================================================================ */
  function L() { return (D && D.settings.lang) || 'af'; }
  function t(key, vars) {
    var s = (I18N[L()] || I18N.af)[key];
    if (s == null) s = I18N.en[key];
    if (s == null) s = key;
    if (vars) s = s.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; });
    return s;
  }
  function catLabel(k) { return !k ? '' : k.indexOf('c:') === 0 ? k.slice(2) : t('cat_' + k); }

  /* ================================================================ */
  /* Storage (IndexedDB, with localStorage fallback)                   */
  /* ================================================================ */
  var DB_NAME = 'dagsorg', STORE = 'kv', MEDIA = 'media', LS_KEY = 'dagsorg.data', useLS = false, dbp = null;
  function getDB() {
    if (!dbp) dbp = new Promise(function (res, rej) {
      if (!window.indexedDB) return rej(new Error('no indexedDB'));
      var r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = function () {
        var db = r.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        if (!db.objectStoreNames.contains(MEDIA)) db.createObjectStore(MEDIA);
      };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
    return dbp;
  }
  function loadData() {
    return getDB().then(function (db) {
      return new Promise(function (res, rej) {
        var q = db.transaction(STORE, 'readonly').objectStore(STORE).get('data');
        q.onsuccess = function () { res(q.result); };
        q.onerror = function () { rej(q.error); };
      });
    }).catch(function () {
      useLS = true;
      try { return JSON.parse(localStorage.getItem(LS_KEY)); } catch (e) { return null; }
    });
  }
  function save() {
    var copy = JSON.parse(JSON.stringify(D));
    if (useLS) {
      try { localStorage.setItem(LS_KEY, JSON.stringify(copy)); return Promise.resolve(true); }
      catch (e) { toast(t('err_save') + ' ' + e.message); return Promise.resolve(false); }
    }
    return getDB().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(copy, 'data');
        tx.oncomplete = function () { res(true); };
        tx.onerror = function () { rej(tx.error); };
      });
    }).catch(function (e) { toast(t('err_save') + ' ' + (e && e.message || '')); return false; });
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});

  /* Photos and videos: kept in their own store, the records only hold the id */
  function mediaTx(mode, fn) {
    return getDB().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction(MEDIA, mode), st = tx.objectStore(MEDIA), out;
        var q = fn(st);
        if (q) q.onsuccess = function () { out = q.result; };
        tx.oncomplete = function () { res(out); };
        tx.onerror = function () { rej(tx.error); };
      });
    });
  }
  function mediaPut(id, blob) { return mediaTx('readwrite', function (st) { st.put(blob, id); }); }
  function mediaGet(id) { return mediaTx('readonly', function (st) { return st.get(id); }); }
  function mediaDel(id) {
    if (!id) return Promise.resolve();
    if (mediaUrls[id]) { URL.revokeObjectURL(mediaUrls[id]); delete mediaUrls[id]; }
    return mediaTx('readwrite', function (st) { st.delete(id); }).catch(function () {});
  }
  function mediaClear() { return mediaTx('readwrite', function (st) { st.clear(); }).catch(function () {}); }
  function mediaKeys() {
    return getDB().then(function (db) {
      return new Promise(function (res, rej) {
        var q = db.transaction(MEDIA, 'readonly').objectStore(MEDIA).getAllKeys();
        q.onsuccess = function () { res(q.result || []); };
        q.onerror = function () { rej(q.error); };
      });
    });
  }
  var mediaUrls = {};   // id -> object URL (cache for showing thumbnails)
  function mediaUrl(id) {
    if (mediaUrls[id]) return Promise.resolve(mediaUrls[id]);
    return mediaGet(id).then(function (b) { if (!b) return null; mediaUrls[id] = URL.createObjectURL(b); return mediaUrls[id]; });
  }
  // Fill <img data-mid> and <video data-mid> after a render
  function hydrate() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-mid]'), function (el) {
      var id = el.getAttribute('data-mid');
      if (el.getAttribute('data-done') === id) return;
      el.setAttribute('data-done', id);
      mediaUrl(id).then(function (u) { if (u) el.src = u; else el.classList.add('gone'); }).catch(function () {});
    });
  }
  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('photo')); };
      img.src = url;
    });
  }
  // Shrink a camera photo to max 1600 px JPEG so the phone doesn't fill up
  function shrinkPhoto(file, maxPx) {
    return loadImage(file).then(function (img) {
      var max = maxPx || 1600, w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, max / Math.max(w, h));
      var c = document.createElement('canvas');
      c.width = Math.round(w * k); c.height = Math.round(h * k);
      var g = c.getContext('2d');
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      return new Promise(function (resolve, reject) { c.toBlob(function (b) { b ? resolve(b) : reject(new Error('photo')); }, 'image/jpeg', 0.75); });
    });
  }
  // A stored photo as a JPEG data URL (for the PDF), max `max` px
  function photoForPdf(id, max) {
    return mediaGet(id).then(function (b) {
      if (!b || !/^image\//.test(b.type || 'image/jpeg')) return null;
      return loadImage(b).then(function (img) {
        var w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, (max || 1100) / Math.max(w, h));
        var c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
        var g = c.getContext('2d');
        g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
        g.drawImage(img, 0, 0, c.width, c.height);
        return { url: c.toDataURL('image/jpeg', 0.82), w: c.width, h: c.height };
      });
    }).catch(function () { return null; });
  }
  // Logo: max 700 x 350 px, on a white background, as a JPEG data URL (works in the PDF too)
  function makeLogo(file) {
    return loadImage(file).then(function (img) {
      var w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, 700 / w, 350 / h);
      var c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
      var g = c.getContext('2d');
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      return { url: c.toDataURL('image/jpeg', 0.9), w: c.width, h: c.height };
    });
  }

  /* ================================================================ */
  /* Small helpers                                                     */
  /* ================================================================ */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dateStr(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function today() { return dateStr(new Date()); }
  function nowHM() { var d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function parseD(s) { var p = String(s).split('-'); return new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1); }
  function addDays(s, n) { var d = parseD(s); d.setDate(d.getDate() + n); return dateStr(d); }
  function weekStart(s) { var d = parseD(s), wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return dateStr(d); }
  function ymOf(s) { return String(s || '').slice(0, 7); }
  function addMonths(ym, n) { var p = ym.split('-'), d = new Date(+p[0], +p[1] - 1 + n, 1); return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
  function monthEnd(ym) { var p = ym.split('-'); return dateStr(new Date(+p[0], +p[1], 0)); }
  function mins(hm) { if (!hm) return NaN; var p = String(hm).split(':'); return (+p[0]) * 60 + (+p[1] || 0); }
  function hmOf(m) { return pad(Math.floor(m / 60)) + ':' + pad(m % 60); }
  function durLabel(m) { if (!(m >= 0)) return ''; var h = Math.floor(m / 60), r = m % 60; return h + t('h_short') + ' ' + pad(r) + t('m_short'); }
  function monthName(m, short) { return t(short ? 'mon' : 'months').split(',')[m - 1]; }
  function ymLabel(ym) { var p = ym.split('-'); return monthName(+p[1]) + ' ' + p[0]; }
  function dayName(s, short) { return t(short ? 'days_s' : 'days').split(',')[parseD(s).getDay()]; }
  function niceDate(s, noYear) {
    if (!s) return '';
    var d = parseD(s);
    return dayName(s) + ' ' + d.getDate() + ' ' + monthName(d.getMonth() + 1, true) + (noYear ? '' : ' ' + d.getFullYear());
  }
  function shortDate(s) { if (!s) return ''; var d = parseD(s); return d.getDate() + ' ' + monthName(d.getMonth() + 1, true) + ' ' + d.getFullYear(); }
  function ageOf(dob, at) {
    if (!dob) return '';
    var a = parseD(dob), b = parseD(at || today());
    var m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) - (b.getDate() < a.getDate() ? 1 : 0);
    if (m < 0) return '';
    if (m < 24) return t('age_m', { n: m });
    return t('age_y', { n: Math.floor(m / 12) });
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function num(v) {
    var s = String(v == null ? '' : v).replace(/[\s R]/gi, '');
    if (!s) return NaN;
    if (s.indexOf(',') > -1 && s.indexOf('.') > -1) s = s.replace(/,/g, '');
    else s = s.replace(',', '.');
    return /^-?\d*\.?\d+$/.test(s) ? Number(s) : NaN;
  }
  function r2(n) { return Math.round(n * 100) / 100; }
  function fmtNum(n, dec) {
    n = Number(n) || 0;
    var neg = n < 0, s = Math.abs(n).toFixed(dec).split('.');
    var i = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return (neg ? '-' : '') + i + (dec ? (L() === 'af' ? ',' : '.') + s[1] : '');
  }
  function fmtR(n) { n = Number(n) || 0; return (n < 0 ? '-' : '') + 'R ' + fmtNum(Math.abs(n), 2); }
  function numIn(n) { return n == null || n === '' || isNaN(n) ? '' : (L() === 'af' ? String(n).replace('.', ',') : String(n)); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function clean(s, max) { return String(s == null ? '' : s).replace(/[ \t]+/g, ' ').trim().slice(0, max || 200); }
  function cleanMulti(s, max) { return String(s == null ? '' : s).replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max || 2000); }
  function inRange(d, from, to) { return (!from || d >= from) && (!to || d <= to); }
  function byDateDesc(a, b) { return (b.date || '').localeCompare(a.date || '') || (b.time || '').localeCompare(a.time || '') || (b.ts || 0) - (a.ts || 0); }
  function byDateAsc(a, b) { return -byDateDesc(a, b); }
  function sum(list, fn) { return r2(list.reduce(function (s, x) { return s + (Number(fn ? fn(x) : x) || 0); }, 0)); }
  function initials(k) { return ((k.name || '?').charAt(0) + (k.surname || '').charAt(0)).toUpperCase(); }
  // File names: plain letters only (Zoë -> Zoe, – -> -), so every phone and browser keeps the name
  function fileSafe(s) {
    s = String(s || '');
    if (s.normalize) s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return s.replace(/[\u2010-\u2015\u00b7]/g, '-').replace(/[^\x20-\x7E]/g, '').replace(/[\\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function telHref(s) { return 'tel:' + String(s || '').replace(/[^\d+]/g, ''); }
  function waHref(s) {
    var d = String(s || '').replace(/\D/g, '');
    if (d.charAt(0) === '0') d = '27' + d.slice(1);
    return 'https://wa.me/' + d;
  }

  var toastT;
  function toast(msg) {
    var el = document.getElementById('toast');
    el.textContent = msg; el.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(function () { el.classList.remove('on'); }, 2800);
  }

  /* Periods ------------------------------------------------------------ */
  function taxYear(offset) {
    var m = Number(D.settings.yearEnd) || 2, now = new Date();
    var endY = (now.getMonth() + 1 <= m ? now.getFullYear() : now.getFullYear() + 1) + (offset || 0);
    var start = new Date(endY - 1, m, 1), end = new Date(endY, m, 0);
    return [dateStr(start), dateStr(end)];
  }
  function presets() {
    var now = new Date(), y = now.getFullYear(), m = now.getMonth();
    var ty = taxYear(0), ly = taxYear(-1);
    return [
      ['p_today', today(), today()],
      ['p_this_week', weekStart(today()), addDays(weekStart(today()), 6)],
      ['p_this_month', dateStr(new Date(y, m, 1)), dateStr(new Date(y, m + 1, 0))],
      ['p_last_month', dateStr(new Date(y, m - 1, 1)), dateStr(new Date(y, m, 0))],
      ['p_this_tax', ty[0], ty[1]],
      ['p_last_tax', ly[0], ly[1]],
      ['p_all', '', '']
    ];
  }

  /* ================================================================ */
  /* Small HTML builders                                               */
  /* ================================================================ */
  function fld(label, inner, hint) {
    return '<div class="fw"><label class="f">' + esc(label) + '</label>' + inner + (hint ? '<div class="hint">' + hint + '</div>' : '') + '</div>';
  }
  function inp(k, o) {
    o = o || {};
    var v = F[k] == null ? '' : F[k];
    return '<input class="in' + (o.cls ? ' ' + o.cls : '') + '" data-k="' + k + '" type="' + (o.type || 'text') + '"' +
      (o.mode ? ' inputmode="' + o.mode + '"' : '') + (o.ph ? ' placeholder="' + esc(o.ph) + '"' : '') +
      (o.max ? ' maxlength="' + o.max + '"' : '') + (o.focus ? ' data-focus="1"' : '') + (o.rr ? ' data-rr="1"' : '') +
      (o.id ? ' id="' + o.id + '"' : '') + ' autocomplete="off" value="' + esc(v) + '">';
  }
  function area(k, ph, rows) {
    return '<textarea class="in" data-k="' + k + '" rows="' + (rows || 4) + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : '') + '>' + esc(F[k] || '') + '</textarea>';
  }
  function sel(k, opts, rr) {
    return '<select class="in" data-k="' + k + '"' + (rr ? ' data-rr="1"' : '') + '>' + opts.map(function (o) {
      return '<option value="' + esc(o[0]) + '"' + (String(F[k] == null ? '' : F[k]) === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
    }).join('') + '</select>';
  }
  function seg(k, opts, cls) {
    return '<div class="seg' + (cls ? ' ' + cls : '') + '">' + opts.map(function (o) {
      return '<button type="button" class="' + (String(F[k]) === String(o[0]) ? 'on' : '') + '" data-chip="' + k + '" data-v="' + esc(o[0]) + '">' + o[1] + '</button>';
    }).join('') + '</div>';
  }
  function pick(k, list, labelFn) {   // single choice from fixed keys, shown as chips (tap again to clear)
    return '<div class="chips">' + list.map(function (v) {
      return '<button type="button" class="chip' + (String(F[k]) === String(v) ? ' on' : '') + '" data-chip="' + k + '" data-v="' + esc(v) + '" data-toggle="1">' + labelFn(v) + '</button>';
    }).join('') + '</div>';
  }
  function multi(k, list, labelFn) {
    var cur = F[k] || [];
    return '<div class="chips">' + list.map(function (v) {
      return '<button type="button" class="chip' + (cur.indexOf(v) > -1 ? ' on' : '') + '" data-multi="' + k + '" data-v="' + esc(v) + '">' + labelFn(v) + '</button>';
    }).join('') + '</div>';
  }
  function check(k, label) {
    return '<label class="chk"><input type="checkbox" data-k="' + k + '" data-rr="1"' + (F[k] ? ' checked' : '') + '><span>' + esc(label) + '</span></label>';
  }
  function msg(kind, text) { return text ? '<div class="msg ' + kind + '">' + text + '</div>' : ''; }
  function empty(text) { return '<p class="muted emptyp">' + esc(text) + '</p>'; }
  function btn(act, label, cls, attrs) { return '<button class="' + (cls || 'secondary') + '" data-act="' + act + '"' + (attrs ? ' ' + attrs : '') + '>' + label + '</button>'; }
  function avatar(k, size) {
    if (!k) return '';
    return '<span class="av" style="background:' + kidColor(k) + (size ? ';width:' + size + 'px;height:' + size + 'px;font-size:' + Math.round(size * 0.4) + 'px' : '') + '">' + esc(initials(k)) + '</span>';
  }
  function kidColor(k) {
    if (k.color) return k.color;
    var h = 0, s = k.id || '';
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return KID_COLORS[h % KID_COLORS.length];
  }
  function dayNav(key, val) {
    var isToday = val === today();
    return '<div class="daynav"><button class="icon round" data-act="dayPrev" data-k="' + key + '" aria-label="' + esc(t('prev')) + '">‹</button>' +
      '<label class="dn-mid"><b>' + esc(isToday ? t('today') : dayName(val)) + '</b><span>' + esc(shortDate(val)) + '</span>' +
      '<input type="date" class="dn-pick" data-day="' + key + '" value="' + val + '"></label>' +
      '<button class="icon round" data-act="dayNext" data-k="' + key + '" aria-label="' + esc(t('next')) + '">›</button>' +
      (isToday ? '' : '<button class="secondary small" data-act="dayToday" data-k="' + key + '">' + esc(t('today')) + '</button>') + '</div>';
  }
  function ymNav(ym) {
    return '<div class="daynav"><button class="icon round" data-act="ymPrev" aria-label="' + esc(t('prev')) + '">‹</button>' +
      '<div class="dn-mid"><b>' + esc(ymLabel(ym)) + '</b></div>' +
      '<button class="icon round" data-act="ymNext" aria-label="' + esc(t('next')) + '">›</button></div>';
  }
  function subTabs(key, list) {
    return '<div class="subtabs">' + list.map(function (x) {
      return '<button class="' + (LS[key] === x[0] ? 'on' : '') + '" data-act="subTab" data-k="' + key + '" data-v="' + x[0] + '">' + x[1] + '</button>';
    }).join('') + '</div>';
  }
  function mediaThumbs(list, removable) {
    if (!list || !list.length) return '';
    return '<div class="thumbs">' + list.map(function (m) {
      var inner = m.type === 'video'
        ? '<video data-mid="' + m.id + '" muted playsinline preload="metadata"></video><span class="vtag">▶</span>'
        : '<img data-mid="' + m.id + '" alt="">';
      return '<div class="thumb" data-act="viewMedia" data-id="' + m.id + '" data-type="' + (m.type || 'image') + '">' + inner +
        (removable ? '<button class="rm" data-act="rmMedia" data-id="' + m.id + '" aria-label="' + esc(t('remove')) + '">✕</button>' : '') + '</div>';
    }).join('') + '</div>';
  }

  /* ================================================================ */
  /* Data                                                              */
  /* ================================================================ */
  function blank() {
    var lang = /^en/i.test(navigator.language || '') && !/ZA/i.test(navigator.language || '') ? 'en' : 'af';
    return {
      app: 'Dagsorg', v: 1,
      settings: { setup: false, lang: lang, name: '', owner: '', phone: '', email: '', addr: '', regNo: '',
                  logo: '', logoW: 0, logoH: 0,
                  bankName: '', bankHolder: '', bankAcc: '', bankBranch: '', bankType: '',
                  closeTime: '17:00', fineAmt: 50, fineMins: 30, hourRound: 'min', payDays: 7, invPrefix: 'F', nextInv: 1, yearEnd: 2, invNote: '',
                  remind: true, remindTime: '16:00', remindNotified: '', cats: { out: [] }, lastBackup: '' },
      kids: [], parents: [], att: [], charges: [], money: [], diary: [], care: [], incidents: [], invoices: [], feeSkip: [], complaints: [], sick: []
    };
  }
  var LISTS = ['kids', 'parents', 'att', 'charges', 'money', 'diary', 'care', 'incidents', 'invoices', 'feeSkip', 'complaints', 'sick'];
  function normalise(d) {
    var b = blank();
    if (!d || typeof d !== 'object') return b;
    d.settings = Object.assign(b.settings, d.settings || {});
    if (!d.settings.cats || !Array.isArray(d.settings.cats.out)) d.settings.cats = { out: [] };
    LISTS.forEach(function (k) { if (!Array.isArray(d[k])) d[k] = []; });
    d.kids.forEach(function (k) { if (!Array.isArray(k.auth)) k.auth = []; if (!Array.isArray(k.regDocs)) k.regDocs = []; if (k.active == null) k.active = true; });
    d.app = 'Dagsorg';
    return d;
  }
  function find(coll, id) { if (!id) return null; var l = D[coll]; for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return null; }
  function removeFrom(coll, id) { D[coll] = D[coll].filter(function (x) { return x.id !== id; }); }
  function fullName(p) { return p ? clean((p.name || '') + ' ' + (p.surname || '')) : ''; }
  function kidName(id) { var k = typeof id === 'object' ? id : find('kids', id); return k ? fullName(k) : t('unknown'); }
  function parentName(id) { var p = find('parents', id); return p ? fullName(p) : ''; }
  function relLabel(r) { return !r ? '' : RELS.indexOf(r) > -1 ? t('rel_' + r) : r; }
  function byName(a, b) { return fullName(a).localeCompare(fullName(b)); }
  function kidsSorted(all) {
    return D.kids.filter(function (k) { return all || k.active !== false; }).slice().sort(byName);
  }
  // Kids who are enrolled on a given day
  function kidsOn(date) {
    return D.kids.filter(function (k) { return k.active !== false && (!k.start || k.start <= date); }).sort(byName);
  }
  function kidsOfParent(pid) { return D.kids.filter(function (k) { return k.p1 === pid || k.p2 === pid; }).sort(byName); }

  // Everyone who may drop off / fetch a child: the parents first, then the extra people on the child's list
  function people(k) {
    var out = [];
    [['p1', 'main_parent'], ['p2', 'second_parent']].forEach(function (x) {
      var p = find('parents', k[x[0]]);
      if (p) out.push({ key: 'p:' + p.id, name: fullName(p), rel: relLabel(p.rel) || t(x[1]), phone: p.cell, parent: true });
    });
    (k.auth || []).forEach(function (a) { out.push({ key: 'a:' + a.id, name: a.name, rel: relLabel(a.rel), phone: a.phone, idNo: a.idNo }); });
    return out;
  }
  function personName(k, key) {
    if (!key) return '';
    var id = key.slice(2);
    if (key.indexOf('p:') === 0) { var p = find('parents', id); return p ? fullName(p) : t('removed_person'); }
    if (key.indexOf('a:') === 0) {
      var a = (k && k.auth || []).filter(function (x) { return x.id === id; })[0];
      return a ? a.name : t('removed_person');
    }
    return key;
  }
  function personWithRel(k, key) {
    var n = personName(k, key), pp = people(k || {}).filter(function (x) { return x.key === key; })[0];
    return pp && pp.rel ? n + ' (' + pp.rel + ')' : n;
  }

  /* Attendance, fines and fees ----------------------------------------- */
  function attOf(kid, date) { for (var i = 0; i < D.att.length; i++) if (D.att[i].kid === kid && D.att[i].date === date) return D.att[i]; return null; }
  function lateMins(out) { var m = mins(out) - mins(D.settings.closeTime || '17:00'); return m > 0 ? m : 0; }
  // R50 for every FULL half hour after closing time (17:29 = R0, 17:30 = R50, 18:00 = R100)
  function fineFor(out) {
    if (!out) return 0;
    var step = Number(D.settings.fineMins) || 30, amt = Number(D.settings.fineAmt) || 0;
    return r2(Math.floor(lateMins(out) / step) * amt);
  }
  function chargeByRef(ref) { for (var i = 0; i < D.charges.length; i++) if (D.charges[i].ref === ref) return D.charges[i]; return null; }
  function stayMins(a) { var x = mins(a.in), y = mins(a.out); return a.in && a.out && y >= x ? y - x : NaN; }
  // Keep the day rate and the late fine of one attendance record in step with it
  function syncAtt(a) {
    var k = find('kids', a.kid);
    if (!k) return;
    var dref = 'day:' + a.id, dc = chargeByRef(dref);
    if (!dc && a.in && k.feeType === 'day' && Number(k.fee) > 0) {
      D.charges.push({ id: uid(), kid: k.id, date: a.date, kind: 'day', amt: r2(Number(k.fee)), ref: dref, ts: Date.now() });
    }
    // hourly fee: hours between signing in and out x the rate (the rate is kept on the charge, so later fee changes don't touch it)
    var href = 'hour:' + a.id, hc = chargeByRef(href), st = stayMins(a);
    if (st >= 0 && (hc || (k.feeType === 'hour' && Number(k.fee) > 0))) {
      var rate = hc && hc.rate != null ? hc.rate : Number(k.fee), bill = billMins(st);
      var vals = { kid: k.id, date: a.date, kind: 'hour', amt: r2(bill / 60 * rate), mins: st, bill: bill, rate: rate, ref: href };
      if (hc) Object.assign(hc, vals); else D.charges.push(Object.assign({ id: uid(), ts: Date.now() }, vals));
    } else if (hc && !(st >= 0)) removeFrom('charges', hc.id);
    var fref = 'fine:' + a.id, fc = chargeByRef(fref), f = a.fineWaived ? 0 : fineFor(a.out);
    if (f > 0) {
      if (fc) { fc.amt = f; fc.mins = lateMins(a.out); fc.date = a.date; }
      else D.charges.push({ id: uid(), kid: k.id, date: a.date, kind: 'fine', amt: f, mins: lateMins(a.out), ref: fref, ts: Date.now() });
    } else if (fc) removeFrom('charges', fc.id);
  }
  function dropAttCharges(aid) { D.charges = D.charges.filter(function (c) { return c.ref !== 'day:' + aid && c.ref !== 'fine:' + aid && c.ref !== 'hour:' + aid; }); }
  // Minutes that are charged for the hourly fee: exact, or rounded up to the started 15 min / half hour / hour
  function billMins(m) { var step = Number(D.settings.hourRound) || 0; return step ? Math.ceil(m / step) * step : m; }
  // Minutes a child was here on one day (still here today: up to now)
  function hereMins(a) {
    if (!a || !a.in) return 0;
    var st = stayMins(a);
    if (st >= 0) return st;
    if (!a.out && a.date === today()) { var m = mins(nowHM()) - mins(a.in); return m > 0 ? m : 0; }
    return 0;
  }
  function minsBetween(kid, from, to) { return D.att.filter(function (a) { return a.kid === kid && inRange(a.date, from, to); }).reduce(function (s, a) { return s + hereMins(a); }, 0); }
  function feeLabel(k) { return t(k.feeType === 'day' ? 'fee_day' : k.feeType === 'hour' ? 'fee_hour' : 'fee_month'); }
  // Monthly fees: one charge per month from the start month up to this month (or the leaving month)
  function postFees() {
    var nowYm = ymOf(today()), n = 0;
    D.kids.forEach(function (k) {
      if (k.feeType !== 'month' || !(Number(k.fee) > 0)) return;
      var start = ymOf(k.start || k.created || today()), end = k.active === false && k.end ? ymOf(k.end) : nowYm;
      if (end > nowYm) end = nowYm;
      for (var ym = start, guard = 0; ym <= end && guard < 240; ym = addMonths(ym, 1), guard++) {
        var ref = 'fee:' + k.id + ':' + ym;
        if (chargeByRef(ref) || D.feeSkip.indexOf(ref) > -1) continue;
        D.charges.push({ id: uid(), kid: k.id, date: ym === ymOf(k.start) ? k.start : ym + '-01', kind: 'fee', amt: r2(Number(k.fee)), ym: ym, ref: ref, ts: Date.now() });
        n++;
      }
    });
    return n;
  }
  // A changed fee: charge it again from this month / today ('now'), or for everything since the start date ('start')
  function repriceKid(k, from) {
    var since = from === 'start' ? '' : today(), sinceYm = ymOf(since);
    D.charges = D.charges.filter(function (c) {
      if (c.kid !== k.id) return true;
      if (c.kind === 'fee') return since && (c.ym || ymOf(c.date)) < sinceYm;
      if (c.kind === 'day' || c.kind === 'hour') return since && c.date < since;
      return true;
    });
    postFees();
    D.att.forEach(function (a) { if (a.kid === k.id && a.in && (!since || a.date >= since)) syncAtt(a); });
  }
  function chargeLabel(c) {
    if (c.kind === 'fee') return t('ch_fee', { m: ymLabel(c.ym || ymOf(c.date)) });
    if (c.kind === 'day') return t('ch_day', { d: shortDate(c.date) });
    if (c.kind === 'hour') return t('ch_hour', { d: shortDate(c.date), h: durLabel(c.bill != null ? c.bill : c.mins), r: fmtR(c.rate) });
    if (c.kind === 'fine') return t('ch_fine', { d: shortDate(c.date), m: c.mins || '' });
    return c.desc || t('ch_other');
  }
  function chargesOf(kid, from, to) { return D.charges.filter(function (c) { return c.kid === kid && inRange(c.date, from, to); }); }
  function paymentsOf(kid, from, to) { return D.money.filter(function (m) { return m.dir === 'in' && m.kind === 'pay' && m.kid === kid && inRange(m.date, from, to); }); }
  function balanceOf(kid, upto) {
    var before = upto || '9999-12-31';
    return r2(sum(chargesOf(kid, '', before), function (c) { return c.amt; }) - sum(paymentsOf(kid, '', before), function (m) { return m.amt; }));
  }
  function payLabel(m) { return t('pay_recv') + (m.method ? ' (' + t('pm_' + m.method) + ')' : '') + (m.ref ? ' · ' + m.ref : ''); }

  /* Expense categories -------------------------------------------------- */
  function outCats(keep) {
    var list = OUT_CATS.slice();
    (D.settings.cats.out || []).forEach(function (n) { list.splice(list.length - 1, 0, 'c:' + n); });
    if (keep && list.indexOf(keep) < 0) list.push(keep);
    return list;
  }

  /* Diary reminder ------------------------------------------------------ */
  function diaryOf(date) { for (var i = 0; i < D.diary.length; i++) if (D.diary[i].date === date) return D.diary[i]; return null; }
  function diaryDue() {
    var s = D.settings;
    if (!s.remind || !s.setup) return false;
    var d = new Date().getDay();
    if (d === 0 || d === 6) return false;   // weekends: no reminder
    return nowHM() >= (s.remindTime || '16:00') && !diaryOf(today());
  }
  function checkReminder() {
    if (!D || !diaryDue()) return;
    if (D.settings.remindNotified === today()) return;
    D.settings.remindNotified = today(); save();
    notify(t('remind_title'), t('remind_body'));
    if (V === 'today') render();
  }
  function notify(title, body) {
    try {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      var opts = { body: body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'dagsorg-diary' };
      if (navigator.serviceWorker && navigator.serviceWorker.ready) {
        navigator.serviceWorker.ready.then(function (r) { r.showNotification(title, opts); }).catch(function () { new Notification(title, opts); });
      } else new Notification(title, opts);
    } catch (e) {}
  }

  /* ================================================================ */
  /* Render and navigation                                             */
  /* ================================================================ */
  function isTab(v) { return TABS.indexOf(v) > -1; }
  function render() {
    document.documentElement.lang = L();
    var setup = !D.settings.setup;
    var color = setup ? '#ff3d8b' : isTab(V) ? TAB_COLOR[V] : (F && F.color) || TAB_COLOR[TAB];
    document.documentElement.style.setProperty('--sec', color);
    document.body.classList.toggle('nonav', setup || !isTab(V));
    renderHeader(setup);
    renderNav(setup);
    var h;
    if (setup) h = setupScreen();
    else switch (V) {
      case 'today': h = todayScreen(); break;
      case 'care': h = careScreen(); break;
      case 'kids': h = kidsScreen(); break;
      case 'books': h = booksScreen(); break;
      case 'money': h = moneyScreen(); break;
      case 'sign': h = signScreen(); break;
      case 'att': h = attScreen(); break;
      case 'group': h = groupScreen(); break;
      case 'complaint': h = complaintForm(); break;
      case 'sick': h = sickForm(); break;
      case 'kid': h = kidScreen(); break;
      case 'kidForm': h = kidForm(); break;
      case 'parent': h = parentScreen(); break;
      case 'parentForm': h = parentForm(); break;
      case 'authForm': h = authForm(); break;
      case 'careAdd': h = careAddScreen(); break;
      case 'careEdit': h = careEditScreen(); break;
      case 'diaryForm': h = diaryForm(); break;
      case 'diaryView': h = diaryView(); break;
      case 'incForm': h = incForm(); break;
      case 'inc': h = incScreen(); break;
      case 'account': h = accountScreen(); break;
      case 'moneyForm': h = moneyForm(); break;
      case 'chargeForm': h = chargeForm(); break;
      case 'reports': h = reportsScreen(); break;
      case 'settings': h = settingsScreen(); break;
      default: h = '';
    }
    app.innerHTML = h;
    hydrate();
    var f = app.querySelector('[data-focus]');
    if (f && !F.focused) { F.focused = 1; try { f.focus(); } catch (e) {} }
  }
  function title() {
    if (!isTab(V)) return subTitle();
    if (V === 'today') return D.settings.name || 'Dagsorg';
    return t('tab_' + V);
  }
  function subTitle() {
    switch (V) {
      case 'sign': return F.dir === 'in' ? t('sign_in') : t('sign_out');
      case 'att': return t('attendance');
      case 'complaint': return F.id ? t('complaint') : t('new_complaint');
      case 'sick': return t('sickness');
      case 'group': return F.dir === 'in' ? t('group_in') : t('group_out');
      case 'kid': return kidName(F.id);
      case 'kidForm': return F.id ? t('edit_kid') : t('new_kid');
      case 'parent': return parentName(F.id) || t('parent');
      case 'parentForm': return F.id ? t('edit_parent') : t('new_parent');
      case 'authForm': return t('auth_person');
      case 'careAdd': return CARE_ICON[F.type] + ' ' + (F.restOf ? t('give_rest') : t('care_' + F.type));
      case 'careEdit': return t('care_entry');
      case 'diaryForm': return t('diary') + ' · ' + shortDate(F.date);
      case 'diaryView': return t('diary') + ' · ' + shortDate((find('diary', F.id) || {}).date);
      case 'incForm': return F.id ? t('edit_inc') : t('new_inc');
      case 'inc': return t('incident');
      case 'account': return t('account') + ' · ' + kidName(F.kid);
      case 'moneyForm': return F.id ? t('edit_' + F.dir) : t('new_' + F.dir);
      case 'chargeForm': return F.id ? t('edit_charge') : t('add_charge');
      case 'reports': return t('reports');
      case 'settings': return t('settings');
    }
    return 'Dagsorg';
  }
  function renderHeader(setup) {
    var h = '';
    if (!setup && !isTab(V)) h += '<button class="icon round hb" data-act="back" aria-label="' + esc(t('back')) + '">‹</button>';
    var tt = setup ? 'Dagsorg' : title();
    var fancy = setup || V === 'today';
    if (fancy && D.settings.logo && !setup) h += '<img class="hlogo" src="' + D.settings.logo + '" alt="">';
    h += '<h1' + (fancy ? ' class="rainbow"' : '') + '>' + (fancy ? rainbow(tt) : esc(tt)) + '</h1><div class="hbtns">';
    h += '<button id="installBtn" class="secondary small' + (installEvt ? '' : ' hidden') + '" type="button" data-act="install">' + esc(t('install')) + '</button>';
    if (!setup && isTab(V)) {
      h += '<button class="icon round hb rep" data-act="reports" aria-label="' + esc(t('reports')) + '">📊</button>';
      h += '<button class="icon round hb set" data-act="settings" aria-label="' + esc(t('settings')) + '">⚙️</button>';
    }
    document.getElementById('hdr').innerHTML = h + '</div>';
  }
  function rainbow(s) {
    var i = 0;
    return Array.prototype.map.call(String(s), function (ch) {
      if (ch === ' ') return ' ';
      return '<span style="color:' + KID_COLORS[(i++) % KID_COLORS.length] + '">' + esc(ch) + '</span>';
    }).join('');
  }
  var NAV_ICON = { today: '☀️', care: '🧷', kids: '🧒', books: '📒', money: '💰' };
  function renderNav(setup) {
    var n = document.getElementById('nav');
    if (setup || !isTab(V)) { n.innerHTML = ''; n.classList.add('hidden'); return; }
    n.classList.remove('hidden');
    n.innerHTML = TABS.map(function (k) {
      return '<button class="' + (V === k ? 'on' : '') + '" data-act="tab" data-v="' + k + '" style="--c:' + TAB_COLOR[k] + '">' +
        '<span class="ni">' + NAV_ICON[k] + '</span><span class="nl">' + esc(t('tab_' + k)) + '</span></button>';
    }).join('');
  }
  function showTab(k) {
    STACK = []; V = TAB = k || TAB; F = {};
    if (history.state && history.state.sub) history.replaceState({ root: 1 }, '');
    render(); window.scrollTo(0, 0);
  }
  function openSub(v, f) {
    STACK.push({ V: V, F: F, y: window.scrollY });
    V = v; F = f || {};
    history.pushState({ sub: STACK.length }, '');
    confirmKey = '';
    render(); window.scrollTo(0, 0);
  }
  // Leave the current sub view (phone back button, ‹, or after saving)
  function closeSub(saved) {
    if (!STACK.length) return showTab();
    if (!saved && F && F.added && F.added.length) F.added.forEach(mediaDel);   // photos added to a form that was not saved
    var prev = STACK.pop();
    V = prev.V; F = prev.F || {};
    confirmKey = '';
    render(); window.scrollTo(0, prev.y || 0);
  }
  function done(saved) {   // after a save: go back one step (keeps the browser history in step)
    if (history.state && history.state.sub) { pendingSaved = saved !== false; history.back(); }
    else closeSub(saved !== false);
  }
  var pendingSaved = false;
  window.addEventListener('popstate', function () {
    if (!D) return;
    if (STACK.length) { var s = pendingSaved; pendingSaved = false; closeSub(s); }
  });

  /* ================================================================ */
  /* Today: attendance                                                 */
  /* ================================================================ */
  function todayScreen() {
    var day = LS.day || today(), kids = kidsOn(day);
    var h = dayNav('day', day);
    if (day === today() && diaryDue()) {
      h += '<div class="banner purple" data-act="diaryToday"><span class="bi">📒</span><div><b>' + esc(t('remind_title')) + '</b><div>' + esc(t('remind_body')) + '</div></div><span class="go">›</span></div>';
    }
    if (!D.kids.length) {
      return h + '<div class="card hero"><div class="big">🧸</div><h2>' + esc(t('welcome_title')) + '</h2><p class="muted">' + esc(t('welcome_text')) + '</p>' +
        btn('newKid', '➕ ' + esc(t('new_kid')), 'primary') + '<div class="sp"></div>' + btn('newParent', '👪 ' + esc(t('new_parent')), 'secondary') + '</div>';
    }
    var here = 0, gone = 0, notYet = 0, fines = 0;
    kids.forEach(function (k) {
      var a = attOf(k.id, day);
      if (!a || !a.in) notYet++; else if (a.out) gone++; else here++;
      if (a && a.out && !a.fineWaived) fines += fineFor(a.out);
    });
    var flt = LS.attFilter || '';
    function tile(key, cls, n, label) {
      return '<button class="st ' + cls + (flt === key ? ' on' : flt ? ' dim' : '') + '" data-act="attFilter" data-v="' + key + '"><b>' + n + '</b><span>' + esc(t(label)) + '</span></button>';
    }
    h += '<div class="stats">' + tile('here', 'g', here, 'st_here') + tile('gone', 'b', gone, 'st_gone') + tile('notyet', 'o', notYet, 'st_notyet') + '</div>';
    if (fines > 0) h += msg('warn', '⏰ ' + esc(t('fines_today', { r: fmtR(fines) })));
    h += '<div class="two">' + btn('groupSign', '👥 ' + esc(t('group_in')), 'primary g', 'data-v="in"' + (notYet ? '' : ' disabled')) +
      btn('groupSign', '👥 ' + esc(t('group_out')), 'primary b', 'data-v="out"' + (here ? '' : ' disabled')) + '</div>';
    var shown = kids.filter(function (k) { return !flt || attStatus(k.id, day) === flt; });
    if (flt) h += '<div class="row fhead"><b>' + esc(t('st_' + flt)) + ' (' + shown.length + ')</b><button class="text small" data-act="attFilter" data-v="">' + esc(t('show_everyone')) + '</button></div>';
    h += '<div class="list">';
    shown.forEach(function (k) {
      var a = attOf(k.id, day), status, act;
      if (!a || !a.in) {
        status = '<span class="muted">' + esc(t('not_arrived')) + '</span>';
        act = '<button class="go-btn g" data-act="signIn" data-id="' + k.id + '">' + esc(t('btn_in')) + '</button>';
      } else {
        status = '<span class="tin">⬇ ' + esc(a.in) + '</span> <span class="muted">' + esc(personName(k, a.inBy)) + '</span>';
        if (a.out) {
          var fn = a.fineWaived ? 0 : fineFor(a.out);
          status += '<br><span class="tout">⬆ ' + esc(a.out) + '</span> <span class="muted">' + esc(personName(k, a.outBy)) + '</span>' +
            (fn ? ' <span class="pill red">' + esc(t('fine')) + ' ' + fmtR(fn) + '</span>' : '') +
            '<br><span class="pill hrs-pill">⏱ ' + esc(durLabel(hereMins(a))) + '</span>';
          act = '<span class="donebadge">✓</span>';
        } else {
          if (day === today()) status += '<br><span class="pill hrs-pill">⏱ ' + esc(durLabel(hereMins(a))) + ' ' + esc(t('so_far')) + '</span>';
          act = '<button class="go-btn b" data-act="signOut" data-id="' + k.id + '">' + esc(t('btn_out')) + '</button>';
        }
      }
      h += '<div class="kidrow" style="--kc:' + kidColor(k) + '">' +
        '<div class="kr-main" ' + (a && a.in ? 'data-act="editAtt" data-id="' + a.id + '"' : 'data-act="openKid" data-id="' + k.id + '"') + '>' + avatar(k) +
        '<div class="kr-txt"><b>' + esc(fullName(k)) + '</b>' + (k.allergies ? ' <span class="pill red" title="' + esc(k.allergies) + '">⚠ ' + esc(t('allergy_short')) + '</span>' : '') +
        (sickOf(k.id, day) ? ' <span class="pill pink">🤒 ' + esc(t('sick')) + '</span>' : '') +
        '<div class="small-l">' + status + '</div></div></div>' + act + '</div>';
    });
    h += '</div>';
    if (!kids.length) h += empty(t('no_kids_day'));
    else if (!shown.length) h += empty(t('nobody_in_' + flt));
    var lb = D.settings.lastBackup;
    if (day === today() && (!lb || (parseD(today()) - parseD(lb)) / 864e5 > 30)) {
      h += '<div class="banner yellow" data-act="settings"><span class="bi">💾</span><div><b>' + esc(t('backup_due')) + '</b><div>' + esc(lb ? t('last_backup', { d: shortDate(lb) }) : t('backup_never')) + '</div></div><span class="go">›</span></div>';
    }
    return h;
  }
  function attStatus(kid, day) { var a = attOf(kid, day); return !a || !a.in ? 'notyet' : a.out ? 'gone' : 'here'; }

  /* Sign a group in (or out): pick the learners, then tap the person under each name */
  function groupScreen() {
    var day = F.date, cand = kidsOn(day).filter(function (k) { return attStatus(k.id, day) === (F.dir === 'in' ? 'notyet' : 'here') || (F.done[k.id]); });
    var h = '<div class="card">' + fld(F.dir === 'in' ? t('time_in') : t('time_out'), '<input class="in big" type="time" data-k="time" data-rr="1" value="' + esc(F.time) + '">');
    if (F.dir === 'out' && lateMins(F.time) > 0) h += msg(fineFor(F.time) ? 'err' : 'warn', '⏰ ' + esc(t('late_by', { m: lateMins(F.time) })) + (fineFor(F.time) ? ' · <b>' + esc(t('fine')) + ' ' + fmtR(fineFor(F.time)) + '</b> ' + esc(t('each')) : ''));
    h += '<div class="row"><label class="f">' + esc(t('choose_learners')) + ' (' + F.kids.length + ')</label>' +
      (cand.length ? '<button class="text small" data-act="groupAll">' + esc(F.kids.length === cand.length ? t('select_none') : t('select_all')) + '</button>' : '') + '</div>';
    if (!cand.length) h += empty(t(F.dir === 'in' ? 'nobody_in_notyet' : 'nobody_in_here'));
    h += '<div class="kidgrid">' + cand.map(function (k) {
      var on = F.kids.indexOf(k.id) > -1;
      return '<button class="kidpick' + (on ? ' on' : '') + '" data-multi="kids" data-v="' + k.id + '" style="--kc:' + kidColor(k) + '">' + avatar(k, 44) +
        '<span>' + esc(k.name) + '</span>' + (on ? '<i class="tick">✓</i>' : '') + '</button>';
    }).join('') + '</div></div>';
    if (F.kids.length) h += '<p class="hint center">👇 ' + esc(t(F.dir === 'in' ? 'tap_who_in' : 'tap_who_out')) + '</p>';
    F.kids.forEach(function (id) {
      var k = find('kids', id);
      if (!k) return;
      var list = people(k), d = F.done[id];
      h += '<div class="gblock' + (d ? ' done' : '') + '" style="--kc:' + kidColor(k) + '"><div class="gname">' + avatar(k, 36) + '<b>' + esc(fullName(k)) + '</b>' +
        (k.allergies ? ' <span class="pill red">⚠ ' + esc(t('allergy_short')) + '</span>' : '') +
        (d ? '<span class="gdone">✓ ' + esc(d.time) + '</span>' : '') + '</div>';
      if (!list.length) h += '<p class="hint">' + esc(t('no_people')) + '</p>';
      h += '<div class="people">' + list.map(function (p) {
        return '<button class="person' + (d && d.by === p.key ? ' on' : '') + '" data-act="groupPick" data-id="' + id + '" data-v="' + esc(p.key) + '"><b>' + esc(p.name) + '</b><span>' + esc(p.rel || '') + '</span></button>';
      }).join('') + '</div></div>';
    });
    h += msg('err', F.err ? esc(F.err) : '');
    h += '<div class="bar">' + btn('back', '✓ ' + esc(t('done_btn')), 'secondary') + '</div>';
    return h;
  }
  // Tapping a person saves that learner at once
  function groupPick(kid, key) {
    if (!F.time) { F.err = t('err_time'); return render(); }
    var k = find('kids', kid), a = attOf(kid, F.date);
    if (!a) { a = { id: uid(), kid: kid, date: F.date, ts: Date.now() }; D.att.push(a); }
    if (F.dir === 'in') { a.in = F.time; a.inBy = key; }
    else {
      if (a.in && mins(F.time) < mins(a.in)) { F.err = t('err_out_before_in'); return render(); }
      a.out = F.time; a.outBy = key;
    }
    syncAtt(a);
    F.done[kid] = { time: F.time, by: key }; F.err = '';
    save();
    var fn = F.dir === 'out' && !a.fineWaived ? fineFor(a.out) : 0;
    toast(F.dir === 'in' ? t('signed_in', { n: k.name }) : (fn ? t('signed_out_fine', { n: k.name, r: fmtR(fn) }) : t('signed_out', { n: k.name })));
    render();
  }

  /* Sign in / sign out ------------------------------------------------- */
  function signScreen() {
    var k = find('kids', F.kid);
    if (!k) return '';
    var list = people(k), h = '';
    h += '<div class="card kidhead" style="--kc:' + kidColor(k) + '">' + avatar(k, 56) + '<div><h2>' + esc(fullName(k)) + '</h2><div class="muted">' + esc(shortDate(F.date)) + '</div></div></div>';
    if (k.allergies) h += msg('err', '⚠ <b>' + esc(t('allergies')) + ':</b> ' + esc(k.allergies));
    h += '<div class="card">' + fld(F.dir === 'in' ? t('time_in') : t('time_out'), '<input class="in big" type="time" data-k="time" data-rr="1" value="' + esc(F.time) + '">');
    if (F.dir === 'out') {
      var fn = fineFor(F.time), lm = lateMins(F.time);
      if (lm > 0) h += msg(fn ? 'err' : 'warn', '⏰ ' + esc(t('late_by', { m: lm })) + (fn ? ' · <b>' + esc(t('fine')) + ' ' + fmtR(fn) + '</b>' : ' · ' + esc(t('no_fine_yet'))));
    }
    h += '<label class="f">' + esc(F.dir === 'in' ? t('dropped_by') : t('fetched_by')) + '</label>';
    if (!list.length) {
      h += msg('warn', esc(t('no_people'))) + btn('editKid', '✏️ ' + esc(t('edit_kid')), 'secondary', 'data-id="' + k.id + '"');
    } else {
      h += '<div class="people">' + list.map(function (p) {
        return '<button class="person' + (F.by === p.key ? ' on' : '') + '" data-chip="by" data-v="' + esc(p.key) + '">' +
          '<b>' + esc(p.name) + '</b><span>' + esc(p.rel || '') + '</span></button>';
      }).join('') + '</div>';
      if (F.dir === 'out') h += '<p class="hint">🔒 ' + esc(t('only_auth')) + '</p>';
    }
    h += '</div>' + msg('err', F.err ? esc(F.err) : '');
    h += '<div class="bar">' + btn('saveSign', F.dir === 'in' ? '✓ ' + esc(t('btn_in')) : '✓ ' + esc(t('btn_out')), 'primary ' + (F.dir === 'in' ? 'g' : 'b')) + '</div>';
    return h;
  }
  function saveSign() {
    var k = find('kids', F.kid);
    if (!F.time) { F.err = t('err_time'); return render(); }
    if (people(k).length && !F.by) { F.err = t(F.dir === 'in' ? 'err_who_in' : 'err_who_out'); return render(); }
    var a = attOf(F.kid, F.date);
    if (F.dir === 'in') {
      if (!a) { a = { id: uid(), kid: F.kid, date: F.date, ts: Date.now() }; D.att.push(a); }
      a.in = F.time; a.inBy = F.by || '';
    } else {
      if (!a) { a = { id: uid(), kid: F.kid, date: F.date, ts: Date.now() }; D.att.push(a); }
      if (a.in && mins(F.time) < mins(a.in)) { F.err = t('err_out_before_in'); return render(); }
      a.out = F.time; a.outBy = F.by || '';
    }
    syncAtt(a);
    save();
    var fn = F.dir === 'out' && !a.fineWaived ? fineFor(a.out) : 0;
    toast(F.dir === 'in' ? t('signed_in', { n: k.name }) : (fn ? t('signed_out_fine', { n: k.name, r: fmtR(fn) }) : t('signed_out', { n: k.name })));
    done();
  }

  /* Edit one attendance record ----------------------------------------- */
  function attScreen() {
    var a = find('att', F.id), k = a && find('kids', a.kid);
    if (!a || !k) return empty(t('not_found'));
    var list = people(k), h = '';
    h += '<div class="card kidhead" style="--kc:' + kidColor(k) + '">' + avatar(k, 56) + '<div><h2>' + esc(fullName(k)) + '</h2><div class="muted">' + esc(niceDate(a.date)) + '</div></div></div>';
    function peopleChips(key) {
      return '<div class="people">' + list.map(function (p) {
        return '<button class="person' + (F[key] === p.key ? ' on' : '') + '" data-chip="' + key + '" data-v="' + esc(p.key) + '"><b>' + esc(p.name) + '</b><span>' + esc(p.rel || '') + '</span></button>';
      }).join('') + '</div>';
    }
    h += '<div class="card"><h3 class="ct g">⬇ ' + esc(t('arrival')) + '</h3>' + fld(t('time_in'), inp('in', { type: 'time' })) +
      '<label class="f">' + esc(t('dropped_by')) + '</label>' + peopleChips('inBy') + '</div>';
    h += '<div class="card"><h3 class="ct b">⬆ ' + esc(t('departure')) + '</h3>' + fld(t('time_out'), inp('out', { type: 'time', rr: 1 })) +
      '<label class="f">' + esc(t('fetched_by')) + '</label>' + peopleChips('outBy');
    var fn = fineFor(F.out);
    if (F.out && lateMins(F.out) > 0) {
      h += msg(fn && !F.fineWaived ? 'err' : 'warn', '⏰ ' + esc(t('late_by', { m: lateMins(F.out) })) + (fn ? ' · ' + esc(t('fine')) + ' ' + fmtR(fn) : ''));
      if (fn) h += check('fineWaived', t('waive_fine'));
    }
    h += '</div>';
    h += '<div class="card">' + fld(t('note'), area('note', '', 2)) + '</div>' + msg('err', F.err ? esc(F.err) : '');
    h += '<div class="bar">' + btn('saveAtt', '✓ ' + esc(t('save')), 'primary') +
      btn('delAtt', confirmKey === 'delAtt' ? esc(t('tap_again_delete')) : '🗑 ' + esc(t('delete')), 'text danger') + '</div>';
    return h;
  }
  function saveAtt() {
    var a = find('att', F.id);
    if (!F.in && !F.out) { F.err = t('err_time'); return render(); }
    if (F.in && F.out && mins(F.out) < mins(F.in)) { F.err = t('err_out_before_in'); return render(); }
    a.in = F.in || ''; a.inBy = F.inBy || ''; a.out = F.out || ''; a.outBy = F.out ? F.outBy || '' : '';
    a.note = cleanMulti(F.note, 500); a.fineWaived = !!F.fineWaived;
    syncAtt(a);
    save(); toast(t('saved')); done();
  }

  /* ================================================================ */
  /* Learners and parents                                              */
  /* ================================================================ */
  function kidsScreen() {
    var h = subTabs('kidsSub', [['kids', '🧒 ' + esc(t('learners'))], ['parents', '👪 ' + esc(t('parents'))]]);
    var q = (LS.q || '').toLowerCase();
    h += '<div class="searchrow"><input class="in" id="ksearch" type="search" placeholder="' + esc(t('search')) + '" value="' + esc(LS.q || '') + '" autocomplete="off"></div>';
    if (LS.kidsSub === 'parents') {
      h += btn('newParent', '➕ ' + esc(t('new_parent')), 'primary');
      var ps = D.parents.slice().sort(byName).filter(function (p) {
        return !q || (fullName(p) + ' ' + (p.cell || '') + ' ' + kidsOfParent(p.id).map(fullName).join(' ')).toLowerCase().indexOf(q) > -1;
      });
      h += '<div class="list">';
      ps.forEach(function (p, i) {
        var ks = kidsOfParent(p.id);
        h += '<div class="lrow" data-act="openParent" data-id="' + p.id + '" style="--kc:' + KID_COLORS[(i + 3) % KID_COLORS.length] + '">' +
          '<span class="av" style="background:var(--kc)">' + esc(((p.name || '?').charAt(0) + (p.surname || '').charAt(0)).toUpperCase()) + '</span>' +
          '<div class="kr-txt"><b>' + esc(fullName(p)) + '</b>' + (p.rel ? ' <span class="muted">· ' + esc(relLabel(p.rel)) + '</span>' : '') +
          '<div class="small-l">' + (p.cell ? '📞 ' + esc(p.cell) + ' · ' : '') + (ks.length ? '🧒 ' + esc(ks.map(function (k) { return k.name; }).join(', ')) : '<span class="muted">' + esc(t('no_kids_linked')) + '</span>') + '</div></div><span class="go">›</span></div>';
      });
      h += '</div>';
      if (!D.parents.length) h += empty(t('no_parents'));
      else if (!ps.length) h += empty(t('no_match'));
      return h;
    }
    h += btn('newKid', '➕ ' + esc(t('new_kid')), 'primary');
    var all = kidsSorted(LS.showOld), ks = all.filter(function (k) {
      return !q || (fullName(k) + ' ' + parentName(k.p1) + ' ' + parentName(k.p2)).toLowerCase().indexOf(q) > -1;
    });
    h += '<div class="list">';
    ks.forEach(function (k) {
      h += '<div class="lrow' + (k.active === false ? ' old' : '') + '" data-act="openKid" data-id="' + k.id + '" style="--kc:' + kidColor(k) + '">' + avatar(k) +
        '<div class="kr-txt"><b>' + esc(fullName(k)) + '</b> <span class="muted">' + esc(ageOf(k.dob)) + '</span>' +
        (k.allergies ? ' <span class="pill red">⚠ ' + esc(t('allergy_short')) + '</span>' : '') + (k.active === false ? ' <span class="pill">' + esc(t('inactive')) + '</span>' : '') +
        '<div class="small-l">👪 ' + esc(parentName(k.p1) || t('no_main_parent')) + '</div></div><span class="go">›</span></div>';
    });
    h += '</div>';
    if (!D.kids.length) h += empty(t('no_kids'));
    else if (!ks.length) h += empty(t('no_match'));
    if (D.kids.some(function (k) { return k.active === false; })) {
      h += '<button class="text" data-act="toggleOld">' + esc(LS.showOld ? t('hide_old') : t('show_old')) + '</button>';
    }
    return h;
  }

  /* One learner -------------------------------------------------------- */
  function contactBtns(phone, email) {
    var h = '';
    if (phone) h += '<a class="cbtn" href="' + telHref(phone) + '">📞</a><a class="cbtn wa" href="' + waHref(phone) + '" target="_blank" rel="noopener">💬</a>';
    if (email) h += '<a class="cbtn" href="mailto:' + esc(email) + '">✉️</a>';
    return h ? '<div class="cbtns">' + h + '</div>' : '';
  }
  function kidScreen() {
    var k = find('kids', F.id);
    if (!k) return empty(t('not_found'));
    var h = '<div class="card kidhead" style="--kc:' + kidColor(k) + '">' + avatar(k, 64) + '<div class="grow"><h2>' + esc(fullName(k)) + '</h2>' +
      '<div class="muted">' + (k.dob ? '🎂 ' + esc(shortDate(k.dob)) + ' · ' + esc(ageOf(k.dob)) : '') + '</div>' +
      '<div class="muted">' + esc(feeLabel(k)) + (Number(k.fee) ? ': ' + fmtR(k.fee) + (k.feeType === 'hour' ? ' ' + t('per_hour') : '') : '') +
      (k.start ? ' · ' + esc(t('started')) + ' ' + esc(shortDate(k.start)) : '') + '</div>' +
      (k.active === false ? '<span class="pill">' + esc(t('inactive')) + (k.end ? ' · ' + esc(shortDate(k.end)) : '') + '</span>' : '') + '</div>' +
      '<button class="icon round" data-act="editKid" data-id="' + k.id + '" aria-label="' + esc(t('edit')) + '">✏️</button></div>';
    h += k.allergies ? '<div class="card alert"><b>⚠ ' + esc(t('allergies')) + '</b><div>' + esc(k.allergies) + '</div></div>'
      : '<div class="card"><b>' + esc(t('allergies')) + '</b> <span class="muted">' + esc(t('none_known')) + '</span></div>';
    if (k.medical) h += '<div class="card"><b>🩺 ' + esc(t('medical')) + '</b><div class="pre">' + esc(k.medical) + '</div></div>';

    h += '<div class="card"><h3 class="ct pink">👪 ' + esc(t('parents')) + '</h3>';
    [['p1', 'main_parent'], ['p2', 'second_parent']].forEach(function (x) {
      var p = find('parents', k[x[0]]);
      h += '<div class="prow"><div class="grow"><span class="pill ' + (x[0] === 'p1' ? 'pink' : '') + '">' + esc(t(x[1])) + '</span> ' +
        (p ? '<a href="#" data-act="openParent" data-id="' + p.id + '"><b>' + esc(fullName(p)) + '</b></a><div class="small-l">' + esc([p.cell, p.email].filter(Boolean).join(' · ')) + '</div>'
           : '<span class="muted">' + esc(t('none_set')) + '</span>') + '</div>' + (p ? contactBtns(p.cell, p.email) : '') + '</div>';
    });
    h += '</div>';

    h += '<div class="card"><h3 class="ct o">🔒 ' + esc(t('auth_list')) + '</h3><p class="hint">' + esc(t('auth_hint')) + '</p>';
    (k.auth || []).forEach(function (a) {
      h += '<div class="prow" data-act="editAuth" data-id="' + a.id + '"><div class="grow"><b>' + esc(a.name) + '</b> <span class="muted">' + esc(relLabel(a.rel)) + '</span>' +
        '<div class="small-l">' + esc([a.phone, a.idNo ? t('id_no') + ' ' + a.idNo : ''].filter(Boolean).join(' · ')) + '</div></div><span class="go">›</span></div>';
    });
    h += btn('newAuth', '➕ ' + esc(t('add_person')), 'secondary small', 'data-id="' + k.id + '"') + '</div>';

    h += sickCard(k);
    h += regDocsCard(k);
    var bal = balanceOf(k.id);
    h += '<div class="card tap" data-act="openAccount" data-id="' + k.id + '"><div class="row"><div><b>💰 ' + esc(t('account')) + '</b><div class="muted">' + esc(bal > 0 ? t('owes') : bal < 0 ? t('in_credit') : t('paid_up')) + '</div></div>' +
      '<b class="amt ' + (bal > 0 ? 'neg' : 'pos') + '">' + fmtR(Math.abs(bal)) + '</b><span class="go">›</span></div></div>';

    // this week
    var ws = weekStart(today()), rows = '';
    for (var i = 0; i < 5; i++) {
      var d = addDays(ws, i), a = attOf(k.id, d);
      rows += '<div class="wk' + (d === today() ? ' now' : '') + '"><span>' + esc(dayName(d, true)) + '</span><b>' + (a && a.in ? esc(a.in) + '–' + esc(a.out || '…') : '—') + '</b></div>';
    }
    var mStart = ymOf(today()) + '-01';
    h += '<div class="card"><h3 class="ct b">🗓 ' + esc(t('this_week')) + '</h3><div class="wkrow">' + rows + '</div>' +
      '<div class="hrs"><div><span>' + esc(t('today')) + '</span><b>' + esc(durLabel(minsBetween(k.id, today(), today()))) + '</b></div>' +
      '<div><span>' + esc(t('this_week')) + '</span><b>' + esc(durLabel(minsBetween(k.id, ws, addDays(ws, 6)))) + '</b></div>' +
      '<div><span>' + esc(t('this_month')) + '</span><b>' + esc(durLabel(minsBetween(k.id, mStart, monthEnd(ymOf(today()))))) + '</b></div></div>' +
      '<div class="two">' + btn('weekPdf', '📄 ' + esc(t('week_report')), 'secondary small', 'data-id="' + k.id + '"') +
      btn('careDayPdf', '🧷 ' + esc(t('care_report')), 'secondary small', 'data-id="' + k.id + '"') + '</div></div>';
    if (k.notes) h += '<div class="card"><b>' + esc(t('notes')) + '</b><div class="pre">' + esc(k.notes) + '</div></div>';
    return h;
  }

  function kidForm() {
    var parents = [['', '— ' + t('choose') + ' —']].concat(D.parents.slice().sort(byName).map(function (p) { return [p.id, fullName(p) + (p.cell ? ' · ' + p.cell : '')]; }));
    var h = '<div class="card">' +
      '<div class="two">' + fld(t('name') + ' *', inp('name', { max: 40, focus: !F.id })) + fld(t('surname') + ' *', inp('surname', { max: 40 })) + '</div>' +
      fld(t('dob'), inp('dob', { type: 'date', rr: 1 }), F.dob ? esc(ageOf(F.dob)) : '') +
      fld(t('allergies'), area('allergies', t('allergies_ph'), 2)) +
      fld(t('medical'), area('medical', t('medical_ph'), 2)) + '</div>';
    h += '<div class="card"><h3 class="ct pink">👪 ' + esc(t('parents')) + '</h3>' +
      fld(t('main_parent'), sel('p1', parents)) + fld(t('second_parent'), sel('p2', parents)) +
      '<div class="two">' + btn('newParentFor', '➕ ' + esc(t('new_parent_main')), 'secondary small', 'data-v="p1"') +
      btn('newParentFor', '➕ ' + esc(t('new_parent_2nd')), 'secondary small', 'data-v="p2"') + '</div>' +
      '<p class="hint">' + esc(t('one_main_hint')) + '</p></div>';
    h += '<div class="card"><h3 class="ct g">💰 ' + esc(t('fees')) + '</h3>' +
      seg('feeType', [['month', esc(t('fee_month'))], ['day', esc(t('fee_day'))], ['hour', esc(t('fee_hour'))]]) +
      fld(F.feeType === 'day' ? t('day_rate') : F.feeType === 'hour' ? t('hour_rate') : t('month_fee'), inp('fee', { mode: 'decimal', ph: '0', rr: 1 })) +
      fld(t('start_date'), inp('start', { type: 'date' }), esc(t(F.feeType === 'month' ? 'fee_month_hint' : F.feeType === 'hour' ? 'fee_hour_hint' : 'fee_day_hint')));
    if (feeChanged()) {
      h += '<div class="msg info"><b>' + esc(t('fee_changed')) + '</b>' + seg('feeFrom', [['now', esc(t('fee_from_now'))], ['start', esc(t('fee_from_start'))]]) +
        '<div class="hint">' + esc(t(F.feeFrom === 'start' ? 'fee_from_start_hint' : 'fee_from_now_hint')) + '</div></div>';
    }
    h += '</div>';
    h += '<div class="card"><label class="f">' + esc(t('colour')) + '</label><div class="colors">' + KID_COLORS.map(function (c) {
      return '<button class="cdot' + (F.color === c ? ' on' : '') + '" style="background:' + c + '" data-chip="color" data-v="' + c + '" aria-label="' + c + '"></button>';
    }).join('') + '</div>' + fld(t('notes'), area('notes', '', 2)) + check('inactive', t('kid_left'));
    if (F.inactive) h += fld(t('end_date'), inp('end', { type: 'date' }));
    h += '</div>' + msg('err', F.err ? esc(F.err) : '');
    h += '<div class="bar">' + btn('saveKid', '✓ ' + esc(t('save')), 'primary') +
      (F.id ? btn('delKid', confirmKey === 'delKid' ? esc(t('tap_again_delete_kid')) : '🗑 ' + esc(t('delete')), 'text danger') : '') + '</div>';
    return h;
  }
  function kidFormState(k) {
    if (!k) return { name: '', surname: '', dob: '', allergies: '', medical: '', p1: '', p2: '', feeType: 'month', fee: '', start: today(), color: KID_COLORS[D.kids.length % KID_COLORS.length], notes: '', inactive: false, end: '' };
    return { id: k.id, name: k.name, surname: k.surname, dob: k.dob || '', allergies: k.allergies || '', medical: k.medical || '', p1: k.p1 || '', p2: k.p2 || '',
      feeType: k.feeType || 'month', fee: numIn(k.fee), start: k.start || '', color: kidColor(k), notes: k.notes || '', inactive: k.active === false, end: k.end || '',
      origFee: Number(k.fee) || 0, origType: k.feeType || 'month', feeFrom: 'now' };
  }
  function feeChanged() {
    if (!F.id) return false;
    var f = F.fee === '' ? 0 : num(F.fee);
    return !isNaN(f) && (r2(f) !== r2(F.origFee) || F.feeType !== F.origType);
  }
  function saveKid() {
    var name = clean(F.name, 40), surname = clean(F.surname, 40), fee = F.fee === '' ? 0 : num(F.fee);
    if (!name || !surname) { F.err = t('err_name'); return render(); }
    if (isNaN(fee) || fee < 0) { F.err = t('err_amount'); return render(); }
    if (F.p1 && F.p1 === F.p2) { F.err = t('err_same_parent'); return render(); }
    var k = F.id ? find('kids', F.id) : null, isNew = !k, repr = feeChanged();
    if (!k) { k = { id: uid(), created: today(), auth: [], ts: Date.now() }; D.kids.push(k); }
    Object.assign(k, { name: name, surname: surname, dob: F.dob || '', allergies: cleanMulti(F.allergies, 500), medical: cleanMulti(F.medical, 800),
      p1: F.p1 || '', p2: F.p2 || '', feeType: F.feeType, fee: r2(fee), start: F.start || '', color: F.color, notes: cleanMulti(F.notes, 1000),
      active: !F.inactive, end: F.inactive ? (F.end || today()) : '' });
    if (repr) repriceKid(k, F.feeFrom);
    postFees();
    save(); toast(t('saved'));
    if (isNew) { V = 'kid'; F = { id: k.id }; render(); window.scrollTo(0, 0); }   // straight on to the learner, to add the people on the list
    else done();
  }
  function delKid() {
    if (confirmKey !== 'delKid') { confirmKey = 'delKid'; return render(); }
    var id = F.id, media = [];
    D.care.forEach(function (c) { if (c.kid === id && c.photo) media.push(c.photo); if (c.kid === id) (c.media || []).forEach(function (m) { media.push(m.id); }); });
    ((find('kids', id) || {}).regDocs || []).forEach(function (m) { media.push(m.id); });
    D.kids = D.kids.filter(function (k) { return k.id !== id; });
    D.att = D.att.filter(function (a) { return a.kid !== id; });
    D.sick = D.sick.filter(function (s) { return s.kid !== id; });
    D.complaints.forEach(function (c) { if (c.kid === id) c.kid = ''; });
    D.charges = D.charges.filter(function (c) { return c.kid !== id; });
    D.care = D.care.filter(function (c) { return c.kid !== id; });
    D.money.forEach(function (m) { if (m.kid === id) m.kid = ''; });
    D.incidents.forEach(function (i) { i.kids = (i.kids || []).filter(function (x) { return x !== id; }); });
    media.forEach(function (m) { if (!mediaInUse(m)) mediaDel(m); });
    save(); toast(t('deleted'));
    showTab('kids');
  }

  /* Authorised people on a learner's list ------------------------------ */
  function authForm() {
    var h = '<div class="card">' + fld(t('full_name') + ' *', inp('name', { max: 60, focus: !F.aid })) +
      '<label class="f">' + esc(t('relation')) + '</label>' + pick('rel', RELS.filter(function (r) { return r !== 'mother' && r !== 'father'; }), function (r) { return esc(relLabel(r)); }) +
      '<div class="two">' + fld(t('cell'), inp('phone', { max: 20, mode: 'tel', type: 'tel' })) + fld(t('id_no'), inp('idNo', { max: 20 })) + '</div>' +
      fld(t('note'), inp('note', { max: 120 })) + '</div>' + msg('err', F.err ? esc(F.err) : '') +
      '<div class="bar">' + btn('saveAuth', '✓ ' + esc(t('save')), 'primary') +
      (F.aid ? btn('delAuth', confirmKey === 'delAuth' ? esc(t('tap_again_delete')) : '🗑 ' + esc(t('remove')), 'text danger') : '') + '</div>';
    return h;
  }
  function saveAuth() {
    var k = find('kids', F.kid), name = clean(F.name, 60);
    if (!name) { F.err = t('err_name'); return render(); }
    var a = F.aid ? k.auth.filter(function (x) { return x.id === F.aid; })[0] : null;
    if (!a) { a = { id: uid() }; k.auth.push(a); }
    Object.assign(a, { name: name, rel: F.rel || '', phone: clean(F.phone, 20), idNo: clean(F.idNo, 20), note: clean(F.note, 120) });
    save(); toast(t('saved')); done();
  }

  /* Parents ------------------------------------------------------------- */
  function parentScreen() {
    var p = find('parents', F.id);
    if (!p) return empty(t('not_found'));
    var ks = kidsOfParent(p.id);
    var h = '<div class="card kidhead" style="--kc:#ff3d8b"><span class="av" style="background:#ff3d8b;width:56px;height:56px;font-size:22px">' +
      esc(((p.name || '?').charAt(0) + (p.surname || '').charAt(0)).toUpperCase()) + '</span><div class="grow"><h2>' + esc(fullName(p)) + '</h2>' +
      '<div class="muted">' + esc(relLabel(p.rel)) + '</div></div><button class="icon round" data-act="editParent" data-id="' + p.id + '" aria-label="' + esc(t('edit')) + '">✏️</button></div>';
    h += '<div class="card">' + contactBtns(p.cell, p.email) +
      [['cell', p.cell], ['phone2', p.phone2], ['email', p.email], ['address', p.addr], ['work', p.work], ['id_no', p.idNo], ['notes', p.notes]].filter(function (x) { return x[1]; })
        .map(function (x) { return '<div class="kv"><span>' + esc(t(x[0])) + '</span><b class="pre">' + esc(x[1]) + '</b></div>'; }).join('') + '</div>';
    var tot = 0;
    h += '<div class="card"><h3 class="ct pink">🧒 ' + esc(t('children')) + '</h3>';
    ks.forEach(function (k) {
      var bal = balanceOf(k.id); tot += bal;
      var role = k.p1 === p.id ? 'p1' : 'p2';
      h += '<div class="prow"><div class="grow" data-act="openKid" data-id="' + k.id + '">' + avatar(k, 34) + ' <b>' + esc(fullName(k)) + '</b> <span class="pill ' + (role === 'p1' ? 'pink' : '') + '">' +
        esc(t(role === 'p1' ? 'main_parent' : 'second_parent')) + '</span><div class="small-l">' + esc(t('account')) + ': <b class="' + (bal > 0 ? 'neg' : 'pos') + '">' + fmtR(bal) + '</b></div></div>' +
        '<button class="text danger small" data-act="unlink" data-id="' + k.id + '">' + esc(confirmKey === 'unlink' + k.id ? t('tap_again') : t('unlink')) + '</button></div>';
    });
    if (!ks.length) h += empty(t('no_kids_linked'));
    else if (ks.length > 1) h += '<div class="kv tot"><span>' + esc(t('family_total')) + '</span><b class="' + (tot > 0 ? 'neg' : 'pos') + '">' + fmtR(tot) + '</b></div>';
    h += '</div>';

    h += complaintsCard(p);
    // link to a learner already in the system
    var others = kidsSorted(true).filter(function (k) { return k.p1 !== p.id && k.p2 !== p.id; });
    h += '<div class="card"><h3 class="ct o">🔗 ' + esc(t('link_kid')) + '</h3>';
    if (!others.length) h += empty(D.kids.length ? t('all_linked') : t('no_kids'));
    else {
      h += fld(t('learner'), sel('linkKid', [['', '— ' + t('choose') + ' —']].concat(others.map(function (k) { return [k.id, fullName(k)]; })), true)) +
        seg('linkRole', [['p1', esc(t('main_parent'))], ['p2', esc(t('second_parent'))]]);
      var lk = find('kids', F.linkKid), cur = lk && (F.linkRole === 'p1' ? lk.p1 : lk.p2);
      if (lk && cur) h += msg('warn', esc(t(F.linkRole === 'p1' ? 'has_main' : 'has_second', { k: lk.name, p: parentName(cur) })));
      h += btn('linkKid', confirmKey === 'linkKid' ? esc(t('tap_again_replace')) : '🔗 ' + esc(t('link')), 'primary', F.linkKid ? '' : 'disabled');
    }
    h += '</div>';
    return h;
  }
  function linkKid() {
    var k = find('kids', F.linkKid), p = find('parents', F.id);
    if (!k || !p) return;
    var role = F.linkRole === 'p2' ? 'p2' : 'p1', other = role === 'p1' ? 'p2' : 'p1';
    if (k[role] && k[role] !== p.id && confirmKey !== 'linkKid') { confirmKey = 'linkKid'; return render(); }
    if (k[other] === p.id) k[other] = '';
    if (role === 'p1' && k.p1 && k.p1 !== p.id && !k.p2) k.p2 = k.p1;   // the old main parent stays on as 2nd parent
    k[role] = p.id;
    confirmKey = ''; F.linkKid = '';
    save(); toast(t('linked', { k: k.name })); render();
  }
  function parentForm() {
    var h = '<div class="card"><div class="two">' + fld(t('name') + ' *', inp('name', { max: 40, focus: !F.id })) + fld(t('surname'), inp('surname', { max: 40 })) + '</div>' +
      '<label class="f">' + esc(t('relation')) + '</label>' + pick('rel', ['mother', 'father', 'guardian', 'gran', 'grandpa', 'other'], function (r) { return esc(relLabel(r)); }) +
      '<div class="two">' + fld(t('cell') + ' *', inp('cell', { max: 20, mode: 'tel', type: 'tel' })) + fld(t('phone2'), inp('phone2', { max: 20, mode: 'tel', type: 'tel' })) + '</div>' +
      fld(t('email'), inp('email', { max: 80, type: 'email' })) + fld(t('address'), area('addr', '', 2)) +
      fld(t('work'), inp('work', { max: 100, ph: t('work_ph') })) + fld(t('id_no'), inp('idNo', { max: 20 })) + fld(t('notes'), area('notes', '', 2)) + '</div>';
    if (!F.id && D.kids.length) {
      h += '<div class="card"><h3 class="ct o">🔗 ' + esc(t('link_kid')) + '</h3>' +
        fld(t('learner'), sel('linkKid', [['', '— ' + t('later') + ' —']].concat(kidsSorted().map(function (k) { return [k.id, fullName(k) + (k.p1 ? '' : ' (' + t('no_main_parent') + ')')]; })))) +
        seg('linkRole', [['p1', esc(t('main_parent'))], ['p2', esc(t('second_parent'))]]) + '</div>';
    }
    h += msg('err', F.err ? esc(F.err) : '') + '<div class="bar">' + btn('saveParent', '✓ ' + esc(t('save')), 'primary') +
      (F.id ? btn('delParent', confirmKey === 'delParent' ? esc(t(kidsOfParent(F.id).length ? 'tap_again_delete_parent' : 'tap_again_delete')) : '🗑 ' + esc(t('delete')), 'text danger') : '') + '</div>';
    return h;
  }
  function saveParent() {
    var name = clean(F.name, 40), cell = clean(F.cell, 20);
    if (!name) { F.err = t('err_name'); return render(); }
    if (!cell) { F.err = t('err_cell'); return render(); }
    var p = F.id ? find('parents', F.id) : null;
    if (!p) { p = { id: uid(), ts: Date.now() }; D.parents.push(p); }
    Object.assign(p, { name: name, surname: clean(F.surname, 40), rel: F.rel || '', cell: cell, phone2: clean(F.phone2, 20), email: clean(F.email, 80),
      addr: cleanMulti(F.addr, 300), work: clean(F.work, 100), idNo: clean(F.idNo, 20), notes: cleanMulti(F.notes, 800) });
    var k = find('kids', F.linkKid);
    if (k) {
      var role = F.linkRole === 'p2' ? 'p2' : 'p1';
      if (role === 'p1' && k.p1 && k.p1 !== p.id && !k.p2) k.p2 = k.p1;   // keep the old main parent as 2nd parent
      k[role] = p.id;
    }
    var prev = STACK[STACK.length - 1];
    if (F.linkBack && prev && prev.V === 'kidForm') prev.F[F.linkBack] = p.id;
    save(); toast(t('saved')); done();
  }
  function delParent() {
    if (confirmKey !== 'delParent') { confirmKey = 'delParent'; return render(); }
    var id = F.id;
    D.kids.forEach(function (k) { if (k.p1 === id) k.p1 = ''; if (k.p2 === id) k.p2 = ''; });
    D.complaints.filter(function (c) { return c.parent === id; }).forEach(function (c) { removeFrom('complaints', c.id); (c.media || []).forEach(function (m) { if (!mediaInUse(m.id)) mediaDel(m.id); }); });
    removeFrom('parents', id);
    save(); toast(t('deleted'));
    LS.kidsSub = 'parents'; showTab('kids');
  }

  /* ================================================================ */
  /* Complaints (on a parent's profile) and sickness (on a learner's)  */
  /* ================================================================ */
  function complaintsCard(p) {
    var list = D.complaints.filter(function (c) { return c.parent === p.id; }).sort(byDateDesc);
    var open = list.filter(function (c) { return !c.resolved; }).length;
    var h = '<div class="card" style="border-top-color:#e5383b"><div class="row"><h3 class="ct r">📣 ' + esc(t('complaints')) + '</h3>' +
      (open ? '<span class="pill red">' + esc(t('open_n', { n: open })) + '</span>' : '') + '</div>';
    list.forEach(function (c) {
      h += '<div class="prow" data-act="editComplaint" data-id="' + c.id + '"><div class="grow"><b>' + esc(shortDate(c.date)) + '</b>' +
        (c.kid ? ' · ' + esc(kidName(c.kid)) : '') + ' <span class="pill ' + (c.resolved ? '' : 'red') + '">' + esc(t(c.resolved ? 'resolved' : 'open')) + '</span>' +
        '<div class="small-l">' + esc((c.desc || '').slice(0, 110)) + ((c.media || []).length ? ' · 📷 ' + c.media.length : '') + '</div></div><span class="go">›</span></div>';
    });
    if (!list.length) h += empty(t('no_complaints'));
    h += btn('newComplaint', '➕ ' + esc(t('new_complaint')), 'secondary small', 'data-id="' + p.id + '"') + '</div>';
    return h;
  }
  function complaintState(c, parent) {
    if (!c) return { parent: parent, date: today(), kid: '', desc: '', action: '', resolved: false, media: [], added: [], removed: [], color: '#e5383b' };
    return { id: c.id, parent: c.parent, date: c.date, kid: c.kid || '', desc: c.desc || '', action: c.action || '', resolved: !!c.resolved,
      media: (c.media || []).slice(), added: [], removed: [], color: '#e5383b' };
  }
  function complaintForm() {
    var ks = kidsOfParent(F.parent);
    var h = '<div class="card"><p class="muted">👪 ' + esc(parentName(F.parent)) + '</p>' + fld(t('date'), inp('date', { type: 'date' })) +
      (ks.length ? fld(t('about_child'), sel('kid', [['', t('general')]].concat(ks.map(function (k) { return [k.id, fullName(k)]; })))) : '') +
      fld(t('complaint_desc') + ' *', area('desc', t('complaint_desc_ph'), 5)) +
      fld(t('complaint_action'), area('action', t('complaint_action_ph'), 3)) + check('resolved', t('complaint_resolved')) + '</div>';
    h += '<div class="card"><label class="f">📷 ' + esc(t('evidence_photos')) + '</label>' + mediaThumbs(F.media, true) + mediaPicker(false) + '</div>';
    h += msg('err', F.err ? esc(F.err) : '') + '<div class="bar">' + btn('saveComplaint', '✓ ' + esc(t('save')), 'primary red') +
      (F.id ? btn('delComplaint', confirmKey === 'delComplaint' ? esc(t('tap_again_delete')) : '🗑 ' + esc(t('delete')), 'text danger') : '') + '</div>';
    return h;
  }
  function saveComplaint() {
    var desc = cleanMulti(F.desc, 4000);
    if (!desc) { F.err = t('err_complaint'); return render(); }
    var c = F.id ? find('complaints', F.id) : null;
    if (!c) { c = { id: uid(), ts: Date.now() }; D.complaints.push(c); }
    Object.assign(c, { parent: F.parent, date: F.date || today(), kid: F.kid || '', desc: desc, action: cleanMulti(F.action, 2000), resolved: !!F.resolved, media: F.media || [] });
    dropRemoved();
    save(); toast(t('saved')); done();
  }
  function delComplaint() {
    if (confirmKey !== 'delComplaint') { confirmKey = 'delComplaint'; return render(); }
    var c = find('complaints', F.id);
    removeFrom('complaints', F.id);
    ((c && c.media) || []).concat(F.media || []).forEach(function (m) { if (!mediaInUse(m.id)) mediaDel(m.id); });
    F.added = [];
    save(); toast(t('deleted')); done();
  }

  /* Sickness ------------------------------------------------------------ */
  var ILLNESSES = ['cold', 'flu', 'fever', 'stomach', 'vomit', 'cough', 'ear', 'rash', 'teeth'];
  function sickOf(kid, date) { return D.sick.filter(function (s) { return s.kid === kid && s.date === date; })[0] || null; }
  function sickCard(k) {
    var list = D.sick.filter(function (s) { return s.kid === k.id; }).sort(byDateDesc);
    var h = '<div class="card" style="border-top-color:#ef476f"><h3 class="ct" style="color:#ef476f">🤒 ' + esc(t('sickness')) + '</h3>';
    list.slice(0, F.sickN || 5).forEach(function (s) {
      h += '<div class="prow" data-act="editSick" data-id="' + s.id + '"><div class="grow"><b>' + esc(shortDate(s.date)) + '</b> · ' + esc(s.illness || t('sick')) +
        (s.temp ? ' · 🌡 ' + esc(s.temp) + '°C' : '') + '<div class="small-l">' + esc(sickSummary(s)) + '</div></div><span class="go">›</span></div>';
    });
    if (list.length > (F.sickN || 5)) h += '<button class="text small" data-act="moreSick">' + esc(t('show_more')) + '</button>';
    if (!list.length) h += empty(t('no_sickness'));
    var td = sickOf(k.id, today());
    h += td ? btn('editSick', '🤒 ' + esc(t('sick_today_edit')), 'secondary small', 'data-id="' + td.id + '"')
      : btn('newSick', '🤒 ' + esc(t('mark_sick')), 'primary small', 'data-id="' + k.id + '" style="background:#ef476f"');
    return h + '</div>';
  }
  function sickSummary(s) {
    var p = [];
    p.push(s.sentHome ? t('sent_home_at', { t: s.sentTime || '?' }) : t('stayed'));
    (s.meds || []).forEach(function (m) { p.push('💊 ' + [m.med, m.dose, m.time].filter(Boolean).join(' ')); });
    if (s.note) p.push(s.note);
    return p.join(' · ');
  }
  function sickState(s, kid) {
    var f = { kid: kid, date: today(), illness: '', temp: '', sentHome: 'no', sentTime: '', medGiven: 'no', note: '', medN: 1, color: '#ef476f' };
    if (s) {
      Object.assign(f, { id: s.id, kid: s.kid, date: s.date, illness: s.illness || '', temp: s.temp || '', sentHome: s.sentHome ? 'yes' : 'no', sentTime: s.sentTime || '',
        medGiven: (s.meds || []).length ? 'yes' : 'no', note: s.note || '', medN: Math.max(1, (s.meds || []).length) });
      (s.meds || []).forEach(function (m, i) { f['med' + i] = m.med; f['dose' + i] = m.dose; f['mtime' + i] = m.time; });
    }
    return f;
  }
  function sickForm() {
    var k = find('kids', F.kid);
    var h = '<div class="card kidhead" style="--kc:' + kidColor(k || {}) + '">' + avatar(k) + '<div><h2>🤒 ' + esc(kidName(F.kid)) + '</h2>' +
      (k && k.allergies ? '<div class="pill red">⚠ ' + esc(k.allergies) + '</div>' : '') + '</div></div>';
    h += '<div class="card">' + '<div class="two">' + fld(t('date'), inp('date', { type: 'date' })) + fld(t('temperature') + ' (°C)', inp('temp', { mode: 'decimal', max: 5, ph: '38,2' })) + '</div>' +
      fld(t('which_illness') + ' *', inp('illness', { max: 80, ph: t('illness_ph') })) +
      '<div class="chips">' + ILLNESSES.map(function (v) { var l = t('ill_' + v); return '<button class="chip' + (F.illness === l ? ' on' : '') + '" data-chip="illness" data-v="' + esc(l) + '">' + esc(l) + '</button>'; }).join('') + '</div>' +
      '<label class="f">' + esc(t('sent_home')) + '</label>' + seg('sentHome', [['no', esc(t('no'))], ['yes', esc(t('yes'))]]) +
      (F.sentHome === 'yes' ? fld(t('sent_time'), inp('sentTime', { type: 'time' })) : '') + '</div>';
    h += '<div class="card"><label class="f">💊 ' + esc(t('med_given')) + '</label>' + seg('medGiven', [['no', esc(t('no'))], ['yes', esc(t('yes'))]]);
    if (F.medGiven === 'yes') {
      for (var i = 0; i < F.medN; i++) {
        h += '<div class="medrow"><div class="two">' + fld(t('medicine'), inp('med' + i, { max: 60 })) + fld(t('dose'), inp('dose' + i, { max: 30, ph: t('dose_ph') })) + '</div>' +
          '<div class="row">' + fld(t('time_given'), inp('mtime' + i, { type: 'time' })) +
          (F.medN > 1 ? '<button class="text danger small" data-act="rmMedRow" data-v="' + i + '">✕ ' + esc(t('remove')) + '</button>' : '') + '</div></div>';
      }
      h += btn('addMedRow', '➕ ' + esc(t('add_medicine')), 'secondary small');
    }
    h += '</div><div class="card">' + fld(t('note'), area('note', t('sick_note_ph'), 3)) + '</div>' + msg('err', F.err ? esc(F.err) : '') +
      '<div class="bar">' + btn('saveSick', '✓ ' + esc(t('save')), 'primary', 'style="background:#ef476f"') +
      (F.id ? btn('delSick', confirmKey === 'delSick' ? esc(t('tap_again_delete')) : '🗑 ' + esc(t('delete')), 'text danger') : '') + '</div>';
    return h;
  }
  function sickMeds() {
    var out = [];
    if (F.medGiven !== 'yes') return out;
    for (var i = 0; i < F.medN; i++) {
      var m = clean(F['med' + i], 60);
      if (m) out.push({ med: m, dose: clean(F['dose' + i], 30), time: F['mtime' + i] || '' });
    }
    return out;
  }
  function saveSick() {
    var ill = clean(F.illness, 80), meds = sickMeds();
    if (!ill) { F.err = t('err_illness'); return render(); }
    if (F.sentHome === 'yes' && !F.sentTime) { F.err = t('err_sent_time'); return render(); }
    if (F.medGiven === 'yes' && !meds.length) { F.err = t('err_med'); return render(); }
    if (meds.some(function (m) { return !m.time; })) { F.err = t('err_med_time'); return render(); }
    var s = F.id ? find('sick', F.id) : null;
    if (!s) { s = { id: uid(), ts: Date.now() }; D.sick.push(s); }
    var temp = num(F.temp);
    Object.assign(s, { kid: F.kid, date: F.date || today(), illness: ill, temp: isNaN(temp) ? '' : numIn(temp), sentHome: F.sentHome === 'yes',
      sentTime: F.sentHome === 'yes' ? F.sentTime : '', meds: meds, note: cleanMulti(F.note, 1000) });
    save(); toast(t('saved')); done();
  }
  // keep what was typed in the medicine rows when one is removed
  function rmMedRow(i) {
    for (var j = i; j < F.medN - 1; j++) { F['med' + j] = F['med' + (j + 1)]; F['dose' + j] = F['dose' + (j + 1)]; F['mtime' + j] = F['mtime' + (j + 1)]; }
    F.medN--; render();
  }

  /* ================================================================ */
  /* Nappy book (care log through the day)                             */
  /* ================================================================ */
  var MEALS = ['breakfast', 'snack_am', 'lunch', 'snack_pm'];
  function careDetail(c) {
    var p = [];
    if (c.type === 'nappy' && c.nappy) p.push(t('nappy_' + c.nappy));
    if (c.type === 'accident' && (c.clothes || []).length) p.push(c.clothes.map(function (x) { return t('cl_' + x); }).join(', '));
    if (c.type === 'eat') { if (c.meal) p.push(t('meal_' + c.meal)); if (c.what) p.push(c.what); if (c.amount) p.push(t('amt_' + c.amount)); }
    if (c.type === 'activity') {
      if (c.act) p.push(t('ac_' + c.act));
      p.push(c.timeEnd ? c.time + '–' + c.timeEnd + (mins(c.timeEnd) >= mins(c.time) ? ' (' + durLabel(mins(c.timeEnd) - mins(c.time)) + ')' : '') : t('act_busy', { t: c.time }));
    }
    if (c.type === 'bottle') {
      if (c.restOf) { var o = find('care', c.restOf); p.push(t('rest_of', { t: o ? o.time : '' })); }
      if (c.drink) p.push(t('dr_' + c.drink));
      if (c.drank) p.push(t('dk_' + c.drank));
      var r = bottleRest(c);
      if (r) p.push(t('rest_given', { t: r.time }));
    }
    if (c.type === 'med') { if (c.med) p.push(c.med); if (c.dose) p.push(c.dose); if (c.by) p.push(t('given_by') + ' ' + c.by); }
    if (c.type === 'sleep' && c.sleep) p.push(t('sleep_' + c.sleep));
    if (c.note) p.push(c.note);
    return p.join(' · ');
  }
  // The follow-up entry when the rest of an unfinished bottle was given
  function bottleRest(c) { for (var i = 0; i < D.care.length; i++) if (D.care[i].restOf === c.id) return D.care[i]; return null; }
  function canGiveRest(c) { return c && c.type === 'bottle' && c.drank && c.drank !== 'all' && !bottleRest(c); }
  function presentKids(date) {
    return kidsOn(date).filter(function (k) { var a = attOf(k.id, date); return a && a.in && !a.out; });
  }
  function careScreen() {
    var day = LS.careDay || today();
    var h = dayNav('careDay', day);
    h += '<div class="tiles">' + CARE_TYPES.map(function (ty) {
      return '<button class="tile" style="--tc:' + CARE_COLOR[ty] + '" data-act="careAdd" data-v="' + ty + '"><span class="ti">' + CARE_ICON[ty] + '</span><span>' + esc(t('care_' + ty)) + '</span></button>';
    }).join('') + '</div>';
    if (!D.kids.length) return h + empty(t('no_kids'));
    var list = D.care.filter(function (c) { return c.date === day; });
    var kidsWith = {};
    list.forEach(function (c) { kidsWith[c.kid] = (kidsWith[c.kid] || 0) + 1; });
    var ks = kidsOn(day).filter(function (k) { return kidsWith[k.id]; });
    if (LS.careKid && !kidsWith[LS.careKid]) LS.careKid = '';
    h += '<div class="card"><div class="row"><h3 class="ct sky">📋 ' + esc(t('care_log')) + '</h3><span class="muted">' + list.length + '</span></div>';
    if (ks.length) {
      h += '<div class="chips scroll"><button class="chip' + (!LS.careKid ? ' on' : '') + '" data-act="careKid" data-id="">' + esc(t('everyone')) + '</button>' +
        ks.map(function (k) { return '<button class="chip' + (LS.careKid === k.id ? ' on' : '') + '" data-act="careKid" data-id="' + k.id + '" style="--kc:' + kidColor(k) + '">' + esc(k.name) + ' <small>' + kidsWith[k.id] + '</small></button>'; }).join('') + '</div>';
    }
    var shown = list.filter(function (c) { return !LS.careKid || c.kid === LS.careKid; }).sort(function (a, b) { return (b.time || '').localeCompare(a.time || '') || (b.ts || 0) - (a.ts || 0); });
    shown.forEach(function (c) {
      var k = find('kids', c.kid);
      h += '<div class="crow" data-act="editCare" data-id="' + c.id + '" style="--tc:' + CARE_COLOR[c.type] + '"><span class="ctime">' + esc(c.time) + '</span>' +
        '<span class="cic">' + CARE_ICON[c.type] + '</span><div class="grow"><b>' + esc(k ? k.name + ' ' + (k.surname || '').charAt(0) + '.' : '?') + '</b> · ' + esc(t('care_' + c.type)) +
        '<div class="small-l">' + esc(careDetail(c)) + '</div>' +
        (canGiveRest(c) ? '<button class="chip restbtn" data-act="bottleRest" data-id="' + c.id + '">🍼 ' + esc(t('give_rest')) + '</button>' : '') +
        (c.type === 'activity' && !c.timeEnd ? '<button class="chip restbtn actbtn" data-act="actDone" data-id="' + c.id + '">⏹ ' + esc(t('act_done')) + '</button>' : '') + '</div>' + (c.photo ? '<img class="mini" data-mid="' + c.photo + '" alt="">' : '') +
        ((c.media || []).length ? '<span class="minibox">' + ((c.media.filter(function (m) { return m.type !== 'video'; })[0]) ? '<img class="mini" data-mid="' + c.media.filter(function (m) { return m.type !== 'video'; })[0].id + '" alt="">' : '<span class="mini vid">▶</span>') +
          (c.media.length > 1 ? '<b>' + c.media.length + '</b>' : '') + '</span>' : '') + '</div>';
    });
    if (!shown.length) h += empty(t('care_empty'));
    if (LS.careKid) h += btn('careDayPdf', '📄 ' + esc(t('care_report_for', { n: (find('kids', LS.careKid) || {}).name || '' })), 'secondary', 'data-id="' + LS.careKid + '" data-day="' + day + '"');
    h += '</div>';
    return h;
  }

  function careFields() {
    var h = '';
    if (F.type === 'nappy') h += '<label class="f">' + esc(t('nappy_was')) + '</label>' + pick('nappy', NAPPY, function (v) { return esc(t('nappy_' + v)); });
    if (F.type === 'eat') {
      h += '<label class="f">' + esc(t('meal')) + '</label>' + pick('meal', MEALS, function (v) { return esc(t('meal_' + v)); }) +
        fld(t('what_eaten'), inp('what', { max: 120, ph: t('what_eaten_ph') })) +
        '<label class="f">' + esc(t('how_much')) + '</label>' + pick('amount', AMOUNTS, function (v) { return esc(t('amt_' + v)); }) +
        '<label class="f">' + esc(t('meal_photo')) + '</label>' + photoPicker('photo');
    }
    if (F.type === 'activity') {
      h += '<label class="f">' + esc(t('which_activity')) + ' *</label>' + pick('act', ACTIVITIES, function (v) { return esc(t('ac_' + v)); }) +
        '<label class="f">📷 ' + esc(t('act_media')) + '</label>' + mediaThumbs(F.media, true) + mediaPicker(true) +
        ((F.kids || []).length > 1 && !F.id ? '<p class="hint">' + esc(t('act_media_hint')) + '</p>' : '');
    }
    if (F.type === 'bottle') {
      h += '<label class="f">' + esc(t('bottle_contents')) + ' *</label>' + pick('drink', DRINKS, function (v) { return esc(t('dr_' + v)); }) +
        '<label class="f">' + esc(t(F.restOf ? 'drank_rest' : 'drank')) + ' *</label>' + pick('drank', DRANK, function (v) { return esc(t('dk_' + v)); });
    }
    if (F.type === 'med') {
      h += fld(t('medicine') + ' *', inp('med', { max: 80 })) + '<div class="two">' + fld(t('dose'), inp('dose', { max: 40, ph: t('dose_ph') })) + fld(t('given_by'), inp('by', { max: 40 })) + '</div>';
    }
    if (F.type === 'sleep') h += pick('sleep', SLEEP, function (v) { return esc(t('sleep_' + v)); });
    if (F.type === 'accident') h += '<label class="f">' + esc(t('clothes_changed')) + '</label>' + multi('clothes', CLOTHES, function (v) { return esc(t('cl_' + v)); });
    h += fld(F.type === 'other' ? t('what_happened') + ' *' : t('note'), area('note', '', 2));
    return h;
  }
  function timeFields() {
    if (F.type !== 'activity') return fld(t('time'), inp('time', { type: 'time' }));
    return '<div class="two">' + fld(t('time_from'), inp('time', { type: 'time' })) + fld(t('time_to'), inp('timeEnd', { type: 'time' })) + '</div><p class="hint">' + esc(t('act_end_hint')) + '</p>';
  }
  function photoPicker(key) {
    if (F[key]) return '<div class="thumbs"><div class="thumb" data-act="viewMedia" data-id="' + F[key] + '"><img data-mid="' + F[key] + '" alt=""><button class="rm" data-act="rmPhoto" data-v="' + key + '">✕</button></div></div>';
    return '<div class="two"><label class="secondary btnl">📷 ' + esc(t('take_photo')) + '<input type="file" accept="image/*" capture="environment" class="hidden" data-photo="' + key + '"></label>' +
      '<label class="secondary btnl">🖼 ' + esc(t('choose_photo')) + '<input type="file" accept="image/*" class="hidden" data-photo="' + key + '"></label></div>';
  }
  function careAddScreen() {
    if (F.restOf) {
      var rk = find('kids', F.kids[0]), orig = find('care', F.restOf);
      return '<div class="card kidhead" style="--kc:' + kidColor(rk || {}) + '">' + avatar(rk) + '<div><h2>🍼 ' + esc(kidName(F.kids[0])) + '</h2><div class="muted">' +
        esc(orig ? t('rest_of', { t: orig.time }) + ' · ' + careDetail(orig) : '') + '</div></div></div>' +
        '<div class="card">' + timeFields() + careFields() + '</div>' + msg('err', F.err ? esc(F.err) : '') +
        '<div class="bar">' + btn('saveCareAdd', '✓ ' + esc(t('save')), 'primary') + '</div>';
    }
    var present = presentKids(F.date), list = (F.showAll || !present.length) ? kidsOn(F.date) : present;
    var h = '<div class="card" style="--sec:' + CARE_COLOR[F.type] + '"><div class="row"><h3 class="ct">' + esc(t('who')) + ' <span class="muted">(' + (F.kids || []).length + ')</span></h3>' +
      '<button class="text small" data-act="careAll">' + esc((F.kids || []).length === list.length && list.length ? t('select_none') : t('select_all')) + '</button></div>';
    if (!present.length) h += '<p class="hint">' + esc(t('nobody_present')) + '</p>';
    h += '<div class="kidgrid">' + list.map(function (k) {
      var on = (F.kids || []).indexOf(k.id) > -1;
      return '<button class="kidpick' + (on ? ' on' : '') + '" data-multi="kids" data-v="' + k.id + '" style="--kc:' + kidColor(k) + '">' + avatar(k, 44) +
        '<span>' + esc(k.name) + '</span>' + (k.allergies && F.type !== 'nappy' ? '<i class="alg">⚠</i>' : '') + (on ? '<i class="tick">✓</i>' : '') + '</button>';
    }).join('') + '</div>';
    if (present.length && kidsOn(F.date).length > present.length) {
      h += '<button class="text small" data-act="careShowAll">' + esc(F.showAll ? t('only_present') : t('show_all_kids')) + '</button>';
    }
    h += '</div>';
    if (F.type === 'med' || F.type === 'eat') {
      var alg = (F.kids || []).map(function (id) { return find('kids', id); }).filter(function (k) { return k && k.allergies; });
      if (alg.length) h += msg('err', '⚠ ' + alg.map(function (k) { return '<b>' + esc(k.name) + ':</b> ' + esc(k.allergies); }).join('<br>'));
    }
    h += '<div class="card">' + timeFields() + careFields() + '</div>' + msg('err', F.err ? esc(F.err) : '');
    h += '<div class="bar">' + btn('saveCareAdd', '✓ ' + esc(t('add_to_n', { n: (F.kids || []).length })), 'primary', (F.kids || []).length ? '' : 'disabled') + '</div>';
    return h;
  }
  var CARE_KEYS = ['nappy', 'meal', 'what', 'amount', 'med', 'dose', 'by', 'sleep', 'drink', 'drank', 'act', 'timeEnd'];
  function careValid() {
    if (!F.time) return t('err_time');
    if (F.type === 'med' && !clean(F.med)) return t('err_med');
    if (F.type === 'other' && !clean(F.note)) return t('err_note');
    if (F.type === 'activity' && !F.act) return t('err_act');
    if (F.type === 'activity' && F.timeEnd && mins(F.timeEnd) < mins(F.time)) return t('err_end_before');
    if (F.type === 'bottle' && !F.drink) return t('err_drink');
    if (F.type === 'bottle' && !F.drank) return t('err_drank');
    return '';
  }
  function careVals() {
    var o = { time: F.time, note: cleanMulti(F.note, 500), photo: F.type === 'eat' ? F.photo || '' : '' };
    CARE_KEYS.forEach(function (k) { o[k] = clean(F[k], 120); });
    o.clothes = F.type === 'accident' ? (F.clothes || []).slice() : [];
    o.media = F.type === 'activity' ? (F.media || []).slice() : [];
    return o;
  }
  function saveCareAdd() {
    var err = careValid();
    if (err) { F.err = err; return render(); }
    var grp = uid(), vals = careVals();
    (F.kids || []).forEach(function (kid) {
      D.care.push(Object.assign({ id: uid(), kid: kid, date: F.date, type: F.type, grp: grp, ts: Date.now() }, vals, F.restOf ? { restOf: F.restOf } : {}));
    });
    save(); toast(t('care_added', { n: F.kids.length })); done();
  }
  function careEditScreen() {
    var c = find('care', F.id), k = c && find('kids', c.kid);
    if (!c) return empty(t('not_found'));
    var h = '<div class="card kidhead" style="--kc:' + kidColor(k || {}) + '">' + avatar(k) + '<div><h2>' + CARE_ICON[c.type] + ' ' + esc(t('care_' + c.type)) + '</h2><div class="muted">' + esc(kidName(c.kid)) + ' · ' + esc(shortDate(c.date)) + '</div></div></div>';
    h += '<div class="card">' + timeFields() + careFields() + '</div>' + msg('err', F.err ? esc(F.err) : '');
    if (canGiveRest(c)) h += btn('bottleRest', '🍼 ' + esc(t('give_rest')), 'secondary', 'data-id="' + c.id + '"');
    h += '<div class="bar">' + btn('saveCareEdit', '✓ ' + esc(t('save')), 'primary') +
      btn('delCare', confirmKey === 'delCare' ? esc(t('tap_again_delete')) : '🗑 ' + esc(t('delete')), 'text danger') + '</div>';
    return h;
  }
  function saveCareEdit() {
    var err = careValid();
    if (err) { F.err = err; return render(); }
    var c = find('care', F.id), old = c.photo;
    Object.assign(c, careVals());
    if (old && old !== c.photo && !mediaInUse(old)) mediaDel(old);
    dropRemoved();
    save(); toast(t('saved')); done();
  }
  function delCare() {
    if (confirmKey !== 'delCare') { confirmKey = 'delCare'; return render(); }
    var c = find('care', F.id);
    removeFrom('care', F.id);
    D.care.forEach(function (x) { if (x.restOf === F.id) delete x.restOf; });
    if (c && c.photo && !mediaInUse(c.photo)) mediaDel(c.photo);
    if (F.photo && F.photo !== (c && c.photo) && !mediaInUse(F.photo)) mediaDel(F.photo);
    ((c && c.media) || []).concat(F.media || []).forEach(function (m) { if (!mediaInUse(m.id)) mediaDel(m.id); });
    save(); toast(t('deleted')); F.added = []; done();
  }
  // Is this photo / video still used by any record?
  function mediaInUse(id) {
    if (!id) return false;
    var used = false;
    D.care.forEach(function (c) { if (c.photo === id) used = true; (c.media || []).forEach(function (m) { if (m.id === id) used = true; }); });
    D.money.forEach(function (m) { if (m.photo === id) used = true; });
    D.diary.forEach(function (d) { (d.media || []).forEach(function (m) { if (m.id === id) used = true; }); });
    D.incidents.forEach(function (i) { (i.media || []).forEach(function (m) { if (m.id === id) used = true; }); });
    D.kids.forEach(function (k) { (k.regDocs || []).forEach(function (m) { if (m.id === id) used = true; }); });
    D.complaints.forEach(function (c) { (c.media || []).forEach(function (m) { if (m.id === id) used = true; }); });
    return used;
  }

  /* ================================================================ */
  /* Diary and incident log                                            */
  /* ================================================================ */
  function booksScreen() {
    var h = subTabs('booksSub', [['diary', '📒 ' + esc(t('diary'))], ['inc', '🩹 ' + esc(t('incidents'))]]);
    if (LS.booksSub === 'inc') {
      h += btn('newInc', '➕ ' + esc(t('new_inc')), 'primary red');
      var list = D.incidents.slice().sort(byDateDesc);
      h += '<div class="list">';
      list.forEach(function (i) {
        var names = (i.kids || []).map(function (id) { var k = find('kids', id); return k ? k.name : ''; }).filter(Boolean).join(', ');
        h += '<div class="lrow" data-act="openInc" data-id="' + i.id + '" style="--kc:' + (SEV_COLOR[i.severity] || '#8338ec') + '">' +
          '<span class="av sq" style="background:var(--kc)">🩹</span><div class="kr-txt"><b>' + esc(i.type ? t('inc_' + i.type) : t('incident')) + '</b> · ' + esc(names || '—') +
          '<div class="small-l">' + esc(shortDate(i.date)) + (i.time ? ' ' + esc(i.time) : '') + (i.severity ? ' · ' + esc(t('sev_' + i.severity)) : '') +
          ((i.media || []).length ? ' · 📎 ' + i.media.length : '') + '</div></div><span class="go">›</span></div>';
      });
      h += '</div>';
      if (!list.length) h += empty(t('no_incidents'));
      return h;
    }
    var td = diaryOf(today());
    if (td) h += '<div class="card tap done" data-act="openDiary" data-id="' + td.id + '"><div class="row"><b>✅ ' + esc(t('diary_done_today')) + '</b><span class="go">›</span></div><div class="small-l">' + esc((td.text || '').slice(0, 140)) + '</div></div>';
    else h += btn('diaryToday', '📒 ' + esc(t('diary_fill_today')), 'primary purple');
    h += '<p class="hint">⏰ ' + esc(D.settings.remind ? t('remind_at', { t: D.settings.remindTime }) : t('remind_off')) + ' · <a href="#" data-act="settings">' + esc(t('change')) + '</a></p>';
    var list2 = D.diary.slice().sort(byDateDesc), n = F.diaryN || 30;
    h += '<div class="list">';
    list2.slice(0, n).forEach(function (d) {
      h += '<div class="lrow" data-act="openDiary" data-id="' + d.id + '" style="--kc:#8338ec"><span class="av sq" style="background:var(--kc)">' + esc(String(parseD(d.date).getDate())) + '</span>' +
        '<div class="kr-txt"><b>' + esc(niceDate(d.date)) + '</b> ' + (d.weather || []).map(function (w) { return WEATHER_ICON[w] || ''; }).join('') +
        '<div class="small-l">' + esc((d.theme ? d.theme + ' · ' : '') + (d.text || '').slice(0, 90)) + ((d.media || []).length ? ' · 📷 ' + d.media.length : '') + '</div></div><span class="go">›</span></div>';
    });
    h += '</div>';
    if (list2.length > n) h += '<button class="text" data-act="moreDiary">' + esc(t('show_more')) + '</button>';
    if (!list2.length) h += empty(t('no_diary'));
    return h;
  }

  /* Diary -------------------------------------------------------------- */
  function diaryState(d, date) {
    if (!d) return { date: date || today(), weather: [], theme: '', activities: '', text: '', meals: '', staff: '', notes: '', media: [], added: [], removed: [], color: '#8338ec' };
    return { id: d.id, date: d.date, weather: (d.weather || []).slice(), theme: d.theme || '', activities: d.activities || '', text: d.text || '', meals: d.meals || '',
      staff: d.staff || '', notes: d.notes || '', media: (d.media || []).slice(), added: [], removed: [], color: '#8338ec' };
  }
  function diaryForm() {
    var h = '<div class="card">' + fld(t('date'), inp('date', { type: 'date' })) +
      '<label class="f">' + esc(t('weather')) + '</label>' + multi('weather', WEATHER, function (w) { return WEATHER_ICON[w] + ' ' + esc(t('w_' + w)); }) +
      fld(t('theme'), inp('theme', { max: 80, ph: t('theme_ph') })) +
      fld(t('activities'), area('activities', t('activities_ph'), 3)) +
      fld(t('day_text') + ' *', area('text', t('day_text_ph'), 5)) +
      fld(t('menu'), area('meals', t('menu_ph'), 2)) +
      fld(t('staff_on_duty'), inp('staff', { max: 120 })) +
      fld(t('other_notes'), area('notes', '', 2)) + '</div>';
    h += '<div class="card"><label class="f">📷 ' + esc(t('photos')) + '</label>' + mediaThumbs(F.media, true) + mediaPicker(false) + '</div>';
    h += msg('err', F.err ? esc(F.err) : '') + '<div class="bar">' + btn('saveDiary', '✓ ' + esc(t('save')), 'primary purple') +
      (F.id ? btn('delDiary', confirmKey === 'delDiary' ? esc(t('tap_again_delete')) : '🗑 ' + esc(t('delete')), 'text danger') : '') + '</div>';
    return h;
  }
  function mediaPicker(video) {
    var acc = video ? 'image/*,video/*' : 'image/*';
    return '<div class="two"><label class="secondary btnl">📷 ' + esc(t('take_photo')) + '<input type="file" accept="image/*" capture="environment" class="hidden" data-media="1"></label>' +
      (video ? '<label class="secondary btnl">🎥 ' + esc(t('take_video')) + '<input type="file" accept="video/*" capture="environment" class="hidden" data-media="1"></label>' : '') +
      '<label class="secondary btnl">🖼 ' + esc(video ? t('choose_media') : t('choose_photos')) + '<input type="file" accept="' + acc + '" multiple class="hidden" data-media="1"></label></div>';
  }
  function addMediaFiles(files) {
    var list = Array.prototype.slice.call(files || []);
    if (!list.length || !F) return;
    var f0 = F;
    toast(t('adding_media'));
    Promise.all(list.map(function (file) {
      var isVid = /^video\//.test(file.type);
      var p = isVid ? Promise.resolve(file) : shrinkPhoto(file);
      return p.then(function (blob) {
        var id = uid();
        return mediaPut(id, isVid ? new Blob([blob], { type: file.type || 'video/mp4' }) : blob).then(function () {
          return { id: id, type: isVid ? 'video' : 'image', name: file.name || '' };
        });
      }).catch(function () { toast(t('err_media')); return null; });
    })).then(function (items) {   // keep the order in which they were chosen
      f0.media = f0.media || []; f0.added = f0.added || [];
      items.filter(Boolean).forEach(function (m) { f0.media.push(m); f0.added.push(m.id); });
      if (F === f0) { render(); toast(t('media_added', { n: list.length })); }
    });
  }
  function rmMedia(id) {
    F.media = (F.media || []).filter(function (m) { return m.id !== id; });
    var i = (F.added || []).indexOf(id);
    if (i > -1) { F.added.splice(i, 1); mediaDel(id); }
    else (F.removed = F.removed || []).push(id);
    render();
  }
  function dropRemoved() { (F.removed || []).forEach(function (id) { if (!mediaInUse(id)) mediaDel(id); }); }
  function saveDiary() {
    var text = cleanMulti(F.text, 4000);
    if (!F.date) { F.err = t('err_date'); return render(); }
    if (!text) { F.err = t('err_day_text'); return render(); }
    var other = diaryOf(F.date);
    if (other && other.id !== F.id) { F.err = t('err_diary_exists'); return render(); }
    var d = F.id ? find('diary', F.id) : null;
    if (!d) { d = { id: uid(), ts: Date.now() }; D.diary.push(d); }
    Object.assign(d, { date: F.date, weather: F.weather || [], theme: clean(F.theme, 80), activities: cleanMulti(F.activities, 2000), text: text,
      meals: cleanMulti(F.meals, 600), staff: clean(F.staff, 120), notes: cleanMulti(F.notes, 2000), media: F.media || [], updated: Date.now() });
    dropRemoved();
    save(); toast(t('saved')); done();
  }
  function delDiary() {
    if (confirmKey !== 'delDiary') { confirmKey = 'delDiary'; return render(); }
    var d = find('diary', F.id);
    removeFrom('diary', F.id);
    ((d && d.media) || []).concat(F.media || []).forEach(function (m) { if (!mediaInUse(m.id)) mediaDel(m.id); });
    F.added = [];
    save(); toast(t('deleted'));
    STACK = STACK.filter(function (s) { return !(s.V === 'diaryView' && s.F && s.F.id === d.id); });
    done();
  }
  function diaryView() {
    var d = find('diary', F.id);
    if (!d) return empty(t('not_found'));
    var h = '<div class="card"><div class="row"><h2>' + esc(niceDate(d.date)) + '</h2><span class="wx">' + (d.weather || []).map(function (w) { return WEATHER_ICON[w]; }).join(' ') + '</span></div>';
    [['theme', d.theme], ['activities', d.activities], ['day_text', d.text], ['menu', d.meals], ['staff_on_duty', d.staff], ['other_notes', d.notes]].forEach(function (x) {
      if (x[1]) h += '<div class="blk"><span class="f">' + esc(t(x[0])) + '</span><div class="pre">' + esc(x[1]) + '</div></div>';
    });
    h += mediaThumbs(d.media, false) + '</div>';
    h += '<div class="bar">' + btn('editDiary', '✏️ ' + esc(t('edit')), 'primary purple', 'data-id="' + d.id + '"') +
      '<div class="two">' + btn('diaryPdf', '📄 PDF', 'secondary', 'data-id="' + d.id + '"') + btn('diaryPdfShare', '📤 ' + esc(t('share')), 'secondary', 'data-id="' + d.id + '"') + '</div></div>';
    return h;
  }

  /* Incidents ---------------------------------------------------------- */
  var INC_KEYS = ['place', 'desc', 'injury', 'action', 'staff', 'witness', 'notifiedWho', 'notifiedHow', 'notifiedTime', 'follow'];
  function incState(i) {
    var f = { date: today(), time: nowHM(), kids: [], type: '', severity: 'minor', notified: '', media: [], added: [], removed: [], color: '#e5383b' };
    INC_KEYS.forEach(function (k) { f[k] = ''; });
    if (!i) return f;
    Object.keys(f).forEach(function (k) { if (i[k] != null) f[k] = Array.isArray(i[k]) ? i[k].slice() : i[k]; });
    f.id = i.id; f.added = []; f.removed = [];
    return f;
  }
  function incForm() {
    var kids = kidsOn(F.date || today());
    (F.kids || []).forEach(function (id) { if (!kids.some(function (k) { return k.id === id; })) { var k = find('kids', id); if (k) kids.push(k); } });
    var h = '<div class="card"><div class="two">' + fld(t('date'), inp('date', { type: 'date' })) + fld(t('time'), inp('time', { type: 'time' })) + '</div>' +
      '<label class="f">' + esc(t('kids_involved')) + ' *</label><div class="kidgrid">' + kids.map(function (k) {
        var on = (F.kids || []).indexOf(k.id) > -1;
        return '<button class="kidpick' + (on ? ' on' : '') + '" data-multi="kids" data-v="' + k.id + '" style="--kc:' + kidColor(k) + '">' + avatar(k, 40) + '<span>' + esc(k.name) + '</span>' + (on ? '<i class="tick">✓</i>' : '') + '</button>';
      }).join('') + '</div></div>';
    h += '<div class="card"><label class="f">' + esc(t('inc_type')) + '</label>' + pick('type', INC_TYPES, function (v) { return esc(t('inc_' + v)); }) +
      '<label class="f">' + esc(t('severity')) + '</label>' + seg('severity', SEVERITY.map(function (s) { return [s, esc(t('sev_' + s))]; })) +
      fld(t('place'), inp('place', { max: 80, ph: t('place_ph') })) +
      fld(t('inc_desc') + ' *', area('desc', t('inc_desc_ph'), 5)) +
      fld(t('injury'), area('injury', t('injury_ph'), 2)) +
      fld(t('action_taken'), area('action', t('action_ph'), 3)) +
      '<div class="two">' + fld(t('staff_handled'), inp('staff', { max: 80 })) + fld(t('witnesses'), inp('witness', { max: 120 })) + '</div></div>';
    h += '<div class="card"><label class="f">' + esc(t('parent_notified')) + '</label>' + seg('notified', [['yes', esc(t('yes'))], ['no', esc(t('no'))]]);
    if (F.notified === 'yes') h += '<div class="two">' + fld(t('notified_who'), inp('notifiedWho', { max: 80 })) + fld(t('notified_time'), inp('notifiedTime', { type: 'time' })) + '</div>' +
      fld(t('notified_how'), inp('notifiedHow', { max: 80, ph: t('notified_how_ph') }));
    h += fld(t('follow_up'), area('follow', '', 2)) + '</div>';
    h += '<div class="card"><label class="f">📎 ' + esc(t('evidence')) + '</label>' + mediaThumbs(F.media, true) + mediaPicker(true) + '<p class="hint">' + esc(t('video_hint')) + '</p></div>';
    h += msg('err', F.err ? esc(F.err) : '') + '<div class="bar">' + btn('saveInc', '✓ ' + esc(t('save')), 'primary red') +
      (F.id ? btn('delInc', confirmKey === 'delInc' ? esc(t('tap_again_delete')) : '🗑 ' + esc(t('delete')), 'text danger') : '') + '</div>';
    return h;
  }
  function saveInc() {
    if (!(F.kids || []).length) { F.err = t('err_kids'); return render(); }
    if (!cleanMulti(F.desc)) { F.err = t('err_desc'); return render(); }
    if (!F.date) { F.err = t('err_date'); return render(); }
    var i = F.id ? find('incidents', F.id) : null, isNew = !i;
    if (!i) { i = { id: uid(), ts: Date.now() }; D.incidents.push(i); }
    Object.assign(i, { date: F.date, time: F.time || '', kids: F.kids.slice(), type: F.type || '', severity: F.severity || '', notified: F.notified || '', media: F.media || [] });
    INC_KEYS.forEach(function (k) { i[k] = cleanMulti(F[k], k === 'desc' ? 4000 : 1000); });
    dropRemoved();
    save(); toast(t('saved'));
    if (isNew) { F.added = []; V = 'inc'; F = { id: i.id, color: '#e5383b' }; render(); window.scrollTo(0, 0); }
    else done();
  }
  function delInc() {
    if (confirmKey !== 'delInc') { confirmKey = 'delInc'; return render(); }
    var i = find('incidents', F.id);
    removeFrom('incidents', F.id);
    ((i && i.media) || []).concat(F.media || []).forEach(function (m) { if (!mediaInUse(m.id)) mediaDel(m.id); });
    F.added = [];
    save(); toast(t('deleted'));
    STACK = STACK.filter(function (s) { return !(s.V === 'inc' && s.F && s.F.id === i.id); });
    done();
  }
  function incScreen() {
    var i = find('incidents', F.id);
    if (!i) return empty(t('not_found'));
    var h = '<div class="card" style="border-top-color:' + (SEV_COLOR[i.severity] || '#e5383b') + '"><div class="row"><h2>🩹 ' + esc(i.type ? t('inc_' + i.type) : t('incident')) + '</h2>' +
      (i.severity ? '<span class="pill" style="background:' + SEV_COLOR[i.severity] + ';color:#fff">' + esc(t('sev_' + i.severity)) + '</span>' : '') + '</div>' +
      '<div class="muted">' + esc(niceDate(i.date)) + (i.time ? ' · ' + esc(i.time) : '') + (i.place ? ' · ' + esc(i.place) : '') + '</div>' +
      '<div class="chips">' + (i.kids || []).map(function (id) { var k = find('kids', id); return k ? '<span class="chip on" style="--kc:' + kidColor(k) + '">' + esc(fullName(k)) + '</span>' : ''; }).join('') + '</div>';
    [['inc_desc', i.desc], ['injury', i.injury], ['action_taken', i.action], ['staff_handled', i.staff], ['witnesses', i.witness], ['follow_up', i.follow]].forEach(function (x) {
      if (x[1]) h += '<div class="blk"><span class="f">' + esc(t(x[0])) + '</span><div class="pre">' + esc(x[1]) + '</div></div>';
    });
    h += '<div class="blk"><span class="f">' + esc(t('parent_notified')) + '</span><div>' + esc(i.notified === 'yes' ? t('yes') + [i.notifiedWho, i.notifiedTime, i.notifiedHow].filter(Boolean).map(function (x) { return ' · ' + x; }).join('') : i.notified === 'no' ? t('no') : '—') + '</div></div>';
    h += mediaThumbs(i.media, false) + '</div>';
    h += '<div class="bar">' + btn('incPdf', '📄 ' + esc(t('inc_report')), 'primary red', 'data-id="' + i.id + '"') +
      '<div class="two">' + btn('incShare', '📤 ' + esc(t('share_report')), 'secondary', 'data-id="' + i.id + '"') + btn('editInc', '✏️ ' + esc(t('edit')), 'secondary', 'data-id="' + i.id + '"') + '</div>' +
      ((i.media || []).some(function (m) { return m.type === 'video'; }) ? '<p class="hint">' + esc(t('share_hint')) + '</p>' : '') + '</div>';
    return h;
  }

  /* ================================================================ */
  /* Money: accounts, income, expenses                                 */
  /* ================================================================ */
  function moneyScreen() {
    var h = subTabs('moneySub', [['acc', '🧾 ' + esc(t('accounts'))], ['in', '⬇ ' + esc(t('income'))], ['out', '⬆ ' + esc(t('expenses'))]]);
    if (LS.moneySub === 'acc') {
      var ks = kidsSorted(true).map(function (k) { return { k: k, b: balanceOf(k.id) }; })
        .filter(function (x) { return x.k.active !== false || Math.abs(x.b) > 0.004; });
      var owed = sum(ks.filter(function (x) { return x.b > 0; }), function (x) { return x.b; });
      h += '<div class="stats"><div class="st r"><b>' + fmtR(owed) + '</b><span>' + esc(t('total_owed')) + '</span></div>' +
        '<div class="st g"><b>' + fmtR(sum(D.money.filter(function (m) { return m.dir === 'in' && m.kind === 'pay' && ymOf(m.date) === ymOf(today()); }), function (m) { return m.amt; })) + '</b><span>' + esc(t('paid_this_month')) + '</span></div></div>';
      h += '<div class="two">' + btn('newMoney', '⬇ ' + esc(t('pay_recv')), 'primary g', 'data-v="in" data-kind="pay"') + btn('reports', '📄 ' + esc(t('invoices_all')), 'secondary') + '</div>';
      ks.sort(function (a, b) { return b.b - a.b || byName(a.k, b.k); });
      h += '<div class="list">';
      ks.forEach(function (x) {
        h += '<div class="lrow" data-act="openAccount" data-id="' + x.k.id + '" style="--kc:' + kidColor(x.k) + '">' + avatar(x.k) +
          '<div class="kr-txt"><b>' + esc(fullName(x.k)) + '</b><div class="small-l">👪 ' + esc(parentName(x.k.p1) || t('no_main_parent')) + '</div></div>' +
          '<b class="amt ' + (x.b > 0.004 ? 'neg' : 'pos') + '">' + fmtR(x.b) + '</b></div>';
      });
      h += '</div>';
      if (!ks.length) h += empty(t('no_kids'));
      return h;
    }
    var dir = LS.moneySub, ym = LS.ym || ymOf(today());
    h += ymNav(ym);
    var list = D.money.filter(function (m) { return m.dir === dir && ymOf(m.date) === ym; }).sort(byDateDesc);
    var tot = sum(list, function (m) { return m.amt; });
    h += '<div class="stats"><div class="st ' + (dir === 'in' ? 'g' : 'r') + '"><b>' + fmtR(tot) + '</b><span>' + esc(t(dir === 'in' ? 'income' : 'expenses')) + '</span></div>';
    if (dir === 'in') {
      h += '<div class="st b"><b>' + fmtR(sum(list.filter(function (m) { return m.kind === 'pay'; }), function (m) { return m.amt; })) + '</b><span>' + esc(t('kind_pay')) + '</span></div>' +
        '<div class="st p"><b>' + fmtR(sum(list.filter(function (m) { return m.kind === 'don'; }), function (m) { return m.amt; })) + '</b><span>' + esc(t('kind_don')) + '</span></div>';
    }
    h += '</div>';
    h += dir === 'in' ? '<div class="two">' + btn('newMoney', '👪 ' + esc(t('kind_pay')), 'primary g', 'data-v="in" data-kind="pay"') + btn('newMoney', '🎁 ' + esc(t('kind_don')), 'primary purple', 'data-v="in" data-kind="don"') + '</div>'
      : btn('newMoney', '➕ ' + esc(t('new_out')), 'primary r', 'data-v="out"');
    if (dir === 'out' && list.length) {
      var byCat = {};
      list.forEach(function (m) { byCat[m.cat] = (byCat[m.cat] || 0) + m.amt; });
      var cats = Object.keys(byCat).sort(function (a, b) { return byCat[b] - byCat[a]; });
      h += '<div class="card"><h3 class="ct r">' + esc(t('by_category')) + '</h3>' + cats.map(function (c) {
        return '<div class="kv"><span>' + esc(catLabel(c)) + '</span><b>' + fmtR(byCat[c]) + '</b></div>';
      }).join('') + '</div>';
    }
    h += '<div class="list">';
    list.forEach(function (m) {
      var who = m.dir === 'out' ? catLabel(m.cat) : m.kind === 'pay' ? kidName(m.kid) : (m.donor || t('anonymous'));
      var sub = m.dir === 'out' ? [m.desc, m.supplier].filter(Boolean).join(' · ') : m.kind === 'pay' ? (m.payer || '') + (m.method ? ' · ' + t('pm_' + m.method) : '') : (m.desc || '');
      h += '<div class="lrow" data-act="editMoney" data-id="' + m.id + '" style="--kc:' + (m.dir === 'out' ? '#e5383b' : m.kind === 'don' ? '#8338ec' : '#06c167') + '">' +
        '<span class="av sq" style="background:var(--kc)">' + (m.dir === 'out' ? '🧾' : m.kind === 'don' ? '🎁' : '👪') + '</span>' +
        '<div class="kr-txt"><b>' + esc(who) + '</b><div class="small-l">' + esc(shortDate(m.date)) + (sub ? ' · ' + esc(sub) : '') + (m.photo ? ' · 📷' : '') + '</div></div>' +
        '<b class="amt ' + (m.dir === 'out' ? 'neg' : 'pos') + '">' + fmtR(m.amt) + '</b></div>';
    });
    h += '</div>';
    if (!list.length) h += empty(t('nothing_month'));
    return h;
  }

  /* One account --------------------------------------------------------- */
  function accountScreen() {
    var k = find('kids', F.kid);
    if (!k) return empty(t('not_found'));
    var bal = balanceOf(k.id);
    var h = '<div class="card kidhead" style="--kc:' + kidColor(k) + '">' + avatar(k, 56) + '<div class="grow"><h2>' + esc(fullName(k)) + '</h2><div class="muted">👪 ' + esc(parentName(k.p1) || t('no_main_parent')) + '</div></div>' +
      '<div class="balbox ' + (bal > 0.004 ? 'neg' : 'pos') + '"><span>' + esc(bal > 0.004 ? t('owes') : bal < -0.004 ? t('in_credit') : t('paid_up')) + '</span><b>' + fmtR(Math.abs(bal)) + '</b></div></div>';
    h += '<div class="two">' + btn('newMoney', '⬇ ' + esc(t('pay_recv')), 'primary g', 'data-v="in" data-kind="pay" data-kid="' + k.id + '"') +
      btn('newCharge', '➕ ' + esc(t('add_charge')), 'secondary', 'data-id="' + k.id + '"') + '</div>';
    // invoice
    var months = []; for (var i = 0; i < 6; i++) months.push(addMonths(ymOf(today()), -i));
    if (!F.invYm) F.invYm = months[0];
    h += '<div class="card"><h3 class="ct purple">📄 ' + esc(t('invoice')) + '</h3><label class="f">' + esc(t('month')) + '</label><div class="chips scroll">' + months.map(function (ym) {
      return '<button class="chip' + (F.invYm === ym ? ' on' : '') + '" data-chip="invYm" data-v="' + ym + '">' + esc(ymLabel(ym)) + '</button>';
    }).join('') + '</div><div class="two">' + btn('invoicePdf', '📄 ' + esc(t('make_invoice')), 'primary purple', 'data-id="' + k.id + '"') +
      btn('invoiceShare', '📤 ' + esc(t('send_invoice')), 'secondary', 'data-id="' + k.id + '"') + '</div>';
    var invs = D.invoices.filter(function (x) { return x.kid === k.id; }).sort(byDateDesc);
    if (invs.length) h += '<div class="small-l">' + esc(t('earlier_invoices')) + ': ' + invs.slice(0, 6).map(function (x) { return '<a href="#" data-act="reInvoice" data-id="' + x.id + '">' + esc(x.no) + '</a>'; }).join(', ') + '</div>';
    h += '</div>';
    // statement
    var rows = chargesOf(k.id).map(function (c) { return { date: c.date, ts: c.ts, c: c, amt: c.amt }; })
      .concat(paymentsOf(k.id).map(function (m) { return { date: m.date, ts: m.ts, m: m, amt: -m.amt }; }))
      .sort(byDateDesc);
    h += '<div class="card"><h3 class="ct">' + esc(t('statement')) + '</h3>';
    var n = F.n || 40;
    rows.slice(0, n).forEach(function (r) {
      if (r.c) h += '<div class="trow" data-act="editCharge" data-id="' + r.c.id + '"><span class="tdate">' + esc(shortDate(r.date)) + '</span><span class="grow">' +
        (r.c.kind === 'fine' ? '⏰ ' : r.c.kind === 'fee' ? '📅 ' : r.c.kind === 'day' ? '☀️ ' : '➕ ') + esc(chargeLabel(r.c)) + '</span><b class="neg">' + fmtR(r.c.amt) + '</b></div>';
      else h += '<div class="trow" data-act="editMoney" data-id="' + r.m.id + '"><span class="tdate">' + esc(shortDate(r.date)) + '</span><span class="grow">✅ ' + esc(payLabel(r.m)) + '</span><b class="pos">-' + fmtR(r.m.amt) + '</b></div>';
    });
    if (rows.length > n) h += '<button class="text" data-act="moreRows">' + esc(t('show_more')) + '</button>';
    if (!rows.length) h += empty(t('no_entries'));
    h += '</div>';
    return h;
  }

  /* Extra charge / edit a charge --------------------------------------- */
  function chargeForm() {
    var c = F.id ? find('charges', F.id) : null;
    var h = '<div class="card">';
    if (c && c.kind !== 'other') h += '<p><b>' + esc(chargeLabel(c)) + '</b></p>';
    else h += fld(t('description') + ' *', inp('desc', { max: 100, ph: t('charge_ph'), focus: !F.id }));
    h += '<div class="two">' + fld(t('date'), inp('date', { type: 'date' })) + fld(t('amount') + ' (R) *', inp('amt', { mode: 'decimal' })) + '</div>';
    if (c && c.kind === 'fine') h += '<p class="hint">' + esc(t('fine_edit_hint')) + '</p>';
    if (c && c.kind === 'fee') h += '<p class="hint">' + esc(t('fee_edit_hint')) + '</p>';
    h += '</div>' + msg('err', F.err ? esc(F.err) : '') + '<div class="bar">' + btn('saveCharge', '✓ ' + esc(t('save')), 'primary') +
      (F.id ? btn('delCharge', confirmKey === 'delCharge' ? esc(t('tap_again_delete')) : '🗑 ' + esc(c && c.kind === 'fine' ? t('waive_fine') : c && c.kind === 'fee' ? t('remove_fee') : t('delete')), 'text danger') : '') + '</div>';
    return h;
  }
  function saveCharge() {
    var amt = num(F.amt), c = F.id ? find('charges', F.id) : null;
    if (isNaN(amt) || amt < 0) { F.err = t('err_amount'); return render(); }
    if ((!c || c.kind === 'other') && !clean(F.desc)) { F.err = t('err_desc'); return render(); }
    if (!c) { c = { id: uid(), kid: F.kid, kind: 'other', ts: Date.now() }; D.charges.push(c); }
    c.amt = r2(amt); c.date = F.date || today();
    if (c.kind === 'other') c.desc = clean(F.desc, 100);
    save(); toast(t('saved')); done();
  }
  function delCharge() {
    if (confirmKey !== 'delCharge') { confirmKey = 'delCharge'; return render(); }
    var c = find('charges', F.id);
    if (c && c.kind === 'fee') D.feeSkip.push(c.ref);
    if (c && c.kind === 'fine') { var a = find('att', c.ref.slice(5)); if (a) a.fineWaived = true; }
    removeFrom('charges', F.id);
    save(); toast(t('deleted')); done();
  }

  /* Income / expense form ----------------------------------------------- */
  function moneyState(m, dir, kind, kid) {
    if (m) return { id: m.id, dir: m.dir, kind: m.kind || '', kid: m.kid || '', payer: m.payer || '', method: m.method || '', ref: m.ref || '', donor: m.donor || '', desc: m.desc || '',
      cat: m.cat || '', supplier: m.supplier || '', amt: numIn(m.amt), date: m.date, note: m.note || '', photo: m.photo || '', added: [] };
    var k = find('kids', kid);
    return { dir: dir, kind: dir === 'in' ? (kind || 'pay') : '', kid: kid || '', payer: k ? parentName(k.p1) : '', method: 'eft', ref: '', donor: '', desc: '',
      cat: dir === 'out' ? 'food' : '', supplier: '', amt: '', date: today(), note: '', photo: '', added: [] };
  }
  function moneyForm() {
    var h = '<div class="card">';
    if (F.dir === 'in') {
      h += seg('kind', [['pay', '👪 ' + esc(t('kind_pay'))], ['don', '🎁 ' + esc(t('kind_don'))]]);
      if (F.kind === 'pay') {
        var k = find('kids', F.kid), payers = k ? people(k).filter(function (p) { return p.parent; }).map(function (p) { return p.name; }) : [];
        h += fld(t('account_of') + ' *', sel('kid', [['', '— ' + t('choose') + ' —']].concat(kidsSorted(true).map(function (x) { return [x.id, fullName(x) + ' (' + fmtR(balanceOf(x.id)) + ')']; })), true));
        h += fld(t('paid_by'), inp('payer', { max: 60 })) + (payers.length ? '<div class="chips">' + payers.map(function (n) { return '<button class="chip' + (F.payer === n ? ' on' : '') + '" data-chip="payer" data-v="' + esc(n) + '">' + esc(n) + '</button>'; }).join('') + '</div>' : '');
        h += '<label class="f">' + esc(t('method')) + '</label>' + pick('method', PAY_METHODS, function (v) { return esc(t('pm_' + v)); }) + fld(t('reference'), inp('ref', { max: 40 }));
      } else {
        h += fld(t('donor'), inp('donor', { max: 80, ph: t('donor_ph') })) + fld(t('description'), inp('desc', { max: 120, ph: t('don_desc_ph') }));
      }
    } else {
      var cats = outCats(F.cat);
      h += fld(t('category'), sel('cat', cats.map(function (c) { return [c, catLabel(c)]; }).concat([['__new', '➕ ' + t('new_category')]]), true));
      if (F.cat === '__new') h += '<div class="row">' + inp('newCat', { max: 40, ph: t('new_category_ph'), focus: 1 }) + btn('addCat', esc(t('add')), 'secondary small') + '</div>';
      h += fld(t('description'), inp('desc', { max: 120 })) + fld(t('supplier'), inp('supplier', { max: 80 }));
    }
    h += '<div class="two">' + fld(t('amount') + ' (R) *', inp('amt', { mode: 'decimal', focus: !F.id && F.dir === 'out' })) + fld(t('date'), inp('date', { type: 'date' })) + '</div>' +
      fld(t('note'), inp('note', { max: 200 })) + '<label class="f">' + esc(t('slip_photo')) + '</label>' + photoPicker('photo') + '</div>';
    if (F.dir === 'in' && F.kind === 'pay' && F.kid) h += '<div class="msg info" id="balInfo">' + balInfo() + '</div>';
    h += msg('err', F.err ? esc(F.err) : '') + '<div class="bar">' + btn('saveMoney', '✓ ' + esc(t('save')), 'primary ' + (F.dir === 'in' ? 'g' : 'r')) +
      (F.id ? btn('delMoney', confirmKey === 'delMoney' ? esc(t('tap_again_delete')) : '🗑 ' + esc(t('delete')), 'text danger') : '') + '</div>';
    return h;
  }
  function balInfo() {
    var b = balanceOf(F.kid), a = num(F.amt);
    return esc(t('bal_now', { r: fmtR(b) })) + (!isNaN(a) && !F.id ? ' → ' + esc(t('bal_after', { r: fmtR(r2(b - a)) })) : '');
  }
  function addCat() {
    var n = clean(F.newCat, 40);
    if (!n) return;
    var exists = outCats().some(function (c) { return catLabel(c).toLowerCase() === n.toLowerCase(); });
    if (!exists) D.settings.cats.out.push(n);
    F.cat = outCats().filter(function (c) { return catLabel(c).toLowerCase() === n.toLowerCase(); })[0];
    F.newCat = '';
    save(); toast(t('cat_added')); render();
  }
  function saveMoney() {
    var amt = num(F.amt);
    if (isNaN(amt) || amt <= 0) { F.err = t('err_amount'); return render(); }
    if (F.dir === 'in' && F.kind === 'pay' && !F.kid) { F.err = t('err_kid'); return render(); }
    if (F.dir === 'out' && (!F.cat || F.cat === '__new')) { F.err = t('err_cat'); return render(); }
    var m = F.id ? find('money', F.id) : null, old = m && m.photo;
    if (!m) { m = { id: uid(), ts: Date.now() }; D.money.push(m); }
    Object.assign(m, { dir: F.dir, amt: r2(amt), date: F.date || today(), note: clean(F.note, 200), photo: F.photo || '' });
    if (F.dir === 'in') {
      m.kind = F.kind;
      if (F.kind === 'pay') Object.assign(m, { kid: F.kid, payer: clean(F.payer, 60), method: F.method || '', ref: clean(F.ref, 40), donor: '', desc: '' });
      else Object.assign(m, { kid: '', payer: '', method: '', ref: '', donor: clean(F.donor, 80), desc: clean(F.desc, 120) });
    } else Object.assign(m, { cat: F.cat, desc: clean(F.desc, 120), supplier: clean(F.supplier, 80) });
    if (old && old !== m.photo && !mediaInUse(old)) mediaDel(old);
    save(); toast(t('saved')); done();
  }
  function delMoney() {
    if (confirmKey !== 'delMoney') { confirmKey = 'delMoney'; return render(); }
    var m = find('money', F.id);
    removeFrom('money', F.id);
    if (m && m.photo && !mediaInUse(m.photo)) mediaDel(m.photo);
    if (F.photo && !mediaInUse(F.photo)) mediaDel(F.photo);
    F.added = [];
    save(); toast(t('deleted')); done();
  }

  /* ================================================================ */
  /* PDF and Excel                                                     */
  /* ================================================================ */
  function rgb(hex) { var n = parseInt(String(hex).slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }
  var ACC = { week: rgb('#3a86ff'), inv: rgb('#8338ec'), money: rgb('#05a66b'), diary: rgb('#8338ec'), care: rgb('#00a6d6'), inc: rgb('#e5383b'), att: rgb('#ff7a00') };
  function pdfDoc(accent) {
    var s = D.settings;
    var doc = new FX.PDF({ footer: [s.name || 'Dagsorg', s.phone, s.email].filter(Boolean).join(' · '), pageLabel: t('page'), accent: accent });
    letterhead(doc);
    return doc;
  }
  // Logo and name of the daycare at the top (every report)
  function letterhead(doc) {
    var s = D.settings, M = doc.M, top = doc.y - 14, x = M, hh = 0;
    var stripW = (doc.W - 2 * M) / KID_COLORS.length;
    KID_COLORS.forEach(function (c, i) { doc.rect(M + i * stripW, top - 8, stripW, 4, rgb(c)); });
    if (s.logo && s.logoW && s.logoH) {
      var lh = 62, lw = lh * s.logoW / s.logoH;
      if (lw > 150) { lw = 150; lh = lw * s.logoH / s.logoW; }
      doc.image(s.logo, s.logoW, s.logoH, M, top + 2, lw, lh);
      x = M + lw + 14; hh = lh + 2;
    }
    doc.text(x, top + 20, s.name || 'Dagsorg', 18, true, doc.accent, 'l', doc.W - M - x);
    var lines = [s.addr ? s.addr.replace(/\s*\n\s*/g, ', ') : '', [s.phone, s.email].filter(Boolean).join('  ·  '), s.regNo ? t('reg_no') + ': ' + s.regNo : ''].filter(Boolean);
    var y = top + 34;
    lines.forEach(function (l) { doc.text(x, y, l, 9, false, FX.PDF.MUTED, 'l', doc.W - M - x); y += 12; });
    hh = Math.max(hh, y - top);
    doc.y = top + hh + 8;
    doc.hline(M, doc.W - M, doc.y, FX.PDF.LINE, 0.8);
    doc.y += 14;
  }
  function para(doc, text, size) {
    size = size || 10;
    var lines = [];
    String(text || '').split('\n').forEach(function (l) { lines = lines.concat(FX.PDF.wrap(l, doc.W - 2 * doc.M, size, false)); });
    lines.forEach(function (l) { doc.ensure(size + 4); doc.text(doc.M, doc.y + size, l, size, false); doc.y += size + 4; });
    doc.y += 4;
  }
  // Label / value rows with the value left-aligned (for names, addresses and other text)
  function info(doc, rows, labelW) {
    labelW = labelW || 120;
    rows.filter(function (r) { return r[1]; }).forEach(function (r) {
      var lines = FX.PDF.wrap(r[1], doc.W - 2 * doc.M - labelW, 10, !!r[2]);
      doc.ensure(lines.length * 14 + 2);
      doc.text(doc.M, doc.y + 11, r[0], 10, false, FX.PDF.MUTED, 'l', labelW - 8);
      lines.forEach(function (l, i) { doc.text(doc.M + labelW, doc.y + 11 + i * 14, l, 10, !!r[2]); });
      doc.y += lines.length * 14 + 2;
    });
    doc.y += 8;
  }
  function section(doc, label, text) {
    if (!text) return;
    doc.ensure(40);
    doc.text(doc.M, doc.y + 10, label, 10, true, doc.accent);
    doc.y += 15;
    para(doc, text);
  }
  function photoGrid(doc, photos) {
    photos = photos.filter(Boolean);
    var gap = 12, colW = (doc.W - 2 * doc.M - gap) / 2, maxH = 230;
    for (var i = 0; i < photos.length; i += 2) {
      var row = photos.slice(i, i + 2).map(function (p) {
        var w = colW, h = w * p.h / p.w;
        if (h > maxH) { h = maxH; w = h * p.w / p.h; }
        return { p: p, w: w, h: h };
      });
      var rh = Math.max.apply(null, row.map(function (r) { return r.h; }));
      doc.ensure(rh + gap);
      row.forEach(function (r, j) { doc.image(r.p.url, r.p.w, r.p.h, doc.M + j * (colW + gap), doc.y, r.w, r.h); });
      doc.y += rh + gap;
    }
  }
  function sigLines(doc, labels) {
    doc.ensure(70);
    doc.y += 26;
    var w = (doc.W - 2 * doc.M - 30) / 2;
    labels.forEach(function (l, i) {
      var x = doc.M + (i % 2) * (w + 30);
      doc.hline(x, x + w, doc.y, FX.PDF.INK, 0.6);
      doc.text(x, doc.y + 12, l, 8.5, false, FX.PDF.MUTED);
      if (i % 2 === 1 || i === labels.length - 1) doc.y += 46;
    });
  }
  function summarySheet(titleTxt, period) {
    var s = D.settings;
    return { name: t('summary'), plain: true, cols: [{ w: 34 }, { w: 60 }],
      rows: [{ c: [s.name || 'Dagsorg'], sec: true }, [[s.phone, s.email].filter(Boolean).join(' · ')], [], { c: [titleTxt], sec: true }, [period || ''], [t('made_on') + ': ' + shortDate(today())]] };
  }
  function deliver(blob, name, share) {
    if (share && canShare) {
      var file = new File([blob], fileSafe(name), { type: blob.type });
      navigator.share({ files: [file], title: name }).catch(function (e) { if (e && e.name !== 'AbortError') toast(t('share_failed')); });
      return;
    }
    download(blob, name);
    toast(t('file_saved'));
  }
  function download(blob, name) {
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = fileSafe(name) || 'Dagsorg'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }
  var canShare = (function () {
    try {
      var probe = new File([new Blob(['x'])], 'x.pdf', { type: 'application/pdf' });
      return !!(navigator.canShare && navigator.canShare({ files: [probe] }));
    } catch (e) { return false; }
  })();
  function run(p, name, share) {
    Promise.resolve().then(p).then(function (blob) { deliver(blob, fileSafe(name), share); })
      .catch(function (e) { console.error(e); toast(t('export_failed') + ' ' + (e && e.message || '')); });
  }
  function weekLabel(ws) { return shortDate(ws) + ' – ' + shortDate(addDays(ws, 6)); }

  /* Week report per learner -------------------------------------------- */
  function weekRows(k, ws) {
    var rows = [];
    for (var i = 0; i < 7; i++) {
      var d = addDays(ws, i), a = attOf(k.id, d);
      if (i > 4 && !(a && a.in)) continue;   // weekends only when the child was there
      rows.push({ d: d, a: a });
    }
    return rows;
  }
  function buildWeekPdf(ids, ws) {
    var doc = null;
    ids.forEach(function (id, n) {
      var k = find('kids', id);
      if (!k) return;
      if (!doc) doc = pdfDoc(ACC.week); else { doc.newPage(); letterhead(doc); }
      doc.title(t('week_report'), [fullName(k) + (k.dob ? '  ·  ' + t('dob') + ': ' + shortDate(k.dob) : ''), t('week') + ': ' + weekLabel(ws), t('main_parent') + ': ' + (parentName(k.p1) || '—')]);
      var days = 0, totM = 0, fines = 0;
      var rows = weekRows(k, ws).map(function (r) {
        var a = r.a, st = a ? stayMins(a) : NaN, f = a && a.out && !a.fineWaived ? fineFor(a.out) : 0;
        if (a && a.in) days++;
        if (st >= 0) totM += st;
        fines += f;
        if (!a || !a.in) return [dayName(r.d), shortDate(r.d), t('absent'), '', '', '', '', ''];
        return [dayName(r.d), shortDate(r.d), a.in, personWithRel(k, a.inBy), a.out || '—', a.out ? personWithRel(k, a.outBy) : '', st >= 0 ? durLabel(st) : '', f ? fmtR(f) : ''];
      });
      doc.table([{ h: t('day'), w: 58 }, { h: t('date'), w: 66 }, { h: t('in'), w: 38 }, { h: t('dropped_by'), wrap: true }, { h: t('out'), w: 38 }, { h: t('fetched_by'), wrap: true }, { h: t('hours'), w: 52, a: 'r' }, { h: t('fine'), w: 52, a: 'r' }], rows);
      doc.kv([[t('days_present'), String(days)], [t('total_hours'), durLabel(totM)], [t('late_fines'), fmtR(fines), true]], 300);
      if (fines) doc.note(t('fine_rule', { r: fmtR(D.settings.fineAmt), m: D.settings.fineMins, t: D.settings.closeTime }));
    });
    if (!doc) throw new Error(t('no_kids'));
    return doc.blob();
  }
  function buildWeekExcel(ids, ws) {
    var rows = [];
    ids.forEach(function (id) {
      var k = find('kids', id);
      if (!k) return;
      weekRows(k, ws).forEach(function (r) {
        var a = r.a, st = a ? stayMins(a) : NaN, f = a && a.out && !a.fineWaived ? fineFor(a.out) : 0;
        rows.push([fullName(k), r.d, dayName(r.d), a && a.in ? a.in : t('absent'), a ? personWithRel(k, a.inBy) : '', a && a.out ? a.out : '', a && a.out ? personWithRel(k, a.outBy) : '', st >= 0 ? r2(st / 60) : '', f || '']);
      });
    });
    return FX.xlsx([summarySheet(t('week_report'), t('week') + ': ' + weekLabel(ws)),
      { name: t('attendance'), cols: [{ h: t('learner'), w: 24 }, { h: t('date'), w: 12, f: 'date' }, { h: t('day'), w: 11 }, { h: t('in'), w: 9 }, { h: t('dropped_by'), w: 26 },
        { h: t('out'), w: 9 }, { h: t('fetched_by'), w: 26 }, { h: t('hours'), w: 9, f: 'num2' }, { h: t('fine'), w: 11, f: 'money' }], rows: rows, sumCols: [7, 8], totalLabel: t('total') }]);
  }
  function buildAttExcel(from, to) {
    var rows = D.att.filter(function (a) { return inRange(a.date, from, to); }).sort(byDateAsc).map(function (a) {
      var k = find('kids', a.kid) || {}, st = stayMins(a), f = a.out && !a.fineWaived ? fineFor(a.out) : 0;
      return [a.date, fullName(k), a.in || '', personWithRel(k, a.inBy), a.out || '', a.out ? personWithRel(k, a.outBy) : '', st >= 0 ? r2(st / 60) : '', f || '', a.note || ''];
    });
    return FX.xlsx([summarySheet(t('attendance'), periodLabel(from, to)),
      { name: t('attendance'), cols: [{ h: t('date'), w: 12, f: 'date' }, { h: t('learner'), w: 24 }, { h: t('in'), w: 9 }, { h: t('dropped_by'), w: 26 }, { h: t('out'), w: 9 },
        { h: t('fetched_by'), w: 26 }, { h: t('hours'), w: 9, f: 'num2' }, { h: t('fine'), w: 11, f: 'money' }, { h: t('note'), w: 30, f: 'wrap' }], rows: rows, sumCols: [6, 7], totalLabel: t('total') }]);
  }
  function buildAttPdf(from, to) {
    var list = D.att.filter(function (a) { return a.in && inRange(a.date, from, to); }).sort(function (x, y) { return x.date.localeCompare(y.date) || kidName(x.kid).localeCompare(kidName(y.kid)); });
    var doc = pdfDoc(ACC.att);
    doc.title(t('attendance'), [periodLabel(from, to)]);
    if (!list.length) doc.note(t('no_entries'));
    var days = {}, per = {};
    list.forEach(function (a) { (days[a.date] = days[a.date] || []).push(a); });
    Object.keys(days).sort().forEach(function (d) {
      doc.heading(niceDate(d) + '  ·  ' + days[d].length + ' ' + t('learners').toLowerCase());
      doc.table([{ h: t('learner'), wrap: true }, { h: t('in'), w: 36 }, { h: t('dropped_by'), wrap: true }, { h: t('out'), w: 36 }, { h: t('fetched_by'), wrap: true }, { h: t('hours'), w: 50, a: 'r' }, { h: t('fine'), w: 50, a: 'r' }],
        days[d].map(function (a) {
          var k = find('kids', a.kid) || {}, st = stayMins(a), f = a.out && !a.fineWaived ? fineFor(a.out) : 0;
          var p = per[a.kid] = per[a.kid] || { days: 0, m: 0, f: 0 };
          p.days++; if (st >= 0) p.m += st; p.f += f;
          return [fullName(k), a.in, personWithRel(k, a.inBy), a.out || '—', a.out ? personWithRel(k, a.outBy) : '', st >= 0 ? durLabel(st) : '', f ? fmtR(f) : ''];
        }), { size: 8 });
    });
    var ids = Object.keys(per).sort(function (x, y) { return kidName(x).localeCompare(kidName(y)); });
    if (ids.length) {
      doc.heading(t('summary'));
      doc.table([{ h: t('learner'), wrap: true }, { h: t('days_present'), w: 90, a: 'r' }, { h: t('total_hours'), w: 90, a: 'r' }, { h: t('late_fines'), w: 90, a: 'r' }],
        ids.map(function (id) { var p = per[id]; return [kidName(id), String(p.days), p.m ? durLabel(p.m) : '—', fmtR(p.f)]; }),
        { total: [t('total'), String(sum(ids, function (id) { return per[id].days; })), durLabel(sum(ids, function (id) { return per[id].m; })), fmtR(sum(ids, function (id) { return per[id].f; }))] });
    }
    return doc.blob();
  }
  // Nappy book for everyone (or one learner) for a day or a period
  function buildCareRangePdf(from, to, kid) {
    var list = D.care.filter(function (c) { return inRange(c.date, from, to) && (!kid || c.kid === kid); })
      .sort(function (x, y) { return x.date.localeCompare(y.date) || kidName(x.kid).localeCompare(kidName(y.kid)) || (x.time || '').localeCompare(y.time || ''); });
    var doc = pdfDoc(ACC.care);
    doc.title(t('care_book'), [periodLabel(from, to)].concat(kid ? [kidName(kid)] : []));
    if (!list.length) doc.note(t('care_empty_period'));
    var days = {}, per = {};
    list.forEach(function (c) {
      (days[c.date] = days[c.date] || []).push(c);
      var p = per[c.kid] = per[c.kid] || {};
      if (!c.restOf) p[c.type] = (p[c.type] || 0) + 1;   // the rest of a bottle is not a new bottle
    });
    Object.keys(days).sort().forEach(function (d) {
      doc.heading(niceDate(d));
      var prev = '';
      doc.table([{ h: t('learner'), w: 120 }, { h: t('time'), w: 42 }, { h: t('what'), w: 86 }, { h: t('detail'), wrap: true }],
        days[d].map(function (c) { var n = kidName(c.kid), show = n !== prev ? n : ''; prev = n; return [show, c.time || '', t('care_' + c.type), careDetail(c)]; }), { size: 8.5 });
    });
    var ids = Object.keys(per).sort(function (x, y) { return kidName(x).localeCompare(kidName(y)); });
    var used = CARE_TYPES.filter(function (ty) { return ids.some(function (id) { return per[id][ty]; }); });
    if (ids.length && used.length) {
      doc.heading(t('summary'));
      var cw = Math.min(58, (doc.W - 2 * doc.M - 110) / used.length);
      doc.table([{ h: t('learner'), wrap: true }].concat(used.map(function (ty) { return { h: t('care_' + ty), w: cw, a: 'r' }; })),
        ids.map(function (id) { return [kidName(id)].concat(used.map(function (ty) { return per[id][ty] ? String(per[id][ty]) : ''; })); }), { size: 8.5 });
    }
    return doc.blob();
  }
  function periodLabel(from, to) { return from && from === to ? niceDate(from) : from || to ? shortDate(from) + ' – ' + shortDate(to) : t('p_all'); }

  /* Invoice (account statement for one month) --------------------------- */
  function invoiceFor(kid, ym) {
    var x = D.invoices.filter(function (i) { return i.kid === kid && i.ym === ym; })[0];
    if (x) return x;
    var s = D.settings;
    var n = Number(s.nextInv) || 1;
    x = { id: uid(), kid: kid, ym: ym, date: today(), no: (s.invPrefix || '') + (n < 10000 ? ('000' + n).slice(-4) : String(n)), ts: Date.now() };
    s.nextInv = (Number(s.nextInv) || 1) + 1;
    D.invoices.push(x); save();
    return x;
  }
  function drawInvoice(doc, inv) {
    var s = D.settings, k = find('kids', inv.kid), p = find('parents', k.p1), from = inv.ym + '-01', to = monthEnd(inv.ym);
    var M = doc.M, W = doc.W;
    doc.text(M, doc.y + 22, t('invoice').toUpperCase(), 24, true, doc.accent);
    var rx = W - M, ry = doc.y + 8;
    [[t('invoice_no'), inv.no], [t('date'), shortDate(inv.date)], [t('due_date'), shortDate(addDays(inv.date, Number(s.payDays) || 7))], [t('period'), ymLabel(inv.ym)]].forEach(function (r) {
      doc.text(rx - 110, ry, r[0], 9, false, FX.PDF.MUTED, 'r'); doc.text(rx, ry, r[1], 9, true, FX.PDF.INK, 'r'); ry += 13;
    });
    doc.y += 36;
    doc.text(M, doc.y, t('bill_to'), 9, true, doc.accent); doc.y += 13;
    [p ? fullName(p) : '—', p && p.addr ? p.addr.replace(/\s*\n\s*/g, ', ') : '', p ? [p.cell, p.email].filter(Boolean).join(' · ') : ''].filter(Boolean).forEach(function (l) { doc.text(M, doc.y, l, 10, false, FX.PDF.INK, 'l', 300); doc.y += 13; });
    doc.text(M, doc.y + 2, t('learner') + ': ' + fullName(k), 10, true); doc.y += 16;
    doc.y = Math.max(doc.y, ry) + 8;
    var open = balanceOf(k.id, addDays(from, -1));
    var ch = chargesOf(k.id, from, to).sort(byDateAsc), pays = paymentsOf(k.id, from, to).sort(byDateAsc);
    var rows = [[shortDate(from), t('balance_bf'), fmtR(open)]];
    ch.forEach(function (c) { rows.push([shortDate(c.date), chargeLabel(c), fmtR(c.amt)]); });
    pays.forEach(function (m) { rows.push([shortDate(m.date), payLabel(m) + (m.payer ? ' – ' + m.payer : ''), '-' + fmtR(m.amt)]); });
    var close = r2(open + sum(ch, function (c) { return c.amt; }) - sum(pays, function (m) { return m.amt; }));
    doc.table([{ h: t('date'), w: 78 }, { h: t('description'), wrap: true }, { h: t('amount'), w: 90, a: 'r' }], rows, { total: ['', close >= 0 ? t('amount_due') : t('in_credit'), fmtR(Math.abs(close))], size: 9 });
    doc.kv([[t('balance_bf'), fmtR(open)], [t('charges_month'), fmtR(sum(ch, function (c) { return c.amt; }))], [t('payments_month'), '-' + fmtR(sum(pays, function (m) { return m.amt; }))],
      [close >= 0 ? t('amount_due') : t('in_credit'), fmtR(Math.abs(close)), true]], 330);
    // the days and hours the child was here this month
    var days = D.att.filter(function (a) { return a.kid === k.id && a.in && inRange(a.date, from, to); }).sort(byDateAsc);
    if (days.length) {
      doc.heading(t('inv_hours'));
      var totM = 0;
      doc.table([{ h: t('date'), w: 110 }, { h: t('in'), w: 60 }, { h: t('out'), w: 60 }, { h: t('hours'), a: 'r' }],
        days.map(function (a) { var m = hereMins(a); totM += m; return [niceDate(a.date), a.in, a.out || '—', a.out ? durLabel(m) : '']; }),
        { total: [days.length === 1 ? t('days_1') : t('days_n', { n: days.length }), '', '', durLabel(totM)], size: 9 });
    }
    if (s.bankAcc) {
      doc.heading(t('bank_details'));
      info(doc, [[t('bank'), s.bankName], [t('acc_holder'), s.bankHolder || s.name], [t('acc_no'), s.bankAcc], [t('branch'), s.bankBranch], [t('acc_type'), s.bankType], [t('pay_ref'), fullName(k) + ' ' + inv.no, true]], 130);
    }
    if (s.invNote) doc.note(s.invNote);
    if (ch.some(function (c) { return c.kind === 'fine'; })) doc.note(t('fine_rule', { r: fmtR(s.fineAmt), m: s.fineMins, t: s.closeTime }));
  }
  function buildInvoicePdf(inv) {
    var doc = pdfDoc(ACC.inv);
    drawInvoice(doc, inv);
    return doc.blob();
  }
  function invoiceName(inv) { return t('invoice') + ' ' + inv.no + ' ' + kidName(inv.kid) + '.pdf'; }
  function buildAllInvoices(ym) {
    var doc = null;
    kidsSorted(true).forEach(function (k) {
      var from = ym + '-01', to = monthEnd(ym);
      if (k.active === false && !chargesOf(k.id, from, to).length && Math.abs(balanceOf(k.id, to)) < 0.005) return;
      if (k.start && k.start > to) return;
      var inv = invoiceFor(k.id, ym);
      if (!doc) doc = pdfDoc(ACC.inv); else { doc.newPage(); letterhead(doc); }
      drawInvoice(doc, inv);
    });
    if (!doc) throw new Error(t('no_kids'));
    return doc.blob();
  }

  /* Money report -------------------------------------------------------- */
  function moneyIn(from, to) { return D.money.filter(function (m) { return inRange(m.date, from, to); }); }
  function buildMoneyPdf(from, to) {
    var list = moneyIn(from, to), ins = list.filter(function (m) { return m.dir === 'in'; }), outs = list.filter(function (m) { return m.dir === 'out'; });
    var pays = ins.filter(function (m) { return m.kind === 'pay'; }), dons = ins.filter(function (m) { return m.kind === 'don'; });
    var doc = pdfDoc(ACC.money);
    doc.title(t('money_report'), [periodLabel(from, to)]);
    var tin = sum(ins, function (m) { return m.amt; }), tout = sum(outs, function (m) { return m.amt; });
    doc.kv([[t('kind_pay'), fmtR(sum(pays, function (m) { return m.amt; }))], [t('kind_don'), fmtR(sum(dons, function (m) { return m.amt; }))], [t('total_income'), fmtR(tin), true],
      [t('total_expenses'), fmtR(tout), true], [tin - tout >= 0 ? t('surplus') : t('shortfall'), fmtR(r2(tin - tout)), true]], 300);
    var byCat = {};
    outs.forEach(function (m) { byCat[m.cat] = r2((byCat[m.cat] || 0) + m.amt); });
    var cats = Object.keys(byCat).sort(function (a, b) { return byCat[b] - byCat[a]; });
    if (cats.length) { doc.heading(t('expenses_by_cat')); doc.bars(cats.map(function (c) { return [catLabel(c), byCat[c], fmtR(byCat[c])]; }), { labelW: 150, color: rgb('#ff7a00') }); }
    doc.heading(t('kind_pay'));
    doc.table([{ h: t('date'), w: 70 }, { h: t('learner'), wrap: true }, { h: t('paid_by'), wrap: true }, { h: t('method'), w: 60 }, { h: t('amount'), w: 80, a: 'r' }],
      pays.sort(byDateAsc).map(function (m) { return [shortDate(m.date), kidName(m.kid), m.payer || '', m.method ? t('pm_' + m.method) : '', fmtR(m.amt)]; }),
      { total: ['', '', '', '', fmtR(sum(pays, function (m) { return m.amt; }))], empty: t('none') });
    doc.heading(t('kind_don'));
    doc.table([{ h: t('date'), w: 70 }, { h: t('donor'), wrap: true }, { h: t('description'), wrap: true }, { h: t('amount'), w: 80, a: 'r' }],
      dons.sort(byDateAsc).map(function (m) { return [shortDate(m.date), m.donor || t('anonymous'), m.desc || '', fmtR(m.amt)]; }),
      { total: ['', '', '', fmtR(sum(dons, function (m) { return m.amt; }))], empty: t('none') });
    doc.heading(t('expenses'));
    doc.table([{ h: t('date'), w: 70 }, { h: t('category'), w: 110 }, { h: t('description'), wrap: true }, { h: t('amount'), w: 80, a: 'r' }],
      outs.sort(byDateAsc).map(function (m) { return [shortDate(m.date), catLabel(m.cat), [m.desc, m.supplier].filter(Boolean).join(' · '), fmtR(m.amt)]; }),
      { total: ['', '', '', fmtR(tout)], empty: t('none') });
    return doc.blob();
  }
  function buildMoneyExcel(from, to) {
    var list = moneyIn(from, to).sort(byDateAsc);
    var ins = list.filter(function (m) { return m.dir === 'in'; }), outs = list.filter(function (m) { return m.dir === 'out'; });
    var acc = kidsSorted(true).map(function (k) { return [fullName(k), parentName(k.p1), feeLabel(k), Number(k.fee) || 0, balanceOf(k.id)]; });
    return FX.xlsx([summarySheet(t('money_report'), periodLabel(from, to)),
      { name: t('income'), cols: [{ h: t('date'), w: 12, f: 'date' }, { h: t('type'), w: 14 }, { h: t('learner') + ' / ' + t('donor'), w: 26 }, { h: t('paid_by'), w: 22 }, { h: t('method'), w: 10 },
        { h: t('reference'), w: 14 }, { h: t('description'), w: 28, f: 'wrap' }, { h: t('amount'), w: 13, f: 'money' }],
        rows: ins.map(function (m) { return [m.date, m.kind === 'pay' ? t('kind_pay') : t('kind_don'), m.kind === 'pay' ? kidName(m.kid) : (m.donor || t('anonymous')), m.payer || '', m.method ? t('pm_' + m.method) : '', m.ref || '', [m.desc, m.note].filter(Boolean).join(' · '), m.amt]; }),
        sumCols: [7], totalLabel: t('total') },
      { name: t('expenses'), cols: [{ h: t('date'), w: 12, f: 'date' }, { h: t('category'), w: 24 }, { h: t('description'), w: 30, f: 'wrap' }, { h: t('supplier'), w: 22 }, { h: t('amount'), w: 13, f: 'money' }],
        rows: outs.map(function (m) { return [m.date, catLabel(m.cat), [m.desc, m.note].filter(Boolean).join(' · '), m.supplier || '', m.amt]; }), sumCols: [4], totalLabel: t('total') },
      { name: t('accounts'), cols: [{ h: t('learner'), w: 26 }, { h: t('main_parent'), w: 26 }, { h: t('fees'), w: 14 }, { h: t('amount'), w: 12, f: 'money' }, { h: t('balance'), w: 14, f: 'money' }],
        rows: acc, sumCols: [4], totalLabel: t('total') }]);
  }

  /* Diary, nappy book, incidents --------------------------------------- */
  function diaryBlock(doc, d, withPhotos) {
    doc.heading(niceDate(d.date) + ((d.weather || []).length ? '  ·  ' + d.weather.map(function (w) { return t('w_' + w); }).join(', ') : ''));
    section(doc, t('theme'), d.theme);
    section(doc, t('activities'), d.activities);
    section(doc, t('day_text'), d.text);
    section(doc, t('menu'), d.meals);
    section(doc, t('staff_on_duty'), d.staff);
    section(doc, t('other_notes'), d.notes);
    if (!withPhotos) return Promise.resolve();
    var ids = (d.media || []).filter(function (m) { return m.type !== 'video'; }).map(function (m) { return m.id; });
    return Promise.all(ids.map(function (id) { return photoForPdf(id, 1000); })).then(function (ph) { if (ph.filter(Boolean).length) photoGrid(doc, ph); });
  }
  function buildDiaryPdf(id) {
    var d = find('diary', id), doc = pdfDoc(ACC.diary);
    doc.title(t('diary'), [niceDate(d.date)]);
    return diaryBlock(doc, d, true).then(function () { return doc.blob(); });
  }
  function buildDiaryRangePdf(from, to) {
    var list = D.diary.filter(function (d) { return inRange(d.date, from, to); }).sort(byDateAsc);
    var doc = pdfDoc(ACC.diary);
    doc.title(t('diary'), [periodLabel(from, to)]);
    if (!list.length) doc.note(t('no_diary'));
    list.forEach(function (d) { diaryBlock(doc, d, false); });
    return doc.blob();
  }
  function buildCarePdf(kid, day) {
    var k = find('kids', kid), a = attOf(kid, day), doc = pdfDoc(ACC.care);
    doc.title(t('care_report'), [fullName(k), niceDate(day)]);
    var kv = [];
    if (a && a.in) kv.push([t('arrival'), a.in + ' · ' + personWithRel(k, a.inBy)]);
    if (a && a.out) kv.push([t('departure'), a.out + ' · ' + personWithRel(k, a.outBy)]);
    if (k.allergies) kv.push([t('allergies'), k.allergies]);
    if (kv.length) info(doc, kv, 110);
    var list = D.care.filter(function (c) { return c.kid === kid && c.date === day; }).sort(function (x, y) { return (x.time || '').localeCompare(y.time || ''); });
    doc.table([{ h: t('time'), w: 50 }, { h: t('what'), w: 110 }, { h: t('detail'), wrap: true }], list.map(function (c) { return [c.time, t('care_' + c.type), careDetail(c)]; }), { empty: t('care_empty') });
    var counts = {};
    list.forEach(function (c) { if (!c.restOf) counts[c.type] = (counts[c.type] || 0) + 1; });
    var ck = CARE_TYPES.filter(function (x) { return counts[x]; });
    if (ck.length) doc.kv(ck.map(function (x) { return [t('care_' + x), String(counts[x])]; }), 200);
    var uniq = function (v, i, arr) { return arr.indexOf(v) === i; };
    var photos = list.filter(function (c) { return c.photo; }).map(function (c) { return c.photo; }).filter(uniq);
    var actPics = [], vids = 0;
    list.forEach(function (c) { (c.media || []).forEach(function (m) { if (m.type === 'video') vids++; else actPics.push(m.id); }); });
    actPics = actPics.filter(uniq);
    return Promise.all(photos.map(function (id) { return photoForPdf(id, 900); })).then(function (ph) {
      if (ph.filter(Boolean).length) { doc.heading(t('meal_photos')); photoGrid(doc, ph); }
      return Promise.all(actPics.map(function (id) { return photoForPdf(id, 900); }));
    }).then(function (ph) {
      if (ph.filter(Boolean).length || vids) doc.heading(t('act_photos'));
      if (ph.filter(Boolean).length) photoGrid(doc, ph);
      if (vids) doc.note(t('act_videos', { n: vids }));
      return doc.blob();
    });
  }
  function incNo(i) { return 'INS-' + i.date.replace(/-/g, '') + '-' + i.id.slice(-4).toUpperCase(); }
  function buildIncPdf(id) {
    var i = find('incidents', id), doc = pdfDoc(ACC.inc);
    doc.title(t('inc_report'), [t('ref') + ': ' + incNo(i), niceDate(i.date) + (i.time ? '  ·  ' + i.time : '')]);
    info(doc, [[t('inc_type'), i.type ? t('inc_' + i.type) : '—'], [t('severity'), i.severity ? t('sev_' + i.severity) : '—'], [t('place'), i.place || '—']], 110);
    doc.heading(t('kids_involved'));
    doc.table([{ h: t('learner'), wrap: true }, { h: t('dob'), w: 72 }, { h: t('allergies'), wrap: true }, { h: t('main_parent'), wrap: true }, { h: t('cell'), w: 82 }],
      (i.kids || []).map(function (kid) {
        var k = find('kids', kid) || {}, p = find('parents', k.p1);
        return [fullName(k), k.dob ? shortDate(k.dob) : '', k.allergies || t('none_known'), p ? fullName(p) : '', p ? p.cell || '' : ''];
      }));
    section(doc, t('inc_desc'), i.desc);
    section(doc, t('injury'), i.injury);
    section(doc, t('action_taken'), i.action);
    section(doc, t('staff_handled'), i.staff);
    section(doc, t('witnesses'), i.witness);
    section(doc, t('parent_notified'), i.notified === 'yes' ? t('yes') + [i.notifiedWho, i.notifiedTime, i.notifiedHow].filter(Boolean).map(function (x) { return ' · ' + x; }).join('') : i.notified === 'no' ? t('no') : '');
    section(doc, t('follow_up'), i.follow);
    var media = i.media || [], vids = media.filter(function (m) { return m.type === 'video'; });
    return Promise.all(media.filter(function (m) { return m.type !== 'video'; }).map(function (m) { return photoForPdf(m.id, 1100); })).then(function (ph) {
      if (ph.filter(Boolean).length || vids.length) doc.heading(t('evidence'));
      if (ph.filter(Boolean).length) photoGrid(doc, ph);
      if (vids.length) doc.note(t('videos_attached', { n: vids.length }) + ' ' + vids.map(function (v, j) { return v.name || ('video ' + (j + 1)); }).join(', '));
      sigLines(doc, [t('sig_staff'), t('sig_manager'), t('sig_parent'), t('date')]);
      return doc.blob();
    });
  }
  function buildIncListPdf(from, to) {
    var list = D.incidents.filter(function (i) { return inRange(i.date, from, to); }).sort(byDateAsc);
    var doc = pdfDoc(ACC.inc);
    doc.title(t('incidents'), [periodLabel(from, to)]);
    doc.table([{ h: t('date'), w: 66 }, { h: t('learner'), wrap: true }, { h: t('inc_type'), w: 80 }, { h: t('severity'), w: 60 }, { h: t('inc_desc'), wrap: true }],
      list.map(function (i) { return [shortDate(i.date) + (i.time ? ' ' + i.time : ''), (i.kids || []).map(kidName).join(', '), i.type ? t('inc_' + i.type) : '', i.severity ? t('sev_' + i.severity) : '', i.desc]; }), { empty: t('no_incidents') });
    return doc.blob();
  }
  function shareInc(id) {
    var i = find('incidents', id);
    buildIncPdf(id).then(function (pdf) {
      var name = fileSafe(t('inc_report') + ' ' + incNo(i)) + '.pdf';
      var files = [new File([pdf], name, { type: 'application/pdf' })];
      return Promise.all((i.media || []).map(function (m, j) {
        return mediaGet(m.id).then(function (b) {
          if (!b) return null;
          var ext = m.type === 'video' ? ((b.type || '').split('/')[1] || 'mp4').replace('quicktime', 'mov') : 'jpg';
          return new File([b], fileSafe(m.name) || (incNo(i) + '-' + (j + 1) + '.' + ext), { type: b.type || (m.type === 'video' ? 'video/mp4' : 'image/jpeg') });
        });
      })).then(function (more) {
        var all = files.concat(more.filter(Boolean));
        if (canShare && navigator.canShare({ files: all })) return navigator.share({ files: all, title: name }).catch(function (e) { if (e && e.name !== 'AbortError') toast(t('share_failed')); });
        if (canShare) return navigator.share({ files: files, title: name }).catch(function () {});
        download(pdf, name);
        more.filter(Boolean).forEach(function (f) { download(f, f.name); });
        toast(t('files_saved'));
      });
    }).catch(function (e) { console.error(e); toast(t('export_failed')); });
  }

  /* Reports screen ------------------------------------------------------ */
  function reportsScreen() {
    if (!F.ws) Object.assign(F, { ws: weekStart(today()), wkKid: '', careKid: '', invYm: ymOf(today()), preset: 2, from: presets()[2][1], to: presets()[2][2] });
    var h = '<div class="card" style="border-top-color:#3a86ff"><h3 class="ct b">🗓 ' + esc(t('week_report')) + '</h3><p class="hint">' + esc(t('week_report_hint')) + '</p>' +
      '<div class="daynav"><button class="icon round" data-act="wkPrev">‹</button><div class="dn-mid"><b>' + esc(t('week')) + '</b><span>' + esc(weekLabel(F.ws)) + '</span></div><button class="icon round" data-act="wkNext">›</button></div>' +
      fld(t('learner'), sel('wkKid', [['', t('all_learners')]].concat(kidsSorted(true).map(function (k) { return [k.id, fullName(k)]; })))) +
      '<div class="three">' + btn('wkPdf', '📄 PDF', 'primary b') + btn('wkShare', '📤 ' + esc(t('share')), 'secondary') + btn('wkXls', '📊 Excel', 'secondary') + '</div></div>';
    var months = []; for (var i = 0; i < 6; i++) months.push(addMonths(ymOf(today()), -i));
    h += '<div class="card" style="border-top-color:#8338ec"><h3 class="ct purple">🧾 ' + esc(t('invoices_all')) + '</h3><p class="hint">' + esc(t('invoices_all_hint')) + '</p><div class="chips scroll">' + months.map(function (ym) {
      return '<button class="chip' + (F.invYm === ym ? ' on' : '') + '" data-chip="invYm" data-v="' + ym + '">' + esc(ymLabel(ym)) + '</button>';
    }).join('') + '</div><div class="two">' + btn('allInv', '📄 PDF', 'primary purple') + btn('allInvShare', '📤 ' + esc(t('share')), 'secondary') + '</div></div>';
    h += '<div class="card" style="border-top-color:#05a66b"><h3 class="ct g">📅 ' + esc(t('period')) + '</h3><div class="chips">' + presets().map(function (p, j) {
      return '<button class="chip' + (F.preset === j ? ' on' : '') + '" data-preset="' + j + '">' + esc(t(p[0])) + '</button>';
    }).join('') + '</div><div class="two">' + fld(t('from'), inp('from', { type: 'date', rr: 1 })) + fld(t('to'), inp('to', { type: 'date', rr: 1 })) + '</div>' +
      '<div class="rgrid">' +
      '<div class="ritem"><b>💰 ' + esc(t('money_report')) + '</b><div class="two">' + btn('monPdf', 'PDF', 'secondary small') + btn('monXls', 'Excel', 'secondary small') + '</div></div>' +
      '<div class="ritem"><b>☀️ ' + esc(t('attendance')) + '</b><div class="two">' + btn('attPdf', 'PDF', 'secondary small') + btn('attXls', 'Excel', 'secondary small') + '</div></div>' +
      '<div class="ritem"><b>📒 ' + esc(t('diary')) + '</b><div class="two">' + btn('diaryRange', 'PDF', 'secondary small') + '</div></div>' +
      '<div class="ritem"><b>🩹 ' + esc(t('incidents')) + '</b><div class="two">' + btn('incList', 'PDF', 'secondary small') + '</div></div>' +
      '</div></div>';
    h += '<div class="card" style="border-top-color:#00a6d6"><h3 class="ct sky">🧷 ' + esc(t('care_book')) + '</h3><p class="hint">' + esc(t('care_book_hint')) + '</p>' +
      fld(t('learner'), sel('careKid', [['', t('all_learners')]].concat(kidsSorted(true).map(function (k) { return [k.id, fullName(k)]; })))) +
      '<div class="two">' + btn('careRange', '📄 PDF', 'primary', 'style="background:#00a6d6"') + btn('careRangeShare', '📤 ' + esc(t('share')), 'secondary') + '</div></div>';
    h += '<div class="card" style="border-top-color:#ff3d8b"><h3 class="ct pink">📂 ' + esc(t('forms')) + '</h3><p class="hint">' + esc(t('forms_blank_hint')) + '</p>' +
      FORMS.map(function (f) {
        return '<div class="formrow"><b>' + f.icon + ' ' + esc(formName(f.k)) + '</b><div class="two">' + btn('blankForm', '📄 PDF', 'secondary small', 'data-v="' + f.k + '"') +
          btn('blankFormShare', '📤 ' + esc(t('share')), 'secondary small', 'data-v="' + f.k + '"') + '</div></div>';
      }).join('') +
      '<div class="sp"></div><h3 class="ct pink">✅ ' + esc(t('forms_filled')) + '</h3>' +
      fld(t('learner'), sel('regKid', [['', '— ' + t('choose') + ' —']].concat(kidsSorted(true).map(function (k) {
        var have = FORMS.filter(function (f) { return docsOf(k, f.k).length; }).length; return [k.id, fullName(k) + '  (' + have + '/3)'];
      })), true));
    var rk = find('kids', F.regKid);
    if (rk) {
      if (!F.regCat) F.regCat = '';
      h += '<label class="f">' + esc(t('which_form')) + '</label>' + seg('regCat', [['', esc(t('all_forms'))]].concat(FORMS.map(function (f) { return [f.k, f.icon + ' ' + esc(formName(f.k))]; })), 'wrap');
      var miss = FORMS.filter(function (f) { return (!F.regCat || F.regCat === f.k) && !docsOf(rk, f.k).length; });
      if (miss.length) h += msg('warn', esc(t('forms_missing', { n: rk.name, f: miss.map(function (f) { return formName(f.k); }).join(', ') })));
    }
    var has = rk && FORMS.some(function (f) { return (!F.regCat || F.regCat === f.k) && docsOf(rk, f.k).length; });
    h += '<div class="two">' + btn('regPull', '📄 ' + esc(t('rf_get')), 'secondary', has ? '' : 'disabled') +
      btn('regPullShare', '📤 ' + esc(t('share')), 'secondary', has ? '' : 'disabled') + '</div></div>';
    h += '<p class="hint center">' + esc(t('reports_logo_hint')) + ' <a href="#" data-act="settings">' + esc(t('settings')) + '</a></p>';
    return h;
  }
  function wkIds() { return F.wkKid ? [F.wkKid] : kidsSorted(true).filter(function (k) { return weekRows(k, F.ws).some(function (r) { return r.a && r.a.in; }) || k.active !== false; }).map(function (k) { return k.id; }); }
  function wkName(ext) { return t('week_report') + ' ' + (F.wkKid ? kidName(F.wkKid) + ' ' : '') + F.ws + ext; }

  /* ================================================================ */
  /* Forms: the daycare's own forms to print, and the filled-in ones   */
  /* uploaded on each learner's profile                                */
  /* ================================================================ */
  /* The daycare's own forms (in the forms folder) and the filled-in ones on each learner's profile */
  var FORMS = [{ k: 'reg', file: 'forms/Inskrywingsvorm.pdf', icon: '📋', color: '#ff3d8b' },
               { k: 'contract', file: 'forms/Kontrak.pdf', icon: '📝', color: '#8338ec' },
               { k: 'waiver', file: 'forms/Vrywaringsvorm.pdf', icon: '🛡️', color: '#00a6d6' }];
  function formName(cat) { return t('form_' + cat); }
  function docsOf(k, cat) { return (k.regDocs || []).filter(function (m) { return (m.cat || 'reg') === cat; }); }
  // Download (or share) one of the daycare's blank forms; it is kept offline with the app
  function getBlankForm(cat, share) {
    var f = FORMS.filter(function (x) { return x.k === cat; })[0];
    fetch(f.file).then(function (r) { if (!r.ok) throw new Error(r.status); return r.blob(); })
      .then(function (b) { deliver(new Blob([b], { type: 'application/pdf' }), formName(cat) + ' ' + fileSafe(D.settings.name) + '.pdf', share); })
      .catch(function () { toast(t('form_offline')); });
  }
  function regDocsCard(k) {
    var h = '<div class="card"><h3 class="ct pink">📂 ' + esc(t('forms')) + '</h3><p class="hint">' + esc(t('rf_upload_hint')) + '</p>';
    FORMS.forEach(function (f) {
      var list = docsOf(k, f.k);
      h += '<div class="formblk" style="--fc:' + f.color + '"><div class="row"><b>' + f.icon + ' ' + esc(formName(f.k)) + '</b>' +
        (list.length ? '<span class="pill" style="background:' + f.color + ';color:#fff">✓ ' + list.length + '</span>' : '<span class="pill">' + esc(t('rf_not_uploaded')) + '</span>') + '</div>';
      if (list.length) h += '<div class="thumbs">' + list.map(function (m) {
        var inner = m.type === 'pdf' ? '<div class="pdft">📄<span>' + esc(m.name || 'PDF') + '</span></div>' : '<img data-mid="' + m.id + '" alt="">';
        return '<div class="thumb" data-act="viewReg" data-id="' + m.id + '">' + inner +
          '<button class="rm" data-act="rmReg" data-id="' + m.id + '" aria-label="' + esc(t('remove')) + '">' + (confirmKey === 'rmReg' + m.id ? '?' : '✕') + '</button></div>';
      }).join('') + '</div>';
      h += '<div class="three">' +
        '<label class="secondary btnl small">📷 ' + esc(t('rf_photo')) + '<input type="file" accept="image/*" capture="environment" class="hidden" data-reg="' + k.id + '" data-cat="' + f.k + '"></label>' +
        '<label class="secondary btnl small">📂 ' + esc(t('rf_file')) + '<input type="file" accept="image/*,application/pdf" multiple class="hidden" data-reg="' + k.id + '" data-cat="' + f.k + '"></label>' +
        (list.length ? btn('pullReg', '📤 ' + esc(t('share')), 'secondary small', 'data-id="' + k.id + '" data-cat="' + f.k + '"') : '<span></span>') + '</div></div>';
    });
    if (confirmKey.indexOf('rmReg') === 0) h += '<p class="hint">' + esc(t('tap_again_remove')) + '</p>';
    return h + '</div>';
  }
  // Pages of a form are kept sharp enough to read: max 2200 px
  function addRegFiles(kid, files, cat) {
    var k = find('kids', kid), list = Array.prototype.slice.call(files || []);
    if (!k || !list.length) return;
    toast(t('adding_media'));
    var chain = Promise.resolve();
    list.forEach(function (file) {
      chain = chain.then(function () {
        var isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
        var p = isPdf ? Promise.resolve(new Blob([file], { type: 'application/pdf' })) : shrinkPhoto(file, 2200);
        return p.then(function (blob) {
          var id = uid();
          return mediaPut(id, blob).then(function () {
            (k.regDocs = k.regDocs || []).push({ id: id, cat: cat || 'reg', type: isPdf ? 'pdf' : 'image', name: isPdf ? (file.name || 'vorm.pdf') : '', added: today() });
          });
        }).catch(function () { toast(t('err_media')); });
      });
    });
    chain.then(function () { save(); render(); toast(t('media_added', { n: list.length })); });
  }
  function viewReg(id) {
    var k = D.kids.filter(function (x) { return (x.regDocs || []).some(function (m) { return m.id === id; }); })[0];
    var m = k && k.regDocs.filter(function (x) { return x.id === id; })[0];
    if (!m) return;
    if (m.type !== 'pdf') return showMedia(id, 'image');
    mediaGet(id).then(function (b) { if (b) download(b, m.name || 'vorm.pdf'); });
  }
  function rmReg(kid, id) {
    if (confirmKey !== 'rmReg' + id) { confirmKey = 'rmReg' + id; return render(); }
    var k = find('kids', kid);
    k.regDocs = (k.regDocs || []).filter(function (m) { return m.id !== id; });
    if (!mediaInUse(id)) mediaDel(id);
    confirmKey = ''; save(); render();
  }
  // The uploaded form: photos of the pages become one PDF (with the logo and name on top); uploaded PDFs go as they are
  function buildRegPhotosPdf(k, cat) {
    var pics = docsOf(k, cat).filter(function (m) { return m.type !== 'pdf'; });
    if (!pics.length) return Promise.resolve(null);
    return Promise.all(pics.map(function (m) { return photoForPdf(m.id, 2000); })).then(function (ph) {
      var doc = pdfDoc(rgb('#ff3d8b'));
      doc.title(formName(cat), [fullName(k)]);
      ph.filter(Boolean).forEach(function (p, i) {
        if (i > 0) { doc.newPage(); letterhead(doc); }
        var maxW = doc.W - 2 * doc.M, maxH = doc.H - doc.M - 30 - doc.y, w = maxW, h = w * p.h / p.w;
        if (h > maxH) { h = maxH; w = h * p.w / p.h; }
        doc.image(p.url, p.w, p.h, doc.M + (maxW - w) / 2, doc.y, w, h);
        doc.y += h + 10;
      });
      return doc.blob();
    });
  }
  function pullReg(kid, share, cat) {
    var k = find('kids', kid);
    if (!k) return;
    var cats = cat ? [cat] : FORMS.map(function (f) { return f.k; });
    var jobs = cats.filter(function (c) { return docsOf(k, c).length; });
    if (!jobs.length) { toast(t('rf_none')); return; }
    Promise.all(jobs.map(function (c) {
      var base = fileSafe(formName(c) + ' ' + fullName(k));
      return buildRegPhotosPdf(k, c).then(function (pdf) {
        var files = pdf ? [new File([pdf], fileSafe(base + '.pdf'), { type: 'application/pdf' })] : [];
        return Promise.all(docsOf(k, c).filter(function (m) { return m.type === 'pdf'; }).map(function (m, i) {
          return mediaGet(m.id).then(function (b) { return b ? new File([b], fileSafe(base + (files.length || i ? ' ' + (i + 1 + files.length) : '') + '.pdf'), { type: 'application/pdf' }) : null; });
        })).then(function (more) { return files.concat(more.filter(Boolean)); });
      });
    })).then(function (groups) {
      var files = [].concat.apply([], groups);
      if (!files.length) { toast(t('rf_none')); return; }
      if (share && canShare && navigator.canShare({ files: files })) return navigator.share({ files: files, title: kidName(kid) }).catch(function (e) { if (e && e.name !== 'AbortError') toast(t('share_failed')); });
      files.forEach(function (f) { download(f, f.name); });
      toast(files.length > 1 ? t('files_saved') : t('file_saved'));
    }).catch(function (e) { console.error(e); toast(t('export_failed')); });
  }

  /* ================================================================ */
  /* First start and settings                                          */
  /* ================================================================ */
  function setupScreen() {
    if (!F.setupInit) Object.assign(F, { setupInit: 1, lang: D.settings.lang, name: '', closeTime: '17:00' });
    return '<div class="card hero"><div class="big">🎈🧸🖍️</div><h2>' + esc(t('setup_title')) + '</h2><p class="muted">' + esc(t('setup_text')) + '</p></div>' +
      '<div class="card">' + fld(t('language'), seg('lang', [['af', 'Afrikaans'], ['en', 'English']])) +
      fld(t('daycare_name') + ' *', inp('name', { max: 60, focus: 1 })) +
      fld(t('logo'), logoPicker()) + fld(t('close_time'), inp('closeTime', { type: 'time' }), esc(t('close_time_hint'))) + '</div>' +
      msg('err', F.err ? esc(F.err) : '') + '<div class="bar">' + btn('finishSetup', '🚀 ' + esc(t('start')), 'primary') +
      '<label class="text btnl">' + esc(t('restore_backup')) + '<input type="file" accept=".json,application/json" class="hidden" id="restoreFile"></label></div>';
  }
  function logoPicker() {
    var s = D.settings;
    return (s.logo ? '<div class="logobox"><img src="' + s.logo + '" alt=""><button class="text danger small" data-act="logoRm">' + esc(t('remove')) + '</button></div>' : '') +
      '<label class="secondary btnl">🖼 ' + esc(s.logo ? t('change_logo') : t('choose_logo')) + '<input type="file" accept="image/*" class="hidden" id="logoIn"></label>';
  }
  function finishSetup() {
    var name = clean(F.name, 60);
    if (!name) { F.err = t('err_daycare_name'); return render(); }
    Object.assign(D.settings, { setup: true, name: name, lang: F.lang || 'af', closeTime: F.closeTime || '17:00' });
    save(); F = {}; V = TAB = 'today'; render();
  }

  var SET_KEYS = ['lang', 'name', 'owner', 'phone', 'email', 'addr', 'regNo', 'bankName', 'bankHolder', 'bankAcc', 'bankBranch', 'bankType', 'invPrefix', 'invNote', 'closeTime', 'remind', 'remindTime', 'hourRound'];
  function settingsScreen() {
    var s = D.settings;
    if (!F.loaded) {
      F.loaded = 1;
      SET_KEYS.forEach(function (k) { F[k] = s[k]; });
      Object.assign(F, { fineAmt: numIn(s.fineAmt), fineMins: String(s.fineMins), payDays: String(s.payDays), nextInv: String(s.nextInv), yearEnd: String(s.yearEnd), color: '#f5a300' });
    }
    var h = '';
    if (F.restoreN != null) {
      h += '<div class="card warnc" id="restoreBox"><strong>' + esc(t('restore_confirm_title')) + '</strong><div class="muted">' + esc(t('restore_confirm', { n: F.restoreN, name: F.restoreName || '–' })) + '</div>' +
        '<div class="two">' + btn('applyRestore', esc(t('restore_yes')), 'primary') + btn('cancelRestore', esc(t('cancel')), 'secondary') + '</div></div>';
    }
    h += '<div class="card"><h3 class="ct pink">🏫 ' + esc(t('daycare')) + '</h3>' + fld(t('language'), seg('lang', [['af', 'Afrikaans'], ['en', 'English']])) +
      fld(t('daycare_name') + ' *', inp('name', { max: 60 })) + fld(t('logo'), logoPicker(), esc(t('logo_hint'))) + fld(t('owner'), inp('owner', { max: 60 })) +
      '<div class="two">' + fld(t('phone'), inp('phone', { max: 20, mode: 'tel' })) + fld(t('email'), inp('email', { max: 80, type: 'email' })) + '</div>' +
      fld(t('address'), area('addr', '', 2)) + fld(t('reg_no'), inp('regNo', { max: 40 })) + '</div>';
    h += '<div class="card"><h3 class="ct o">⏰ ' + esc(t('times_fines')) + '</h3>' + fld(t('close_time'), inp('closeTime', { type: 'time' })) +
      '<div class="two">' + fld(t('fine_amt') + ' (R)', inp('fineAmt', { mode: 'decimal' })) + fld(t('fine_every'), sel('fineMins', [['15', '15 min'], ['30', '30 min'], ['60', '60 min']])) + '</div>' +
      '<p class="hint">' + esc(t('fine_rule', { r: fmtR(num(F.fineAmt) || 0), m: F.fineMins, t: F.closeTime || '17:00' })) + '</p>' +
      fld(t('hour_round'), sel('hourRound', [['min', t('round_min')], ['15', t('round_15')], ['30', t('round_30')], ['60', t('round_60')]]), esc(t('hour_round_hint'))) + '</div>';
    h += '<div class="card"><h3 class="ct purple">🧾 ' + esc(t('invoices')) + '</h3>' +
      '<div class="three">' + fld(t('inv_prefix'), inp('invPrefix', { max: 6 })) + fld(t('next_no'), inp('nextInv', { mode: 'numeric', max: 6 })) + fld(t('pay_days'), inp('payDays', { mode: 'numeric', max: 3 })) + '</div>' +
      fld(t('bank'), inp('bankName', { max: 40 })) + fld(t('acc_holder'), inp('bankHolder', { max: 60 })) +
      '<div class="two">' + fld(t('acc_no'), inp('bankAcc', { max: 30, mode: 'numeric' })) + fld(t('branch'), inp('bankBranch', { max: 20 })) + '</div>' +
      fld(t('acc_type'), inp('bankType', { max: 30 })) + fld(t('inv_note'), area('invNote', t('inv_note_ph'), 2)) +
      fld(t('year_end'), sel('yearEnd', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(function (m) { return [String(m), monthName(m)]; }))) + '</div>';
    h += '<div class="card"><h3 class="ct purple">📒 ' + esc(t('diary_reminder')) + '</h3>' + check('remind', t('remind_on')) +
      (F.remind ? fld(t('remind_time'), inp('remindTime', { type: 'time' })) : '') + '<p class="hint">' + esc(t('remind_hint')) + '</p>';
    var perm = ('Notification' in window) ? Notification.permission : 'unsupported';
    if (F.remind && perm === 'default') h += btn('askNotify', '🔔 ' + esc(t('allow_notify')), 'secondary small');
    if (perm === 'granted') h += '<p class="hint">🔔 ' + esc(t('notify_on')) + '</p>';
    if (perm === 'denied') h += '<p class="hint">🔕 ' + esc(t('notify_denied')) + '</p>';
    if (F.remind) h += '<div class="two">' + btn('icsRemind', '📅 ' + esc(t('add_calendar')), 'secondary small') + btn('gcalRemind', '📅 Google', 'secondary small') + '</div>';
    h += '</div>';
    h += '<div class="card"><h3 class="ct r">🏷 ' + esc(t('exp_cats')) + '</h3><p class="hint">' + esc(t('exp_cats_hint')) + '</p><div class="chips">' +
      OUT_CATS.map(function (c) { return '<span class="chip">' + esc(catLabel(c)) + '</span>'; }).join('') +
      (s.cats.out || []).map(function (n) { return '<span class="chip on">' + esc(n) + ' <a href="#" data-act="delCat" data-v="' + esc(n) + '">' + (confirmKey === 'delCat' + n ? esc(t('tap_again')) : '✕') + '</a></span>'; }).join('') +
      '</div><div class="row">' + inp('newCat', { max: 40, ph: t('new_category_ph') }) + btn('addCatSet', esc(t('add')), 'secondary small') + '</div></div>';
    h += msg('err', F.err ? esc(F.err) : '') + btn('saveSettings', '✓ ' + esc(t('save')), 'primary');
    h += '<div class="card"><h3 class="ct b">💾 ' + esc(t('backup')) + '</h3><p class="hint">' + esc(t('backup_hint')) + '</p>' +
      (s.lastBackup ? '<p class="small-l">' + esc(t('last_backup', { d: shortDate(s.lastBackup) })) + '</p>' : '') +
      '<div class="two">' + btn('backup', '💾 ' + esc(t('make_backup')), 'secondary') +
      '<label class="secondary btnl">📂 ' + esc(t('restore_backup')) + '<input type="file" accept=".json,application/json" class="hidden" id="restoreFile"></label></div></div>';
    h += '<div class="card"><h3 class="ct r">⚠️ ' + esc(t('danger')) + '</h3>' + btn('wipe', confirmKey === 'wipe' ? esc(t('wipe_confirm')) : '🗑 ' + esc(t('wipe')), 'text danger') + '</div>';
    h += '<p class="hint center">Dagsorg ' + VERSION + ' · ' + esc(t('offline_note')) + '</p>';
    return h;
  }
  function saveSettings() {
    var name = clean(F.name, 60), fine = num(F.fineAmt), next = parseInt(F.nextInv, 10), pd = parseInt(F.payDays, 10);
    if (!name) { F.err = t('err_daycare_name'); return render(); }
    if (isNaN(fine) || fine < 0) { F.err = t('err_amount'); return render(); }
    var s = D.settings;
    SET_KEYS.forEach(function (k) { s[k] = typeof F[k] === 'string' ? (k === 'addr' || k === 'invNote' ? cleanMulti(F[k], 400) : clean(F[k], 80)) : F[k]; });
    s.name = name; s.fineAmt = r2(fine); s.fineMins = Number(F.fineMins) || 30; s.payDays = isNaN(pd) ? 7 : pd; s.nextInv = isNaN(next) || next < 1 ? s.nextInv : next;
    s.yearEnd = Number(F.yearEnd) || 2; s.remind = !!F.remind; s.closeTime = s.closeTime || '17:00';
    // fines of today and later follow the new rules; older ones stay as they were
    D.att.forEach(function (a) { if (a.date >= today() && a.out) syncAtt(a); });
    save(); toast(t('saved')); done();
  }
  function setLogo(file) {
    makeLogo(file).then(function (l) {
      D.settings.logo = l.url; D.settings.logoW = l.w; D.settings.logoH = l.h;
      save(); render(); toast(t('logo_added'));
    }).catch(function () { toast(t('err_photo')); });
  }

  /* Reminders in the phone's calendar (fire even when the app is closed) */
  function appUrl() { return location.href.split('#')[0].split('?')[0]; }
  function reminderIcs() {
    deliver(FX.ics({ time: F.remindTime || D.settings.remindTime || '16:00', title: t('ics_title'), desc: t('ics_desc'), url: appUrl() }), 'Dagsorg ' + t('diary_reminder') + '.ics');
  }
  function reminderGoogle() {
    var hm = (F.remindTime || D.settings.remindTime || '16:00').split(':'), d = new Date();
    d.setHours(+hm[0], +hm[1] || 0, 0, 0);
    var e = new Date(d.getTime() + 10 * 60000);
    var f = function (x) { return x.getFullYear() + pad(x.getMonth() + 1) + pad(x.getDate()) + 'T' + pad(x.getHours()) + pad(x.getMinutes()) + '00'; };
    window.open('https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(t('ics_title')) +
      '&details=' + encodeURIComponent(t('ics_desc') + '\n' + appUrl()) + '&dates=' + f(d) + '/' + f(e) +
      '&ctz=Africa/Johannesburg&recur=' + encodeURIComponent('RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'), '_blank', 'noopener');
  }

  /* Backup / restore --------------------------------------------------- */
  function blobToDataUrl(b) {
    return new Promise(function (res) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = function () { res(null); }; r.readAsDataURL(b); });
  }
  function dataUrlToBlob(u) {
    var m = /^data:([^;,]+);base64,(.*)$/.exec(u || '');
    if (!m) return null;
    var bin = atob(m[2]), arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: m[1] });
  }
  function allMediaIds() {
    var ids = {};
    D.care.forEach(function (c) { if (c.photo) ids[c.photo] = 1; (c.media || []).forEach(function (m) { ids[m.id] = 1; }); });
    D.money.forEach(function (m) { if (m.photo) ids[m.photo] = 1; });
    D.diary.forEach(function (d) { (d.media || []).forEach(function (m) { ids[m.id] = 1; }); });
    D.incidents.forEach(function (i) { (i.media || []).forEach(function (m) { ids[m.id] = 1; }); });
    D.kids.forEach(function (k) { (k.regDocs || []).forEach(function (m) { ids[m.id] = 1; }); });
    D.complaints.forEach(function (c) { (c.media || []).forEach(function (m) { ids[m.id] = 1; }); });
    return Object.keys(ids);
  }
  function backup() {
    D.settings.lastBackup = today();
    save();
    toast(t('backup_busy'));
    var ids = useLS ? [] : allMediaIds(), media = {};
    // one file at a time, so a phone with many videos doesn't run out of memory all at once
    var chain = Promise.resolve();
    ids.forEach(function (id) {
      chain = chain.then(function () { return mediaGet(id); }).then(function (b) { return b ? blobToDataUrl(b) : null; }).then(function (u) { if (u) media[id] = u; }).catch(function () {});
    });
    chain.then(function () {
      var parts = ['{"media":{'], first = true;
      Object.keys(media).forEach(function (k) { parts.push((first ? '' : ',') + JSON.stringify(k) + ':' + JSON.stringify(media[k])); first = false; });
      var json = JSON.stringify(D);
      parts.push('},' + json.slice(1));
      var name = 'Dagsorg backup ' + fileSafe(D.settings.name) + ' ' + today() + '.json';
      deliver(new Blob(parts, { type: 'application/json' }), name);
      if (V === 'settings') render();
    });
  }
  var pendingRestore = null, pendingMedia = {};
  function restoreFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var d;
      try { d = JSON.parse(reader.result); } catch (e) { d = null; }
      if (!d || d.app !== 'Dagsorg' || !d.settings) { toast(t('restore_bad')); return; }
      var media = d.media || {};
      delete d.media;
      pendingRestore = normalise(d);
      pendingMedia = media;
      if (!D.settings.setup || (!D.kids.length && !D.money.length)) return applyRestore();
      var n = D.kids.length;
      if (V !== 'settings') openSub('settings', {});
      F.restoreN = pendingRestore.kids.length; F.restoreName = pendingRestore.settings.name;
      render();
      var el = document.getElementById('restoreBox');
      if (el) el.scrollIntoView({ block: 'center' });
    };
    reader.readAsText(file);
  }
  function applyRestore() {
    if (!pendingRestore) return;
    D = pendingRestore; pendingRestore = null;
    D.settings.setup = true;
    var media = pendingMedia; pendingMedia = {};
    Object.keys(mediaUrls).forEach(function (k) { URL.revokeObjectURL(mediaUrls[k]); }); mediaUrls = {};
    var ph = useLS ? Promise.resolve() : mediaClear().then(function () {
      return Promise.all(Object.keys(media).map(function (k) { var b = dataUrlToBlob(media[k]); return b ? mediaPut(k, b) : null; }));
    }).catch(function () {});
    Promise.all([save(), ph]).then(function () { toast(t('restored')); render(); });
    showTab('today');
  }
  function wipe() {
    if (confirmKey !== 'wipe') { confirmKey = 'wipe'; return render(); }
    var lang = D.settings.lang;
    D = blank(); D.settings.lang = lang; save(); mediaClear(); mediaUrls = {}; confirmKey = '';
    STACK = []; F = {}; V = TAB = 'today';
    history.replaceState({ root: 1 }, '');
    render();
  }

  /* ================================================================ */
  /* Actions                                                           */
  /* ================================================================ */
  function dayKey(k) { return LS[k] || today(); }
  function shiftDay(k, n) { var d = addDays(dayKey(k), n); LS[k] = d === today() ? null : d; if (k === 'day') LS.attFilter = ''; render(); }
  function kidForPdf(id) { return find('kids', id); }
  var ACT = {
    tab: function (b) { if (b.getAttribute('data-v') === V) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; } showTab(b.getAttribute('data-v')); },
    back: function () { if (history.state && history.state.sub) history.back(); else closeSub(); },
    reports: function () { openSub('reports', { color: '#3a86ff' }); },
    settings: function () { if (V !== 'settings') openSub('settings', {}); },
    install: function () { doInstall(); },
    dayPrev: function (b) { shiftDay(b.getAttribute('data-k'), -1); },
    dayNext: function (b) { shiftDay(b.getAttribute('data-k'), 1); },
    dayToday: function (b) { LS[b.getAttribute('data-k')] = null; render(); },
    ymPrev: function () { LS.ym = addMonths(LS.ym || ymOf(today()), -1); render(); },
    ymNext: function () { LS.ym = addMonths(LS.ym || ymOf(today()), 1); render(); },
    subTab: function (b) { LS[b.getAttribute('data-k')] = b.getAttribute('data-v'); LS.q = ''; render(); },

    // learners & parents
    newKid: function () { openSub('kidForm', kidFormState(null)); },
    openKid: function (b, id) { openSub('kid', { id: id }); },
    editKid: function (b, id) { openSub('kidForm', kidFormState(find('kids', id))); },
    saveKid: saveKid, delKid: delKid,
    toggleOld: function () { LS.showOld = !LS.showOld; render(); },
    newAuth: function (b, id) { openSub('authForm', { kid: id, name: '', rel: '', phone: '', idNo: '', note: '' }); },
    editAuth: function (b, id) {
      var k = find('kids', F.id), a = k && k.auth.filter(function (x) { return x.id === id; })[0];
      if (a) openSub('authForm', { kid: k.id, aid: a.id, name: a.name, rel: a.rel || '', phone: a.phone || '', idNo: a.idNo || '', note: a.note || '' });
    },
    saveAuth: saveAuth,
    delAuth: function () {
      if (confirmKey !== 'delAuth') { confirmKey = 'delAuth'; return render(); }
      var k = find('kids', F.kid); k.auth = k.auth.filter(function (x) { return x.id !== F.aid; });
      save(); toast(t('deleted')); done();
    },
    newParent: function () { openSub('parentForm', { linkRole: 'p1', linkKid: '' }); },
    newParentFor: function (b) { openSub('parentForm', { linkBack: b.getAttribute('data-v'), linkRole: 'p1' }); },
    openParent: function (b, id) { openSub('parent', { id: id, linkRole: 'p1', linkKid: '' }); },
    editParent: function (b, id) { var p = find('parents', id); openSub('parentForm', Object.assign({}, p, { id: id })); },
    saveParent: saveParent, delParent: delParent, linkKid: linkKid,
    unlink: function (b, id) {
      if (confirmKey !== 'unlink' + id) { confirmKey = 'unlink' + id; return render(); }
      var k = find('kids', id);
      if (k.p1 === F.id) k.p1 = ''; if (k.p2 === F.id) k.p2 = '';
      confirmKey = ''; save(); render();
    },

    // attendance
    signIn: function (b, id) { openSign(id, 'in'); },
    signOut: function (b, id) { openSign(id, 'out'); },
    saveSign: saveSign,
    newComplaint: function (b, id) { openSub('complaint', complaintState(null, id)); },
    editComplaint: function (b, id) { openSub('complaint', complaintState(find('complaints', id))); },
    saveComplaint: saveComplaint, delComplaint: delComplaint,
    newSick: function (b, id) { openSub('sick', sickState(null, id)); },
    editSick: function (b, id) { openSub('sick', sickState(find('sick', id))); },
    saveSick: saveSick,
    delSick: function () { if (confirmKey !== 'delSick') { confirmKey = 'delSick'; return render(); } removeFrom('sick', F.id); save(); toast(t('deleted')); done(); },
    addMedRow: function () { F.medN++; render(); },
    rmMedRow: function (b) { rmMedRow(+b.getAttribute('data-v')); },
    moreSick: function () { F.sickN = (F.sickN || 5) + 10; render(); },
    attFilter: function (b) { var v = b.getAttribute('data-v'); LS.attFilter = LS.attFilter === v ? '' : v; render(); },
    groupSign: function (b) {
      var dir = b.getAttribute('data-v'), day = dayKey('day');
      openSub('group', { dir: dir, date: day, time: day === today() ? nowHM() : (dir === 'in' ? '07:00' : D.settings.closeTime), kids: [], done: {}, color: dir === 'in' ? '#06c167' : '#3a86ff' });
    },
    groupAll: function () {
      var cand = kidsOn(F.date).filter(function (k) { return attStatus(k.id, F.date) === (F.dir === 'in' ? 'notyet' : 'here') || F.done[k.id]; });
      F.kids = F.kids.length === cand.length ? [] : cand.map(function (k) { return k.id; });
      render();
    },
    groupPick: function (b, id) { groupPick(id, b.getAttribute('data-v')); },
    editAtt: function (b, id) { var a = find('att', id); openSub('att', { id: id, in: a.in || '', inBy: a.inBy || '', out: a.out || '', outBy: a.outBy || '', note: a.note || '', fineWaived: !!a.fineWaived }); },
    saveAtt: saveAtt,
    delAtt: function () {
      if (confirmKey !== 'delAtt') { confirmKey = 'delAtt'; return render(); }
      dropAttCharges(F.id); removeFrom('att', F.id); save(); toast(t('deleted')); done();
    },
    diaryToday: function () { var d = diaryOf(today()); openSub('diaryForm', diaryState(d, today())); },

    // nappy book
    careAdd: function (b) {
      var ty = b.getAttribute('data-v'), day = dayKey('careDay');
      openSub('careAdd', { type: ty, date: day, time: day === today() ? nowHM() : '', kids: [], added: [], removed: [], media: [], clothes: [], color: CARE_COLOR[ty], nappy: ty === 'nappy' ? 'wet' : '', sleep: ty === 'sleep' ? 'asleep' : '' });
    },
    actDone: function (b, id) {
      var c = find('care', id), now = c && c.date === today() ? nowHM() : '';
      if (!c) return;
      if (!now) { return ACT.editCare(b, id); }
      var n = 0;
      D.care.forEach(function (x) { if (x.type === 'activity' && !x.timeEnd && (x.id === id || (c.grp && x.grp === c.grp))) { x.timeEnd = mins(now) >= mins(x.time) ? now : x.time; n++; } });
      save(); toast(t('act_ended', { n: n, t: now })); render();
    },
    bottleRest: function (b, id) {
      var c = find('care', id);
      if (!c) return;
      openSub('careAdd', { type: 'bottle', restOf: c.id, date: c.date, time: c.date === today() ? nowHM() : c.time, kids: [c.kid], added: [], clothes: [], drink: c.drink || '', drank: '', color: CARE_COLOR.bottle });
    },
    careKid: function (b, id) { LS.careKid = id || ''; render(); },
    careAll: function () {
      var present = presentKids(F.date), list = (F.showAll || !present.length) ? kidsOn(F.date) : present;
      F.kids = (F.kids || []).length === list.length ? [] : list.map(function (k) { return k.id; });
      render();
    },
    careShowAll: function () { F.showAll = !F.showAll; render(); },
    saveCareAdd: saveCareAdd,
    editCare: function (b, id) { var c = find('care', id); openSub('careEdit', Object.assign({ added: [], removed: [], color: CARE_COLOR[c.type] }, c, { clothes: (c.clothes || []).slice(), media: (c.media || []).slice() })); },
    saveCareEdit: saveCareEdit, delCare: delCare,
    careDayPdf: function (b, id) { var day = b.getAttribute('data-day') || today(); run(function () { return buildCarePdf(id, day); }, t('care_report') + ' ' + kidName(id) + ' ' + day + '.pdf', canShare); },
    rmPhoto: function (b) {
      var k = b.getAttribute('data-v'), id = F[k], i = (F.added || []).indexOf(id);
      F[k] = '';
      if (i > -1) { F.added.splice(i, 1); if (!mediaInUse(id)) mediaDel(id); }
      render();
    },
    viewMedia: function (b, id) { showMedia(id, b.getAttribute('data-type')); },
    rmMedia: function (b, id) { rmMedia(id); },

    // diary & incidents
    openDiary: function (b, id) { openSub('diaryView', { id: id, color: '#8338ec' }); },
    editDiary: function (b, id) { openSub('diaryForm', diaryState(find('diary', id))); },
    saveDiary: saveDiary, delDiary: delDiary,
    moreDiary: function () { F.diaryN = (F.diaryN || 30) + 30; render(); },
    diaryPdf: function (b, id) { run(function () { return buildDiaryPdf(id); }, t('diary') + ' ' + find('diary', id).date + '.pdf'); },
    diaryPdfShare: function (b, id) { run(function () { return buildDiaryPdf(id); }, t('diary') + ' ' + find('diary', id).date + '.pdf', true); },
    newInc: function () { openSub('incForm', incState(null)); },
    openInc: function (b, id) { openSub('inc', { id: id, color: '#e5383b' }); },
    editInc: function (b, id) { openSub('incForm', incState(find('incidents', id))); },
    saveInc: saveInc, delInc: delInc,
    incPdf: function (b, id) { var i = find('incidents', id); run(function () { return buildIncPdf(id); }, t('inc_report') + ' ' + incNo(i) + '.pdf'); },
    incShare: function (b, id) { shareInc(id); },

    // money
    openAccount: function (b, id) { openSub('account', { kid: id, color: '#05a66b' }); },
    newMoney: function (b) { var dir = b.getAttribute('data-v'); openSub('moneyForm', Object.assign(moneyState(null, dir, b.getAttribute('data-kind'), b.getAttribute('data-kid')), { color: dir === 'in' ? '#06c167' : '#e5383b' })); },
    editMoney: function (b, id) { var m = find('money', id); openSub('moneyForm', Object.assign(moneyState(m), { color: m.dir === 'in' ? '#06c167' : '#e5383b' })); },
    saveMoney: saveMoney, delMoney: delMoney, addCat: addCat,
    newCharge: function (b, id) { openSub('chargeForm', { kid: id, desc: '', amt: '', date: today() }); },
    editCharge: function (b, id) { var c = find('charges', id); openSub('chargeForm', { id: id, kid: c.kid, desc: c.desc || '', amt: numIn(c.amt), date: c.date }); },
    saveCharge: saveCharge, delCharge: delCharge,
    invoicePdf: function (b, id) { var inv = invoiceFor(id, F.invYm); run(function () { return buildInvoicePdf(inv); }, invoiceName(inv)); render(); },
    invoiceShare: function (b, id) { var inv = invoiceFor(id, F.invYm); run(function () { return buildInvoicePdf(inv); }, invoiceName(inv), true); render(); },
    reInvoice: function (b, id) { var inv = find('invoices', id); run(function () { return buildInvoicePdf(inv); }, invoiceName(inv), canShare); },
    moreRows: function () { F.n = (F.n || 40) + 40; render(); },

    // reports
    weekPdf: function (b, id) { var ws = weekStart(today()); run(function () { return buildWeekPdf([id], ws); }, t('week_report') + ' ' + kidName(id) + ' ' + ws + '.pdf', canShare); },
    wkPrev: function () { F.ws = addDays(F.ws, -7); render(); },
    wkNext: function () { F.ws = addDays(F.ws, 7); render(); },
    wkPdf: function () { run(function () { return buildWeekPdf(wkIds(), F.ws); }, wkName('.pdf')); },
    wkShare: function () { run(function () { return buildWeekPdf(wkIds(), F.ws); }, wkName('.pdf'), true); },
    wkXls: function () { run(function () { return buildWeekExcel(wkIds(), F.ws); }, wkName('.xlsx')); },
    allInv: function () { run(function () { return buildAllInvoices(F.invYm); }, t('invoices') + ' ' + ymLabel(F.invYm) + '.pdf'); },
    allInvShare: function () { run(function () { return buildAllInvoices(F.invYm); }, t('invoices') + ' ' + ymLabel(F.invYm) + '.pdf', true); },
    monPdf: function () { run(function () { return buildMoneyPdf(F.from, F.to); }, t('money_report') + ' ' + periodFile() + '.pdf'); },
    monXls: function () { run(function () { return buildMoneyExcel(F.from, F.to); }, t('money_report') + ' ' + periodFile() + '.xlsx'); },
    blankForm: function (b) { getBlankForm(b.getAttribute('data-v'), false); },
    blankFormShare: function (b) { getBlankForm(b.getAttribute('data-v'), true); },
    regPull: function () { pullReg(F.regKid, false, F.regCat); },
    regPullShare: function () { pullReg(F.regKid, true, F.regCat); },
    pullReg: function (b, id) { pullReg(id, true, b.getAttribute('data-cat')); },
    viewReg: function (b, id) { viewReg(id); },
    rmReg: function (b, id) { rmReg(F.id, id); },
    attPdf: function () { run(function () { return buildAttPdf(F.from, F.to); }, t('attendance') + ' ' + periodFile() + '.pdf'); },
    careRange: function () { run(function () { return buildCareRangePdf(F.from, F.to, F.careKid); }, t('care_book') + ' ' + (F.careKid ? kidName(F.careKid) + ' ' : '') + periodFile() + '.pdf'); },
    careRangeShare: function () { run(function () { return buildCareRangePdf(F.from, F.to, F.careKid); }, t('care_book') + ' ' + (F.careKid ? kidName(F.careKid) + ' ' : '') + periodFile() + '.pdf', true); },
    attXls: function () { run(function () { return buildAttExcel(F.from, F.to); }, t('attendance') + ' ' + periodFile() + '.xlsx'); },
    diaryRange: function () { run(function () { return buildDiaryRangePdf(F.from, F.to); }, t('diary') + ' ' + periodFile() + '.pdf'); },
    incList: function () { run(function () { return buildIncListPdf(F.from, F.to); }, t('incidents') + ' ' + periodFile() + '.pdf'); },

    // settings
    finishSetup: finishSetup,
    logoRm: function () {
      if (confirmKey !== 'logoRm') { confirmKey = 'logoRm'; toast(t('tap_again_remove')); return; }
      D.settings.logo = ''; D.settings.logoW = D.settings.logoH = 0; confirmKey = ''; save(); render();
    },
    saveSettings: saveSettings,
    askNotify: function () {
      if (!('Notification' in window)) return;
      Notification.requestPermission().then(function (p) { if (p === 'granted') { notify('Dagsorg', t('notify_test')); } render(); });
    },
    icsRemind: function () { reminderIcs(); },
    gcalRemind: function () { reminderGoogle(); },
    delCat: function (b) {
      var n = b.getAttribute('data-v');
      if (confirmKey !== 'delCat' + n) { confirmKey = 'delCat' + n; return render(); }
      D.settings.cats.out = D.settings.cats.out.filter(function (x) { return x !== n; });
      confirmKey = ''; save(); render();
    },
    addCatSet: function () {
      var n = clean(F.newCat, 40);
      if (!n) return;
      if (!outCats().some(function (c) { return catLabel(c).toLowerCase() === n.toLowerCase(); })) D.settings.cats.out.push(n);
      F.newCat = ''; save(); toast(t('cat_added')); render();
    },
    backup: backup,
    applyRestore: applyRestore,
    cancelRestore: function () { pendingRestore = null; pendingMedia = {}; F.restoreN = null; render(); },
    wipe: wipe
  };
  function periodFile() { return F.from || F.to ? (F.from || '') + ' – ' + (F.to || '') : t('p_all'); }
  function openSign(id, dir) {
    var day = dayKey('day'), k = find('kids', id), list = people(k);
    var a = attOf(id, day);
    openSub('sign', { kid: id, dir: dir, date: day, time: day === today() ? nowHM() : (dir === 'in' ? '07:00' : D.settings.closeTime), by: list.length === 1 ? list[0].key : (dir === 'out' && a && a.inBy ? '' : ''), color: dir === 'in' ? '#06c167' : '#3a86ff' });
  }

  function showMedia(id, type) {
    var v = document.createElement('div');
    v.className = 'viewer';
    v.innerHTML = (type === 'video' ? '<video controls autoplay playsinline></video>' : '<img alt="">') + '<button class="icon round close" aria-label="' + esc(t('close')) + '">✕</button>';
    mediaUrl(id).then(function (u) { if (u) v.firstChild.src = u; });
    v.addEventListener('click', function (e) { if (e.target === v || e.target.classList.contains('close') || e.target.tagName === 'IMG') v.remove(); });
    document.body.appendChild(v);
  }

  /* ================================================================ */
  /* Events                                                            */
  /* ================================================================ */
  document.addEventListener('input', function (e) {
    var el = e.target;
    if (el.id === 'ksearch') {
      LS.q = el.value;
      var pos = el.selectionStart;
      render();
      var n = document.getElementById('ksearch'); n.focus(); try { n.setSelectionRange(pos, pos); } catch (x) {}
      return;
    }
    var k = el.getAttribute && el.getAttribute('data-k');
    if (!k || !F || el.type === 'checkbox' || el.tagName === 'SELECT') return;
    F[k] = el.value;
    if (V === 'moneyForm' && k === 'amt') { var bi = document.getElementById('balInfo'); if (bi) bi.innerHTML = balInfo(); }
  });
  document.addEventListener('change', function (e) {
    var el = e.target;
    if (el.id === 'restoreFile') { restoreFile(el.files && el.files[0]); el.value = ''; return; }
    if (el.id === 'logoIn') { if (el.files && el.files[0]) setLogo(el.files[0]); el.value = ''; return; }
    if (el.getAttribute('data-media')) { addMediaFiles(el.files); el.value = ''; return; }
    if (el.getAttribute('data-reg')) { addRegFiles(el.getAttribute('data-reg'), el.files, el.getAttribute('data-cat')); el.value = ''; return; }
    var pk = el.getAttribute('data-photo');
    if (pk && F) {
      var file = el.files && el.files[0], f0 = F;
      el.value = '';
      if (!file) return;
      shrinkPhoto(file).then(function (b) {
        var id = uid();
        return mediaPut(id, b).then(function () {
          var old = f0[pk], i = (f0.added || []).indexOf(old);
          if (old && i > -1) { f0.added.splice(i, 1); mediaDel(old); }
          f0[pk] = id; (f0.added = f0.added || []).push(id);
          if (F === f0) render();
          toast(t('photo_added'));
        });
      }).catch(function () { toast(t('err_photo')); });
      return;
    }
    var dk = el.getAttribute('data-day');
    if (dk) { if (el.value) LS[dk] = el.value === today() ? null : el.value; render(); return; }
    var k = el.getAttribute && el.getAttribute('data-k');
    if (!k || !F) return;
    if (el.type === 'checkbox') F[k] = el.checked; else F[k] = el.value;
    if (V === 'moneyForm' && k === 'kid' && !F.id) { var kk = find('kids', F.kid); F.payer = kk ? parentName(kk.p1) : ''; }
    if (V === 'reports' && (k === 'from' || k === 'to')) F.preset = -1;
    if (el.getAttribute('data-rr')) { if (pressing) pendingRR = true; else render(); }
  });
  // A field that redraws the screen when it changes must not redraw it in the middle of a tap on a button
  // (the field loses focus on the press, and the redraw would swallow the tap): wait until the tap is done.
  var pressing = false, pendingRR = false;
  document.addEventListener('pointerdown', function () { pressing = true; }, true);
  function released() { setTimeout(function () { pressing = false; if (pendingRR) { pendingRR = false; render(); } }, 0); }
  document.addEventListener('pointerup', released, true);
  document.addEventListener('pointercancel', released, true);
  document.addEventListener('click', function (e) {
    var chip = e.target.closest('[data-chip]');
    if (chip && F) {
      var k = chip.getAttribute('data-chip'), v = chip.getAttribute('data-v');
      F[k] = chip.getAttribute('data-toggle') && String(F[k]) === v ? '' : v;
      if (k === 'lang') { D.settings.lang = F.lang; if (D.settings.setup) save(); }
      if (k === 'feeType' && F.fee === '') F.fee = '';
      if (k === 'linkRole') confirmKey = '';
      F.err = '';
      return render();
    }
    var mul = e.target.closest('[data-multi]');
    if (mul && F) {
      var mk = mul.getAttribute('data-multi'), mv = mul.getAttribute('data-v'), arr = F[mk] || (F[mk] = []), i = arr.indexOf(mv);
      if (i > -1) arr.splice(i, 1); else arr.push(mv);
      F.err = '';
      return render();
    }
    var pre = e.target.closest('[data-preset]');
    if (pre && F) {
      var p = presets()[+pre.getAttribute('data-preset')];
      F.preset = +pre.getAttribute('data-preset'); F.from = p[1]; F.to = p[2];
      return render();
    }
    var b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    if (b.tagName === 'A') e.preventDefault();
    var act = b.getAttribute('data-act');
    var keep = /^(del|wipe|unlink|linkKid|logoRm|rmReg)/.test(act);
    if (!keep) confirmKey = '';
    if (ACT[act]) ACT[act](b, b.getAttribute('data-id'));
  });

  /* Install button (Android Chrome / desktop Chrome & Edge) */
  var installEvt = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); installEvt = e;
    var b = document.getElementById('installBtn'); if (b) b.classList.remove('hidden');
  });
  function doInstall() {
    if (!installEvt) return;
    installEvt.prompt();
    installEvt.userChoice.finally(function () {
      installEvt = null;
      var b = document.getElementById('installBtn'); if (b) b.classList.add('hidden');
    });
  }
  window.addEventListener('appinstalled', function () { toast(t('installed')); });

  /* Offline support */
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }

  /* Monthly fees and the diary reminder: checked when the app opens, comes back to the front, and every minute */
  function tick() {
    if (!D || !D.settings.setup) return;
    if (postFees()) { save(); if (isTab(V)) render(); }
    checkReminder();
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible' || !D) return;
    tick();
    if (V === 'today' || V === 'care') render();
  });
  setInterval(tick, 60000);

  /* ================================================================ */
  /* Start                                                             */
  /* ================================================================ */
  loadData().then(function (d) {
    D = normalise(d);
    history.replaceState({ root: 1 }, '');
    if (D.settings.setup && postFees()) save();
    render();
    tick();
  });

  // for automated tests only
  window.__DS = { get: function () { return D; }, set: function (d) { D = normalise(d); save(); render(); },
    week: function (ids, ws) { return buildWeekPdf(ids, ws); }, inv: function (kid, ym) { return buildInvoicePdf(invoiceFor(kid, ym)); },
    inc: function (id) { return buildIncPdf(id); }, care: function (kid, d) { return buildCarePdf(kid, d); }, money: function (f, tt) { return buildMoneyPdf(f, tt); },
    moneyX: function (f, tt) { return buildMoneyExcel(f, tt); }, diary: function (id) { return buildDiaryPdf(id); }, allInv: function (ym) { return buildAllInvoices(ym); },
    fine: fineFor, i18n: function () { return I18N; } };
})();
