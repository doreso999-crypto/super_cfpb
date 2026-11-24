// ==UserScript==
// @name         CFPB - Remember Uploads + Detected Company Dropdown
// @namespace    CFPB Tools
// @version      4.8.0
// @description  Remembers uploaded filenames and shows matching companies in a dropdown remembers uploaded filenames; no company dropdown or autofill.
// @match        https://portal.consumerfinance.gov/*
// @run-at       document-start
// @grant        none
// @all-frames   true
// ==/UserScript==

(function () {
    'use strict';

    const STORAGE_KEY = 'cfpb-uploaded-filenames-v1';
    const BUREAUS = {
        EQU: 'Equifax information solution, Inc.',
        EXP: 'Experian Information Solutions, Inc.',
        TU: 'TRANSUNION INTERMEDIATE HOLDINGS, INC.'
    };
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

    function safeGetNames() {
        try {
            const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
            return Array.isArray(value) ? value.filter(x => typeof x === 'string') : [];
        } catch (_) {
            return [];
        }
    }

    function rememberFiles(fileList) {
        const names = Array.from(fileList || []).map(file => file.name).filter(Boolean);
        if (!names.length) return;
        const merged = [...new Set([...safeGetNames(), ...names])];
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(merged)); } catch (_) {}
        showToast('Saved uploaded filename(s):\\n' + names.join('\\n'), 'success');
    }

    function detectedBureaus() {
        const names = safeGetNames();
        const found = new Set();

        for (const name of names) {
            // Split on every non-alphanumeric character so codes surrounded by
            // hyphens, underscores, spaces, or punctuation are treated equally.
            // Example: "Daniel H-EXP-LP" becomes ["DANIEL", "H", "EXP", "LP"].
            const upper = String(name).toUpperCase();
            const tokens = upper.split(/[^A-Z0-9]+/).filter(Boolean);

            if (tokens.includes('EQU') || upper.includes('EQUIFAX')) found.add('EQU');
            if (tokens.includes('EX') || tokens.includes('EXP') || upper.includes('EXPERIAN')) found.add('EXP');
            if (tokens.includes('TU') || upper.includes('TRANSUNION')) found.add('TU');
        }

        return ['EQU', 'EXP', 'TU'].filter(code => found.has(code));
    }

    function showToast(message, type = 'warning') {
        const doc = document;
        if (!doc.body) return;
        let toast = doc.getElementById('cfpb-helper-toast');
        if (!toast) {
            toast = doc.createElement('div');
            toast.id = 'cfpb-helper-toast';
            toast.style.cssText = 'position:fixed;top:18px;right:18px;z-index:2147483647;max-width:min(480px,calc(100vw - 36px));display:flex;gap:12px;align-items:flex-start;padding:13px 15px;border:2px solid #7a1711;border-radius:7px;background:#b42318;color:white;box-shadow:0 3px 14px #0004;font:14px/1.5 Arial,sans-serif;white-space:pre-line';
            const text = doc.createElement('div');
            text.id = 'cfpb-helper-toast-text';
            text.style.cssText = 'flex:1;overflow-wrap:anywhere';
            const close = doc.createElement('button');
            close.type = 'button';
            close.textContent = '×';
            close.setAttribute('aria-label', 'Close notification');
            close.style.cssText = 'border:0;background:transparent;color:white;font:bold 24px/20px Arial;cursor:pointer;padding:0';
            close.addEventListener('click', () => toast.remove());
            toast.append(text, close);
            doc.body.appendChild(toast);
        }
        toast.style.background = type === 'success' ? '#176b3a' : '#b42318';
        toast.style.borderColor = type === 'success' ? '#104d2a' : '#7a1711';
        toast.querySelector('#cfpb-helper-toast-text').textContent = message;
    }

    // Explicitly keep the native picker single-file, including dynamically inserted inputs.
    function enforceSingleFilePicker(root) {
        if (!root || typeof root.querySelectorAll !== 'function') return;
        const inputs = [];
        if (root instanceof HTMLInputElement && root.type === 'file') inputs.push(root);
        inputs.push(...root.querySelectorAll('input[type="file"]'));
        for (const input of inputs) {
            input.multiple = false;
            input.removeAttribute('multiple');
        }
    }

    enforceSingleFilePicker(document);
    new MutationObserver(records => {
        for (const record of records) {
            for (const node of record.addedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE) enforceSingleFilePicker(node);
            }
        }
    }).observe(document.documentElement, { childList: true, subtree: true });

    // Step 3: capture filenames from the ordinary single-file picker. No multi-select is enabled.
    document.addEventListener('change', event => {
        const input = event.target;
        if (input instanceof HTMLInputElement && input.type === 'file') {
            rememberFiles(input.files);
        }
    }, true);

    function visible(element) {
        return !!(element && (element.offsetWidth || element.offsetHeight || element.getClientRects().length));
    }

    function companyInputIn(container) {
        return container?.querySelector('input.search-box-body, input[placeholder="Company name"]') || null;
    }

    function watchForCompanyStep() {
        installDetectedCompanyDropdowns();
        const observer = new MutationObserver(installDetectedCompanyDropdowns);
        observer.observe(document.documentElement || document, { childList: true, subtree: true });
        window.addEventListener('hashchange', installDetectedCompanyDropdowns);
        window.addEventListener('popstate', installDetectedCompanyDropdowns);
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', watchForCompanyStep, { once: true });
    } else {
        watchForCompanyStep();
    }
})();
