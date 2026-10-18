/* global pdfjsLib, PDFLib, JSZip */
window.AseoTools = window.AseoTools || {};

(function () {
  "use strict";
  const Aseo = window.Aseo;
  const GROUP_COLORS = ["#3a5366", "#8b4513", "#2f6b4f", "#6b3a5a", "#5a4a2f", "#2f4a6b"];

  window.AseoTools["dividir-pdf"] = async function (body) {
    body.innerHTML = `
      <section class="dropzone tool-drop" id="dz" tabindex="0">
        <input type="file" id="fileInput" accept="application/pdf,.pdf" hidden />
        <div class="dropzone-inner compact">
          <p class="lede">Sube un PDF, crea grupos (mínimo 2) y asigna páginas a cada uno.</p>
          <button type="button" class="btn btn-primary" id="browseBtn">Elegir PDF</button>
          <p class="hint">También puedes soltar el archivo aquí</p>
        </div>
      </section>
      <section id="workspace" class="workspace split-workspace hidden">
        <aside class="controls">
          <div class="file-meta">
            <p class="file-label">Archivo</p>
            <p id="fileName" class="file-name">—</p>
            <p id="pageCount" class="file-pages">0 páginas</p>
          </div>
          <div class="control-block">
            <h2>Grupos</h2>
            <p class="help">Elige un grupo activo y marca páginas una a una o por tramos. Mínimo 2 grupos; cada uno con al menos una página.</p>
            <div id="groupTabs" class="group-tabs" role="tablist"></div>
            <div class="actions compact-actions">
              <button type="button" class="btn btn-ghost" id="addGroupBtn">Añadir grupo</button>
              <button type="button" class="btn btn-ghost" id="removeGroupBtn">Quitar grupo activo</button>
            </div>
            <label class="opt-row range-field">
              <span>Tramos del grupo activo</span>
              <input type="text" id="rangeInput" placeholder="ej. 1-3, 5, 8-10" autocomplete="off" />
            </label>
            <div class="actions compact-actions">
              <button type="button" class="btn btn-ghost" id="applyRangeBtn">Aplicar tramos</button>
            </div>
          </div>
          <div class="control-block summary">
            <div class="stat"><span id="groupCount">2</span><small>grupos</small></div>
            <div class="stat"><span id="assignedCount">0</span><small>asignadas</small></div>
            <div class="stat"><span id="freeCount">0</span><small>sin grupo</small></div>
          </div>
          <div class="actions">
            <button type="button" class="btn btn-primary" id="exportBtn" disabled>Dividir y descargar</button>
            <button type="button" class="btn btn-ghost" id="resetBtn">Otro PDF</button>
          </div>
          <p id="status" class="status" role="status"></p>
        </aside>
        <div class="pages-panel">
          <div class="pages-toolbar">
            <h2>Páginas</h2>
            <p class="mode-help" id="modeHelp">Grupo activo: 1. Clic en una página para asignarla.</p>
          </div>
          <div id="pagesGrid" class="pages-grid"></div>
        </div>
      </section>
      <div id="pageTip" class="page-toast hidden" role="status"></div>
      <div id="unassignedDialog" class="confirm-dialog hidden" role="dialog" aria-modal="true" aria-labelledby="unassignedTitle">
        <div class="confirm-dialog-card">
          <h2 id="unassignedTitle">Páginas sin asignar</h2>
          <p id="unassignedMsg" class="confirm-dialog-text"></p>
          <div class="actions-row">
            <button type="button" class="btn btn-primary" id="confirmExportBtn">Continuar sin ellas</button>
            <button type="button" class="btn btn-ghost" id="cancelExportBtn">Seguir seleccionando</button>
          </div>
        </div>
      </div>
    `;

    const els = {
      dz: body.querySelector("#dz"),
      input: body.querySelector("#fileInput"),
      browseBtn: body.querySelector("#browseBtn"),
      workspace: body.querySelector("#workspace"),
      fileName: body.querySelector("#fileName"),
      pageCount: body.querySelector("#pageCount"),
      groupTabs: body.querySelector("#groupTabs"),
      addGroupBtn: body.querySelector("#addGroupBtn"),
      removeGroupBtn: body.querySelector("#removeGroupBtn"),
      rangeInput: body.querySelector("#rangeInput"),
      applyRangeBtn: body.querySelector("#applyRangeBtn"),
      groupCount: body.querySelector("#groupCount"),
      assignedCount: body.querySelector("#assignedCount"),
      freeCount: body.querySelector("#freeCount"),
      exportBtn: body.querySelector("#exportBtn"),
      resetBtn: body.querySelector("#resetBtn"),
      status: body.querySelector("#status"),
      modeHelp: body.querySelector("#modeHelp"),
      pageTip: body.querySelector("#pageTip"),
      pagesGrid: body.querySelector("#pagesGrid"),
      unassignedDialog: body.querySelector("#unassignedDialog"),
      unassignedMsg: body.querySelector("#unassignedMsg"),
      confirmExportBtn: body.querySelector("#confirmExportBtn"),
      cancelExportBtn: body.querySelector("#cancelExportBtn"),
    };

    const state = {
      pdfBytes: null,
      pdfDoc: null,
      fileName: "",
      pageCount: 0,
      /** pageIndex -> groupIndex (0-based), or undefined if unassigned */
      pageGroup: new Map(),
      groupCount: 2,
      activeGroup: 0,
    };

    function setStatus(msg, isError) {
      Aseo.setStatus(els.status, msg, isError);
    }

    function pagesInGroup(g) {
      const pages = [];
      for (const [page, group] of state.pageGroup) {
        if (group === g) pages.push(page);
      }
      return pages.sort((a, b) => a - b);
    }

    function canExport() {
      if (!state.pdfBytes || state.groupCount < 2) return false;
      for (let g = 0; g < state.groupCount; g++) {
        if (pagesInGroup(g).length === 0) return false;
      }
      return true;
    }

    function unassignedCount() {
      let free = 0;
      for (let i = 0; i < state.pageCount; i++) {
        if (!state.pageGroup.has(i)) free++;
      }
      return free;
    }

    function updateStats() {
      const free = unassignedCount();
      const assigned = state.pageCount - free;
      els.groupCount.textContent = String(state.groupCount);
      els.assignedCount.textContent = String(assigned);
      els.freeCount.textContent = String(free);
      els.exportBtn.disabled = !canExport();
      els.removeGroupBtn.disabled = state.groupCount <= 2;
      els.modeHelp.textContent = `Grupo activo: ${state.activeGroup + 1}. Las páginas de otro grupo no se pueden reasignar.`;
    }

    function hideUnassignedDialog() {
      els.unassignedDialog.classList.add("hidden");
    }

    function showUnassignedDialog(free) {
      const n = free;
      els.unassignedMsg.textContent =
        `Hay ${n} página${n === 1 ? "" : "s"} sin asignar. No se añadirán a ningún PDF. ¿Quieres continuar o seguir seleccionando?`;
      els.unassignedDialog.classList.remove("hidden");
    }

    function parseRanges(text) {
      const parts = text.split(/[,;\s]+/).filter(Boolean);
      if (!parts.length) throw new Error("Escribe al menos un tramo (ej. 1-3 o 5).");
      const indices = new Set();
      for (const part of parts) {
        if (part.includes("-")) {
          const [a, b] = part.split("-").map((n) => parseInt(n, 10));
          if (!a || !b || a < 1 || b > state.pageCount || a > b) {
            throw new Error(`Tramo inválido: ${part}`);
          }
          for (let i = a; i <= b; i++) indices.add(i - 1);
        } else {
          const n = parseInt(part, 10);
          if (!n || n < 1 || n > state.pageCount) throw new Error(`Página inválida: ${part}`);
          indices.add(n - 1);
        }
      }
      return [...indices].sort((a, b) => a - b);
    }

    function applyRanges() {
      if (!state.pdfBytes) return;
      try {
        const indices = parseRanges(els.rangeInput.value.trim());
        let added = 0;
        let skipped = 0;
        indices.forEach((i) => {
          if (state.pageGroup.has(i) && state.pageGroup.get(i) !== state.activeGroup) {
            skipped++;
            return;
          }
          state.pageGroup.set(i, state.activeGroup);
          added++;
        });
        refreshCards();
        if (!added && skipped) {
          setStatus("Esas páginas ya están en otro grupo y no se pueden reasignar.", true);
          return;
        }
        let msg = `Asignadas ${added} página${added === 1 ? "" : "s"} al grupo ${state.activeGroup + 1}.`;
        if (skipped) msg += ` ${skipped} ya estaban en otro grupo.`;
        setStatus(msg);
      } catch (err) {
        setStatus(err.message || "Tramo no válido.", true);
      }
    }

    function renderGroupTabs() {
      els.groupTabs.innerHTML = "";
      for (let g = 0; g < state.groupCount; g++) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "group-tab" + (g === state.activeGroup ? " active" : "");
        btn.style.setProperty("--group-color", GROUP_COLORS[g % GROUP_COLORS.length]);
        const n = pagesInGroup(g).length;
        btn.innerHTML = `<span class="group-tab-dot"></span>Grupo ${g + 1}<small>${n} pág.</small>`;
        btn.addEventListener("click", () => {
          state.activeGroup = g;
          renderGroupTabs();
          refreshCards();
          updateStats();
        });
        els.groupTabs.appendChild(btn);
      }
    }

    function refreshCard(card) {
      const index = Number(card.dataset.index);
      const group = state.pageGroup.has(index) ? state.pageGroup.get(index) : null;
      const lockedOther = group !== null && group !== state.activeGroup;
      card.classList.toggle("in-group", group !== null);
      card.classList.toggle("active-group", group === state.activeGroup);
      card.classList.toggle("group-locked", lockedOther);
      card.title = lockedOther
        ? `Asignada al grupo ${group + 1}. No se puede mover.`
        : "";
      if (group !== null) {
        card.style.setProperty("--group-color", GROUP_COLORS[group % GROUP_COLORS.length]);
      } else {
        card.style.removeProperty("--group-color");
      }
      const badges = card.querySelector(".badges");
      badges.innerHTML =
        group !== null
          ? `<span class="badge badge-group">G${group + 1}</span>`
          : "";
    }

    function refreshCards() {
      body.querySelectorAll(".page-card").forEach(refreshCard);
      renderGroupTabs();
      updateStats();
    }

    let tipTimer = null;

    function showPageTip(msg, nearEl) {
      els.pageTip.textContent = msg;
      els.pageTip.classList.remove("hidden", "is-leaving");
      if (nearEl && nearEl.getBoundingClientRect) {
        const rect = nearEl.getBoundingClientRect();
        const tipW = Math.min(320, window.innerWidth - 24);
        let left = rect.left + rect.width / 2 - tipW / 2;
        left = Math.max(12, Math.min(left, window.innerWidth - tipW - 12));
        let top = rect.bottom + 10;
        els.pageTip.style.width = `${tipW}px`;
        els.pageTip.style.left = `${left}px`;
        els.pageTip.style.top = `${top}px`;
        els.pageTip.style.transform = "none";
        // If it would go off-screen bottom, show above the card
        requestAnimationFrame(() => {
          const tipRect = els.pageTip.getBoundingClientRect();
          if (tipRect.bottom > window.innerHeight - 12) {
            top = Math.max(12, rect.top - tipRect.height - 10);
            els.pageTip.style.top = `${top}px`;
          }
        });
      } else {
        els.pageTip.style.width = "";
        els.pageTip.style.left = "50%";
        els.pageTip.style.top = "auto";
        els.pageTip.style.bottom = "1.5rem";
        els.pageTip.style.transform = "translateX(-50%)";
      }
      if (tipTimer) clearTimeout(tipTimer);
      tipTimer = setTimeout(() => {
        els.pageTip.classList.add("is-leaving");
        tipTimer = setTimeout(() => {
          els.pageTip.classList.add("hidden");
          els.pageTip.classList.remove("is-leaving");
        }, 220);
      }, 3200);
    }

    function hidePageTip() {
      if (tipTimer) clearTimeout(tipTimer);
      els.pageTip.classList.add("hidden");
      els.pageTip.classList.remove("is-leaving");
    }

    function onPageClick(index, cardEl) {
      const current = state.pageGroup.has(index) ? state.pageGroup.get(index) : null;
      if (current === null) {
        hidePageTip();
        state.pageGroup.set(index, state.activeGroup);
      } else if (current === state.activeGroup) {
        hidePageTip();
        state.pageGroup.delete(index);
      } else {
        showPageTip(
          `Está en el grupo ${current + 1}. Ve a ese grupo, deselecciónala y luego podrás ponerla en otro.`,
          cardEl
        );
        return;
      }
      refreshCards();
    }

    async function renderPageThumb(page, index) {
      const canvas = await Aseo.pdfPageToCanvas(page, 0.35);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "page-card";
      btn.dataset.index = String(index);
      btn.innerHTML = `
        <div class="page-preview"></div>
        <div class="page-meta"><span>Pág. ${index + 1}</span><div class="badges"></div></div>
      `;
      btn.querySelector(".page-preview").appendChild(canvas);
      btn.addEventListener("click", () => onPageClick(index, btn));
      els.pagesGrid.appendChild(btn);
      refreshCard(btn);
    }

    async function loadPdf(file) {
      setStatus("Cargando PDF…");
      els.exportBtn.disabled = true;
      els.pagesGrid.innerHTML = "";
      state.pageGroup.clear();
      state.groupCount = 2;
      state.activeGroup = 0;
      const buffer = await file.arrayBuffer();
      state.pdfBytes = new Uint8Array(buffer);
      state.fileName = file.name;
      state.pdfDoc = await pdfjsLib.getDocument({ data: state.pdfBytes.slice() }).promise;
      state.pageCount = state.pdfDoc.numPages;
      if (state.pageCount < 2) {
        setStatus("El PDF necesita al menos 2 páginas para dividir por grupos.", true);
        resetApp();
        return;
      }
      els.fileName.textContent = state.fileName;
      els.pageCount.textContent = `${state.pageCount} página${state.pageCount === 1 ? "" : "s"}`;
      els.dz.classList.add("hidden");
      els.workspace.classList.remove("hidden");
      for (let i = 1; i <= state.pageCount; i++) {
        const page = await state.pdfDoc.getPage(i);
        await renderPageThumb(page, i - 1);
        setStatus(`Renderizando… ${i}/${state.pageCount}`);
      }
      refreshCards();
      setStatus("Listo. Elige un grupo y marca sus páginas.");
    }

    function resetApp() {
      state.pdfBytes = null;
      state.pdfDoc = null;
      state.fileName = "";
      state.pageCount = 0;
      state.pageGroup.clear();
      state.groupCount = 2;
      state.activeGroup = 0;
      els.pagesGrid.innerHTML = "";
      els.rangeInput.value = "";
      hidePageTip();
      els.workspace.classList.add("hidden");
      els.dz.classList.remove("hidden");
      setStatus("");
      updateStats();
      renderGroupTabs();
    }

    function addGroup() {
      state.groupCount += 1;
      state.activeGroup = state.groupCount - 1;
      refreshCards();
    }

    function removeActiveGroup() {
      if (state.groupCount <= 2) return;
      const removed = state.activeGroup;
      for (const [page, group] of [...state.pageGroup]) {
        if (group === removed) state.pageGroup.delete(page);
        else if (group > removed) state.pageGroup.set(page, group - 1);
      }
      state.groupCount -= 1;
      if (state.activeGroup >= state.groupCount) state.activeGroup = state.groupCount - 1;
      refreshCards();
    }

    async function doExport() {
      hideUnassignedDialog();
      els.exportBtn.disabled = true;
      setStatus("Dividiendo…");
      try {
        const { PDFDocument } = PDFLib;
        const src = await PDFDocument.load(state.pdfBytes.slice(), { ignoreEncryption: true });
        const base = Aseo.baseName(state.fileName);
        const zip = new JSZip();
        for (let g = 0; g < state.groupCount; g++) {
          const indices = pagesInGroup(g);
          const out = await PDFDocument.create();
          const copied = await out.copyPages(src, indices);
          copied.forEach((p) => out.addPage(p));
          const label =
            indices.length === 1
              ? `grupo${g + 1}-p${indices[0] + 1}`
              : `grupo${g + 1}-p${indices[0] + 1}-${indices[indices.length - 1] + 1}`;
          zip.file(`${base}-${label}.pdf`, await out.save());
        }
        Aseo.downloadBlob(await zip.generateAsync({ type: "blob" }), `${base}-dividido.zip`);
        const free = unassignedCount();
        setStatus(
          free
            ? `ZIP descargado. ${free} página${free === 1 ? "" : "s"} sin asignar no se incluyeron.`
            : "ZIP con los grupos descargado."
        );
      } catch (err) {
        console.error(err);
        setStatus(err.message || "Error al dividir.", true);
      } finally {
        updateStats();
      }
    }

    function exportSplit() {
      if (!canExport()) {
        setStatus("Necesitas al menos 2 grupos y cada uno con alguna página.", true);
        return;
      }
      const free = unassignedCount();
      if (free > 0) {
        showUnassignedDialog(free);
        return;
      }
      doExport();
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

    els.addGroupBtn.addEventListener("click", addGroup);
    els.removeGroupBtn.addEventListener("click", removeActiveGroup);
    els.applyRangeBtn.addEventListener("click", applyRanges);
    els.rangeInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        applyRanges();
      }
    });
    els.exportBtn.addEventListener("click", exportSplit);
    els.confirmExportBtn.addEventListener("click", doExport);
    els.cancelExportBtn.addEventListener("click", () => {
      hideUnassignedDialog();
      setStatus("Puedes seguir asignando páginas.");
    });
    els.unassignedDialog.addEventListener("click", (e) => {
      if (e.target === els.unassignedDialog) {
        hideUnassignedDialog();
        setStatus("Puedes seguir asignando páginas.");
      }
    });
    els.resetBtn.addEventListener("click", () => {
      hideUnassignedDialog();
      resetApp();
    });
    renderGroupTabs();
    updateStats();
  };
})();
