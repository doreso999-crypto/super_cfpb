// ==UserScript==
// @name         CFPB Enable Paste
// @namespace    CFPB Tools
// @version      1.1
// @description  Restore normal paste, cut, copy, and text selection on CFPB portal form fields.
// @match        https://portal.consumerfinance.gov/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
    "use strict";

    const FIELD_SELECTOR = [
        "input:not([type=button]):not([type=submit]):not([type=reset]):not([type=checkbox]):not([type=radio])",
        "textarea",
        '[contenteditable="true"]'
    ].join(",");

    // Stop page-level handlers from cancelling clipboard actions, but never
    // prevent the browser's native paste default.
    function allowClipboardEvent(event) {
        event.stopImmediatePropagation();
    }

    ["paste", "copy", "cut"].forEach((type) => {
        window.addEventListener(type, allowClipboardEvent, true);
        document.addEventListener(type, allowClipboardEvent, true);
    });

    document.addEventListener("keydown", function (event) {
        const key = event.key.toLowerCase();
        const isClipboardShortcut =
            (event.ctrlKey || event.metaKey) &&
            ["v", "c", "x"].includes(key);

        if (isClipboardShortcut) {
            event.stopImmediatePropagation();
        }
    }, true);

    function enableField(field) {
        if (!(field instanceof HTMLElement)) return;

        field.style.setProperty("user-select", "text", "important");
        field.style.setProperty("-webkit-user-select", "text", "important");

        // Remove inline handlers commonly used to disable paste.
        ["onpaste", "oncopy", "oncut"].forEach((attribute) => {
            if (field.hasAttribute(attribute)) field.removeAttribute(attribute);
        });

        field.onpaste = null;
        field.oncopy = null;
        field.oncut = null;

        if (field.hasAttribute("readonly") && field.dataset.cfpbPasteReadonly === "true") {
            field.removeAttribute("readonly");
        }
    }

    function scan(root) {
        if (!root || !root.querySelectorAll) return;

        if (root.matches && root.matches(FIELD_SELECTOR)) {
            enableField(root);
        }

        root.querySelectorAll(FIELD_SELECTOR).forEach(enableField);
    }

    function install() {
        scan(document);

        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === "childList") {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) scan(node);
                    });
                } else if (mutation.type === "attributes") {
                    enableField(mutation.target);
                }
            });
        });

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["onpaste", "oncopy", "oncut", "style"]
        });
    }

    if (document.documentElement) {
        install();
    } else {
        document.addEventListener("DOMContentLoaded", install, { once: true });
    }

    console.log("[CFPB Enable Paste] Active — form paste enabled");
})();
