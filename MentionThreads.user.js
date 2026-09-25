// ==UserScript==
// @name         BerryTube Mention Threads
// @namespace    btcustomload
// @version      0.2.1
// @homepageURL  https://github.com/flames5123/BT-mentions-threads
// @supportURL   https://github.com/flames5123/BT-mentions-threads/issues
// @updateURL    https://raw.githubusercontent.com/flames5123/BT-mentions-threads/main/MentionThreads.user.js
// @downloadURL  https://raw.githubusercontent.com/flames5123/BT-mentions-threads/main/MentionThreads.user.js
// @description  Click any username (a chat @mention OR a message's sender name) to thread it: jump to that person's relevant message and step older/newer with a pinned header bar. Works in both vanilla BerryTube chat and the MalTweaks tweaked view. Uses wutColors when enabled.
// @author       (by request)
// @match        http://berrytube.tv/*
// @match        http://www.berrytube.tv/*
// @match        https://berrytube.tv/*
// @match        https://www.berrytube.tv/*
// @match        https://berrytube.berrypun.ch:8445/*
// @match        http://tunnel.berrypun.ch/*
// @match        http://tunnel.q-z.xyz/*
// @match        http://btc.berrytube.tv:8000/*
// @match        https://new.berrytube.tv:8443/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Known-username registry (from #chatlist + every msgwrap[nick]). Only FULL
  // usernames from this set are ever linkified, so client-side squee aliases
  // are never touched.
  // ---------------------------------------------------------------------------
  var names = new Set();
  var lc2canon = {};
  var mentionRegex = null;
  var regexDirty = true;

  function registerName(n) {
    if (!n) return;
    var key = n.toLowerCase();
    if (!(key in lc2canon)) { names.add(n); lc2canon[key] = n; regexDirty = true; }
  }

  function buildRegex() {
    if (!regexDirty) return;
    regexDirty = false;
    var arr = Array.from(names);
    if (!arr.length) { mentionRegex = null; return; }
    arr.sort(function (a, b) { return b.length - a.length; }); // longest first
    var esc = arr.map(function (n) { return n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); });
    try {
      mentionRegex = new RegExp('(?<![\\w])(?:' + esc.join('|') + ')(?![\\w])', 'gi');
    } catch (e) {
      mentionRegex = new RegExp('(^|[^\\w])(' + esc.join('|') + ')(?![\\w])', 'gi');
      mentionRegex._noLookbehind = true;
    }
  }

  // ---------------------------------------------------------------------------
  // wutColors: read the per-user color straight from the DOM. wutColors adds a
  // 10px left border (in the user's color) on .msgwrap[nick="X"] and on the
  // #chatlist entry. We gate on border-left-width >= 3px == "wutColors on".
  // ---------------------------------------------------------------------------
  var colorCache = {};
  function firstWithNick(selector, nick) {
    var els = document.querySelectorAll(selector);
    for (var i = 0; i < els.length; i++) if (els[i].getAttribute('nick') === nick) return els[i];
    return null;
  }
  function computeColor(nick) {
    var candidates = [firstWithNick('.msgwrap', nick), firstWithNick('#chatlist [nick]', nick)];
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      if (!el) continue;
      var cs = getComputedStyle(el);
      if (parseFloat(cs.borderLeftWidth) >= 3) {
        var c = cs.borderLeftColor;
        if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') return c;
      }
    }
    return null;
  }
  function getUserColor(nick) {
    if (nick in colorCache) return colorCache[nick];
    var c = computeColor(nick);
    if (c) colorCache[nick] = c; // only cache real (enabled) colors
    return c;
  }

  // ---------------------------------------------------------------------------
  // Styling.
  // ---------------------------------------------------------------------------
  function injectStyle() {
    if (document.getElementById('mtn-style')) return;
    var css = [
      '.mtn-mention{cursor:pointer;display:inline-block;padding:0 4px;border:1px solid rgba(120,180,255,.55);',
      '  border-radius:4px;background:rgba(255,255,255,.06);line-height:1.35;}',
      '.mtn-mention:hover{background:rgba(255,255,255,.16);}',
      '.nick.mtn-nick-link{cursor:pointer;}',
      '.nick.mtn-nick-link:hover{text-decoration:underline dotted;}',
      '.mtn-bar{position:fixed;z-index:2147483000;display:none;align-items:center;gap:6px;',
      '  font-size:12px;line-height:1;padding:5px 8px;box-sizing:border-box;',
      '  background:rgba(20,28,40,.94);color:#e7eefc;border-bottom:1px solid rgba(120,180,255,.5);',
      '  box-shadow:0 2px 6px rgba(0,0,0,.4);}',
      '.mtn-bar .mtn-thread-icon{opacity:.85;}',
      '.mtn-bar .mtn-name{font-weight:bold;color:#8fc0ff;max-width:40%;overflow:hidden;',
      '  text-overflow:ellipsis;white-space:nowrap;}',
      '.mtn-bar .mtn-count{opacity:.7;margin-left:2px;}',
      '.mtn-bar .mtn-empty{opacity:.7;font-style:italic;display:none;}',
      '.mtn-bar .mtn-spacer{flex:1 1 auto;}',
      '.mtn-bar .mtn-btn{cursor:pointer;border:1px solid rgba(120,180,255,.5);background:rgba(120,180,255,.15);',
      '  color:#e7eefc;border-radius:4px;padding:2px 8px;font-size:12px;line-height:1;min-width:26px;}',
      '.mtn-bar .mtn-btn:hover:not([disabled]){background:rgba(120,180,255,.35);}',
      '.mtn-bar .mtn-btn[disabled]{opacity:.35;cursor:default;}',
      '.msgwrap.mtn-focus{outline:2px solid rgba(120,180,255,.9);outline-offset:-1px;border-radius:3px;',
      '  animation:mtnFlash 1.1s ease-out 1;}',
      '@keyframes mtnFlash{0%{background:rgba(120,180,255,.30);}100%{background:transparent;}}'
    ].join('');
    var s = document.createElement('style');
    s.id = 'mtn-style';
    s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  }

  // ---------------------------------------------------------------------------
  // Linkify a .msg element's text nodes.
  // ---------------------------------------------------------------------------
  function linkifyMsg(msgEl) {
    buildRegex();
    if (!mentionRegex) return;
    var walker = document.createTreeWalker(msgEl, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        var p = n.parentNode;
        while (p && p !== msgEl) {
          var tag = p.tagName;
          if (tag === 'A' || tag === 'CODE' || tag === 'IMG') return NodeFilter.FILTER_REJECT;
          if (p.classList && (p.classList.contains('mtn-mention') || p.classList.contains('berrymote')))
            return NodeFilter.FILTER_REJECT;
          p = p.parentNode;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);

    textNodes.forEach(function (node) {
      var text = node.nodeValue;
      mentionRegex.lastIndex = 0;
      var m, last = 0, frag = null;
      while ((m = mentionRegex.exec(text))) {
        var matchText, matchIndex;
        if (mentionRegex._noLookbehind) { matchText = m[2]; matchIndex = m.index + m[1].length; }
        else { matchText = m[0]; matchIndex = m.index; }
        if (!frag) frag = document.createDocumentFragment();
        if (matchIndex > last) frag.appendChild(document.createTextNode(text.slice(last, matchIndex)));
        var canonical = lc2canon[matchText.toLowerCase()] || matchText;
        var span = document.createElement('span');
        span.className = 'mtn-mention';
        span.setAttribute('data-nick', canonical);
        span.textContent = matchText;
        var col = getUserColor(canonical);
        if (col) { span.style.color = col; span.style.borderColor = col; }
        frag.appendChild(span);
        last = matchIndex + matchText.length;
        if (mentionRegex._noLookbehind) mentionRegex.lastIndex = last;
      }
      if (frag) {
        if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
        node.parentNode.replaceChild(frag, node);
      }
    });
  }

  function processMsgwrap(wrap) {
    if (!wrap || wrap._mtnDone) return;
    wrap._mtnDone = true;
    var nick = wrap.getAttribute('nick');
    registerName(nick);
    var label = wrap.querySelector('.message > .nick, .nick');
    if (label && nick) { label.classList.add('mtn-nick-link'); label.setAttribute('data-nick', nick); }
    var msg = wrap.querySelector('.msg');
    if (msg) linkifyMsg(msg);
  }

  // ---------------------------------------------------------------------------
  // Single fixed thread bar that mirrors the active buffer's rectangle.
  // ---------------------------------------------------------------------------
  var bar = null, activeBuffer = null, activeNick = null, activeIdx = -1, activeColor = null, posTimer = null, ro = null;

  function buildBar() {
    if (bar) return bar;
    injectStyle();
    bar = document.createElement('div');
    bar.className = 'mtn-bar';
    bar.innerHTML =
      '<span class="mtn-thread-icon">\uD83E\uDDF5</span>' +
      '<span class="mtn-name"></span>' +
      '<span class="mtn-count"></span>' +
      '<span class="mtn-empty">no messages in view</span>' +
      '<span class="mtn-spacer"></span>' +
      '<button class="mtn-btn mtn-up" title="Older message from this user">\u25B2</button>' +
      '<button class="mtn-btn mtn-down" title="Newer message from this user">\u25BC</button>' +
      '<button class="mtn-btn mtn-close" title="Close thread view">\u2715</button>';
    document.body.appendChild(bar);
    bar.querySelector('.mtn-up').addEventListener('click', function () { step(-1); });
    bar.querySelector('.mtn-down').addEventListener('click', function () { step(1); });
    bar.querySelector('.mtn-close').addEventListener('click', closeBar);
    return bar;
  }

  function positionBar() {
    if (!bar || !activeBuffer || !activeNick) return;
    if (!activeBuffer.isConnected || !activeBuffer.offsetParent) { bar.style.display = 'none'; return; }
    var r = activeBuffer.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) { bar.style.display = 'none'; return; }
    bar.style.display = 'flex';
    bar.style.left = r.left + 'px';
    bar.style.top = r.top + 'px';
    bar.style.width = r.width + 'px';
    // Push the buffer's first line clear of the bar.
    activeBuffer.style.paddingTop = bar.offsetHeight + 'px';
  }

  function messagesFor(buffer, nick) {
    return Array.prototype.filter.call(buffer.querySelectorAll('.msgwrap'),
      function (w) { return w.getAttribute('nick') === nick; });
  }

  // Initial index rule:
  //  - mention click  (anchor is someone else's message): most recent target
  //    message strictly ABOVE the anchor. ▼ can still reach later ones.
  //  - name-label click (anchor is the target's own message): that exact one.
  //  - nothing at/above the anchor: earliest, so ▼ can reach the rest.
  function indexForAnchor(msgs, anchor) {
    if (!anchor) return msgs.length - 1;
    var idx = -1;
    for (var i = 0; i < msgs.length; i++) {
      if (msgs[i] === anchor) { idx = i; break; }
      var pos = anchor.compareDocumentPosition(msgs[i]);
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) idx = i;
      else if (pos & Node.DOCUMENT_POSITION_FOLLOWING) break;
    }
    return idx < 0 ? (msgs.length ? 0 : -1) : idx;
  }

  // Visible region of the buffer BELOW our pinned bar.
  function bufferVisibleBox(buffer) {
    var br = buffer.getBoundingClientRect();
    var barH = (bar && bar.style.display !== 'none') ? bar.offsetHeight : 0;
    return { top: br.top + barH, bottom: br.bottom, height: br.height - barH };
  }
  // Drive the buffer's own scrollTop (reliable across vanilla/MalTweaks layouts;
  // scrollIntoView can scroll the wrong ancestor / the page).
  function scrollToTarget(buffer, target) {
    var vb = bufferVisibleBox(buffer);
    var tr = target.getBoundingClientRect();
    var delta = (tr.top - vb.top) - Math.max(0, (vb.height - tr.height) / 2);
    buffer.scrollTop += delta;
  }
  function targetVisible(buffer, target) {
    var vb = bufferVisibleBox(buffer);
    var tr = target.getBoundingClientRect();
    return tr.top >= vb.top - 2 && tr.bottom <= vb.bottom + 2;
  }
  // BerryTube's scrollBuffersToBottom() force-scrolls the buffer to the bottom on
  // EVERY incoming message. While a thread is open we re-pin the focused message
  // so that auto-scroll can't yank it out of view.
  function keepFocusPinned() {
    if (!activeBuffer || !activeNick) return;
    var msgs = messagesFor(activeBuffer, activeNick);
    if (activeIdx < 0 || activeIdx >= msgs.length) return;
    var target = msgs[activeIdx];
    if (!target) return;
    requestAnimationFrame(function () {
      if (activeBuffer && target.isConnected && !targetVisible(activeBuffer, target))
        scrollToTarget(activeBuffer, target);
    });
  }

  function clearFocus(buffer) {
    buffer.querySelectorAll('.msgwrap.mtn-focus').forEach(function (el) {
      el.classList.remove('mtn-focus');
      el.style.outlineColor = '';
    });
  }

  function render() {
    if (!activeBuffer) return;
    var msgs = messagesFor(activeBuffer, activeNick);
    var n = msgs.length;
    if (activeIdx >= n) activeIdx = n - 1;
    if (activeIdx < 0 && n) activeIdx = 0;

    var nameEl = bar.querySelector('.mtn-name');
    nameEl.textContent = activeNick;
    nameEl.style.color = activeColor || '';

    var count = bar.querySelector('.mtn-count');
    var empty = bar.querySelector('.mtn-empty');
    var up = bar.querySelector('.mtn-up');
    var down = bar.querySelector('.mtn-down');

    clearFocus(activeBuffer);
    if (n === 0) {
      count.style.display = 'none';
      empty.style.display = '';
      up.disabled = down.disabled = true;
      positionBar();
      return;
    }
    empty.style.display = 'none';
    count.style.display = '';
    count.textContent = '(' + (activeIdx + 1) + '/' + n + ')';
    up.disabled = (activeIdx <= 0);
    down.disabled = (activeIdx >= n - 1);

    var target = msgs[activeIdx];
    target.classList.add('mtn-focus');
    if (activeColor) target.style.outlineColor = activeColor;
    positionBar();
    scrollToTarget(activeBuffer, target);
  }

  function step(delta) { activeIdx += delta; render(); }

  function focusThread(nick, buffer, anchor) {
    buildBar();
    activeBuffer = buffer;
    activeNick = nick;
    activeColor = getUserColor(nick);
    var msgs = messagesFor(buffer, nick);
    activeIdx = indexForAnchor(msgs, anchor);
    // Track the buffer's geometry (pane resize, users-panel toggle, tab switch).
    if (ro) { ro.disconnect(); ro = null; }
    if (window.ResizeObserver) { ro = new ResizeObserver(positionBar); ro.observe(buffer); }
    if (posTimer) clearInterval(posTimer);
    posTimer = setInterval(positionBar, 250);
    render();
  }

  function closeBar() {
    if (bar) bar.style.display = 'none';
    if (activeBuffer) { clearFocus(activeBuffer); activeBuffer.style.paddingTop = ''; }
    if (ro) { ro.disconnect(); ro = null; }
    if (posTimer) { clearInterval(posTimer); posTimer = null; }
    activeBuffer = activeNick = null;
    activeIdx = -1;
  }

  window.addEventListener('resize', positionBar);

  // ---------------------------------------------------------------------------
  // Delegated click.
  // ---------------------------------------------------------------------------
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('.mtn-mention, .nick.mtn-nick-link');
    if (!t) return;
    var nick = t.getAttribute('data-nick');
    if (!nick) return;
    var buffer = (t.closest && t.closest('.chatbuffer')) || document.getElementById('chatbuffer');
    if (!buffer) return;
    var anchor = t.closest('.msgwrap');
    e.preventDefault();
    e.stopPropagation();
    focusThread(nick, buffer, anchor);
  }, true);

  // ---------------------------------------------------------------------------
  // Attach to buffers + user list; process messages as they arrive.
  // ---------------------------------------------------------------------------
  function seedFromChatlist() {
    document.querySelectorAll('#chatlist [nick]').forEach(function (el) { registerName(el.getAttribute('nick')); });
  }
  function attachBuffer(buffer) {
    if (buffer._mtnObserved) return;
    buffer._mtnObserved = true;
    buffer.querySelectorAll('.msgwrap').forEach(processMsgwrap);
    new MutationObserver(function (muts) {
      muts.forEach(function (mut) {
        mut.addedNodes.forEach(function (node) {
          if (node.nodeType !== 1) return;
          if (node.classList && node.classList.contains('msgwrap')) processMsgwrap(node);
          else if (node.querySelectorAll) node.querySelectorAll('.msgwrap').forEach(processMsgwrap);
        });
      });
      // Counteract BerryTube's auto-scroll-to-bottom while a thread is open.
      if (activeBuffer === buffer && activeNick) keepFocusPinned();
    }).observe(buffer, { childList: true });
  }
  function scan() {
    injectStyle();
    seedFromChatlist();
    document.querySelectorAll('.chatbuffer, #chatbuffer').forEach(attachBuffer);
  }

  scan();
  setInterval(scan, 3000);
  console.log('[MentionThreads] v0.2.1 loaded');
})();
