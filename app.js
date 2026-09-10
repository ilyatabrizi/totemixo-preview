/* TOTEM IXO — mechanical snap. Tight stagger, scale only, no drift. */
(function(){
  var io=null,failsafe=null;
  var STEP=30, DUR=300, EASE='cubic-bezier(.16,.86,.24,1)';
  function reveal(){
    if(!('IntersectionObserver' in window))return;
    if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    if(!io){
      io=new IntersectionObserver(function(es){
        var n=0;
        es.forEach(function(e){
          if(!e.isIntersecting)return;
          var el=e.target; io.unobserve(el);
          setTimeout(function(){el.style.opacity='1';el.style.transform='none';},(n++)*STEP);
        });
      },{rootMargin:'0px 700px -4% 700px',threshold:.01});
    }
    [].forEach.call(document.querySelectorAll('.card:not([data-rv]),.gal-item:not([data-rv])'),function(el){
      el.setAttribute('data-rv','1');
      el.style.opacity='0';
      el.style.transform='scale(.965)';
      el.style.transition='opacity '+DUR+'ms '+EASE+', transform '+DUR+'ms '+EASE;
      io.observe(el);
    });
    clearTimeout(failsafe);
    failsafe=setTimeout(function(){
      [].forEach.call(document.querySelectorAll('[data-rv]'),function(el){
        if(parseFloat(getComputedStyle(el).opacity)<.9){el.style.opacity='1';el.style.transform='none';}
      });
    },4000);
  }
  window.brandMotion={reveal:reveal};
})();

/* ===========================================================
   Alpha Agency — PWA preview engine
   Shared core. Brand behaviour is driven by window.BRAND
   (tokens, feature flags and a motion signature) plus the
   per-brand motion module appended after this file.
   =========================================================== */
(function () {
  'use strict';

  var B = window.BRAND || {};
  var D = window.DATA || {};
  var HAS_CRM = !!B.crm;
  var HAS_CHECKIN = !!B.checkin;
  var HAS_ADDRESSES = !!B.addresses;
  var SHOP_KEY = B.shopKey || 'shop';          // 'shop' | 'menu'
  var CUR = B.currency || 'تومان';

  /* ---------- tiny helpers ---------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function fmt(n) { return Number(n).toLocaleString('en-US'); }
  function money(n) { return fmt(n) + ' ' + CUR; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------- persistent store ---------- */
  var KEY = 'alpha.' + (B.slug || 'preview') + '.v1';
  var seed = {
    cart: [],
    saved: [],
    points: (D.profile && D.profile.points) || 0,
    orders: (D.profile && D.profile.orders) || [],
    checkins: [],
    checkedInAt: null,
    branch: null
  };
  var S;
  try {
    S = JSON.parse(localStorage.getItem(KEY)) || null;
  } catch (e) { S = null; }
  if (!S) S = JSON.parse(JSON.stringify(seed));
  // forward-compat: fill any missing keys
  Object.keys(seed).forEach(function (k) { if (S[k] === undefined) S[k] = seed[k]; });

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
  }

  /* ---------- CRM tiers ---------- */
  var TIERS = B.tiers || [
    { name: 'Bronze', min: 0 },
    { name: 'Silver', min: 150 },
    { name: 'Gold', min: 400 }
  ];
  function tierOf(pts) {
    var t = TIERS[0];
    for (var i = 0; i < TIERS.length; i++) if (pts >= TIERS[i].min) t = TIERS[i];
    return t;
  }
  function nextTier(pts) {
    for (var i = 0; i < TIERS.length; i++) if (pts < TIERS[i].min) return TIERS[i];
    return null;
  }

  /* ---------- catalogue ---------- */
  var ITEMS = D.items || [];
  var CATS = D.categories || [];
  function byId(id) {
    for (var i = 0; i < ITEMS.length; i++) if (ITEMS[i].id === id) return ITEMS[i];
    return null;
  }
  function priceOf(it, variantIdx) {
    if (it.variants && it.variants.length) {
      var v = it.variants[variantIdx || 0];
      return v ? v.price : it.variants[0].price;
    }
    return it.price || 0;
  }

  /* ---------- cart ---------- */
  function cartCount() {
    return S.cart.reduce(function (a, l) { return a + l.qty; }, 0);
  }
  function cartTotal() {
    return S.cart.reduce(function (a, l) {
      var it = byId(l.id);
      return a + (it ? priceOf(it, l.v) * l.qty : 0);
    }, 0);
  }
  function addToCart(id, v, qty) {
    v = v || 0; qty = qty || 1;
    var line = null;
    for (var i = 0; i < S.cart.length; i++) if (S.cart[i].id === id && S.cart[i].v === v) line = S.cart[i];
    if (line) line.qty += qty; else S.cart.push({ id: id, v: v, qty: qty });
    save(); syncBadge();
    var it = byId(id);
    toast((it ? it.name : 'Item') + ' added to bag');
    bump();
  }
  function setQty(idx, q) {
    if (q <= 0) S.cart.splice(idx, 1); else S.cart[idx].qty = q;
    save(); syncBadge(); render();
  }

  function syncBadge() {
    var n = cartCount();
    $$('[data-badge]').forEach(function (b) {
      b.textContent = n;
      b.hidden = n === 0;
    });
  }
  function bump() {
    var d = $('.dock [data-tab="bag"]');
    if (!d) return;
    d.classList.remove('bump');
    void d.offsetWidth;
    d.classList.add('bump');
  }

  /* ---------- toast ---------- */
  var toastT;
  function toast(msg) {
    var t = $('#toast');
    if (!t) { t = el('div', 'toast'); t.id = 'toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toastT);
    toastT = setTimeout(function () { t.classList.remove('on'); }, 2200);
  }

  /* ---------- bottom sheet ---------- */
  function sheet(html, onMount) {
    var wrap = el('div', 'sheet-wrap');
    wrap.innerHTML = '<div class="sheet-scrim"></div><div class="sheet" role="dialog" aria-modal="true">' +
      '<button class="sheet-grab" aria-label="Close"></button>' +
      '<div class="sheet-body">' + html + '</div></div>';
    document.body.appendChild(wrap);
    document.body.classList.add('locked');
    void wrap.offsetWidth;
    wrap.classList.add('on');
    function close() {
      wrap.classList.remove('on');
      document.body.classList.remove('locked');
      setTimeout(function () { wrap.remove(); }, B.sheetMs || 380);
    }
    $('.sheet-scrim', wrap).addEventListener('click', close);
    $('.sheet-grab', wrap).addEventListener('click', close);
    document.addEventListener('keydown', function esckey(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esckey); }
    });
    if (onMount) onMount(wrap, close);
    return close;
  }

  /* ---------- routing ---------- */
  var TABS = ['home', SHOP_KEY, 'bag', 'profile'];
  if (HAS_ADDRESSES) TABS.splice(2, 0, 'places');
  if (HAS_CHECKIN) TABS.push('checkin');

  function route() {
    var h = (location.hash || '').replace(/^#\/?/, '').split('/')[0];
    return TABS.indexOf(h) >= 0 ? h : 'home';
  }
  function go(tab) {
    if (route() === tab) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    location.hash = '#/' + tab;
  }

  /* ---------- views ---------- */
  function viewHome() {
    var h = '';
    var hero = D.hero || {};
    if (B.heroVideo) {
      h += '<section class="hero hero-video">' +
        '<video class="hero-media" autoplay muted loop playsinline preload="metadata" poster="assets/hero-poster.jpg">' +
        '<source src="assets/hero.mp4" type="video/mp4"></video>' +
        '<div class="hero-veil"></div>' +
        '<div class="hero-inner">' +
        (B.heroLogo ? '<img class="hero-logo" src="' + B.heroLogo + '" alt="' + esc(B.name) + '">' : '') +
        '<h1 class="hero-title">' + esc(hero.title || B.name) + '</h1>' +
        '<p class="hero-sub">' + esc(hero.sub || '') + '</p>' +
        '<button class="btn btn-hero" data-go="' + SHOP_KEY + '">' + esc(hero.cta || 'Explore') + '</button>' +
        '</div></section>';
    } else {
      // full-bleed poster hero — same shape as the video one, so the brands
      // without footage still open on an image rather than a text block
      var poster = (D.heroImages || [])[0] || 'assets/p1.jpg';
      h += '<section class="hero hero-poster">' +
        '<img class="hero-media" src="' + esc(poster) + '" alt="" fetchpriority="high">' +
        '<div class="hero-veil"></div>' +
        '<div class="hero-inner">' +
        (B.heroLogo ? '<img class="hero-logo" src="' + B.heroLogo + '" alt="' + esc(B.name) + '">' : '') +
        '<h1 class="hero-title">' + esc(hero.title || B.name) + '</h1>' +
        '<p class="hero-sub">' + esc(hero.sub || '') + '</p>' +
        '<div class="hero-cta">' +
        '<button class="btn btn-hero" data-go="' + SHOP_KEY + '">' + esc(hero.cta || 'Explore') + '</button>' +
        '<button class="btn btn-hero ghost-on-media" data-go="profile">' + (HAS_CRM ? 'Join the club' : 'Your profile') + '</button>' +
        '</div></div></section>';
    }

    if (HAS_CRM) h += crmStrip();

    // featured rail
    var feat = ITEMS.filter(function (i) { return i.featured; }).slice(0, 10);
    if (!feat.length) feat = ITEMS.slice(0, 10);
    h += '<section class="sec">' + secHead(D.railTitle || 'Featured', SHOP_KEY) +
      '<div class="rail" id="homeRail">' + feat.map(cardHTML).join('') + '</div></section>';

    // editorial strip from client photos
    if ((D.gallery || []).length) {
      h += '<section class="sec"><h2 class="sec-title">' + esc(D.galleryTitle || 'In the room') + '</h2>' +
        '<div class="gal">' + D.gallery.map(function (g, i) {
          return '<figure class="gal-item g' + (i % 5) + '"><img src="' + g.src + '" alt="' + esc(g.alt || '') + '" loading="lazy">' +
            (g.cap ? '<figcaption>' + esc(g.cap) + '</figcaption>' : '') + '</figure>';
        }).join('') + '</div></section>';
    }

    // categories teaser
    if (CATS.length > 1) {
      h += '<section class="sec"><h2 class="sec-title">' + esc(B.catTitle || 'Browse') + '</h2>' +
        '<div class="chips">' + CATS.map(function (c) {
          return '<button class="chip" data-cat="' + esc(c.id) + '">' + esc(c.name) + '</button>';
        }).join('') + '</div></section>';
    }

    if (HAS_CHECKIN) {
      h += '<section class="sec"><div class="ci-teaser" data-go="checkin">' +
        '<div><span class="ci-dot"></span> ' + esc(D.checkinTeaser || 'See who is here right now') + '</div>' +
        '<span class="ci-count">' + liveCount() + '</span></div></section>';
    }

    h += story();
    return h;
  }

  function secHead(title, tab) {
    return '<div class="sec-head"><h2 class="sec-title">' + esc(title) + '</h2>' +
      '<button class="link" data-go="' + tab + '">All</button></div>';
  }

  function crmStrip() {
    var t = tierOf(S.points), nx = nextTier(S.points);
    var pct = nx ? Math.min(100, Math.round((S.points - t.min) / (nx.min - t.min) * 100)) : 100;
    return '<section class="sec"><div class="crm" data-go="profile">' +
      '<div class="crm-top"><span class="crm-tier">' + esc(t.name) + '</span>' +
      '<span class="crm-pts">' + fmt(S.points) + ' pts</span></div>' +
      '<div class="crm-bar"><i style="width:' + pct + '%"></i></div>' +
      '<div class="crm-note">' + (nx
        ? esc(fmt(nx.min - S.points) + ' points to ' + nx.name)
        : 'Top tier — thank you') + '</div></div></section>';
  }

  function cardHTML(it) {
    var p = priceOf(it, 0);
    return '<article class="card" data-item="' + esc(it.id) + '" tabindex="0">' +
      '<div class="card-media"><img src="' + esc(it.img) + '" alt="' + esc(it.name) + '" loading="lazy">' +
      (it.tag ? '<span class="card-tag">' + esc(it.tag) + '</span>' : '') + '</div>' +
      '<div class="card-body"><h3 class="card-name">' + esc(it.name) + '</h3>' +
      (it.sub ? '<p class="card-sub">' + esc(it.sub) + '</p>' : '') +
      '<div class="card-foot"><span class="card-price">' + money(p) + '</span>' +
      '<button class="mini" data-add="' + esc(it.id) + '" aria-label="Add ' + esc(it.name) + ' to bag">+</button>' +
      '</div></div></article>';
  }

  var activeCat = 'all';
  function viewShop() {
    var cats = [{ id: 'all', name: 'All' }].concat(CATS);
    var list = activeCat === 'all' ? ITEMS : ITEMS.filter(function (i) { return i.cat === activeCat; });
    return '<header class="page-head"><h1 class="page-title">' + esc(B.shopTitle || 'Shop') + '</h1>' +
      '<p class="page-sub">' + esc(B.shopSub || '') + '</p></header>' +
      '<div class="catbar">' + cats.map(function (c) {
        return '<button class="cat' + (c.id === activeCat ? ' on' : '') + '" data-cat="' + esc(c.id) + '">' + esc(c.name) + '</button>';
      }).join('') + '</div>' +
      '<div class="grid">' + list.map(cardHTML).join('') + '</div>' +
      (list.length ? '' : '<p class="empty">Nothing in this category yet.</p>');
  }

  function viewBag() {
    if (!S.cart.length) {
      return '<header class="page-head"><h1 class="page-title">Bag</h1></header>' +
        '<div class="empty-state"><div class="empty-mark"></div><h2>Your bag is empty</h2>' +
        '<p>Add something you like and it will show up here.</p>' +
        '<button class="btn" data-go="' + SHOP_KEY + '">Browse ' + esc(B.shopTitle || 'Shop') + '</button></div>';
    }
    var sub = cartTotal();
    var earn = Math.round(sub / (B.pointsPer || 50000));
    var h = '<header class="page-head"><h1 class="page-title">Bag</h1>' +
      '<p class="page-sub">' + cartCount() + ' item' + (cartCount() > 1 ? 's' : '') + '</p></header><div class="lines">';
    S.cart.forEach(function (l, i) {
      var it = byId(l.id); if (!it) return;
      var vname = it.variants && it.variants[l.v] ? it.variants[l.v].name : '';
      h += '<div class="line"><img src="' + esc(it.img) + '" alt="" loading="lazy">' +
        '<div class="line-mid"><h3>' + esc(it.name) + '</h3>' +
        (vname ? '<p class="line-var">' + esc(vname) + '</p>' : '') +
        '<span class="line-price">' + money(priceOf(it, l.v)) + '</span></div>' +
        '<div class="qty"><button data-q="' + i + ':-1" aria-label="Decrease">−</button>' +
        '<span>' + l.qty + '</span>' +
        '<button data-q="' + i + ':1" aria-label="Increase">+</button></div></div>';
    });
    h += '</div><div class="totals">' +
      '<div class="trow"><span>Subtotal</span><b>' + money(sub) + '</b></div>';
    if (HAS_CRM) h += '<div class="trow sub"><span>Points earned</span><b>+' + fmt(earn) + '</b></div>';
    h += '<div class="trow big"><span>Total</span><b>' + money(sub) + '</b></div>' +
      '<button class="btn btn-pay" id="pay">Checkout</button>' +
      '<p class="fineprint">Preview only — no payment is taken.</p></div>';
    return h;
  }

  function viewPlaces() {
    var br = D.branches || [];
    return '<header class="page-head"><h1 class="page-title">' + esc(B.placesTitle || 'Locations') + '</h1>' +
      '<p class="page-sub">' + br.length + ' ' + (br.length === 1 ? 'location' : 'locations') + '</p></header>' +
      '<div class="places">' + br.map(function (b, i) {
        return '<article class="place">' +
          (b.img ? '<div class="place-media"><img src="' + esc(b.img) + '" alt="" loading="lazy"></div>' : '<div class="place-media place-media-blank"></div>') +
          '<div class="place-body"><h3>' + esc(b.name) + '</h3>' +
          '<p class="place-addr" dir="auto">' + esc(b.address) + '</p>' +
          '<div class="place-row">' +
          (b.hours ? '<span class="place-hours">' + esc(b.hours) + '</span>' : '') +
          (b.map ? '<a class="link" href="' + esc(b.map) + '" target="_blank" rel="noopener">Directions</a>' : '') +
          '</div></div></article>';
      }).join('') + '</div>';
  }

  /* ---------- check-in ---------- */
  function liveCount() {
    var base = (D.checkinBase || 6);
    var hour = new Date().getHours();
    var wave = Math.round(Math.sin((hour - 7) / 24 * Math.PI * 2) * 4);
    return Math.max(1, base + wave + (S.checkedInAt ? 1 : 0));
  }
  function viewCheckin() {
    var people = (D.people || []).slice(0, liveCount());
    var here = !!S.checkedInAt;
    var branchName = S.branch || ((D.branches || [])[0] || {}).name || B.name;
    var h = '<header class="page-head"><h1 class="page-title">Check in</h1>' +
      '<p class="page-sub">' + esc(branchName) + '</p></header>';
    h += '<div class="ci-card' + (here ? ' in' : '') + '">' +
      '<div class="ci-live"><span class="ci-dot"></span>' + liveCount() + ' here now</div>' +
      '<button class="btn btn-ci" id="ciBtn">' + (here ? 'Check out' : 'Check in') + '</button>' +
      (here ? '<p class="ci-since">Checked in ' + since(S.checkedInAt) + '</p>' : '<p class="ci-since">Tap to let the room know you are here.</p>') +
      '</div>';
    if ((D.branches || []).length > 1) {
      h += '<div class="ci-branch"><label>Branch</label><select id="ciBranch">' +
        D.branches.map(function (b) {
          return '<option' + (b.name === branchName ? ' selected' : '') + '>' + esc(b.name) + '</option>';
        }).join('') + '</select></div>';
    }
    h += '<h2 class="sec-title">Who is here</h2><div class="people">';
    if (here) {
      h += '<div class="person me"><div class="ava" style="background:' + (B.accent || '#888') + '">' +
        esc(((D.profile || {}).name || 'You').slice(0, 1)) + '</div>' +
        '<div><h4>You</h4><p>just now</p></div><span class="pill">You</span></div>';
    }
    h += people.map(function (p) {
      return '<div class="person"><div class="ava" style="background:' + esc(p.color) + '">' + esc(p.name.slice(0, 1)) + '</div>' +
        '<div><h4>' + esc(p.name) + '</h4><p>' + esc(p.note) + '</p></div></div>';
    }).join('');
    h += '</div><p class="fineprint">Preview only — people shown are sample data.</p>';
    return h;
  }
  function since(ts) {
    var m = Math.max(1, Math.round((Date.now() - ts) / 60000));
    return m < 60 ? m + ' min ago' : Math.round(m / 60) + ' h ago';
  }

  function viewProfile() {
    var p = D.profile || {};
    var t = tierOf(S.points), nx = nextTier(S.points);
    var pct = nx ? Math.min(100, Math.round((S.points - t.min) / (nx.min - t.min) * 100)) : 100;
    var h = '<header class="page-head"><h1 class="page-title">Profile</h1></header>';
    h += '<div class="prof"><div class="ava lg" style="background:' + (B.accent || '#888') + '">' + esc((p.name || 'A').slice(0, 1)) + '</div>' +
      '<div><h2>' + esc(p.name || 'Guest') + '</h2><p>' + esc(p.phone || '') + '</p></div></div>';

    if (HAS_CRM) {
      h += '<div class="card-flat"><div class="crm-top"><span class="crm-tier">' + esc(t.name) + ' member</span>' +
        '<span class="crm-pts">' + fmt(S.points) + ' pts</span></div>' +
        '<div class="crm-bar"><i style="width:' + pct + '%"></i></div>' +
        '<div class="crm-note">' + (nx ? esc(fmt(nx.min - S.points) + ' points to ' + nx.name) : 'Top tier — thank you') + '</div>' +
        '<div class="perks">' + (D.perks || []).map(function (x) {
          return '<div class="perk"><b>' + esc(x.t) + '</b><span>' + esc(x.d) + '</span></div>';
        }).join('') + '</div></div>';
    }

    h += '<h2 class="sec-title">Order history</h2>';
    if (!S.orders.length) h += '<p class="empty">No orders yet.</p>';
    else h += '<div class="orders">' + S.orders.map(function (o) {
      return '<div class="order"><div><h4>' + esc(o.ref) + '</h4><p>' + esc(o.date) + ' · ' + o.n + ' items</p></div>' +
        '<div class="order-right"><b>' + money(o.total) + '</b>' +
        (HAS_CRM ? '<span>+' + fmt(o.pts) + ' pts</span>' : '') + '</div></div>';
    }).join('') + '</div>';

    h += '<h2 class="sec-title">Saved</h2>';
    if (!S.saved.length) h += '<p class="empty">Tap the heart on anything to save it here.</p>';
    else h += '<div class="rail">' + S.saved.map(function (id) {
      var it = byId(id); return it ? cardHTML(it) : '';
    }).join('') + '</div>';

    h += '<div class="prof-actions"><button class="btn ghost" id="reset">Reset preview</button></div>';
    return h;
  }

  /* ---------- item detail ---------- */
  function openItem(id) {
    var it = byId(id); if (!it) return;
    var vi = 0;
    var vhtml = '';
    if (it.variants && it.variants.length > 1) {
      vhtml = '<div class="vars">' + it.variants.map(function (v, i) {
        return '<button class="var' + (i === 0 ? ' on' : '') + '" data-v="' + i + '">' +
          esc(v.name) + '<span>' + money(v.price) + '</span></button>';
      }).join('') + '</div>';
    }
    var isSaved = S.saved.indexOf(id) >= 0;
    var html = '<div class="d-media"><img src="' + esc(it.img) + '" alt="' + esc(it.name) + '"></div>' +
      '<div class="d-head"><h2>' + esc(it.name) + '</h2>' +
      '<button class="heart' + (isSaved ? ' on' : '') + '" id="dSave" aria-label="Save">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5S3.8 15 3.8 9.6A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 8.2 2.3c0 5.4-8.2 10.9-8.2 10.9Z"/></svg></button></div>' +
      (it.desc ? '<p class="d-desc" dir="auto">' + esc(it.desc) + '</p>' : '') +
      (it.meta ? '<p class="d-meta">' + esc(it.meta) + '</p>' : '') +
      vhtml +
      '<div class="d-buy"><span class="d-price" id="dPrice">' + money(priceOf(it, 0)) + '</span>' +
      '<button class="btn" id="dAdd">Add to bag</button></div>';

    sheet(html, function (wrap, close) {
      $$('.var', wrap).forEach(function (b) {
        b.addEventListener('click', function () {
          $$('.var', wrap).forEach(function (x) { x.classList.remove('on'); });
          b.classList.add('on');
          vi = +b.getAttribute('data-v');
          $('#dPrice', wrap).textContent = money(priceOf(it, vi));
        });
      });
      $('#dAdd', wrap).addEventListener('click', function () { addToCart(id, vi, 1); close(); });
      $('#dSave', wrap).addEventListener('click', function () {
        var i = S.saved.indexOf(id);
        if (i >= 0) { S.saved.splice(i, 1); this.classList.remove('on'); toast('Removed from saved'); }
        else { S.saved.push(id); this.classList.add('on'); toast('Saved'); }
        save();
      });
    });
  }

  /* ---------- checkout ---------- */
  function checkout() {
    var total = cartTotal();
    var n = cartCount();
    var pts = Math.round(total / (B.pointsPer || 50000));
    var ref = '#' + String(Date.now()).slice(-6);
    S.orders.unshift({ ref: ref, date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }), n: n, total: total, pts: pts });
    if (HAS_CRM) S.points += pts;
    S.cart = [];
    save(); syncBadge();
    sheet('<div class="done"><div class="done-mark"><svg viewBox="0 0 24 24"><path d="M4 12.5 9.5 18 20 6.5"/></svg></div>' +
      '<h2>Order placed</h2><p>' + esc(ref) + ' · ' + money(total) + '</p>' +
      (HAS_CRM ? '<p class="done-pts">+' + fmt(pts) + ' points added to your account</p>' : '') +
      '<p class="fineprint">Preview only — no payment was taken.</p>' +
      '<button class="btn" id="doneOk">Done</button></div>', function (wrap, close) {
      $('#doneOk', wrap).addEventListener('click', function () { close(); go('profile'); });
    });
  }

  /* ---------- story block ---------- */
  function story() {
    var s = D.story;
    if (!s) return '';
    return '<section class="sec story">' +
      '<h2 class="sec-title">' + esc(s.title) + '</h2>' +
      '<p class="story-body">' + esc(s.body) + '</p>' +
      (s.facts ? '<div class="facts">' + s.facts.map(function (f) {
        return '<div class="fact"><b>' + esc(f.k) + '</b><span>' + esc(f.v) + '</span></div>';
      }).join('') + '</div>' : '') +
      '</section>';
  }

  /* ---------- footer ---------- */
  function footer() {
    var social = B.instagram
      ? '<a class="ig" href="https://instagram.com/' + esc(B.instagram) + '" target="_blank" rel="noopener">@' + esc(B.instagram) + '</a>'
      : '';
    return '<footer class="foot">' +
      '<div class="foot-brand">' + esc(B.name) + '</div>' +
      '<div class="foot-loc">' + esc(B.location || '') + '</div>' +
      social +
      '<a class="powered" href="https://alphaa.agency" target="_blank" rel="noopener">' +
      '<img class="alpha-mark" src="' + (B.alphaLogo || 'assets/alpha-black.png') + '" alt="Alpha Agency">' +
      '<span class="powered-txt"><span class="pb">Powered by</span><span class="pa">Alpha Agency</span></span>' +
      '</a>' +
      '</footer>';
  }

  /* ---------- render ---------- */
  var app;
  function render() {
    var r = route();
    var body =
      r === 'home' ? viewHome() :
      r === SHOP_KEY ? viewShop() :
      r === 'bag' ? viewBag() :
      r === 'places' ? viewPlaces() :
      r === 'checkin' ? viewCheckin() :
      viewProfile();

    app.innerHTML = '<div class="view v-' + r + '">' + body + (r === 'home' ? footer() : '') + '</div>';

    $$('.dock [data-tab]').forEach(function (b) {
      var on = b.getAttribute('data-tab') === r;
      b.classList.toggle('on', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    movePill();
    syncBadge();
    if (window.brandMotion && window.brandMotion.reveal) window.brandMotion.reveal();
    if (r !== 'home') window.scrollTo(0, 0);
  }

  /* ---------- events ---------- */
  function wire() {
    document.addEventListener('click', function (e) {
      var t = e.target;

      var go1 = t.closest('[data-go]');
      if (go1) { go(go1.getAttribute('data-go')); return; }

      var tab = t.closest('.dock [data-tab]');
      if (tab) { go(tab.getAttribute('data-tab')); return; }

      var add = t.closest('[data-add]');
      if (add) { e.stopPropagation(); addToCart(add.getAttribute('data-add'), 0, 1); return; }

      var card = t.closest('[data-item]');
      if (card) { openItem(card.getAttribute('data-item')); return; }

      var cat = t.closest('[data-cat]');
      if (cat) {
        activeCat = cat.getAttribute('data-cat');
        if (route() !== SHOP_KEY) go(SHOP_KEY); else render();
        return;
      }

      var q = t.closest('[data-q]');
      if (q) {
        var parts = q.getAttribute('data-q').split(':');
        var i = +parts[0], d = +parts[1];
        setQty(i, S.cart[i].qty + d);
        return;
      }

      if (t.closest('#pay')) { checkout(); return; }

      if (t.closest('#ciBtn')) {
        if (S.checkedInAt) { S.checkedInAt = null; toast('Checked out'); }
        else { S.checkedInAt = Date.now(); toast('You are checked in'); }
        save(); render();
        return;
      }

      if (t.closest('#reset')) {
        try { localStorage.removeItem(KEY); } catch (err) {}
        S = JSON.parse(JSON.stringify(seed));
        save(); toast('Preview reset'); render();
        return;
      }
    });

    document.addEventListener('change', function (e) {
      if (e.target.id === 'ciBranch') { S.branch = e.target.value; save(); render(); }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var c = e.target.closest && e.target.closest('[data-item]');
      if (c) { e.preventDefault(); openItem(c.getAttribute('data-item')); }
    });

    window.addEventListener('hashchange', render);
  }

  /* ---------- sliding dock pill ----------
     The active tab is marked by a pill that slides between tabs rather
     than a background that pops on — the detail that makes the bar feel
     native rather than like a row of buttons. */
  function movePill() {
    var dock = $('.dock'); if (!dock) return;
    var pill = $('.dock-pill', dock);
    if (!pill) {
      pill = el('span', 'dock-pill');
      dock.insertBefore(pill, dock.firstChild);
    }
    var active = $('.dock button.on', dock);
    if (!active) { pill.classList.remove('ready'); return; }
    var dr = dock.getBoundingClientRect(), ar = active.getBoundingClientRect();
    if (!ar.width) return;
    pill.style.width = ar.width + 'px';
    pill.style.transform = 'translateX(' + (ar.left - dr.left) + 'px)';
    requestAnimationFrame(function () { pill.classList.add('ready'); });
  }
  window.addEventListener('resize', function () { movePill(); });
  window.addEventListener('orientationchange', function () { setTimeout(movePill, 120); });

  /* ---------- splash ---------- */
  function hideSplash() {
    var s = document.getElementById('splash');
    if (!s || s.classList.contains('gone')) return;
    s.classList.add('gone');
    setTimeout(function () { if (s.parentNode) s.parentNode.removeChild(s); }, 620);
  }

  /* ---------- hero video ----------
     Browsers pause muted autoplay video in a backgrounded tab and do not
     always resume it. Nudge it on return and on the first interaction. */
  function keepHeroPlaying() {
    function nudge() {
      var v = $('.hero-media');
      if (v && v.paused) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
    }
    document.addEventListener('visibilitychange', function () { if (!document.hidden) nudge(); });
    window.addEventListener('pageshow', nudge);
    ['touchstart', 'pointerdown'].forEach(function (ev) {
      document.addEventListener(ev, nudge, { once: true, passive: true });
    });
    setTimeout(nudge, 600);
  }

  /* ---------- boot ---------- */
  function boot() {
    app = $('#app');
    wire();
    render();
    requestAnimationFrame(movePill);
    if (B.heroVideo) keepHeroPlaying();

    // hold the splash long enough to read, but never let it stick
    var minShow = 900, started = window.__splashAt || Date.now();
    function done() { setTimeout(hideSplash, Math.max(0, minShow - (Date.now() - started))); }
    if (document.readyState === 'complete') done();
    else window.addEventListener('load', done);
    setTimeout(hideSplash, 4000);
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').catch(function () {});
      });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  /* expose a little for the brand motion module */
  window.APP = { render: render, go: go, toast: toast, $: $, $$: $$ };
})();
