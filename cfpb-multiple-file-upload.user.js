// ==UserScript==
// @name         CFPB - Multiple File Selection + Name Check
// @namespace    CFPB Tools
// @version      3.1.0
// @description  Allows multi-select and warns when selected filenames do not match the logged-in user's first name.
// @match        https://portal.consumerfinance.gov/*
// @run-at       document-start
// @grant        none
// @all-frames   true
// ==/UserScript==

(function () {
    'use strict';

    const FILE_INPUT = 'input[type="file"]';

    function topDocument() {
        try {
            return window.top.document;
        } catch (_) {
            return document;
        }
    }

    function enableMultiple(input) {
        if (!input.multiple) {
            input.multiple = true;
            input.setAttribute('multiple', '');
        }
    }

    function normalized(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '');
    }

    function loggedInFirstName() {
        const userElement = topDocument().querySelector('#user-name');
        if (!userElement) return '';
        const fullName = userElement.textContent.trim();
        return fullName.split(/\s+/)[0] || '';
    }

    function showWarning(message) {
        const doc = topDocument();
        if (!doc.body) return;

        let toast = doc.getElementById('cfpb-filename-warning');

        if (!toast) {
            toast = doc.createElement('div');
            toast.id = 'cfpb-filename-warning';
            toast.style.cssText = [
                'position:fixed',
                'top:20px',
                'right:20px',
                'z-index:2147483647',
                'width:max-content',
                'max-width:min(460px,calc(100vw - 40px))',
                'box-sizing:border-box',
                'display:flex',
                'align-items:flex-start',
                'gap:14px',
                'padding:14px 16px',
                'background:#b42318',
                'color:#fff',
                'border:2px solid #7a1711',
                'border-radius:7px',
                'box-shadow:0 3px 14px rgba(0,0,0,.28)',
                'font:14px/1.5 Arial,sans-serif'
            ].join(';');

            const messageElement = doc.createElement('div');
            messageElement.id = 'cfpb-filename-warning-message';
            messageElement.style.cssText = 'flex:1;min-width:0;white-space:pre-line;overflow-wrap:anywhere';

            const closeButton = doc.createElement('button');
            closeButton.type = 'button';
            closeButton.textContent = '×';
            closeButton.setAttribute('aria-label', 'Close warning');
            closeButton.title = 'Close';
            closeButton.style.cssText = [
                'flex:none',
                'border:0',
                'background:transparent',
                'color:#fff',
                'font:bold 24px/20px Arial,sans-serif',
                'padding:0 2px',
                'margin:-2px -2px 0 0',
                'cursor:pointer'
            ].join(';');
            closeButton.addEventListener('click', () => toast.remove());

            toast.append(messageElement, closeButton);
            doc.body.appendChild(toast);
        }

        const messageElement = toast.querySelector('#cfpb-filename-warning-message');
        if (messageElement) messageElement.textContent = message;
        toast.style.display = 'flex';
    }

    function checkSelectedFiles(input) {
        const firstName = loggedInFirstName();
        if (!firstName) {
            showWarning('FILENAME CHECK WARNING\nCould not read the logged-in name. Please verify the selected filenames manually.');
            return;
        }

        const expected = normalized(firstName);
        const mismatches = Array.from(input.files || []).filter(file =>
            !normalized(file.name).includes(expected)
        );

        if (mismatches.length) {
            const names = mismatches.map(file => '• ' + file.name).join('\n');
            showWarning(
                'FILENAME WARNING\n' +
                'Logged-in user: ' + firstName + '\n' +
                'These selected file(s) do not contain the user name:\n' +
                names
            );
        }
    }

    function scan(root) {
        if (!root || typeof root.querySelectorAll !== 'function') return;
        root.querySelectorAll(FILE_INPUT).forEach(enableMultiple);
        if (root.matches?.(FILE_INPUT)) enableMultiple(root);
    }

    scan(document);

    new MutationObserver(records => {
        for (const record of records) {
            for (const node of record.addedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE) scan(node);
            }
        }
    }).observe(document, { childList: true, subtree: true });

    document.addEventListener('change', event => {
        const input = event.target;
        if (!(input instanceof HTMLInputElement) || !input.matches(FILE_INPUT)) return;

        enableMultiple(input);
        checkSelectedFiles(input);
    }, true);
})();
