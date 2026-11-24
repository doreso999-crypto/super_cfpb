// ==UserScript==
// @name         CFPB - Remember Uploads + Auto Select Credit Bureaus
// @namespace    CFPB Tools
// @version      4.2.1
// @description  Remembers uploaded filenames and auto-selects matching credit reporting companies when CFPB Step 4 appears.
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
            const upper = name.toUpperCase();
            // EXP is checked separately so it is not confused with the EX abbreviation.
            if (/(^|[^A-Z0-9])EQU([^A-Z0-9]|$)/.test(upper)) found.add('EQU');
            // Accept bureau codes (EX / EXP) and the full bureau name.
            // Full-name matching is needed for filenames such as "EXPERIAN.pdf",
            // where EX/EXP is immediately followed by another letter.
            if (/(^|[^A-Z0-9])EXP?([^A-Z0-9]|$)/.test(upper) ||
                upper.includes('EXPERIAN')) found.add('EXP');
            if (/(^|[^A-Z0-9])TU([^A-Z0-9]|$)/.test(upper)) found.add('TU');
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

    function selectedCompanyExists(company) {
        const bodyText = document.body?.innerText || '';
        return bodyText.toLowerCase().includes(company.toLowerCase());
    }

    async function chooseCompany(input, company) {
        if (!input || !visible(input)) return false;
        input.focus();

        // Use the native input setter, then emit the events Aura's typeahead listens for.
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        if (setter) setter.call(input, company);
        else input.value = company;
        input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, composed: true, key: company.slice(-1) }));
        input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, composed: true, key: company.slice(-1) }));
        input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));

        const normalized = value => (value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
        // CFPB renders results inside .result-items-box-body under this exact typeahead.
        for (let attempt = 0; attempt < 50; attempt++) {
            await sleep(200);
            const scope = input.closest('.cMosTypeaheadSearch') || input.parentElement;
            const resultBox = scope?.querySelector('.result-items-box-body');
            const searchRoot = resultBox && resultBox.children.length ? resultBox : scope;
            const candidates = Array.from(searchRoot.querySelectorAll(
                '[data-item-title],.list-item,[role="option"],li,button,a,div,span'
            ));
            const match = candidates.find(option => {
                const title = option.getAttribute('data-item-title') || option.textContent || '';
                return normalized(title) === normalized(company) && visible(option);
            });
            if (match) {
                // Prefer the nearest clickable/result row rather than a nested text span.
                const clickable = match.closest('button,[role="option"],.list-item,li,[data-item-title]') || match;
                clickable.click();
                await sleep(500);
                return true;
            }
        }
        return false;
    }

    function firstCompanyArea() {
        // CFPB's current Aura markup places the primary search input inside this
        // component; it is not necessarily preceded by an h2 heading.
        const component = document.querySelector('.cMosConsumerAllCompanyHCIU');
        if (component && companyInputIn(component)) return component;

        // Fallback for alternate/older CFPB layouts.
        const labelled = Array.from(document.querySelectorAll('label'))
            .find(label => label.textContent.trim().toLowerCase() === 'company name');
        if (labelled) {
            const typeahead = labelled.closest('.cMosTypeaheadSearch');
            if (typeahead && companyInputIn(typeahead)) return typeahead;
        }

        const headings = Array.from(document.querySelectorAll('h2'));
        const heading = headings.find(h => h.textContent.trim().toLowerCase() === 'credit reporting company');
        if (!heading) return null;
        let node = heading.nextElementSibling;
        while (node && !companyInputIn(node)) node = node.nextElementSibling;
        return node;
    }

    function nextCompanyQuestion(afterNode) {
        const sections = Array.from(document.querySelectorAll('section'));
        const section = sections.find(s => {
            const text = s.innerText || '';
            return text.includes('Do you want to complain about another company?') &&
                (!afterNode || afterNode.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING);
        });
        return section || null;
    }

    async function enableAdditionalCompany(afterNode) {
        const question = nextCompanyQuestion(afterNode);
        if (!question) return false;
        const yes = Array.from(question.querySelectorAll('input[type="radio"]'))
            .find(input => input.value.toLowerCase() === 'yes');
        if (!yes) return false;
        if (!yes.checked) {
            yes.click();
            yes.dispatchEvent(new Event('change', { bubbles: true }));
        }
        for (let i = 0; i < 30; i++) {
            await sleep(200);
            const headings = Array.from(document.querySelectorAll('h2'));
            const additional = headings.find(h => h.textContent.trim().toLowerCase() === 'additional company');
            if (additional) {
                let node = additional.nextElementSibling;
                while (node && !companyInputIn(node)) node = node.nextElementSibling;
                if (node && companyInputIn(node)) return { container: node, question };
            }
        }
        return false;
    }

    async function autoSelectBureaus() {
        const codes = detectedBureaus();
        if (!codes.length) return false;
        const targets = codes.map(code => ({ code, company: BUREAUS[code] }));
        const already = targets.filter(item => selectedCompanyExists(item.company));
        const pending = targets.filter(item => !selectedCompanyExists(item.company));

        if (already.length) {
            showToast('ALREADY SELECTED\\n' + already.map(x => x.company).join('\\n') +
                '\\nThis company is already included and will receive the complaint.', 'success');
        }
        if (!pending.length) {
            try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
            return true;
        }

        let area = firstCompanyArea();
        if (!area || !companyInputIn(area)) {
            showToast('COMPANY SEARCH FIELD NOT FOUND\\nThe CFPB Company name field has not rendered yet. The helper will retry automatically.', 'warning');
            return false;
        }

        let first = true;
        let completed = 0;
        for (const item of pending) {
            let input = companyInputIn(area);
            if (!input) break;

            if (!first) {
                const added = await enableAdditionalCompany(area);
                if (!added) {
                    showToast('Could not open the next Additional company field. Select Yes manually, then search for: ' + item.company);
                    break;
                }
                area = added.container;
                input = companyInputIn(area);
            }

            const selected = await chooseCompany(input, item.company);
            if (!selected) {
                showToast('Could not find this exact company in the CFPB search results:\\n' + item.company +
                    '\\nYou can still search for and select the company manually.');
                break;
            }
            showToast('SELECTED FROM UPLOADED FILENAMES\\n' + item.code + ': ' + item.company, 'success');
            completed++;
            first = false;
        }

        if (completed === pending.length) {
            try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
            return true;
        }
        return false;
    }

    function isCompanyStep() {
        return Array.from(document.querySelectorAll('h1')).some(h =>
            h.textContent.toLowerCase().includes('what company is this complaint about')
        );
    }

    let selectionRunning = false;
    let selectionDoneForStep = false;

    async function runCompanyStepWhenReady() {
        if (!isCompanyStep() || selectionRunning || selectionDoneForStep) return;
        const area = firstCompanyArea();
        const input = area && companyInputIn(area);
        if (!input || !visible(input)) return;

        const names = safeGetNames();
        if (!names.length) {
            showToast('NO REMEMBERED FILENAMES\\nNo uploaded filenames were detected for this complaint. Upload/select the files in Step 3 first, then return to Step 4.', 'warning');
            selectionDoneForStep = true;
            return;
        }
        if (!detectedBureaus().length) {
            showToast('NO BUREAU CODE FOUND\\nRemembered filenames do not contain EQU, EXP/EX, or TU. You can still search and select the company manually.', 'warning');
            selectionDoneForStep = true;
            return;
        }

        selectionRunning = true;
        try {
            const completed = await autoSelectBureaus();
            // Keep the observer active after a failed attempt so late Aura rendering
            // or a temporarily missing result can be retried without manual searching.
            selectionDoneForStep = completed === true;
        } finally {
            selectionRunning = false;
        }
    }

    function watchForCompanyStep() {
        runCompanyStepWhenReady();
        const observer = new MutationObserver(() => {
            runCompanyStepWhenReady();
        });
        observer.observe(document.documentElement || document, { childList: true, subtree: true });
        // CFPB is a single-page app; also re-check after its step navigation events.
        window.addEventListener('hashchange', () => {
            selectionDoneForStep = false;
            runCompanyStepWhenReady();
        });
        window.addEventListener('popstate', () => {
            selectionDoneForStep = false;
            runCompanyStepWhenReady();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', watchForCompanyStep, { once: true });
    } else {
        watchForCompanyStep();
    }
})();
