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
})();
