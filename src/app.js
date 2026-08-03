/* surd shell — classic script, no modules (must run from file:// for the offline loader) */
(function () {
  'use strict';

  var GAMES = (window.SURD_GAMES || []).slice();
  var K = 'surd.';
  var $ = function (s) { return document.querySelector(s); };

  /* ---------- storage (localStorage works on file:// too) ---------- */
  function get(k, d) {
    try { var v = localStorage.getItem(K + k); return v === null ? d : JSON.parse(v); }
    catch (e) { return d; }
  }
  function set(k, v) {
    try { localStorage.setItem(K + k, JSON.stringify(v)); } catch (e) {}
  }

  var favs = get('favs', []);
  var recents = get('recents', []);

  /* ---------- CDN indirection ----------
   * Manifest URLs are stored as {A}/… and {C}/… and resolved here against an ordered
   * list of bases. A CDN can ban an account overnight (jsDelivr did exactly that to the
   * biggest site in this category), so switching mirrors must never require a rebuild.
   */
  var CDN = window.SURD_CDN || { A: [''], C: [''] };
  var mirror = get('mirror', 0);

  function resolve(url, kind) {
    var list = CDN[kind] || [''];
    var base = list[Math.min(mirror, list.length - 1)] || list[0] || '';
    return String(url || '').replace(/^\{[AC]\}/, base);
  }

  // Covers fall through the base list independently — one dead CDN shouldn't blank the grid.
  // `card` (optional) has its .noart class cleared only once an image really loads.
  function coverFallback(img, url, i, card) {
    var list = CDN.C || [];
    if (i >= list.length) { img.removeAttribute('src'); return; }
    img.onerror = function () { coverFallback(img, url, i + 1, card); };
    img.onload = function () { if (card) card.classList.remove('noart'); };
    img.src = String(url).replace(/^\{C\}/, list[i]);
  }

  /* ---------- state ---------- */
  var query = '';
  var tag = null;
  var openCol = null;                       // currently opened series folder

  var COLS = window.SURD_COLS || [];
  var colById = {};
  COLS.forEach(function (c) { colById[c.id] = c; });

  function inCol(id) {
    return GAMES.filter(function (g) { return g.col === id; });
  }

  /* ---------- tag bar ---------- */
  var counts = {};
  GAMES.forEach(function (g) {
    (g.tags || []).forEach(function (t) { counts[t] = (counts[t] || 0) + 1; });
  });
  var topTags = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).slice(0, 14);

  function renderTags() {
    var el = $('#tags');
    el.textContent = '';
    topTags.forEach(function (t) {
      var b = document.createElement('button');
      b.textContent = t;
      if (t === tag) b.className = 'on';
      b.onclick = function () { tag = (tag === t ? null : t); renderTags(); renderGrid(); };
      el.appendChild(b);
    });
  }

  /* ---------- grid ---------- */
  function matches(g) {
    if (tag && (g.tags || []).indexOf(tag) < 0) return false;
    if (!query) return true;
    return g.title.toLowerCase().indexOf(query) >= 0 ||
           (g.tags || []).join(' ').indexOf(query) >= 0;
  }

  // Stable flat colour per game so a missing cover still looks designed, not broken.
  function tint(id) {
    var h = 0;
    for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
    return 'hsl(' + h + ' 32% 20%)';
  }

  function initials(title) {
    var w = title.replace(/[^a-z0-9 ]/gi, ' ').trim().split(/\s+/);
    return ((w[0] || '?')[0] + (w.length > 1 ? w[1][0] : '')).toUpperCase();
  }

  function card(g) {
    var el = document.createElement('button');
    el.className = 'card noart';
    el.setAttribute('role', 'listitem');
    el.style.background = tint(g.id);

    var ini = document.createElement('div');
    ini.className = 'init';
    ini.textContent = initials(g.title);
    el.appendChild(ini);

    var img = document.createElement('img');
    img.loading = 'lazy';
    img.decoding = 'async';
    img.alt = '';
    if (g.cover) coverFallback(img, g.cover, Math.min(mirror, (CDN.C || []).length - 1), el);

    var t = document.createElement('div');
    t.className = 't';
    t.textContent = g.title;

    var f = document.createElement('button');
    f.className = 'fav' + (favs.indexOf(g.id) >= 0 ? ' on' : '');
    f.textContent = '★';
    f.title = 'Favorite';
    f.onclick = function (e) { e.stopPropagation(); toggleFav(g.id); };

    el.appendChild(img); el.appendChild(t); el.appendChild(f);
    el.onclick = function () { play(g); };
    return el;
  }

  // One card standing in for a whole series. Cover comes from the best-known member.
  function colCard(c) {
    var members = inCol(c.id);
    var face = members.filter(function (g) { return g.pick; })[0] || members[0];
    var el = document.createElement('button');
    el.className = 'card col noart';
    el.setAttribute('role', 'listitem');
    el.style.background = tint(c.id);

    var ini = document.createElement('div');
    ini.className = 'init';
    ini.textContent = initials(c.title);
    el.appendChild(ini);

    var img = document.createElement('img');
    img.loading = 'lazy'; img.decoding = 'async'; img.alt = '';
    if (face && face.cover) coverFallback(img, face.cover, 0, el);

    var t = document.createElement('div');
    t.className = 't';
    t.textContent = c.title;

    var n = document.createElement('div');
    n.className = 'n';
    // stacked-layers glyph — signals "several games behind this card"
    n.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7"' +
      ' stroke-linejoin="round"><path d="M8 1.7 14.5 5 8 8.3 1.5 5 8 1.7Z"/>' +
      '<path d="M1.5 8.2 8 11.5l6.5-3.3"/></svg>';
    n.appendChild(document.createTextNode(String(members.length)));

    el.appendChild(img); el.appendChild(t); el.appendChild(n);
    el.onclick = function () { openCol = c.id; renderGrid(); window.scrollTo(0, 0); };
    return el;
  }

  function section(title, list, grid) {
    if (!list.length) return;
    var h = document.createElement('h2');
    h.textContent = title;
    h.style.gridColumn = '1/-1';
    grid.appendChild(h);
    list.forEach(function (g) { grid.appendChild(card(g)); });
  }

  function byId(id) {
    for (var i = 0; i < GAMES.length; i++) if (GAMES[i].id === id) return GAMES[i];
    return null;
  }

  function renderGrid() {
    var grid = $('#grid');
    grid.textContent = '';
    $('#crumb').hidden = true;
    // The hero is a front-page thing — it has no business sitting above search results.
    $('#hero').style.display = (query || tag || openCol) ? 'none' : '';

    // Search and tag filters go through EVERYTHING, flat. If you know what you want,
    // folders should never stand between you and it.
    if (query || tag) {
      var flat = GAMES.filter(matches);
      $('#empty').hidden = flat.length > 0;
      flat.forEach(function (g) { grid.appendChild(card(g)); });
      return;
    }

    // Inside a folder: just that series.
    if (openCol && colById[openCol]) {
      var crumb = $('#crumb');
      crumb.hidden = false;
      $('#crumb-title').textContent = colById[openCol].title;
      $('#empty').hidden = true;
      inCol(openCol).forEach(function (g) { grid.appendChild(card(g)); });
      return;
    }

    $('#empty').hidden = true;

    section('Favorites', favs.map(byId).filter(Boolean), grid);
    section('Recent', recents.map(byId).filter(Boolean).slice(0, 8), grid);

    // Hand-picked first — the whole point of curating 677 games.
    var picks = GAMES.filter(function (g) { return g.pick; });
    section('Picks', picks, grid);

    // Everything else: series collapse into one card each, standalone games stay as-is.
    var rest = [];
    var usedCols = {};
    GAMES.forEach(function (g) {
      if (g.pick) return;
      if (g.col && colById[g.col]) {
        if (!usedCols[g.col]) { usedCols[g.col] = true; rest.push(colById[g.col]); }
      } else {
        rest.push(g);
      }
    });

    if (picks.length || favs.length || recents.length) {
      var h = document.createElement('h2');
      h.textContent = 'All games';
      h.style.gridColumn = '1/-1';
      grid.appendChild(h);
    }
    rest.forEach(function (x) {
      grid.appendChild(x.n !== undefined && x.title && !x.src ? colCard(x) : card(x));
    });
  }

  function toggleFav(id) {
    var i = favs.indexOf(id);
    if (i >= 0) favs.splice(i, 1); else favs.push(id);
    set('favs', favs);
    renderGrid();
    if (current && current.id === id) syncFavBtn();
  }

  /* ---------- player ---------- */
  var current = null;

  function play(g) {
    current = g;
    recents = [g.id].concat(recents.filter(function (x) { return x !== g.id; })).slice(0, 12);
    set('recents', recents);

    $('#p-title').textContent = g.title;

    // Credit the original developer — cheap goodwill, and it matters if one ever complains.
    var by = $('#p-by');
    by.textContent = '';
    if (g.author) {
      if (g.authorLink) {
        var a = document.createElement('a');
        a.href = g.authorLink; a.target = '_blank'; a.rel = 'noopener noreferrer';
        a.textContent = g.author;
        by.appendChild(document.createTextNode('by '));
        by.appendChild(a);
      } else {
        by.textContent = 'by ' + g.author;
      }
    }

    $('#p-frame').src = resolve(g.src, 'A');
    $('#player').hidden = false;
    syncFavBtn();
  }

  function closePlayer() {
    $('#player').hidden = true;
    $('#p-frame').src = 'about:blank';
    current = null;
    renderGrid();
  }

  function syncFavBtn() {
    var on = current && favs.indexOf(current.id) >= 0;
    var b = $('#p-fav');
    b.textContent = on ? '★' : '☆';
    b.style.color = on ? '#ffd05a' : '';
  }

  $('#p-back').onclick = closePlayer;
  $('#p-fav').onclick = function () { if (current) toggleFav(current.id); };
  $('#p-full').onclick = function () {
    var f = $('#p-frame');
    if (f.requestFullscreen) f.requestFullscreen();
  };

  /* ---------- hero ---------- */
  var heroGame = null;

  function pickHero() {
    var pool = GAMES.filter(function (g) { return g.pick; });
    if (!pool.length) pool = GAMES;
    return pool[Math.floor(Math.random() * pool.length)] || null;
  }

  function renderHero(g) {
    heroGame = g;
    if (!g) { $('#hero').style.display = 'none'; return; }
    var art = $('#hero-art');
    art.style.background = tint(g.id);
    art.textContent = '';

    if (g.cover) {
      var img = document.createElement('img');
      img.alt = ''; img.decoding = 'async';
      coverFallback(img, g.cover, 0);
      art.appendChild(img);
    }

    $('#hero-title').textContent = g.title;
    var bits = [];
    if (g.author) bits.push(g.author);
    if (g.tags && g.tags.length) bits.push(g.tags.join(' · '));
    $('#hero-meta').textContent = bits.join('  —  ');
  }

  $('#hero-play').onclick = function () { if (heroGame) play(heroGame); };
  $('#hero-rand').onclick = function () { renderHero(pickHero()); };

  /* ---------- tabs ---------- */
  Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (b) {
    b.onclick = function () {
      Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (x) {
        x.classList.toggle('on', x === b);
      });
      Array.prototype.forEach.call(document.querySelectorAll('.view'), function (v) {
        v.classList.toggle('on', v.id === 'view-' + b.dataset.tab);
      });
    };
  });

  /* ---------- search ---------- */
  $('#q').oninput = function (e) {
    query = e.target.value.trim().toLowerCase();
    if (query) openCol = null;
    renderGrid();
  };

  $('#crumb-back').onclick = function () { openCol = null; renderGrid(); };

  /* ---------- cloaking ---------- */
  function applyCloak() {
    var t = get('cloakTitle', '');
    var i = get('cloakIcon', '');
    if (t) document.title = t;
    if (i) {
      var link = document.querySelector('link[rel=icon]');
      if (link) link.href = i;
    }
  }

  $('#s-title').value = get('cloakTitle', '');
  $('#s-icon').value = get('cloakIcon', '');
  $('#s-panic').value = get('panic', '');

  $('#s-title').oninput = function (e) { set('cloakTitle', e.target.value); applyCloak(); };
  $('#s-icon').oninput = function (e) { set('cloakIcon', e.target.value); applyCloak(); };
  $('#s-panic').oninput = function (e) { set('panic', e.target.value); };

  // about:blank cloak — reopens this page inside a blank tab so the URL never hits history.
  $('#s-blank').onclick = function () {
    var w = window.open('about:blank', '_blank');
    if (!w) { alert('Allow popups for this site, then try again.'); return; }
    var f = w.document.createElement('iframe');
    f.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0';
    f.src = location.href;
    w.document.body.style.margin = '0';
    w.document.body.appendChild(f);
    location.replace(get('panic', '') || 'https://www.google.com');
  };

  /* ---------- mirror switcher ---------- */
  (function () {
    var sel = $('#s-mirror');
    (CDN.A || []).forEach(function (base, i) {
      var o = document.createElement('option');
      o.value = i;
      // Show the host only — the full URL is noise.
      o.textContent = (base.split('/')[2] || base) + (i === 0 ? ' (default)' : '');
      sel.appendChild(o);
    });
    sel.value = Math.min(mirror, (CDN.A || []).length - 1);
    sel.onchange = function () {
      mirror = +sel.value;
      set('mirror', mirror);
      renderGrid();
    };
  })();

  $('#s-clear').onclick = function () {
    if (!confirm('Clear favorites, history and settings?')) return;
    Object.keys(localStorage)
      .filter(function (k) { return k.indexOf(K) === 0; })
      .forEach(function (k) { localStorage.removeItem(k); });
    location.reload();
  };

  /* ---------- keys ---------- */
  document.onkeydown = function (e) {
    var typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
    if (e.key === '`' && !typing) {
      var p = get('panic', '');
      if (p) { e.preventDefault(); location.replace(p); }
    }
    if (e.key === 'Escape' && !$('#player').hidden) closePlayer();
    if (e.key === '/' && !typing) { e.preventDefault(); $('#q').focus(); }
  };

  /* ---------- go ---------- */
  applyCloak();
  renderHero(pickHero());
  renderTags();
  renderGrid();
  $('#build').textContent = GAMES.length + ' games · build ' + (window.SURD_BUILD || 'dev');
  $('#foot-count').textContent = GAMES.length + ' games · ' + COLS.length + ' series · no ads · no tracking';
})();
