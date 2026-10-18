/* global pdfjsLib, PDFLib */
window.AseoTools = window.AseoTools || {};

(function () {
  "use strict";
  const Aseo = window.Aseo;

  window.AseoTools["rotar-pdf"] = async function (body) {
    body.innerHTML = `
      <section class="dropzone tool-drop" id="dz" tabindex="0">
        <input type="file" id="fileInput" accept="application/pdf,.pdf" hidden />
        <div class="dropzone-inner compact">
          <p class="lede">Sube un PDF para rotarlo entero o página a página, con vista previa.</p>
          <button type="button" class="btn btn-primary" id="browseBtn">Elegir PDF</button>
          <p class="hint">También puedes soltar el archivo aquí</p>
        </div>
      </section>
      <section id="workspace" class="workspace rotate-workspace hidden">
        <aside class="controls">
          <div class="file-meta">
            <p class="file-label">Archivo</p>
            <p id="fileName" class="file-name">—</p>
            <p id="pageCount" class="file-pages">0 páginas</p>
          </div>
          <div class="control-block">
            <h2>Modo</h2>
            <div class="mode-toggle" role="group" aria-label="Modo de rotación">
              <button type="button" class="mode-btn active" data-mode="all" id="modeAll">Todo el PDF</button>
              <button type="button" class="mode-btn" data-mode="pages" id="modePages">Por páginas</button>
            </div>
            <p class="mode-help" id="modeHelp">La rotación se aplica a todas las páginas.</p>
          </div>
          <div class="control-block">
            <h2>Rotar</h2>
            <div class="rotate-actions">
              <button type="button" class="btn btn-ghost" id="rotLeft" title="Girar a la izquierda">↺ Izquierda</button>
              <button type="button" class="btn btn-ghost" id="rotRight" title="Girar a la derecha">Derecha ↻</button>
            </div>
            <p class="help">Cada clic gira 90°. Para darle la vuelta, pulsa dos veces el mismo lado.</p>
            <div class="actions compact-actions">
              <button type="button" class="btn btn-ghost" id="resetRotBtn">Quitar rotaciones</button>
            </div>
          </div>
          <div class="control-block summary">
            <div class="stat"><span id="changedCount">0</span><small>modificadas</small></div>
            <div class="stat"><span id="selectedCount">0</span><small>seleccionadas</small></div>
          </div>
          <div class="actions">
            <button type="button" class="btn btn-primary" id="exportBtn" disabled>Descargar PDF rotado</button>
            <button type="button" class="btn btn-ghost" id="resetBtn">Otro PDF</button>
          </div>
          <p id="status" class="status" role="status"></p>
        </aside>
        <div class="pages-panel">
          <div class="pages-toolbar">
            <h2>Vista previa</h2>
            <p class="mode-help" id="previewHelp">Así quedará el PDF al descargar.</p>
          </div>
          <div id="pagesGrid" class="pages-grid rotate-grid"></div>
        </div>
      </section>
    `;

    const els = {
      dz: body.querySelector("#dz"),
      input: body.querySelector("#fileInput"),
      browseBtn: body.querySelector("#browseBtn"),
      workspace: body.querySelector("#workspace"),
      fileName: body.querySelector("#fileName"),
      pageCount: body.querySelector("#pageCount"),
      modeAll: body.querySelector("#modeAll"),
      modePages: body.querySelector("#modePages"),
      modeHelp: body.querySelector("#modeHelp"),
      previewHelp: body.querySelector("#previewHelp"),
      rotLeft: body.querySelector("#rotLeft"),
      rotRight: body.querySelector("#rotRight"),
      resetRotBtn: body.querySelector("#resetRotBtn"),
      changedCount: body.querySelector("#changedCount"),
      selectedCount: body.querySelector("#selectedCount"),
      exportBtn: body.querySelector("#exportBtn"),
      resetBtn: body.querySelector("#resetBtn"),
      status: body.querySelector("#status"),
      pagesGrid: body.querySelector("#pagesGrid"),
    };

    const state = {
      pdfBytes: null,
      pdfDoc: null,
      fileName: "",
      pageCount: 0,
      /** extra rotation per page: 0 | 90 | 180 | 270 */
      rotations: [],
      selected: new Set(),
      mode: "all",
    };

    function setStatus(msg, isError) {
      Aseo.setStatus(els.status, msg, isError);
    }

    function normAngle(a) {
      return ((a % 360) + 360) % 360;
    }

    function targets() {
      if (state.mode === "all") {
        return Array.from({ length: state.pageCount }, (_, i) => i);
      }
      return [...state.selected].sort((a, b) => a - b);
    }

    function applyDelta(delta) {
      const pages = targets();
      if (state.mode === "pages" && !pages.length) {
        setStatus("Selecciona al menos una página para rotarla.", true);
        return;
      }
      pages.forEach((i) => {
        state.rotations[i] = normAngle(state.rotations[i] + delta);
      });
      refreshAll();
      setStatus(
        state.mode === "all"
          ? `Rotación aplicada a las ${state.pageCount} páginas.`
          : `Rotación aplicada a ${pages.length} página${pages.length === 1 ? "" : "s"}.`
      );
    }

    function clearRotations() {
      state.rotations = Array(state.pageCount).fill(0);
      refreshAll();
      setStatus("Rotaciones quitadas.");
    }

    function updateStats() {
      const changed = state.rotations.filter((r) => r !== 0).length;
      els.changedCount.textContent = String(changed);
      els.selectedCount.textContent = String(state.selected.size);
      els.exportBtn.disabled = !state.pdfBytes || changed === 0;
    }

    function setMode(mode) {
      state.mode = mode;
      els.modeAll.classList.toggle("active", mode === "all");
      els.modePages.classList.toggle("active", mode === "pages");
      if (mode === "all") state.selected.clear();
      els.modeHelp.textContent =
        mode === "all"
          ? "Los botones de rotar afectan a todas las páginas."
          : "Selecciona páginas y luego rota, o haz clic otra vez para quitar la selección.";
      els.previewHelp.textContent =
        mode === "all"
          ? "Vista previa de cómo quedará el PDF completo."
          : "Marca páginas y aplica rotación. La vista previa se actualiza al momento.";
      refreshAll();
    }

    function refreshCard(card) {
      const index = Number(card.dataset.index);
      const rot = state.rotations[index] || 0;
      const selected = state.selected.has(index);
      card.classList.toggle("is-selected", state.mode === "pages" && selected);
      card.classList.toggle("is-rotated", rot !== 0);
      const stage = card.querySelector(".rotate-stage");
      stage.style.transform = rot ? `rotate(${rot}deg)` : "";
      stage.classList.toggle("is-sideways", rot === 90 || rot === 270);
      const badge = card.querySelector(".badges");
      badge.innerHTML = rot ? `<span class="badge badge-crop">${rot}°</span>` : "";
      const label = card.querySelector(".page-meta span");
      label.textContent = `Pág. ${index + 1}`;
    }

    function refreshAll() {
      body.querySelectorAll(".page-card").forEach(refreshCard);
      updateStats();
    }

    function onPageClick(index) {
      if (state.mode !== "pages") return;
      if (state.selected.has(index)) state.selected.delete(index);
      else state.selected.add(index);
      refreshAll();
    }

    async function renderPageThumb(page, index) {
      const canvas = await Aseo.pdfPageToCanvas(page, 0.35);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "page-card";
      btn.dataset.index = String(index);
      btn.innerHTML = `
        <div class="page-preview rotate-preview">
          <div class="rotate-stage"></div>
        </div>
        <div class="page-meta"><span>Pág. ${index + 1}</span><div class="badges"></div></div>
      `;
      btn.querySelector(".rotate-stage").appendChild(canvas);
      btn.addEventListener("click", () => onPageClick(index));
      els.pagesGrid.appendChild(btn);
      refreshCard(btn);
    }

    async function loadPdf(file) {
      setStatus("Cargando PDF…");
      els.exportBtn.disabled = true;
      els.pagesGrid.innerHTML = "";
      state.selected.clear();
      const buffer = await file.arrayBuffer();
      state.pdfBytes = new Uint8Array(buffer);
      state.fileName = file.name;
      state.pdfDoc = await pdfjsLib.getDocument({ data: state.pdfBytes.slice() }).promise;
      state.pageCount = state.pdfDoc.numPages;
      state.rotations = Array(state.pageCount).fill(0);
      els.fileName.textContent = state.fileName;
      els.pageCount.textContent = `${state.pageCount} página${state.pageCount === 1 ? "" : "s"}`;
      els.dz.classList.add("hidden");
      els.workspace.classList.remove("hidden");
      for (let i = 1; i <= state.pageCount; i++) {
        const page = await state.pdfDoc.getPage(i);
        await renderPageThumb(page, i - 1);
        setStatus(`Renderizando… ${i}/${state.pageCount}`);
      }
      setMode(state.mode);
      setStatus("Listo. Elige modo y rota; la vista previa se actualiza al momento.");
    }

    function resetApp() {
      state.pdfBytes = null;
      state.pdfDoc = null;
      state.fileName = "";
      state.pageCount = 0;
      state.rotations = [];
      state.selected.clear();
      state.mode = "all";
      els.pagesGrid.innerHTML = "";
      els.workspace.classList.add("hidden");
      els.dz.classList.remove("hidden");
      setStatus("");
      updateStats();
    }

    async function exportPdf() {
      if (!state.pdfBytes) return;
      if (!state.rotations.some((r) => r !== 0)) {
        setStatus("No hay rotaciones que aplicar.", true);
        return;
      }
      els.exportBtn.disabled = true;
      setStatus("Generando PDF…");
      try {
        const { PDFDocument, degrees } = PDFLib;
        const doc = await PDFDocument.load(state.pdfBytes.slice(), { ignoreEncryption: true });
        doc.getPages().forEach((page, i) => {
          const delta = state.rotations[i] || 0;
          if (!delta) return;
          const current = page.getRotation().angle || 0;
          page.setRotation(degrees(normAngle(current + delta)));
        });
        Aseo.downloadBytes(
          await doc.save(),
          `${Aseo.baseName(state.fileName)}-rotado.pdf`,
          "application/pdf"
        );
        setStatus("PDF rotado descargado.");
      } catch (err) {
        console.error(err);
        setStatus(err.message || "Error al rotar.", true);
      } finally {
        updateStats();
      }
    }

    Aseo.bindDropzone({
      dropzone: els.dz,
      input: els.input,
      browseBtn: els.browseBtn,
      accept: "application/pdf,.pdf",
      multiple: false,
      onFiles: (files) => {
        const file = files[0];
        if (!file) return;
        if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
          setStatus("Formato no válido.", true);
          return;
        }
        loadPdf(file).catch((err) => {
          console.error(err);
          setStatus("No se pudo leer el PDF.", true);
          resetApp();
        });
      },
    });

    els.modeAll.addEventListener("click", () => setMode("all"));
    els.modePages.addEventListener("click", () => setMode("pages"));
    els.rotLeft.addEventListener("click", () => applyDelta(-90));
    els.rotRight.addEventListener("click", () => applyDelta(90));
    els.resetRotBtn.addEventListener("click", clearRotations);
    els.exportBtn.addEventListener("click", exportPdf);
    els.resetBtn.addEventListener("click", resetApp);
    updateStats();
  };
})();
