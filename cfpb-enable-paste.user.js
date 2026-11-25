// ==UserScript==
// @name         CFPB Enable Paste
// @namespace    CFPB Tools
// @version      1.3
// @description  Re-enable normal paste functionality on CFPB portal fields.
// @match        https://portal.consumerfinance.gov/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
    "use strict";

    /*
     * ALLOW NORMAL PASTE
     * Stop CFPB page handlers from receiving clipboard events.
     * Do not read or modify the clipboard and do not prevent the
     * browser's native paste action.
     */

    function stopPageClipboardHandler(event) {
        event.stopImmediatePropagation();
    }

    // Window capture runs before document and target-level page handlers.
    ["paste", "copy", "cut"].forEach(function (type) {
        window.addEventListener(type, stopPageClipboardHandler, true);
        document.addEventListener(type, stopPageClipboardHandler, true);
    });

    /*
     * ALLOW CUT / COPY / PASTE KEYBOARD SHORTCUTS
     */

    document.addEventListener("keydown", function (event) {
        if (
            (event.ctrlKey || event.metaKey) &&
            ["v", "c", "x"].includes(event.key.toLowerCase())
        ) {
            event.stopImmediatePropagation();
        }
    }, true);

    /*
     * ALLOW TEXT SELECTION IN CFPB FIELDS
     */

    const style = document.createElement("style");
    style.textContent = `
        input,
        textarea,
        select,
        [contenteditable="true"] {
            user-select: text !important;
            -webkit-user-select: text !important;
        }
    `;

    (document.head || document.documentElement).appendChild(style);

    /*
     * HANDLE DYNAMICALLY CREATED FIELDS
     */

    function enableSelection(root) {
        if (!root || !root.querySelectorAll) return;

        const fields = [];
        if (root.matches && root.matches("input, textarea, select")) {
            fields.push(root);
        }

        root.querySelectorAll("input, textarea, select").forEach(function (field) {
            fields.push(field);
        });

        fields.forEach(function (field) {
            field.style.setProperty("user-select", "text", "important");
            field.style.setProperty("-webkit-user-select", "text", "important");
        });
    }

    function startObserver() {
        enableSelection(document);

        const observer = new MutationObserver(function (mutations) {
            mutations.forEach(function (mutation) {
                mutation.addedNodes.forEach(function (node) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        enableSelection(node);
                    }
                });
            });
        });

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true
        });
    }

    if (document.documentElement) {
        startObserver();
    } else {
        document.addEventListener("DOMContentLoaded", startObserver, { once: true });
    }

    console.log("[CFPB Enable Paste] v1.3 active");
})();