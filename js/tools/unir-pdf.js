/* global pdfjsLib, PDFLib */
window.AseoTools = window.AseoTools || {};

(function () {
  "use strict";
  const Aseo = window.Aseo;

  window.AseoTools["unir-pdf"] = async function (body) {
    body.innerHTML = `
      <section class="dropzone tool-drop" id="dz" tabindex="0">
        <input type="file" id="fileInput" accept="application/pdf,.pdf" multiple hidden />
        <div class="dropzone-inner compact">
          <p class="lede">Sube un PDF y ve añadiendo más. Luego ordénalos y previsualiza cada uno.</p>
          <button type="button" class="btn btn-primary" id="browseBtn">Elegir PDF</button>
          <p class="hint">También puedes soltar archivos aquí</p>
        </div>
      </section>
      <div id="panel" class="convert-panel merge-panel hidden">
        <div class="merge-layout">
          <div class="merge-list-wrap">
            <div class="merge-list-head">
              <h2>PDFs a unir</h2>
              <p class="help">Arrastra para reordenar, o usa las flechas. Clic para ver la vista previa.</p>
            </div>
            <ul id="mergeList" class="merge-list"></ul>
            <div class="add-more-row">
              <button type="button" class="btn btn-ghost" id="addMoreBtn">Añadir PDF</button>
              <p class="hint">O suelta más archivos aquí</p>
            </div>
          </div>
          <aside class="merge-preview" id="mergePreview">
            <p class="merge-preview-empty" id="previewEmpty">Selecciona un PDF de la lista para ver su contenido.</p>
            <div id="previewBody" class="merge-preview-body hidden">
              <div class="merge-preview-meta">
                <p id="previewName" class="file-name">—</p>
                <p id="previewPages" class="file-pages">0 páginas</p>
              </div>
              <div id="previewGrid" class="merge-preview-grid"></div>
            </div>
          </aside>
        </div>
        <label class="opt-row merge-name-field">
          <span>Nombre del PDF final <em>(obligatorio)</em></span>
          <input type="text" id="outName" required placeholder="ej. documento-unido" autocomplete="off" />
        </label>
        <div class="actions-row">
          <button type="button" class="btn btn-primary" id="runBtn" disabled>Unir PDF</button>
          <button type="button" class="btn btn-ghost" id="clearBtn">Empezar de nuevo</button>
        </div>
        <p id="status" class="status" role="status"></p>
      </div>
    `;

    const dz = body.querySelector("#dz");
    const input = body.querySelector("#fileInput");
    const browseBtn = body.querySelector("#browseBtn");
    const panel = body.querySelector("#panel");
    const mergeList = body.querySelector("#mergeList");
    const addMoreBtn = body.querySelector("#addMoreBtn");
    const runBtn = body.querySelector("#runBtn");
    const clearBtn = body.querySelector("#clearBtn");
    const status = body.querySelector("#status");
    const outName = body.querySelector("#outName");
    const previewEmpty = body.querySelector("#previewEmpty");
    const previewBody = body.querySelector("#previewBody");
    const previewName = body.querySelector("#previewName");
    const previewPages = body.querySelector("#previewPages");
    const previewGrid = body.querySelector("#previewGrid");

    /** @type {{ id: string, file: File, pageCount: number, thumb: HTMLCanvasElement|null, bytes: Uint8Array|null }[]} */
    let items = [];
    let selectedId = null;
    let dragFrom = null;

    function isPdf(f) {
      return /\.pdf$/i.test(f.name) || f.type === "application/pdf";
    }

    function uid() {
      return `pdf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }

    function getOutputName() {
      let name = (outName.value || "").trim();
      if (!name) return "";
      name = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "").replace(/\.+$/, "");
      if (!name) return "";
      if (!/\.pdf$/i.test(name)) name += ".pdf";
      return name;
    }

    async function loadItemMeta(item) {
      const buffer = await item.file.arrayBuffer();
      item.bytes = new Uint8Array(buffer);
      const doc = await pdfjsLib.getDocument({ data: item.bytes.slice() }).promise;
      item.pageCount = doc.numPages;
      if (doc.numPages > 0) {
        const page = await doc.getPage(1);
        item.thumb = await Aseo.pdfPageToCanvas(page, 0.28);
      }
    }

    function updateRunBtn() {
      runBtn.disabled = items.length < 2 || !getOutputName();
    }

    function moveItem(from, to) {
      if (to < 0 || to >= items.length || from === to) return;
      const [item] = items.splice(from, 1);
      items.splice(to, 0, item);
      renderList();
    }

    async function showPreview(item) {
      selectedId = item.id;
      renderList();
      previewEmpty.classList.add("hidden");
      previewBody.classList.remove("hidden");
      previewName.textContent = item.file.name;
      previewPages.textContent = `${item.pageCount} página${item.pageCount === 1 ? "" : "s"}`;
      previewGrid.innerHTML = '<p class="help">Cargando vista previa…</p>';
      try {
        const doc = await pdfjsLib.getDocument({ data: item.bytes.slice() }).promise;
        previewGrid.innerHTML = "";
        const maxPages = Math.min(doc.numPages, 24);
        for (let i = 1; i <= maxPages; i++) {
          const page = await doc.getPage(i);
          const canvas = await Aseo.pdfPageToCanvas(page, 0.45);
          const card = document.createElement("div");
          card.className = "merge-preview-page";
          card.innerHTML = `<span>Pág. ${i}</span>`;
          card.prepend(canvas);
          previewGrid.appendChild(card);
        }
        if (doc.numPages > maxPages) {
          const more = document.createElement("p");
          more.className = "help";
          more.textContent = `Mostrando ${maxPages} de ${doc.numPages} páginas.`;
          previewGrid.appendChild(more);
        }
      } catch (err) {
        console.error(err);
        previewGrid.innerHTML = '<p class="status is-error">No se pudo previsualizar este PDF.</p>';
      }
    }

    function clearPreview() {
      selectedId = null;
      previewEmpty.classList.remove("hidden");
      previewBody.classList.add("hidden");
      previewGrid.innerHTML = "";
    }

    function renderList() {
      mergeList.innerHTML = "";
      items.forEach((item, index) => {
        const li = document.createElement("li");
        li.className = "merge-item" + (item.id === selectedId ? " is-selected" : "");
        li.draggable = true;
        li.dataset.id = item.id;
        li.innerHTML = `
          <span class="merge-item-order">${index + 1}</span>
          <div class="merge-item-thumb"></div>
          <div class="merge-item-info">
            <span class="merge-item-name">${item.file.name}</span>
            <span class="merge-item-meta">${item.pageCount || "…"} pág. · ${Aseo.formatBytes(item.file.size)}</span>
          </div>
          <div class="merge-item-actions">
            <button type="button" class="btn btn-ghost btn-sm" data-up title="Subir">↑</button>
            <button type="button" class="btn btn-ghost btn-sm" data-down title="Bajar">↓</button>
            <button type="button" class="btn btn-ghost btn-sm" data-remove>Quitar</button>
          </div>
        `;
        const thumbWrap = li.querySelector(".merge-item-thumb");
        if (item.thumb) {
          const img = document.createElement("img");
          img.src = item.thumb.toDataURL("image/jpeg", 0.75);
          img.alt = "";
          thumbWrap.appendChild(img);
        } else {
          thumbWrap.innerHTML = '<span class="merge-thumb-placeholder">…</span>';
        }

        li.addEventListener("click", (e) => {
          if (e.target.closest("button")) return;
          showPreview(item);
        });
        li.querySelector("[data-up]").addEventListener("click", (e) => {
          e.stopPropagation();
          moveItem(index, index - 1);
        });
        li.querySelector("[data-down]").addEventListener("click", (e) => {
          e.stopPropagation();
          moveItem(index, index + 1);
        });
        li.querySelector("[data-remove]").addEventListener("click", (e) => {
          e.stopPropagation();
          const wasSelected = item.id === selectedId;
          items = items.filter((x) => x.id !== item.id);
          if (!items.length) {
            panel.classList.add("hidden");
            dz.classList.remove("hidden");
            clearPreview();
          } else if (wasSelected) {
            clearPreview();
          }
          renderList();
          updateRunBtn();
        });

        li.addEventListener("dragstart", () => {
          dragFrom = index;
          li.classList.add("is-dragging");
        });
        li.addEventListener("dragend", () => {
          dragFrom = null;
          li.classList.remove("is-dragging");
          mergeList.querySelectorAll(".is-drop-target").forEach((el) => el.classList.remove("is-drop-target"));
        });
        li.addEventListener("dragover", (e) => {
          e.preventDefault();
          li.classList.add("is-drop-target");
        });
        li.addEventListener("dragleave", () => li.classList.remove("is-drop-target"));
        li.addEventListener("drop", (e) => {
          e.preventDefault();
          e.stopPropagation();
          li.classList.remove("is-drop-target");
          if (dragFrom === null) return;
          moveItem(dragFrom, index);
          dragFrom = null;
        });

        mergeList.appendChild(li);
      });
      updateRunBtn();
    }

    async function addFiles(list) {
      const filtered = list.filter(isPdf);
      if (!filtered.length) {
        Aseo.setStatus(status, "Formato no válido.", true);
        return;
      }
      dz.classList.add("hidden");
      panel.classList.remove("hidden");
      Aseo.setStatus(status, "Cargando vistas previas…");
      for (const file of filtered) {
        const item = { id: uid(), file, pageCount: 0, thumb: null, bytes: null };
        items.push(item);
        renderList();
        try {
          await loadItemMeta(item);
        } catch (err) {
          console.error(err);
          items = items.filter((x) => x.id !== item.id);
          Aseo.setStatus(status, `No se pudo leer ${file.name}.`, true);
        }
        renderList();
      }
      updateRunBtn();
      Aseo.setStatus(status, items.length ? "Listo. Ordena y previsualiza antes de unir." : "");
    }

    Aseo.bindDropzone({
      dropzone: dz,
      input,
      browseBtn,
      accept: "application/pdf,.pdf",
      multiple: true,
      onFiles: addFiles,
    });

    addMoreBtn.addEventListener("click", () => input.click());
    panel.addEventListener("dragover", (e) => {
      if (e.dataTransfer && [...e.dataTransfer.types].includes("Files")) {
        e.preventDefault();
        panel.classList.add("is-dragover");
      }
    });
    panel.addEventListener("dragleave", () => panel.classList.remove("is-dragover"));
    panel.addEventListener("drop", (e) => {
      if (!(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length)) return;
      e.preventDefault();
      panel.classList.remove("is-dragover");
      addFiles([...e.dataTransfer.files]);
    });

    outName.addEventListener("input", updateRunBtn);

    clearBtn.addEventListener("click", () => {
      items = [];
      outName.value = "";
      panel.classList.add("hidden");
      dz.classList.remove("hidden");
      clearPreview();
      renderList();
      Aseo.setStatus(status, "");
    });

    runBtn.addEventListener("click", async () => {
      if (items.length < 2) {
        Aseo.setStatus(status, "Necesitas al menos dos PDF.", true);
        return;
      }
      const fileName = getOutputName();
      if (!fileName) {
        Aseo.setStatus(status, "Escribe un nombre para el PDF final.", true);
        outName.focus();
        return;
      }
      runBtn.disabled = true;
      Aseo.setStatus(status, "Uniendo…");
      try {
        const { PDFDocument } = PDFLib;
        const out = await PDFDocument.create();
        for (const item of items) {
          const src = await PDFDocument.load(item.bytes.slice(), { ignoreEncryption: true });
          const pages = await out.copyPages(src, src.getPageIndices());
          pages.forEach((p) => out.addPage(p));
        }
        Aseo.downloadBytes(await out.save(), fileName, "application/pdf");
        Aseo.setStatus(status, "PDF unido descargado.");
      } catch (err) {
        console.error(err);
        Aseo.setStatus(status, err.message || "Error al unir.", true);
      } finally {
        updateRunBtn();
      }
    });
  };

})();
