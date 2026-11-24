// ==UserScript==
// @name         CFPB - Remember Uploads + Auto Select Credit Bureaus
// @namespace    CFPB Tools
// @version      4.0.0
// @description  Remembers uploaded filenames and selects the matching credit reporting companies on the CFPB company step.
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
            if (/(^|[^A-Z0-9])EXP([^A-Z0-9]|$)/.test(upper) ||
                /(^|[^A-Z0-9])EX([^A-Z0-9]|$)/.test(upper)) found.add('EXP');
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
        input.value = company;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));

        // Wait for the CFPB typeahead to render the exact company result.
        for (let attempt = 0; attempt < 35; attempt++) {
            await sleep(200);
            const scope = input.closest('.cMosTypeaheadSearch') || input.parentElement;
            const options = Array.from(scope.querySelectorAll('.list-item,[data-item-title]'));
            const match = options.find(option => {
                const title = option.getAttribute('data-item-title') || option.textContent || '';
                return title.trim().toLowerCase() === company.toLowerCase() && visible(option);
            });
            if (match) {
                match.click();
                await sleep(450);
                return true;
            }
        }
        return false;
    }

    function firstCompanyArea() {
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
        if (!codes.length) return;
        const targets = codes.map(code => ({ code, company: BUREAUS[code] }));
        const already = targets.filter(item => selectedCompanyExists(item.company));
        const pending = targets.filter(item => !selectedCompanyExists(item.company));

        if (already.length) {
            showToast('ALREADY SELECTED\\n' + already.map(x => x.company).join('\\n') +
                '\\nThis company is already included and will receive the complaint.', 'success');
        }
        if (!pending.length) {\n            try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}\n            return;\n        }\n
        let area = firstCompanyArea();
        if (!area) return;

        let first = true;
        for (const item of pending) {
            let input = companyInputIn(area);
            if (!input) break;

            // The first company uses the primary field. Further companies use the
            // CFPB "Do you want to complain about another company?" flow.
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
            first = false;
        }
    }

    function isCompanyStep() {
        return Array.from(document.querySelectorAll('h1')).some(h =>
            h.textContent.toLowerCase().includes('what company is this complaint about')
        );
    }

    function startCompanyStep() {
        if (!isCompanyStep()) return;
        let attempts = 0;
        const timer = setInterval(() => {
            attempts++;
            if (document.querySelector('input.search-box-body') || attempts > 30) {
                clearInterval(timer);
                autoSelectBureaus();
            }
        }, 250);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startCompanyStep, { once: true });
    } else {
        startCompanyStep();
    }
})();
