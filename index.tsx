
import { GoogleGenAI, Type } from "@google/genai";

document.addEventListener('DOMContentLoaded', () => {
    // --- State ---
    let currentFile: File | null = null;
    let extractionData: any = null;
    let currentView: 'page' | 'page-summary' | 'set' = 'page';

    // --- DOM Elements ---
    const dropZone = document.getElementById('drop-zone') as HTMLDivElement;
    const fileInput = document.getElementById('file-input') as HTMLInputElement;
    const previewContainer = document.getElementById('preview-container') as HTMLDivElement;
    const pdfPlaceholder = document.getElementById('pdf-placeholder') as HTMLDivElement;
    const fileNameDisplay = document.getElementById('file-name') as HTMLElement;
    const fileInfoDisplay = document.getElementById('file-info') as HTMLElement;
    const imagePreview = document.getElementById('image-preview') as HTMLImageElement;
    const resetBtn = document.getElementById('reset-btn') as HTMLButtonElement;
    const actionBar = document.getElementById('action-bar') as HTMLDivElement;
    const extractBtn = document.getElementById('extract-btn') as HTMLButtonElement;
    const loadingState = document.getElementById('loading-state') as HTMLDivElement;
    const resultsFeed = document.getElementById('results-feed') as HTMLDivElement;
    const setFeed = document.getElementById('set-feed') as HTMLDivElement;
    const pageSummaryFeed = document.getElementById('page-summary-feed') as HTMLDivElement;
    const emptyState = document.getElementById('empty-state') as HTMLDivElement;
    const exportActions = document.getElementById('export-actions') as HTMLDivElement;
    const feedFooter = document.getElementById('feed-footer') as HTMLDivElement;
    const errorBox = document.getElementById('error-box') as HTMLDivElement;
    const errorMessage = document.getElementById('error-message') as HTMLParagraphElement;
    const statusBadge = document.getElementById('status-badge') as HTMLDivElement;
    const summaryCount = document.getElementById('summary-count') as HTMLElement;
    const processingOverlay = document.getElementById('processing-overlay') as HTMLDivElement;

    const tabPage = document.getElementById('tab-page') as HTMLButtonElement;
    const tabPageSummary = document.getElementById('tab-page-summary') as HTMLButtonElement;
    const tabSet = document.getElementById('tab-set') as HTMLButtonElement;
    
    const pageDescription = document.getElementById('page-description') as HTMLDivElement;
    const pageSummaryDescription = document.getElementById('page-summary-description') as HTMLDivElement;
    const setDescription = document.getElementById('set-description') as HTMLDivElement;

    const copyAllBtn = document.getElementById('copy-all-btn') as HTMLButtonElement;
    const copyJsonBtn = document.getElementById('copy-json') as HTMLButtonElement;
    const downloadCsvBtn = document.getElementById('download-csv') as HTMLButtonElement;

    // --- File Handling ---
    const handleFile = (file: File) => {
        if (!file) return;
        const validTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
        if (!validTypes.includes(file.type)) {
            showError('Unsupported format. Please upload PDF or image files.');
            return;
        }

        currentFile = file;
        fileNameDisplay.textContent = file.name;
        fileInfoDisplay.textContent = `${(file.size / (1024 * 1024)).toFixed(2)} MB • ${file.type.split('/')[1].toUpperCase()}`;

        dropZone.classList.add('hidden');
        previewContainer.classList.remove('hidden');
        actionBar.classList.remove('hidden');
        resetBtn.classList.remove('hidden');
        errorBox.classList.add('hidden');

        if (file.type.startsWith('image/')) {
            imagePreview.src = URL.createObjectURL(file);
            imagePreview.classList.remove('hidden');
            pdfPlaceholder.classList.add('hidden');
        } else {
            imagePreview.classList.add('hidden');
            pdfPlaceholder.classList.remove('hidden');
        }
    };

    const softReset = () => {
        currentFile = null;
        extractionData = null;
        fileInput.value = '';
        dropZone.classList.remove('hidden');
        previewContainer.classList.add('hidden');
        actionBar.classList.add('hidden');
        resetBtn.classList.add('hidden');
        loadingState.classList.add('hidden');
        errorBox.classList.add('hidden');
        exportActions.classList.add('hidden');
        feedFooter.classList.add('hidden');
        
        resultsFeed.innerHTML = '';
        resultsFeed.appendChild(emptyState);
        setFeed.innerHTML = '';
        pageSummaryFeed.innerHTML = '';
        
        setFeed.classList.add('hidden');
        pageSummaryFeed.classList.add('hidden');
        resultsFeed.classList.remove('hidden');
        
        switchTab('page');
    };

    // --- Tab Management ---
    const switchTab = (view: 'page' | 'page-summary' | 'set') => {
        currentView = view;
        
        // Reset all tabs
        [tabPage, tabPageSummary, tabSet].forEach(t => t.classList.remove('tab-active', 'text-slate-700'));
        [tabPage, tabPageSummary, tabSet].forEach(t => t.classList.add('text-slate-400'));
        [resultsFeed, pageSummaryFeed, setFeed, pageDescription, pageSummaryDescription, setDescription].forEach(el => el.classList.add('hidden'));

        if (view === 'page') {
            tabPage.classList.add('tab-active', 'text-slate-700');
            tabPage.classList.remove('text-slate-400');
            resultsFeed.classList.remove('hidden');
            pageDescription.classList.remove('hidden');
        } else if (view === 'page-summary') {
            tabPageSummary.classList.add('tab-active', 'text-slate-700');
            tabPageSummary.classList.remove('text-slate-400');
            pageSummaryFeed.classList.remove('hidden');
            pageSummaryDescription.classList.remove('hidden');
        } else {
            tabSet.classList.add('tab-active', 'text-slate-700');
            tabSet.classList.remove('text-slate-400');
            setFeed.classList.remove('hidden');
            setDescription.classList.remove('hidden');
        }
    };

    tabPage.onclick = () => switchTab('page');
    tabPageSummary.onclick = () => switchTab('page-summary');
    tabSet.onclick = () => switchTab('set');

    // --- API & Processing ---
    const blobToBase64 = (blob: Blob): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    };

    const processOCR = async () => {
        if (!currentFile || !process.env.API_KEY) return;

        toggleLoading(true);
        errorBox.classList.add('hidden');

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const base64Data = await blobToBase64(currentFile);

            const prompt = `
                You are a high-precision CJK Linguistic Pipeline. 
                Analyze this entire document (Set).

                Task 1: Page-by-page OCR
                - Extract ALL linguistic blocks from every page.
                - Detect language: 'zh', 'ja', 'ko'.
                - For 'zh': provide Pinyin.
                - For 'ja': provide Furigana.
                - For 'ko' (Hanja): provide Hangeul.

                Task 2: Page Summary View
                - For EACH individual page, list all sentences and vocabulary found on that specific page.
                - Do not worry about duplicates between different pages here, but list them clearly by page.

                Task 3: Aggregated Global Set View
                - Create a master inventory of ALL unique sentences and vocabulary found across ALL pages.
                - Remove ALL duplicates for this section. Every word and sentence must be unique.
                - Categorize them into "sentences" and "vocabulary".

                Return everything in the specified JSON structure.
            `;

            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: {
                    parts: [
                        { inlineData: { data: base64Data, mimeType: currentFile.type } },
                        { text: prompt }
                    ]
                },
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            results: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        id: { type: Type.STRING },
                                        original: { type: Type.STRING },
                                        reading: { type: Type.STRING },
                                        language: { type: Type.STRING },
                                        type: { type: Type.STRING },
                                        page: { type: Type.INTEGER },
                                        confidence: { type: Type.NUMBER }
                                    },
                                    required: ["id", "original", "reading", "language", "type", "confidence"]
                                }
                            },
                            pageSummaries: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        page: { type: Type.INTEGER },
                                        sentences: { type: Type.ARRAY, items: { type: Type.STRING } },
                                        vocabulary: { type: Type.ARRAY, items: { type: Type.STRING } }
                                    },
                                    required: ["page", "sentences", "vocabulary"]
                                }
                            },
                            aggregatedSet: {
                                type: Type.OBJECT,
                                properties: {
                                    sentences: { type: Type.ARRAY, items: { type: Type.STRING } },
                                    vocabulary: { type: Type.ARRAY, items: { type: Type.STRING } }
                                }
                            },
                            summary: {
                                type: Type.OBJECT,
                                properties: {
                                    totalBlocks: { type: Type.INTEGER },
                                    pageCount: { type: Type.INTEGER }
                                }
                            }
                        }
                    }
                }
            });

            const data = JSON.parse(response.text);
            extractionData = data;
            renderResults(data);
            renderPageSummary(data);
            renderSetView(data);
        } catch (err: any) {
            showError(err.message || 'Analysis failed. The PDF might be too large or encrypted.');
        } finally {
            toggleLoading(false);
        }
    };

    const renderResults = (data: any) => {
        resultsFeed.innerHTML = '';
        data.results.forEach((item: any, idx: number) => {
            const card = document.createElement('div');
            card.className = 'p-8 hover:bg-slate-50 border-b border-slate-100 transition-all border-l-4 border-l-transparent hover:border-l-indigo-500';
            const langClass = item.language === 'zh' ? 'bg-amber-50 text-amber-700' : item.language === 'ja' ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700';
            
            card.innerHTML = `
                <div class="flex items-start gap-6">
                    <div class="flex-shrink-0 w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center text-[10px] font-black text-white">P${item.page || 1}</div>
                    <div class="flex-1 space-y-4">
                        <div class="flex justify-between items-center">
                            <span class="text-[9px] font-black uppercase px-2 py-1 rounded ${langClass}">${item.language}</span>
                            <span class="text-[9px] font-mono text-slate-400">CONFIDENCE: ${Math.round(item.confidence * 100)}%</span>
                        </div>
                        <p class="text-3xl serif-text text-slate-900 leading-tight">${item.original}</p>
                        <div class="text-lg font-medium text-slate-500 italic bg-slate-50 p-3 rounded-xl border border-slate-100">${item.reading}</div>
                    </div>
                </div>
            `;
            resultsFeed.appendChild(card);
        });
        summaryCount.textContent = data.summary.totalBlocks;
        exportActions.classList.remove('hidden');
        feedFooter.classList.remove('hidden');
    };

    const renderPageSummary = (data: any) => {
        pageSummaryFeed.innerHTML = '';
        const summaries = data.pageSummaries || [];
        
        summaries.forEach((pSum: any) => {
            const pageContainer = document.createElement('div');
            pageContainer.className = 'bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm';
            
            pageContainer.innerHTML = `
                <div class="bg-slate-900 px-6 py-4 flex items-center justify-between">
                    <h3 class="text-white font-black text-xs uppercase tracking-widest">Page ${pSum.page} Breakdown</h3>
                    <div class="text-[10px] text-slate-400 font-mono">COUNT: ${pSum.sentences.length + pSum.vocabulary.length}</div>
                </div>
                <div class="p-6 space-y-8">
                    <div class="space-y-4">
                        <p class="text-[10px] font-black text-amber-500 uppercase flex items-center gap-2 tracking-tighter">
                            <i class="fas fa-quote-right"></i> Sentences
                        </p>
                        <div class="flex flex-wrap gap-2">
                            ${pSum.sentences.map((s: string) => `
                                <div class="bg-amber-50 px-4 py-2 rounded-xl border border-amber-100 text-sm font-medium text-amber-900 shadow-sm">${s}</div>
                            `).join('') || '<span class="text-slate-300 italic text-xs">No sentences found.</span>'}
                        </div>
                    </div>
                    <div class="space-y-4">
                        <p class="text-[10px] font-black text-indigo-500 uppercase flex items-center gap-2 tracking-tighter">
                            <i class="fas fa-spell-check"></i> Vocabulary
                        </p>
                        <div class="flex flex-wrap gap-2">
                            ${pSum.vocabulary.map((v: string) => `
                                <div class="bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100 text-sm font-medium text-indigo-900 shadow-sm">${v}</div>
                            `).join('') || '<span class="text-slate-300 italic text-xs">No vocabulary found.</span>'}
                        </div>
                    </div>
                </div>
            `;
            pageSummaryFeed.appendChild(pageContainer);
        });
    };

    const renderSetView = (data: any) => {
        setFeed.innerHTML = '';
        const set = data.aggregatedSet;

        const createSection = (title: string, items: string[], icon: string) => {
            const section = document.createElement('div');
            section.className = 'space-y-4 mb-8';
            section.innerHTML = `
                <h3 class="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <i class="fas ${icon} text-indigo-500"></i> ${title} (${items.length})
                </h3>
                <div class="bg-slate-50 rounded-2xl p-6 border border-slate-100 flex flex-wrap gap-3">
                    ${items.map(item => `
                        <div class="bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm text-sm font-medium text-slate-700 hover:border-indigo-300 transition-colors">
                            ${item}
                        </div>
                    `).join('')}
                </div>
            `;
            setFeed.appendChild(section);
        };

        if (set.sentences.length > 0) createSection('Global Unique Sentences', set.sentences, 'fa-quote-left');
        if (set.vocabulary.length > 0) createSection('Global Unique Vocabulary', set.vocabulary, 'fa-spell-check');
    };

    const toggleLoading = (isLoading: boolean) => {
        loadingState.classList.toggle('hidden', !isLoading);
        actionBar.classList.toggle('hidden', isLoading);
        processingOverlay.classList.toggle('hidden', !isLoading);
    };

    const showError = (msg: string) => {
        errorMessage.textContent = msg;
        errorBox.classList.remove('hidden');
        toggleLoading(false);
    };

    // --- Export Functionality ---
    copyAllBtn.onclick = () => {
        if (!extractionData) return;
        let textToCopy = "";
        
        if (currentView === 'page') {
            textToCopy = extractionData.results.map((r: any) => 
                `[Page ${r.page || 1}] ${r.original} (${r.reading || 'N/A'})`
            ).join('\n');
        } else if (currentView === 'page-summary') {
            textToCopy = extractionData.pageSummaries.map((pSum: any) => 
                `=== PAGE ${pSum.page} ===\nSentences:\n${pSum.sentences.join('\n')}\nVocabulary:\n${pSum.vocabulary.join('\n')}`
            ).join('\n\n');
        } else {
            textToCopy = "=== GLOBAL UNIQUE SENTENCES ===\n" + 
                extractionData.aggregatedSet.sentences.join('\n') + 
                "\n\n=== GLOBAL UNIQUE VOCABULARY ===\n" + 
                extractionData.aggregatedSet.vocabulary.join('\n');
        }

        navigator.clipboard.writeText(textToCopy).then(() => {
            const originalText = copyAllBtn.innerHTML;
            copyAllBtn.innerHTML = '<i class="fas fa-check"></i> COPIED!';
            copyAllBtn.classList.replace('bg-indigo-600', 'bg-emerald-600');
            setTimeout(() => {
                copyAllBtn.innerHTML = originalText;
                copyAllBtn.classList.replace('bg-emerald-600', 'bg-indigo-600');
            }, 2000);
        });
    };

    copyJsonBtn.onclick = () => {
        if (!extractionData) return;
        const blob = new Blob([JSON.stringify(extractionData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `cjk_extraction_${Date.now()}.json`;
        link.click();
        URL.revokeObjectURL(url);
    };

    downloadCsvBtn.onclick = () => {
        if (!extractionData) return;
        const headers = ['Page', 'Type', 'Original', 'Reading', 'Language', 'Confidence'];
        const rows = extractionData.results.map((r: any) => [
            r.page || 1,
            r.type,
            `"${r.original.replace(/"/g, '""')}"`,
            `"${(r.reading || '').replace(/"/g, '""')}"`,
            r.language,
            r.confidence
        ]);
        
        // Add summary info
        rows.push(['---', '---', '---', '---', '---', '---']);
        rows.push(['GLOBAL_SET', 'Sentences', extractionData.aggregatedSet.sentences.length, '', '', '']);
        extractionData.aggregatedSet.sentences.forEach((s: string) => rows.push(['GLOBAL_DATA', 'Sentence', `"${s.replace(/"/g, '""')}"`, '', '', '']));
        
        rows.push(['GLOBAL_SET', 'Vocabulary', extractionData.aggregatedSet.vocabulary.length, '', '', '']);
        extractionData.aggregatedSet.vocabulary.forEach((v: string) => rows.push(['GLOBAL_DATA', 'Word', `"${v.replace(/"/g, '""')}"`, '', '', '']));

        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `cjk_db_ready_${Date.now()}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    // --- Events ---
    dropZone.onclick = () => fileInput.click();
    fileInput.onchange = (e: any) => handleFile(e.target.files[0]);
    dropZone.ondragover = (e) => { e.preventDefault(); dropZone.classList.add('active'); };
    dropZone.ondragleave = () => dropZone.classList.remove('active');
    dropZone.ondrop = (e: any) => { 
        e.preventDefault(); 
        dropZone.classList.remove('active'); 
        handleFile(e.dataTransfer.files[0]); 
    };

    extractBtn.onclick = processOCR;
    resetBtn.onclick = softReset;
});
