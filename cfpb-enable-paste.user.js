// ==UserScript==
// @name         CFPB Enable Paste
// @namespace    CFPB Tools
// @version      1.2
// @description  Restore paste in CFPB signup and other portal form fields.
// @match        https://portal.consumerfinance.gov/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
    "use strict";

    const FIELD_SELECTOR = [
        "input:not([type=button]):not([type=submit]):not([type=reset]):not([type=checkbox]):not([type=radio])",
        "textarea",
        '[contenteditable="true"]',
        ".sfdc_usernameinput",
        ".sfdc_extrafieldinput",
        ".sfdc_passwordinput"
    ].join(",");

    function isEditable(field) {
        return field instanceof HTMLElement &&
            (field.matches(FIELD_SELECTOR) || field.isContentEditable);
    }

    // Insert clipboard text ourselves so page-level paste blockers cannot
    // cancel the operation. The native value setter also works with React-style
    // controlled inputs when followed by an input event.
    function insertClipboardText(event) {
        const field = event.target;
        if (!isEditable(field) || field.disabled || field.readOnly) return;

        const clipboard = event.clipboardData;
        if (!clipboard) return;

        const text = clipboard.getData("text/plain");
        if (text === "") return;

        event.preventDefault();
        event.stopImmediatePropagation();

        if (field.isContentEditable) {
            const selection = window.getSelection();
            if (selection && selection.rangeCount) {
                const range = selection.getRangeAt(0);
                range.deleteContents();
                const node = document.createTextNode(text);
                range.insertNode(node);
                range.setStartAfter(node);
                range.collapse(true);
                selection.removeAllRanges();
                selection.addRange(range);
            } else {
                field.appendChild(document.createTextNode(text));
            }
            field.dispatchEvent(new InputEvent("input", {
                bubbles: true,
                inputType: "insertFromPaste",
                data: text
            }));
            return;
        }

        const isTextArea = field instanceof HTMLTextAreaElement;
        const proto = isTextArea ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const valueSetter = Object.getOwnPropertyDescriptor(proto, "value").set;
        const start = typeof field.selectionStart === "number" ? field.selectionStart : field.value.length;
        const end = typeof field.selectionEnd === "number" ? field.selectionEnd : start;
        const nextValue = field.value.slice(0, start) + text + field.value.slice(end);

        valueSetter.call(field, nextValue);
        if (typeof field.setSelectionRange === "function") {
            field.setSelectionRange(start + text.length, start + text.length);
        }

        field.dispatchEvent(new InputEvent("input", {
            bubbles: true,
            inputType: "insertFromPaste",
            data: text
        }));
        field.dispatchEvent(new Event("change", { bubbles: true }));
    }

    // Register on window and document capture phases before page handlers.
    window.addEventListener("paste", insertClipboardText, true);
    document.addEventListener("paste", insertClipboardText, true);

    function enableField(field) {
        if (!isEditable(field)) return;

        field.style.setProperty("user-select", "text", "important");
        field.style.setProperty("-webkit-user-select", "text", "important");

        ["onpaste", "oncopy", "oncut"].forEach((name) => {
            field.removeAttribute(name);
            field[name] = null;
        });
    }

    function scan(root) {
        if (!root || !root.querySelectorAll) return;
        if (root.matches && root.matches(FIELD_SELECTOR)) enableField(root);
        root.querySelectorAll(FIELD_SELECTOR).forEach(enableField);
    }

    function install() {
        scan(document);
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === "childList") {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) scan(node);
                    });
                } else if (mutation.type === "attributes") {
                    enableField(mutation.target);
                }
            }
        });

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["onpaste", "oncopy", "oncut", "style"]
        });
    }

    if (document.documentElement) install();
    else document.addEventListener("DOMContentLoaded", install, { once: true });

    console.log("[CFPB Enable Paste] v1.2 active");
})();