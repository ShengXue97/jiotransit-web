/* Instant page switches between the site's own pages.
   The other pages are fetched in the background once this one has loaded; a click on a
   site link then swaps <main> and the header state in place, with no blank reload.
   Anything unexpected falls back to a normal page load. */
(function () {
  if (!window.fetch || !window.history || !history.pushState || !window.DOMParser) return;

  var cache = {};
  var parser = new DOMParser();

  function clean(url) {
    var u = new URL(url, location.href);
    u.hash = "";
    u.search = "";
    if (/\/index\.html$/.test(u.pathname)) u.pathname = u.pathname.replace(/index\.html$/, "");
    return u.href;
  }

  function isSitePage(a) {
    if (!a || a.target || a.hasAttribute("download")) return false;
    var u = new URL(a.href, location.href);
    if (u.origin !== location.origin) return false;
    if (!/\/$|\/index\.html$/.test(u.pathname)) return false;
    return !!document.querySelector('.site-nav a[href]') &&
      [].some.call(document.querySelectorAll(".site-nav a"), function (n) { return clean(n.href) === clean(u.href); });
  }

  function load(url) {
    url = clean(url);
    if (!cache[url]) {
      cache[url] = fetch(url, { credentials: "same-origin" }).then(function (r) {
        if (!r.ok) throw new Error(r.status);
        return r.text();
      });
      cache[url].catch(function () { delete cache[url]; });
    }
    return cache[url];
  }

  function runScripts(root) {
    [].forEach.call(root.querySelectorAll("script"), function (old) {
      var s = document.createElement("script");
      s.textContent = old.textContent;
      old.parentNode.replaceChild(s, old);
    });
  }

  function swap(html, url) {
    var doc = parser.parseFromString(html, "text/html");
    var main = doc.querySelector("main");
    var nav = doc.querySelector(".site-nav");
    if (!main || !nav) throw new Error("unexpected page");
    var tail = doc.querySelectorAll("body > script:not([src])");

    document.title = doc.title;
    ["description"].forEach(function (n) {
      var a = document.querySelector('meta[name="' + n + '"]'), b = doc.querySelector('meta[name="' + n + '"]');
      if (a && b) a.setAttribute("content", b.getAttribute("content"));
    });

    // Links inside the new page are relative to its own folder, so the URL changes first.
    if (url !== null) history.pushState({ instant: true }, "", url);

    var cur = document.querySelector("main");
    cur.replaceWith(document.importNode(main, true));
    // Header and footer link targets differ by folder depth; take the new page's versions.
    document.querySelector(".site-header").replaceWith(document.importNode(doc.querySelector(".site-header"), true));
    var foot = doc.querySelector(".site-footer");
    if (foot) document.querySelector(".site-footer").replaceWith(document.importNode(foot, true));

    [].forEach.call(document.querySelectorAll("body > script.page-script"), function (s) { s.remove(); });
    [].forEach.call(tail, function (t) {
      var s = document.createElement("script");
      s.className = "page-script";
      s.textContent = t.textContent;
      document.body.appendChild(s);
    });
  }

  function go(url, push) {
    return load(url).then(function (html) {
      var run = function () { swap(html, push ? url : null); };
      var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (document.startViewTransition && !reduce) {
        var t = document.startViewTransition(run);
        return t.updateCallbackDone;
      }
      run();
    }).then(function () {
      if (push) window.scrollTo(0, 0);
      var m = document.querySelector("main");
      if (m) { m.setAttribute("tabindex", "-1"); m.focus({ preventScroll: true }); }
    });
  }

  document.addEventListener("click", function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest && e.target.closest("a[href]");
    if (!isSitePage(a)) return;
    var url = clean(a.href);
    e.preventDefault();
    if (url === clean(location.href)) { window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    go(url, true).catch(function () { location.href = url; });
  });

  // Warm the cache: on touch or hover right away, and every page once this one is idle.
  function warm(e) {
    var a = e.target.closest && e.target.closest("a[href]");
    if (isSitePage(a)) load(a.href);
  }
  document.addEventListener("touchstart", warm, { passive: true });
  document.addEventListener("mouseover", warm);
  function warmAll() {
    [].forEach.call(document.querySelectorAll(".site-nav a"), function (a) { load(a.href); });
  }
  if ("requestIdleCallback" in window) requestIdleCallback(warmAll, { timeout: 2000 });
  else setTimeout(warmAll, 800);
  cache[clean(location.href)] = Promise.resolve(document.documentElement.outerHTML);

  history.replaceState({ instant: true }, "", location.href);
  window.addEventListener("popstate", function () {
    go(location.href, false).catch(function () { location.reload(); });
  });
})();
