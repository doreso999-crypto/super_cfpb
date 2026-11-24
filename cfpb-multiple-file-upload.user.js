// ==UserScript==
// @name         CFPB - Multiple File Upload
// @namespace    CFPB Tools
// @version      1.0.0
// @description  Enables multiple file selection in CFPB attachment upload fields.
// @match        https://portal.consumerfinance.gov/*
// @run-at       document-start
// @grant        none
// @all-frames   true
// ==/UserScript==

(function () {
    'use strict';

    const SELECTOR = 'input[type="file"]';

    function enableMultipleUploads(root) {
        if (!root || typeof root.querySelectorAll !== 'function') return;

        root.querySelectorAll(SELECTOR).forEach(input => {
            if (!input.multiple) {
                input.multiple = true;
                input.setAttribute('multiple', '');
            }
        });

        // Also handle a root that is itself a file input.
        if (root.matches?.(SELECTOR) && !root.multiple) {
            root.multiple = true;
            root.setAttribute('multiple', '');
        }
    }

    // The CFPB attachment picker is rendered inside a same-origin iframe.
    // @all-frames lets this script run in that iframe as well as the parent page.
    enableMultipleUploads(document);

    const observer = new MutationObserver(mutations => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    enableMultipleUploads(node);
                }
            }
        }
    });

    observer.observe(document, {
        childList: true,
        subtree: true
    });
})();
