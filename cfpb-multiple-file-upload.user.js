// ==UserScript==
// @name         CFPB - Multiple File Upload Queue
// @namespace    CFPB Tools
// @version      2.0.0
// @description  Queues selected files and submits them one at a time through CFPB's existing uploader.
// @match        https://portal.consumerfinance.gov/*
// @run-at       document-start
// @grant        none
// @all-frames   true
// ==/UserScript==

(function () {
    'use strict';

    const FILE_INPUT = 'input[type="file"]';
    const ATTACHMENT_LINKS = 'a[data-salesforce-file-record-id]';
    const UPLOAD_TIMEOUT_MS = 120000;
    const POLL_INTERVAL_MS = 500;

    // Only the upload iframe should own the queue. The top page has no file input.
    let activeQueue = false;
    let panel;
    let statusLine;
    let list;

    function setMultiple(input) {
        if (!input.multiple) {
            input.multiple = true;
            input.setAttribute('multiple', '');
        }
    }

    function getTopDocument() {
        try {
            return window.top.document;
        } catch (_) {
            return document;
        }
    }

    function attachmentCount() {
        const doc = getTopDocument();
        return doc.querySelectorAll(ATTACHMENT_LINKS).length;
    }

    function makeSingleFileList(file) {
        const transfer = new DataTransfer();
        transfer.items.add(file);
        return transfer.files;
    }

    function createPanel(files) {
        const doc = getTopDocument();
        if (!doc.body) return;

        panel?.remove();
        panel = doc.createElement('section');
        panel.id = 'cfpb-multi-upload-queue';
        panel.style.cssText = [
            'position:fixed',
            'right:20px',
            'bottom:20px',
            'z-index:2147483647',
            'width:340px',
            'max-height:55vh',
            'overflow:auto',
            'background:#fff',
            'color:#222',
            'border:1px solid #888',
            'border-radius:8px',
            'box-shadow:0 4px 18px rgba(0,0,0,.22)',
            'padding:14px',
            'font:13px/1.4 Arial,sans-serif'
        ].join(';');

        const heading = doc.createElement('div');
        heading.textContent = 'CFPB Upload Queue';
        heading.style.cssText = 'font-weight:700;font-size:15px;margin-bottom:8px';
        statusLine = doc.createElement('div');
        statusLine.textContent = 'Preparing uploads…';
        statusLine.style.cssText = 'margin-bottom:8px;color:#555';

        list = doc.createElement('ol');
        list.style.cssText = 'margin:0;padding-left:22px';

        files.forEach(file => {
            const item = doc.createElement('li');
            item.textContent = file.name + ' — Waiting';
            item.style.cssText = 'margin:5px 0;overflow-wrap:anywhere';
            list.appendChild(item);
        });

        panel.append(heading, statusLine, list);
        doc.body.appendChild(panel);
    }

    function updateItem(index, status) {
        if (!list?.children[index]) return;
        const file = list.children[index].textContent.split(' — ')[0];
        list.children[index].textContent = file + ' — ' + status;
    }

    function setStatus(message) {
        if (statusLine) statusLine.textContent = message;
    }

    function waitForAttachmentIncrease(previousCount) {
        return new Promise((resolve, reject) => {
            const started = Date.now();
            const timer = setInterval(() => {
                const current = attachmentCount();
                if (current > previousCount) {
                    clearInterval(timer);
                    resolve(current);
                } else if (Date.now() - started >= UPLOAD_TIMEOUT_MS) {
                    clearInterval(timer);
                    reject(new Error('Timed out waiting for CFPB to register the uploaded attachment.'));
                }
            }, POLL_INTERVAL_MS);
        });
    }

    async function runQueue(input, files, initialCount) {
        activeQueue = true;
        createPanel(files);

        // Capture the count before CFPB's original handler can finish the first upload.
        let knownCount = initialCount;

        try {
            // The original change event is already submitting file 1.
            updateItem(0, 'Uploading');
            setStatus('Uploading 1 of ' + files.length);

            knownCount = await waitForAttachmentIncrease(knownCount);
            updateItem(0, 'Uploaded');

            for (let i = 1; i < files.length; i++) {
                setStatus('Uploading ' + (i + 1) + ' of ' + files.length);
                updateItem(i, 'Uploading');

                input.files = makeSingleFileList(files[i]);
                input.dispatchEvent(new Event('change', {
                    bubbles: true
                }));

                knownCount = await waitForAttachmentIncrease(knownCount);
                updateItem(i, 'Uploaded');
            }

            setStatus('All ' + files.length + ' files uploaded.');
        } catch (error) {
            const current = [...(list?.children || [])].findIndex(item =>
                item.textContent.endsWith(' — Uploading')
            );
            if (current >= 0) updateItem(current, 'Failed — ' + error.message);
            setStatus('Queue stopped. Check the CFPB attachment list before retrying.');
            console.error('[CFPB Upload Queue]', error);
        } finally {
            activeQueue = false;
        }
    }

    function handleFileChange(event) {
        const input = event.target;
        if (!(input instanceof HTMLInputElement) || !input.matches(FILE_INPUT)) return;

        setMultiple(input);

        if (activeQueue) return;

        const selected = Array.from(input.files || []);
        if (selected.length <= 1) return;
        const initialCount = attachmentCount();

        // Preserve the selected File objects, but let CFPB's original handler
        // receive only the first file. Remaining files are submitted one by one.
        input.files = makeSingleFileList(selected[0]);

        // Defer queue execution until the current change event has reached
        // CFPB's original input/change handlers.
        queueMicrotask(() => runQueue(input, selected, initialCount));
    }

    function scan(root) {
        if (!root?.querySelectorAll) return;
        root.querySelectorAll(FILE_INPUT).forEach(setMultiple);
        if (root.matches?.(FILE_INPUT)) setMultiple(root);
    }

    scan(document);

    new MutationObserver(records => {
        for (const record of records) {
            for (const node of record.addedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE) scan(node);
            }
        }
    }).observe(document, { childList: true, subtree: true });

    // Capture before the CFPB input's own change handler reads input.files.
    document.addEventListener('change', handleFileChange, true);
})();
