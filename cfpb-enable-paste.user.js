// ==UserScript==
// @name         CFPB Enable Paste
// @namespace    CFPB Tools
// @version      1.0
// @description  Re-enable normal paste functionality on CFPB portal fields.
// @match        https://portal.consumerfinance.gov/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
    "use strict";

    /*
     * =====================================================
     * ALLOW PASTE
     * =====================================================
     *
     * Capture paste events before the CFPB page handlers.
     * We do NOT modify the clipboard.
     * We simply prevent the page from cancelling paste.
     */

    document.addEventListener(
        "paste",
        function (event) {
            event.stopImmediatePropagation();
        },
        true
    );

    /*
     * =====================================================
     * ALLOW CUT / COPY / PASTE KEYBOARD EVENTS
     * =====================================================
     */

    document.addEventListener(
        "keydown",
        function (event) {
            if (
                (event.ctrlKey || event.metaKey) &&
                ["v", "c", "x"].includes(event.key.toLowerCase())
            ) {
                event.stopImmediatePropagation();
            }
        },
        true
    );

    /*
     * =====================================================
     * ALLOW USER SELECTION
     * =====================================================
     */

    const style = document.createElement("style");

    style.textContent = `
        input,
        textarea,
        select {
            user-select: text !important;
            -webkit-user-select: text !important;
        }
    `;

    (document.head || document.documentElement).appendChild(style);

    /*
     * =====================================================
     * HANDLE DYNAMIC CFPB FIELDS
     * =====================================================
     */

    const observer = new MutationObserver(function () {
        document.querySelectorAll("input, textarea").forEach(function (field) {
            field.style.userSelect = "text";
            field.style.webkitUserSelect = "text";
        });
    });

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true
    });

    console.log("[CFPB Enable Paste] Active");
})();
