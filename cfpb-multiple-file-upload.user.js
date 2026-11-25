// ==UserScript==
// @name         CFPB - Remember Uploads + Drag and Drop
// @namespace    CFPB Tools
// @version      5.6.0
// @description  Remembers uploaded filenames and supports single-file drag and drop onto the CFPB uploader.
// @match        https://portal.consumerfinance.gov/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const STORAGE_KEY = 'cfpb-uploaded-filenames-v1';
    const BUREAUS = {
        EQU: 'Equifax information solution, Inc.',
        EXP: 'Experian Information Solutions, Inc.',
        TU: 'TRANSUNION INTERMEDIATE HOLDINGS, INC.'
    };

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
        const previous = safeGetNames();
        const previousLookup = new Set(previous.map(name => name.trim().toLocaleLowerCase()));
        const duplicates = names.filter(name => previousLookup.has(name.trim().toLocaleLowerCase()));
        const merged = [...new Set([...previous, ...names])];
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(merged)); } catch (_) {}

        if (duplicates.length) {
            showToast(
                'DUPLICATE FILENAME DETECTED — upload is still allowed.\\n\\n' +
                duplicates.map(name => '• ' + name).join('\\n') +
                '\\n\\nThis filename already exists in the upload history. Close this notice when reviewed.',
                'warning'
            );
        } else {
            showToast('Saved uploaded filename(s):\\n' + names.join('\\n'), 'success');
        }
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

    // Keep the native picker single-file. Avoid repeatedly scanning the whole page:
    // process only newly inserted elements that actually contain file inputs.
    function enforceSingleFilePicker(root) {
        if (!root || root.nodeType !== Node.ELEMENT_NODE) return;
        if (root.matches?.('input[type="file"]')) {
            root.multiple = false;
            root.removeAttribute('multiple');
        }
        if (root.querySelectorAll) {
            for (const input of root.querySelectorAll('input[type="file"]')) {
                input.multiple = false;
                input.removeAttribute('multiple');
            }
        }
    }

    function installUploaderDrop(uploader) {
        if (!uploader || uploader.dataset.cfpbDropReady === 'true') return;

        if (!document.getElementById('cfpb-active-note')) {
            const note = document.createElement('div');
            note.id = 'cfpb-active-note';
            note.textContent = 'Super CFPB is active';
            note.style.cssText = 'margin-top:7px;color:#888;font:11px/1.4 Arial,sans-serif;text-align:center;opacity:.75;pointer-events:none';
            uploader.insertAdjacentElement('afterend', note);
        }

        uploader.dataset.cfpbDropReady = 'true';
        uploader.addEventListener('dragenter', event => {
            event.preventDefault();
            if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
        }, true);
        uploader.addEventListener('dragover', event => {
            event.preventDefault();
            if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
        }, true);
        uploader.addEventListener('drop', event => {
            event.preventDefault();
            event.stopImmediatePropagation();

            const file = event.dataTransfer?.files?.[0];
            if (!file) return;

            const input = uploader.querySelector('input[type="file"]') ||
                document.querySelector('#j_id0\\:form\\:file');
            if (!input) {
                showToast('The CFPB file input was not found. Please use “Select a file to upload.”');
                return;
            }

            try {
                const transfer = new DataTransfer();
                transfer.items.add(file);
                input.files = transfer.files;
                input.dispatchEvent(new Event('change', { bubbles: true }));
            } catch (_) {
                showToast('This browser could not pass the dropped file to the CFPB uploader. Please use “Select a file to upload.”');
            }
        }, true);
    }

    function processAddedNode(node) {
        if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
        enforceSingleFilePicker(node);

        let uploader = null;
        if (node.matches?.('#file-upload')) uploader = node;
        else uploader = node.querySelector?.('#file-upload');
        if (uploader) installUploaderDrop(uploader);
    }

    // Initial pass, then one observer that reacts only to inserted subtrees.
    enforceSingleFilePicker(document.documentElement);
    const initialUploader = document.getElementById('file-upload');
    if (initialUploader) installUploaderDrop(initialUploader);

    const pageObserver = new MutationObserver(records => {
        for (const record of records) {
            for (const node of record.addedNodes) processAddedNode(node);
        }
    });
    if (document.documentElement) {
        pageObserver.observe(document.documentElement, { childList: true, subtree: true });
    }

    // Step 3: capture filenames from the ordinary single-file picker. No multi-select is enabled.
    document.addEventListener('change', event => {
        const input = event.target;
        if (input instanceof HTMLInputElement && input.type === 'file') {
            rememberFiles(input.files);
        }
    }, true);




})();
