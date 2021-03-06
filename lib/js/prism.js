/**
 * This is file that extend scheme PrismJS sytnax to work better with LIPS
 * This file is part of LIPS interpreter
 * Copyright (C) Jakub T. Jankiewicz <https://jcubic.pl>
 *
 * based on 1.22.0
 *
 */
/* global Prism */

// extend scheme syntax in PrismJS to inlcude regular expressions
// (it's modification of JavaScript regex, only look behind was modified)
Prism.languages.insertBefore('scheme', 'string', {
   'regex': {
       pattern: /(^|\s)\/(?:\[(?:[^\]\\\r\n]|\\.)*]|\\.|[^/\\\[\r\n])+\/[gimyus]{0,6}(?=(?:\s|\/\*(?:[^*]|\*(?!\/))*\*\/)*(?:$|[\r\n,.;:})\]]|\/\/))/,
       lookbehind: true,
       greedy: true
   }
});

// symbols
Prism.languages.insertBefore('scheme', 'string', {
   symbol: {
       pattern: /'(?:[^\s()\[\]]+|\|[^|]+\|)/g,
       greedy: true
   }
});
// add LIPS specific keywords
var keyword = Prism.languages.scheme.keyword.pattern;
Prism.languages.scheme.keyword.pattern = new RegExp(keyword.source.replace(/\|when/, '|when|set-obj!|let-env|try|catch|throw|raise'));
