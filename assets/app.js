/* Shared interactivity: mobile menu, TOC scroll-spy, self-check reveal */
(function () {
  // Mobile sidebar toggle
  var btn = document.querySelector('.menubtn');
  var side = document.querySelector('.side');
  if (btn && side) {
    btn.addEventListener('click', function () { side.classList.toggle('open'); });
    document.querySelectorAll('nav.toc a').forEach(function (a) {
      a.addEventListener('click', function () { side.classList.remove('open'); });
    });
  }

  // Scroll-spy: highlight the TOC entry of the section in view
  var links = Array.prototype.slice.call(document.querySelectorAll('nav.toc a[href^="#"]'));
  var map = {};
  links.forEach(function (a) {
    var id = a.getAttribute('href').slice(1);
    var el = document.getElementById(id);
    if (el) map[id] = a;
  });
  var ids = Object.keys(map);
  if (ids.length && 'IntersectionObserver' in window) {
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          links.forEach(function (l) { l.classList.remove('active'); });
          if (map[e.target.id]) map[e.target.id].classList.add('active');
        }
      });
    }, { rootMargin: '-20% 0px -70% 0px', threshold: 0 });
    ids.forEach(function (id) { obs.observe(document.getElementById(id)); });
  }

  // Self-check: click a question to reveal its answer
  document.querySelectorAll('.selfcheck .q').forEach(function (q) {
    q.addEventListener('click', function () {
      var a = q.nextElementSibling;
      if (a && a.classList.contains('a')) {
        a.classList.toggle('show');
        q.classList.toggle('open');
      }
    });
  });

  // Open all plain-english + self-check answers when printing
  window.addEventListener('beforeprint', function () {
    document.querySelectorAll('details.plain-english').forEach(function (d) { d.open = true; });
    document.querySelectorAll('.selfcheck .a').forEach(function (a) { a.classList.add('show'); });
  });

  /* ------------------------------------------------------------------
     Private answer layer (owner only).
     A separate, encrypted set of deeper model answers lives in
     assets/notes.enc.json as ciphertext only. Typing the passphrase
     anywhere on an exam page derives the key (PBKDF2) and decrypts it
     (AES-GCM) entirely in the browser, then injects a violet block
     after each public model answer. A wrong passphrase fails silently.
     Nothing here reveals the content or the passphrase to a reader of
     the source: the answers exist only as an encrypted blob.
     ------------------------------------------------------------------ */
  (function () {
    // Only on the exam pages, and only where the browser has Web Crypto.
    var pageKey = (location.pathname.split('/').pop() || '').replace(/\.html$/, '');
    if (pageKey.indexOf('exam-') !== 0) return;
    if (!(window.crypto && window.crypto.subtle && window.TextDecoder)) return;

    var SS_KEY = 'sx_notes';        // sessionStorage cache of the decrypted set (per tab, this device only)
    var ENC_URL = 'assets/notes.enc.json';
    var encBlob = null;             // fetched-once ciphertext descriptor
    var unlocked = false;

    function b64ToBuf(b64) {
      var bin = atob(b64), u = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      return u;
    }

    // Insert the private block for one section of the decrypted set.
    function injectSection(sectionId, entry) {
      var sec = document.getElementById(sectionId);
      if (!sec || sec.querySelector('.mine')) return;
      var anchor = sec.querySelector('.model') || sec.querySelector('.qbox') ||
                   sec.querySelector('.howto');
      var el = document.createElement('div');
      el.className = 'mine';
      el.innerHTML = '<div class="hd">' + (entry.title || 'My answer (private)') + '</div>' + entry.html;
      if (anchor) anchor.insertAdjacentElement('afterend', el);
      else sec.appendChild(el);
    }

    function render(notes) {
      var pageNotes = notes[pageKey];
      if (!pageNotes) return false;
      var any = false;
      Object.keys(pageNotes).forEach(function (sid) {
        var before = document.querySelectorAll('.mine').length;
        injectSection(sid, pageNotes[sid]);
        if (document.querySelectorAll('.mine').length > before) any = true;
      });
      return any;
    }

    function toast() {
      var t = document.createElement('div');
      t.className = 'sxtoast';
      t.textContent = 'Private answers unlocked';
      document.body.appendChild(t);
      requestAnimationFrame(function () { t.classList.add('show'); });
      setTimeout(function () { t.classList.remove('show'); }, 2600);
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 3100);
    }

    function finish(notes, fromCache) {
      if (unlocked) return;
      var any = render(notes);
      unlocked = true;
      try { sessionStorage.setItem(SS_KEY, JSON.stringify(notes)); } catch (e) {}
      if (!fromCache && any) toast();
    }

    // Already unlocked earlier this tab session: render straight away, no typing.
    (function fromSession() {
      try {
        var cached = sessionStorage.getItem(SS_KEY);
        if (cached) finish(JSON.parse(cached), true);
      } catch (e) {}
    })();

    async function tryUnlock(pass) {
      if (unlocked || !pass || pass.length < 4) return;
      try {
        if (!encBlob) {
          var r = await fetch(ENC_URL, { cache: 'force-cache' });
          if (!r.ok) return;
          encBlob = await r.json();
        }
        var enc = new TextEncoder();
        var baseKey = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
        var key = await crypto.subtle.deriveKey(
          { name: 'PBKDF2', salt: b64ToBuf(encBlob.salt), iterations: encBlob.iter, hash: 'SHA-256' },
          baseKey, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
        var plainBuf = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: b64ToBuf(encBlob.iv) }, key, b64ToBuf(encBlob.ct));
        var notes = JSON.parse(new TextDecoder().decode(plainBuf));
        finish(notes, false);
      } catch (e) {
        // wrong passphrase or bad data: stay locked, say nothing.
      }
    }

    // Key buffer: catch the passphrase typed anywhere on the page.
    var buf = '', resetTimer = null, debTimer = null;
    function scheduleReset() {
      clearTimeout(resetTimer);
      resetTimer = setTimeout(function () { buf = ''; }, 2000);
    }
    document.addEventListener('keydown', function (e) {
      if (unlocked) return;
      var t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Escape') { buf = ''; return; }
      if (e.key === 'Backspace') { buf = buf.slice(0, -1); scheduleReset(); return; }
      if (e.key === 'Enter') { tryUnlock(buf); buf = ''; return; }
      if (e.key && e.key.length === 1) {
        buf = (buf + e.key).slice(-64);
        scheduleReset();
        clearTimeout(debTimer);
        debTimer = setTimeout(function () { tryUnlock(buf); }, 350);
      }
    });
  })();
})();
