// ==UserScript==
// @name         CFPB - Remember Uploads + Drag and Drop
// @namespace    CFPB Tools
// @version      5.4.0
// @description  Remembers uploaded filenames and supports single-file drag and drop onto the CFPB uploader.
// @match        https://portal.consumerfinance.gov/*
// @run-at       document-start
// @grant        none
// @all-frames   true
// ==/UserScript==

(function () {
    'use strict';

    const STORAGE_KEY = 'cfpb-uploaded-filenames-v1';
    const COMPLAINT_FILES_KEY = 'cfpb-files-by-complaint-v1';
    const ACTIVE_COMPLAINT_KEY = 'cfpb-active-complaint-v1';
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

    function getComplaintId() {
        const field = document.querySelector(
            'input[name$="objectRecordId"], input[id$="objectRecordId"], input[name="objectRecordId"]'
        );
        const value = field?.value?.trim();
        if (value) {
            try { sessionStorage.setItem(ACTIVE_COMPLAINT_KEY, value); } catch (_) {}
            return value;
        }
        try { return sessionStorage.getItem(ACTIVE_COMPLAINT_KEY) || ''; } catch (_) { return ''; }
    }

    function readComplaintFiles() {
        try {
            const value = JSON.parse(localStorage.getItem(COMPLAINT_FILES_KEY) || '{}');
            return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
        } catch (_) { return {}; }
    }

    function fileDestination(filename) {
        const upper = String(filename).toUpperCase();
        const tokens = upper.split(/[^A-Z0-9]+/).filter(Boolean);
        const matches = [];
        if (tokens.includes('EQU') || upper.includes('EQUIFAX')) matches.push('Equifax');
        if (tokens.includes('EX') || tokens.includes('EXP') || upper.includes('EXPERIAN')) matches.push('Experian');
        if (tokens.includes('TU') || upper.includes('TRANSUNION')) matches.push('TransUnion');
        return matches.length ? matches.join(' / ') : 'Company not identified from filename';
    }

    function renderStep4Files() {
        const sidebar = document.querySelector('aside.content_sidebar.cMosConsumerAside');
        const companyInput = document.querySelector('input.search-box-body, input[placeholder="Company name"]');
        const anchor = sidebar || companyInput;
        if (!anchor) return;

        let panel = document.getElementById('cfpb-step4-uploaded-files');
        if (!panel) {
            panel = document.createElement('section');
            panel.id = 'cfpb-step4-uploaded-files';
            panel.style.cssText = 'margin:10px 0 14px;padding:10px 12px;border:1px solid #d8d8d8;border-radius:5px;background:#fafafa;color:#333;font:12px/1.5 Arial,sans-serif;max-width:100%;box-sizing:border-box';
            anchor.insertAdjacentElement('afterend', panel);
        } else if (sidebar && panel.previousElementSibling !== sidebar) {
            sidebar.insertAdjacentElement('afterend', panel);
        }

        let filenames = [];
        try {
            const saved = JSON.parse(sessionStorage.getItem('cfpb-step3-filenames-v1') || '[]');
            filenames = Array.isArray(saved) ? saved.filter(name => typeof name === 'string' && name.trim()) : [];
        } catch (_) {}
        panel.replaceChildren();

        const heading = document.createElement('div');
        heading.textContent = 'Filename(s) selected in Step 3';
        heading.style.cssText = 'font-weight:600;margin-bottom:5px';
        panel.appendChild(heading);

        if (!filenames.length) {
            const note = document.createElement('div');
            note.textContent = 'No Step 3 filename captured yet.';
            note.style.color = '#777';
            panel.appendChild(note);
            return;
        }

        const list = document.createElement('div');
        list.style.cssText = 'overflow-wrap:anywhere';
        list.textContent = filenames.join(' | ');
        panel.appendChild(list);
    }

    function rememberFiles(fileList) {
        const names = Array.from(fileList || []).map(file => file.name).filter(Boolean);
        if (!names.length) return;
        // Store only filename strings so Step 4 can display them; file contents are never copied.
        try {
            const prior = JSON.parse(sessionStorage.getItem('cfpb-step3-filenames-v1') || '[]');
            const combined = [...new Set([...(Array.isArray(prior) ? prior : []), ...names])];
            sessionStorage.setItem('cfpb-step3-filenames-v1', JSON.stringify(combined));
        } catch (_) {
            try { sessionStorage.setItem('cfpb-step3-filenames-v1', JSON.stringify(names)); } catch (_) {}
        }

        const previous = safeGetNames();
        const previousLookup = new Set(previous.map(name => name.trim().toLocaleLowerCase()));
        const duplicates = names.filter(name => previousLookup.has(name.trim().toLocaleLowerCase()));
        const merged = [...new Set([...previous, ...names])];
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(merged)); } catch (_) {}

        const complaintId = getComplaintId();
        if (complaintId) {
            const byComplaint = readComplaintFiles();
            const current = Array.isArray(byComplaint[complaintId]) ? byComplaint[complaintId] : [];
            const known = new Set(current.map(item => String(item.name || '').trim().toLocaleLowerCase()));
            for (const name of names) {
                if (!known.has(name.trim().toLocaleLowerCase())) current.push({ name, addedAt: Date.now() });
            }
            byComplaint[complaintId] = current;
            try { localStorage.setItem(COMPLAINT_FILES_KEY, JSON.stringify(byComplaint)); } catch (_) {}
        } else {
            showToast('Could not identify this complaint. The filename was added to general history but not assigned to a complaint.', 'warning');
        }

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
        renderStep4Files();
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


    // Keep the Step 4 file summary current as the portal advances or re-renders.
    function installStep4FilePanel() {
        renderStep4Files();
    }
    installStep4FilePanel();
    new MutationObserver(installStep4FilePanel).observe(document.documentElement, {
        childList: true,
        subtree: true
    });

    // Allow a single file to be dropped directly onto CFPB's visible uploader.
    // Route it through the page's existing file input/change handler so the
    // portal retains responsibility for validation and upload.
    function installUploaderDrop() {
        const uploader = document.getElementById('file-upload');
        if (!uploader) return;

        if (!document.getElementById('cfpb-active-note')) {
            const note = document.createElement('div');
            note.id = 'cfpb-active-note';
            note.textContent = 'Super CFPB is active';
            note.style.cssText = 'margin-top:7px;color:#888;font:11px/1.4 Arial,sans-serif;text-align:center;opacity:.75;pointer-events:none';
            uploader.insertAdjacentElement('afterend', note);
        }

        if (uploader.dataset.cfpbDropReady === 'true') return;
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
            } catch (error) {
                showToast('This browser could not pass the dropped file to the CFPB uploader. Please use “Select a file to upload.”');
            }
        }, true);
    }

    installUploaderDrop();
    new MutationObserver(installUploaderDrop).observe(document.documentElement, {
        childList: true,
        subtree: true
    });

})();
