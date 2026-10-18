/* global pdfjsLib, PDFLib */
window.AseoTools = window.AseoTools || {};

window.AseoTools["quitar-anuncios"] = async function (body, tool) {
  const Aseo = window.Aseo;
  const MM_TO_PT = 72 / 25.4;

  body.innerHTML = `
    <section id="dropzone" class="dropzone tool-drop" tabindex="0">
      <input type="file" id="fileInput" accept="application/pdf,.pdf" hidden />
      <div class="dropzone-inner compact">
        <p class="lede">Sube un PDF para excluir páginas y aplicar un margen de recorte.</p>
        <button type="button" class="btn btn-primary" id="browseBtn">Abrir PDF</button>
        <p class="hint">También puedes soltar el archivo aquí</p>
      </div>
    </section>
    <section id="workspace" class="workspace hidden">
      <aside class="controls">
        <div class="file-meta">
          <p class="file-label">Archivo</p>
          <p id="fileName" class="file-name">—</p>
          <p id="pageCount" class="file-pages">0 páginas</p>
        </div>
        <div class="control-block">
          <h2>Modo</h2>
          <div class="mode-toggle" role="group">
            <button type="button" class="mode-btn active" data-mode="exclude" id="modeExclude">Excluir</button>
            <button type="button" class="mode-btn" data-mode="crop" id="modeCrop">Recortar</button>
          </div>
          <p class="mode-help" id="modeHelp">Clic en una miniatura para excluirla del PDF final.</p>
        </div>
        <div class="control-block">
          <h2>Margen (mm)</h2>
          <p class="help">Solo en páginas marcadas para recorte.</p>
          <div class="margin-grid">
            <label class="margin-field span-2"><span>Superior</span><input type="number" id="marginTop" min="0" step="1" value="20" /></label>
            <label class="margin-field"><span>Izquierdo</span><input type="number" id="marginLeft" min="0" step="1" value="15" /></label>
            <label class="margin-field"><span>Derecho</span><input type="number" id="marginRight" min="0" step="1" value="15" /></label>
            <label class="margin-field span-2"><span>Inferior</span><input type="number" id="marginBottom" min="0" step="1" value="25" /></label>
          </div>
          <div class="preset-row">
            <button type="button" class="btn btn-ghost" data-preset="ads">Anuncios típicos</button>
            <button type="button" class="btn btn-ghost" data-preset="equal">Igual en todos</button>
          </div>
        </div>
        <div class="control-block summary">
          <div class="stat"><span id="keptCount">0</span><small>se mantienen</small></div>
          <div class="stat"><span id="excludedCount">0</span><small>excluidas</small></div>
          <div class="stat"><span id="cropCount">0</span><small>con recorte</small></div>
        </div>
        <div class="actions">
          <button type="button" class="btn btn-primary" id="exportBtn" disabled>Descargar PDF limpio</button>
          <button type="button" class="btn btn-ghost" id="resetBtn">Otro PDF</button>
        </div>
        <p id="status" class="status" role="status"></p>
      </aside>
      <div class="pages-panel">
        <div class="pages-toolbar">
          <h2>Páginas</h2>
          <div class="toolbar-actions">
            <button type="button" class="btn btn-ghost btn-sm" id="selectAllCrop">Marcar todas para recorte</button>
            <button type="button" class="btn btn-ghost btn-sm" id="clearExcluded">Limpiar exclusiones</button>
          </div>
        </div>
        <div id="pagesGrid" class="pages-grid"></div>
      </div>
    </section>
  `;

  const els = {
    dropzone: body.querySelector("#dropzone"),
    fileInput: body.querySelector("#fileInput"),
    browseBtn: body.querySelector("#browseBtn"),
    workspace: body.querySelector("#workspace"),
    fileName: body.querySelector("#fileName"),
    pageCount: body.querySelector("#pageCount"),
    pagesGrid: body.querySelector("#pagesGrid"),
    modeExclude: body.querySelector("#modeExclude"),
    modeCrop: body.querySelector("#modeCrop"),
    modeHelp: body.querySelector("#modeHelp"),
    marginTop: body.querySelector("#marginTop"),
    marginRight: body.querySelector("#marginRight"),
    marginBottom: body.querySelector("#marginBottom"),
    marginLeft: body.querySelector("#marginLeft"),
    keptCount: body.querySelector("#keptCount"),
    excludedCount: body.querySelector("#excludedCount"),
    cropCount: body.querySelector("#cropCount"),
    exportBtn: body.querySelector("#exportBtn"),
    resetBtn: body.querySelector("#resetBtn"),
    status: body.querySelector("#status"),
    selectAllCrop: body.querySelector("#selectAllCrop"),
    clearExcluded: body.querySelector("#clearExcluded"),
  };

  const state = {
    pdfBytes: null,
    pdfDoc: null,
    fileName: "",
    pageCount: 0,
    excluded: new Set(),
    cropPages: new Set(),
    pageSizes: [],
    mode: "exclude",
  };

  function setStatus(msg) {
    Aseo.setStatus(els.status, msg);
  }

  function getMarginsMm() {
    return {
      top: Math.max(0, Number(els.marginTop.value) || 0),
      right: Math.max(0, Number(els.marginRight.value) || 0),
      bottom: Math.max(0, Number(els.marginBottom.value) || 0),
      left: Math.max(0, Number(els.marginLeft.value) || 0),
    };
  }

  function allPagesCropMarked() {
    if (state.pageCount === 0) return false;
    for (let i = 0; i < state.pageCount; i++) {
      if (!state.cropPages.has(i)) return false;
    }
    return true;
  }

  function updateCropToggleLabel() {
    els.selectAllCrop.textContent = allPagesCropMarked()
      ? "Quitar recorte de todas"
      : "Marcar todas para recorte";
  }

  function updateStats() {
    const excluded = state.excluded.size;
    const kept = state.pageCount - excluded;
    const crop = [...state.cropPages].filter((i) => !state.excluded.has(i)).length;
    els.keptCount.textContent = String(kept);
    els.excludedCount.textContent = String(excluded);
    els.cropCount.textContent = String(crop);
    els.exportBtn.disabled = !state.pdfBytes || kept === 0;
    updateCropToggleLabel();
  }

  function setMode(mode) {
    state.mode = mode;
    els.modeExclude.classList.toggle("active", mode === "exclude");
    els.modeCrop.classList.toggle("active", mode === "crop");
    els.modeHelp.textContent =
      mode === "exclude"
        ? "Clic en una miniatura para excluirla del PDF final."
        : "Clic en una miniatura para aplicar (o quitar) el margen de recorte.";
  }

  function refreshOverlays() {
    const margins = getMarginsMm();
    body.querySelectorAll(".page-card").forEach((card) => {
      const index = Number(card.dataset.index);
      const overlay = card.querySelector(".crop-overlay");
      const windowEl = card.querySelector(".crop-window");
      const showCrop = state.cropPages.has(index) && !state.excluded.has(index);
      overlay.hidden = !showCrop;
      if (!showCrop) return;
      const size = state.pageSizes[index];
      if (!size || !windowEl) return;
      windowEl.style.top = `${Math.min((margins.top * MM_TO_PT) / size.height * 100, 49)}%`;
      windowEl.style.bottom = `${Math.min((margins.bottom * MM_TO_PT) / size.height * 100, 49)}%`;
      windowEl.style.left = `${Math.min((margins.left * MM_TO_PT) / size.width * 100, 49)}%`;
      windowEl.style.right = `${Math.min((margins.right * MM_TO_PT) / size.width * 100, 49)}%`;
    });
  }

  function refreshCard(card) {
    const index = Number(card.dataset.index);
    const excluded = state.excluded.has(index);
    const crop = state.cropPages.has(index);
    card.classList.toggle("excluded", excluded);
    card.classList.toggle("crop-marked", crop && !excluded);
    const badges = card.querySelector(".badges");
    badges.innerHTML = "";
    if (excluded) badges.innerHTML = '<span class="badge badge-exclude">Fuera</span>';
    else if (crop) badges.innerHTML = '<span class="badge badge-crop">Recorte</span>';
  }

  function refreshAllCards() {
    body.querySelectorAll(".page-card").forEach(refreshCard);
    refreshOverlays();
    updateStats();
  }

  function onPageClick(index) {
    if (state.mode === "exclude") {
      if (state.excluded.has(index)) state.excluded.delete(index);
      else state.excluded.add(index);
    } else {
      if (state.cropPages.has(index)) state.cropPages.delete(index);
      else state.cropPages.add(index);
    }
    refreshAllCards();
  }

  async function renderPageThumb(page, index) {
    const canvas = await Aseo.pdfPageToCanvas(page, 0.35);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "page-card";
    btn.dataset.index = String(index);
    btn.innerHTML = `
      <div class="page-preview"><div class="crop-overlay" hidden><div class="crop-window"></div></div></div>
      <div class="page-meta"><span>Pág. ${index + 1}</span><div class="badges"></div></div>
    `;
    btn.querySelector(".page-preview").insertBefore(canvas, btn.querySelector(".crop-overlay"));
    btn.addEventListener("click", () => onPageClick(index));
    els.pagesGrid.appendChild(btn);
    refreshCard(btn);
  }

  async function loadPdf(file) {
    setStatus("Cargando PDF…");
    els.exportBtn.disabled = true;
    els.pagesGrid.innerHTML = "";
    state.excluded.clear();
    state.cropPages.clear();
    state.pageSizes = [];
    const buffer = await file.arrayBuffer();
    state.pdfBytes = new Uint8Array(buffer);
    state.fileName = file.name;
    state.pdfDoc = await pdfjsLib.getDocument({ data: state.pdfBytes.slice() }).promise;
    state.pageCount = state.pdfDoc.numPages;
    els.fileName.textContent = state.fileName;
    els.pageCount.textContent = `${state.pageCount} página${state.pageCount === 1 ? "" : "s"}`;
    els.dropzone.classList.add("hidden");
    els.workspace.classList.remove("hidden");
    for (let i = 1; i <= state.pageCount; i++) {
      const page = await state.pdfDoc.getPage(i);
      const vp = page.getViewport({ scale: 1 });
      state.pageSizes[i - 1] = { width: vp.width, height: vp.height };
      await renderPageThumb(page, i - 1);
      setStatus(`Renderizando… ${i}/${state.pageCount}`);
    }
    refreshAllCards();
    setStatus("Listo. Excluye anuncios y marca las páginas a recortar.");
  }

  function resetApp() {
    state.pdfBytes = null;
    state.pdfDoc = null;
    state.fileName = "";
    state.pageCount = 0;
    state.excluded.clear();
    state.cropPages.clear();
    state.pageSizes = [];
    els.pagesGrid.innerHTML = "";
    els.workspace.classList.add("hidden");
    els.dropzone.classList.remove("hidden");
    setStatus("");
    updateStats();
  }

  function applyCropBox(page, marginsMm) {
    const { width, height } = page.getSize();
    const top = marginsMm.top * MM_TO_PT;
    const right = marginsMm.right * MM_TO_PT;
    const bottom = marginsMm.bottom * MM_TO_PT;
    const left = marginsMm.left * MM_TO_PT;
    let x = left;
    let y = bottom;
    let w = width - left - right;
    let h = height - top - bottom;
    if (w <= 1 || h <= 1) return;
    x = Math.max(0, Math.min(x, width - 2));
    y = Math.max(0, Math.min(y, height - 2));
    w = Math.min(w, width - x);
    h = Math.min(h, height - y);
    page.setCropBox(x, y, w, h);
    page.setMediaBox(x, y, w, h);
  }

  async function exportPdf() {
    if (!state.pdfBytes) return;
    if (state.pageCount - state.excluded.size === 0) {
      setStatus("Debes mantener al menos una página.");
      return;
    }
    els.exportBtn.disabled = true;
    setStatus("Generando PDF…");
    try {
      const { PDFDocument } = PDFLib;
      const src = await PDFDocument.load(state.pdfBytes.slice(), { ignoreEncryption: true });
      const out = await PDFDocument.create();
      const margins = getMarginsMm();
      const indices = [];
      for (let i = 0; i < state.pageCount; i++) if (!state.excluded.has(i)) indices.push(i);
      const copied = await out.copyPages(src, indices);
      copied.forEach((page, idx) => {
        if (state.cropPages.has(indices[idx])) applyCropBox(page, margins);
        out.addPage(page);
      });
      const bytes = await out.save();
      Aseo.downloadBytes(bytes, `${Aseo.baseName(state.fileName)}-sin-anuncios.pdf`, "application/pdf");
      setStatus("Descarga lista.");
    } catch (err) {
      console.error(err);
      Aseo.setStatus(els.status, "Error al generar el PDF.", true);
    } finally {
      updateStats();
    }
  }

  Aseo.bindDropzone({
    dropzone: els.dropzone,
    input: els.fileInput,
    browseBtn: els.browseBtn,
    accept: "application/pdf,.pdf",
    onFiles: (files) => {
      const file = files[0];
      if (!file) return;
      loadPdf(file).catch((err) => {
        console.error(err);
        Aseo.setStatus(els.status, "No se pudo leer el PDF.", true);
        resetApp();
      });
    },
  });

  els.modeExclude.addEventListener("click", () => setMode("exclude"));
  els.modeCrop.addEventListener("click", () => setMode("crop"));
  ["input", "change"].forEach((ev) => {
    [els.marginTop, els.marginRight, els.marginBottom, els.marginLeft].forEach((input) => {
      input.addEventListener(ev, refreshOverlays);
    });
  });
  body.querySelectorAll("[data-preset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.preset === "ads") {
        els.marginTop.value = "18";
        els.marginRight.value = "12";
        els.marginBottom.value = "28";
        els.marginLeft.value = "12";
      } else {
        const v = els.marginTop.value || "15";
        els.marginTop.value = v;
        els.marginRight.value = v;
        els.marginBottom.value = v;
        els.marginLeft.value = v;
      }
      refreshOverlays();
    });
  });
  els.selectAllCrop.addEventListener("click", () => {
    if (allPagesCropMarked()) state.cropPages.clear();
    else for (let i = 0; i < state.pageCount; i++) state.cropPages.add(i);
    refreshAllCards();
  });
  els.clearExcluded.addEventListener("click", () => {
    state.excluded.clear();
    refreshAllCards();
  });
  els.exportBtn.addEventListener("click", exportPdf);
  els.resetBtn.addEventListener("click", resetApp);
  setMode("exclude");
  updateStats();
};
