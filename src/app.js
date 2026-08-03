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

  // Any {LETTER} prefix maps to its own ordered base list, so a tier can live in a
  // separate repo and be repointed — or lost — without touching the rest of the library.
  function resolve(url) {
    var s = String(url || '');
    var m = s.match(/^\{([A-Z])\}/);
    if (!m) return s;
    var list = CDN[m[1]] || [''];
    var base = list[Math.min(mirror, list.length - 1)] || list[0] || '';
    return s.replace(/^\{[A-Z]\}/, base);
  }

  // Covers fall through the base list independently — one dead CDN shouldn't blank the grid.
  // `card` (optional) has its .noart class cleared only once an image really loads.
  function coverFallback(img, url, i, card) {
    var list = CDN.C || [];
    if (i >= list.length) { img.removeAttribute('src'); return; }
    img.onerror = function () { coverFallback(img, url, i + 1, card); };
    img.onload = function () { if (card) card.classList.remove('noart'); };
    img.src = String(url).replace(/^\{[A-Z]\}/, list[i]);
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

  // Inside a series folder the prefix is redundant and eats both title lines:
  // "Friday Night Funkin': Mistful Crimson Morning" -> "Mistful Crimson Morning".
  // Only strip when an explicit separator follows the series name. Without that guard
  // "Slope 2" collapses to "2" and "Sonic the Hedgehog 2" to "the Hedgehog 2".
  function shortTitle(title, colTitle) {
    if (!colTitle) return title;
    var t = title.replace(/^\s+/, '');
    if (t.toLowerCase().indexOf(colTitle.toLowerCase()) !== 0) return title;
    var tail = t.slice(colTitle.length);
    var m = tail.match(/^\s*[:–—-]\s*(.+)$/);
    return m && m[1].length > 2 ? m[1] : title;
  }

  var eagerBudget = 0;

  function card(g, colTitle) {
    var el = document.createElement('button');
    el.className = 'card noart';
    el.setAttribute('role', 'listitem');
    el.title = g.title;                       // full name always available on hover
    el.style.background = tint(g.id);

    var ini = document.createElement('div');
    ini.className = 'init';
    ini.textContent = initials(g.title);
    el.appendChild(ini);

    var img = document.createElement('img');
    // With 600+ lazy images the browser defers nearly all of them and the first screen
    // paints empty. Load the first rows eagerly; everything below stays lazy.
    img.loading = eagerBudget-- > 0 ? 'eager' : 'lazy';
    img.decoding = 'async';
    img.alt = '';
    if (g.cover) coverFallback(img, g.cover, Math.min(mirror, (CDN.C || []).length - 1), el);

    var t = document.createElement('div');
    t.className = 't';
    t.textContent = shortTitle(g.title, colTitle);

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
    img.loading = eagerBudget-- > 0 ? 'eager' : 'lazy';
    img.decoding = 'async'; img.alt = '';
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
    eagerBudget = 30;
    $('#crumb').hidden = true;
    // The hero is a front-page thing — it has no business sitting above search results.
    var heroHidden = !!(query || tag || openCol);
    $('#hero').style.display = heroHidden ? 'none' : '';
    if (heroHidden) stopHeroTimer(); else startHeroTimer();

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
      var ct = colById[openCol].title;
      inCol(openCol).forEach(function (g) { grid.appendChild(card(g, ct)); });
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

    // Credit the original developer AND the porter. Getting a big engine game running
    // in a browser is real work, and we neutralise the watermark links inside the games
    // themselves — so the credit has to live here instead.
    var by = $('#p-by');
    by.textContent = '';
    if (g.author) {
      by.appendChild(document.createTextNode('by '));
      if (g.authorLink) {
        var a = document.createElement('a');
        a.href = g.authorLink; a.target = '_blank'; a.rel = 'noopener noreferrer';
        a.textContent = g.author;
        by.appendChild(a);
      } else {
        by.appendChild(document.createTextNode(g.author));
      }
    }
    if (g.porter) {
      var sep = document.createElement('span');
      sep.className = 'porter';
      sep.textContent = (g.author ? ' · ' : '') + 'web port by ' + g.porter;
      by.appendChild(sep);
    }

    $('#player').hidden = false;
    stopHeroTimer();
    syncFavBtn();
    launch(g);
  }

  /* ---------- launching a game ----------
   * Games are fetched and written into a src-less iframe rather than navigated to.
   * A filter that categorises or logs URLs never sees the asset host at all, because
   * no navigation happens — only an XHR and its subresources. The cost is that the
   * written document is same-origin with us; we hold nothing sensitive, so that's an
   * acceptable trade for now (revisit if accounts ever land).
   *
   * Falls back to a plain iframe src when fetch can't work — notably file://, where
   * the offline build runs and cross-origin fetch is blocked.
   */
  function candidates(url) {
    var s = String(url || '');
    var m = s.match(/^\{([A-Z])\}/);
    if (!m) return [s];
    var list = CDN[m[1]] || [''];
    var i = Math.min(mirror, list.length - 1);
    // start from the user's chosen mirror, then try the others
    return list.slice(i).concat(list.slice(0, i))
      .map(function (b) { return s.replace(/^\{[A-Z]\}/, b); });
  }

  // A document written into a blank iframe resolves relative URLs against OUR origin,
  // so it must carry an absolute <base> pointing at its own directory.
  function withBase(html, abs) {
    var dir = abs.slice(0, abs.lastIndexOf('/') + 1);
    var tag = '<base href="' + dir + '">';
    if (/<base\b[^>]*>/i.test(html)) return html.replace(/<base\b[^>]*>/i, tag);
    if (/<head[^>]*>/i.test(html)) return html.replace(/<head([^>]*)>/i, '<head$1>' + tag);
    return tag + html;
  }

  function freshFrame() {
    var old = $('#p-frame');
    var f = document.createElement('iframe');
    f.id = 'p-frame';
    f.title = 'Game';
    f.setAttribute('allow', 'autoplay; fullscreen; gamepad; pointer-lock');
    f.setAttribute('allowfullscreen', '');
    // Ported games often carry the porter's watermark and a link back to the site they
    // were built for. The credit stays — it's earned — but the link shouldn't be able to
    // navigate our users away. Omitting allow-top-navigation and allow-popups blocks that
    // in the browser itself; allow-same-origin is kept so localStorage (game saves) works.
    f.setAttribute('sandbox',
      'allow-same-origin allow-scripts allow-forms allow-modals allow-pointer-lock allow-orientation-lock');
    old.parentNode.replaceChild(f, old);
    return f;
  }

  function writeInto(html) {
    var f = freshFrame();
    var doc = f.contentDocument;
    doc.open();
    doc.write(html);
    doc.close();
  }

  var launchToken = 0;

  function launch(g) {
    var token = ++launchToken;
    var urls = candidates(g.src);

    // file:// can't fetch cross-origin — the offline build navigates instead.
    if (location.protocol === 'file:' || typeof fetch !== 'function') {
      freshFrame().src = urls[0];
      return;
    }

    var i = 0;
    (function attempt() {
      if (token !== launchToken) return;             // a newer launch superseded this
      if (i >= urls.length) { freshFrame().src = urls[0]; return; }   // last resort
      var url = urls[i++];
      fetch(url + (url.indexOf('?') < 0 ? '?t=' : '&t=') + Date.now())
        .then(function (r) { return r.ok ? r.text() : Promise.reject(r.status); })
        .then(function (html) {
          // jsDelivr answers 200 with this body for a missing file
          if (/^\s*Couldn't find the requested file/i.test(html)) return Promise.reject('404-body');
          if (token !== launchToken) return;
          writeInto(withBase(html, url));
        })
        .catch(function () { attempt(); });
    })();
  }

  function closePlayer() {
    $('#player').hidden = true;
    startHeroTimer();
    launchToken++;                 // cancel any in-flight fetch
    freshFrame();                  // tear the game down: kills audio, loops, timers
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

  /* ---------- hero carousel ---------- */
  var heroGame = null;
  var heroIdx = 0;
  var heroTimer = null;
  var HERO_MS = 5000;

  var HEROES = (function () {
    var pool = GAMES.filter(function (g) { return g.hero; })
      .sort(function (a, b) { return a.hero - b.hero; });
    if (!pool.length) pool = GAMES.filter(function (g) { return g.pick; });
    if (!pool.length) pool = GAMES.slice(0, 1);
    return pool;
  })();

  function randomGame() {
    return GAMES[Math.floor(Math.random() * GAMES.length)] || null;
  }

  function paintHero(g) {
    heroGame = g;
    if (!g) { $('#hero').style.display = 'none'; return; }
    var art = $('#hero-art');
    art.style.background = tint(g.id);
    art.textContent = '';

    var shot = $('#hero-shot');
    shot.textContent = '';

    if (g.cover) {
      var img = document.createElement('img');
      img.alt = ''; img.decoding = 'async';
      coverFallback(img, g.cover, 0);
      art.appendChild(img);

      var sharp = document.createElement('img');
      sharp.alt = ''; sharp.decoding = 'async';
      coverFallback(sharp, g.cover, 0);
      shot.appendChild(sharp);
    }

    $('#hero-title').textContent = g.title;
    var bits = [];
    if (g.author) bits.push(g.author);
    if (g.porter) bits.push('web port by ' + g.porter);
    if (g.tags && g.tags.length) bits.push(g.tags.join(' · '));
    $('#hero-meta').textContent = bits.join('  —  ');
  }

  function paintDots() {
    var wrap = $('#hero-dots');
    if (HEROES.length < 2) { wrap.hidden = true; return; }
    wrap.hidden = false;
    if (wrap.childNodes.length !== HEROES.length) {
      wrap.textContent = '';
      HEROES.forEach(function (g, i) {
        var b = document.createElement('button');
        b.className = 'dot';
        b.setAttribute('aria-label', 'Show ' + g.title);
        b.onclick = function () { showHero(i, true); };
        wrap.appendChild(b);
      });
    }
    Array.prototype.forEach.call(wrap.childNodes, function (b, i) {
      b.classList.toggle('on', i === heroIdx);
      b.setAttribute('aria-current', i === heroIdx ? 'true' : 'false');
    });
  }

  function showHero(i, manual) {
    if (!HEROES.length) return;
    heroIdx = ((i % HEROES.length) + HEROES.length) % HEROES.length;
    paintHero(HEROES[heroIdx]);
    paintDots();
    if (manual) startHeroTimer();          // a manual move restarts the dwell
  }

  function startHeroTimer() {
    stopHeroTimer();
    if (HEROES.length < 2) return;
    // Don't animate for people who asked not to.
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    heroTimer = setInterval(function () { showHero(heroIdx + 1); }, HERO_MS);
  }
  function stopHeroTimer() { if (heroTimer) { clearInterval(heroTimer); heroTimer = null; } }

  $('#hero-prev').onclick = function () { showHero(heroIdx - 1, true); };
  $('#hero-next').onclick = function () { showHero(heroIdx + 1, true); };

  // Pause while the pointer is over it — nothing worse than the banner moving mid-click.
  $('#hero').addEventListener('mouseenter', stopHeroTimer);
  $('#hero').addEventListener('mouseleave', function () {
    if (!$('#player').hidden) return;
    if ($('#hero').style.display !== 'none') startHeroTimer();
  });

  $('#hero-play').onclick = function () { if (heroGame) play(heroGame); };
  $('#hero-rand').onclick = function () { stopHeroTimer(); paintHero(randomGame()); };

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

  // "classroom.google.com" without a scheme is treated as a RELATIVE path by
  // location.replace, so the panic key silently does nothing. Assume https.
  function normalizeUrl(u) {
    u = String(u || '').trim();
    if (!u) return '';
    if (u.indexOf('://') > 0) return u;                       // http://, https://, …
    if (/^(about|chrome|edge|mailto|data|file):/i.test(u)) return u;
    if (u.indexOf('//') === 0) return 'https:' + u;
    // NB: a bare "host:port" must NOT be mistaken for a scheme.
    return 'https://' + u;
  }

  function panicUrl() { return normalizeUrl(get('panic', '')); }

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
  // show what will actually be navigated to, so the scheme isn't a hidden surprise
  $('#s-panic').onblur = function (e) {
    var n = normalizeUrl(e.target.value);
    if (n && n !== e.target.value) { e.target.value = n; set('panic', n); }
  };

  /* ---------- rebindable panic key ---------- */
  var panicKey = get('panicKey', '`');
  var capturing = false;

  function keyLabel(k) {
    if (k === ' ') return 'Space';
    if (k === 'Escape') return 'Esc';
    if (k && k.length === 1) return k.toUpperCase();
    return k || '—';
  }
  function drawKey() {
    $('#s-panickey').textContent = capturing ? 'Press a key…' : keyLabel(panicKey);
    $('#s-panickey').classList.toggle('listening', capturing);
  }
  $('#s-panickey').onclick = function () { capturing = true; drawKey(); };
  drawKey();

  // about:blank cloak — reopens this page inside a blank tab so the URL never hits history.
  $('#s-blank').onclick = function () {
    var w = window.open('about:blank', '_blank');
    if (!w) { alert('Allow popups for this site, then try again.'); return; }
    var f = w.document.createElement('iframe');
    f.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0';
    f.src = location.href;
    w.document.body.style.margin = '0';
    w.document.body.appendChild(f);
    location.replace(panicUrl() || 'https://www.google.com');
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
    // Rebinding swallows the next keypress, whatever it is.
    if (capturing) {
      e.preventDefault();
      capturing = false;
      if (e.key !== 'Escape') { panicKey = e.key; set('panicKey', panicKey); }
      drawKey();
      return;
    }

    var typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
    if (e.key === panicKey && !typing) {
      var p = panicUrl();
      if (p) { e.preventDefault(); location.replace(p); }
    }
    if (e.key === 'Escape' && !$('#player').hidden) closePlayer();
    if (e.key === '/' && !typing) { e.preventDefault(); $('#q').focus(); }
  };

  /* ---------- footer + legal ---------- */
  var SITE = window.SURD_SITE || {};

  var DOCS = {
    dmca: {
      title: 'DMCA / takedown',
      html: '<p>If you hold the rights to something hosted here and want it removed, email ' +
        '<b>{CONTACT}</b> and it will be taken down. No form, no lawyer required.</p>' +
        '<p>Please include the title as it appears on this site, and a line confirming you ' +
        'represent the rights holder. Removals are usually done the same day.</p>' +
        '<p>Games are community web ports. Where a porter is known they are credited on the ' +
        'game screen alongside the original developer.</p>'
    },
    privacy: {
      title: 'Privacy',
      html: '<p>There are no accounts, no analytics, no trackers and no cookies. ' +
        'Nothing you do here is sent to a server we control.</p>' +
        '<p>Favourites, recently played, settings and game saves live in your browser\'s ' +
        'local storage on this device only. Clearing site data in Settings erases all of it.</p>' +
        '<p>Games are fetched from public file hosts, which see the request the same way any ' +
        'website does. Individual games may store their own progress locally.</p>'
    }
  };

  function openDoc(k) {
    var d = DOCS[k];
    if (!d) return;
    $('#doc-title').textContent = d.title;
    $('#doc-body').innerHTML = d.html.replace(/\{CONTACT\}/g, SITE.contact || 'the site owner');
    $('#doc').hidden = false;
  }
  function closeDoc() { $('#doc').hidden = true; }

  Array.prototype.forEach.call(document.querySelectorAll('.flink[data-doc]'), function (b) {
    b.onclick = function () { openDoc(b.dataset.doc); };
  });
  $('#doc-close').onclick = closeDoc;
  $('#doc').onclick = function (e) { if (e.target === $('#doc')) closeDoc(); };

  (function () {
    // Hide any link we don't actually have, so no dead entry ever ships.
    // Null-guarded: a variant build may ship a different footer, and one missing
    // element must never throw and take the whole app down with it.
    function link(sel, href) {
      var el = $(sel);
      if (!el || !href) return;
      el.href = href;
      el.hidden = false;
    }
    link('#foot-discord', SITE.discord);
    link('#foot-github', SITE.github);
    link('#foot-contact', SITE.contact ? 'mailto:' + SITE.contact : '');
  })();

  /* ---------- go ---------- */
  applyCloak();
  showHero(0);
  startHeroTimer();
  renderTags();
  renderGrid();
  $('#build').textContent = GAMES.length + ' games · build ' + (window.SURD_BUILD || 'dev');
  $('#foot-count').textContent = GAMES.length + ' games · ' + COLS.length + ' series' +
    (SITE.tagline ? ' · ' + SITE.tagline : '');
  $('#q').placeholder = 'Search ' + GAMES.length + ' games';
})();
