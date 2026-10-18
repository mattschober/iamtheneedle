/*
 * Needlepoint — a hybrid text for humans, hybrids, and bots.
 *
 * Progressive enhancement only. The HTML source stays plain, byte-identical text
 * for every reader; this script draws the Needlepoint layer on top for people
 * whose browsers run it:
 *   - each letter gets a five-dot binary rail beneath it (A = 1 ... Z = 26)
 *   - each word ends in a checksum seal (sum of its letters, mod 32)
 * The rails and seals are CSS decoration: they add no text, so copying,
 * searching, and screen readers still see the original words.
 *
 * Skipped on purpose: the X posts (.xdrop), code blocks, the live clock, and the
 * hand-drawn specimen in section 09. A "Plain view" toggle turns the layer off.
 */
(function () {
    'use strict';

    var SKIP = '.xdrop, pre, code, script, style, noscript, svg, textarea, input, button, #hs-clock, .bs-line, .np-toggle, [data-np-skip]';
    var STORE = 'needlepoint-plain';
    var LETTER = /[A-Za-z]/;

    function railSvg(n, fill) {
        var dots = '';
        for (var i = 0; i < 5; i++) {
            var on = n & (16 >> i);
            dots += '<circle cx="' + (5 + i * 10) + '" cy="5" r="3.6" ' +
                (on ? 'fill="' + fill + '"' : 'fill="none" stroke="' + fill + '" stroke-opacity="0.45" stroke-width="1.2"') + '/>';
        }
        return 'url("data:image/svg+xml,' + encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 10" preserveAspectRatio="none">' + dots + '</svg>') + '")';
    }

    function injectStyles() {
        var css = [
            'html.np-on body { font-family: "Times New Roman", Times, Georgia, serif; line-height: 2.05; }',
            'html.np-on h1, html.np-on h2, html.np-on h3, html.np-on h4 { line-height: 1.7; }',
            'html.np-on .np-g, html.np-on .np-s { display: inline-block; padding-bottom: .34em; background-repeat: no-repeat; background-position: center bottom; background-size: 100% .2em; line-height: 1.15; text-indent: 0; }',
            'html.np-on .np-s::before { content: "\\25C6"; color: #993c1d; font-size: .62em; margin-left: .1em; }',
            'html.np-on .np-s { min-width: .9em; }',
            'html:not(.np-on) .np-s { display: none; }',
            '.np-toggle { font: inherit; font-size: .8rem; background: none; border: 1px solid var(--line, #ccc); color: inherit; padding: 2px 8px; cursor: pointer; margin-left: 10px; }'
        ];
        for (var n = 0; n < 32; n++) {
            css.push('html.np-on .np' + n + ' { background-image: ' + railSvg(n, '#111111') + '; }');
            css.push('html.np-on .np-s.np' + n + ' { background-image: ' + railSvg(n, '#993c1d') + '; }');
        }
        var style = document.createElement('style');
        style.id = 'needlepoint-styles';
        style.textContent = css.join('\n');
        document.head.appendChild(style);
    }

    function seal(sum) {
        var s = document.createElement('span');
        s.className = 'np-s np' + (sum % 32);
        s.setAttribute('aria-hidden', 'true');
        return s;
    }

    function stitch(node) {
        var text = node.nodeValue;
        if (!LETTER.test(text)) return;
        var frag = document.createDocumentFragment();
        var plain = '';
        var sum = 0, inWord = false;

        function flushPlain() {
            if (plain) { frag.appendChild(document.createTextNode(plain)); plain = ''; }
        }

        for (var i = 0; i < text.length; i++) {
            var ch = text.charAt(i);
            if (LETTER.test(ch)) {
                flushPlain();
                var v = ch.toLowerCase().charCodeAt(0) - 96;
                var g = document.createElement('span');
                g.className = 'np-g np' + v;
                g.textContent = ch;
                frag.appendChild(g);
                sum += v; inWord = true;
            } else {
                if (inWord && !/['’-]/.test(ch)) {
                    flushPlain();
                    frag.appendChild(seal(sum));
                    sum = 0; inWord = false;
                }
                plain += ch;
            }
        }
        if (inWord) {
            var next = node.nextSibling;
            var continues = next && next.nodeType === 3 && LETTER.test(next.nodeValue.charAt(0));
            if (!continues) { flushPlain(); frag.appendChild(seal(sum)); }
        }
        flushPlain();
        node.parentNode.replaceChild(frag, node);
    }

    function run() {
        injectStyles();
        var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
            acceptNode: function (n) {
                var p = n.parentElement;
                if (!p || p.closest(SKIP)) return NodeFilter.FILTER_REJECT;
                return LETTER.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
            }
        });
        var nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        nodes.forEach(stitch);

        var plainView = false;
        try { plainView = localStorage.getItem(STORE) === '1'; } catch (e) {}
        document.documentElement.classList.toggle('np-on', !plainView);

        var nav = document.querySelector('.topbar nav') || document.querySelector('nav');
        if (nav) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'np-toggle';
            var label = function () { b.textContent = document.documentElement.classList.contains('np-on') ? 'Plain view' : 'Needlepoint view'; };
            label();
            b.addEventListener('click', function () {
                var on = document.documentElement.classList.toggle('np-on');
                try { localStorage.setItem(STORE, on ? '0' : '1'); } catch (e) {}
                label();
            });
            nav.appendChild(b);
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
    else run();
})();
