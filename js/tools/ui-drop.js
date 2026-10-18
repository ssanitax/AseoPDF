/* Shared drop + file-list UI for convert tools */
window.Aseo = window.Aseo || {};

(function (Aseo) {
  "use strict";

  Aseo.simpleDropUI = function(body, opts) {
    const addLabel = opts.addLabel || "Añadir más";
    body.innerHTML = `
      <section class="dropzone tool-drop" id="dz" tabindex="0">
        <input type="file" id="fileInput" hidden />
        <div class="dropzone-inner compact">
          <p class="lede">${opts.lede}</p>
          <button type="button" class="btn btn-primary" id="browseBtn">${opts.browse}</button>
          <p class="hint">También puedes soltar archivos aquí</p>
        </div>
      </section>
      <div id="panel" class="convert-panel hidden">
        <div id="fileArea"></div>
        ${
          opts.multiple
            ? `<div class="add-more-row">
          <button type="button" class="btn btn-ghost" id="addMoreBtn">${addLabel}</button>
          <p class="hint">O suelta más archivos en esta zona</p>
        </div>`
            : ""
        }
        <div id="options" class="convert-options">${opts.optionsHtml || ""}</div>
        <div class="actions-row">
          <button type="button" class="btn btn-primary" id="runBtn" disabled>${opts.runLabel}</button>
          <button type="button" class="btn btn-ghost" id="clearBtn">Empezar de nuevo</button>
        </div>
        <p id="status" class="status" role="status"></p>
      </div>
    `;
    const dz = body.querySelector("#dz");
    const input = body.querySelector("#fileInput");
    const browseBtn = body.querySelector("#browseBtn");
    const panel = body.querySelector("#panel");
    const fileArea = body.querySelector("#fileArea");
    const addMoreBtn = body.querySelector("#addMoreBtn");
    const runBtn = body.querySelector("#runBtn");
    const clearBtn = body.querySelector("#clearBtn");
    const status = body.querySelector("#status");
    let files = [];

    function refresh() {
      fileArea.innerHTML = Aseo.fileListHtml(files);
      runBtn.disabled = files.length === 0;
      fileArea.querySelectorAll("[data-remove]").forEach((btn) => {
        btn.addEventListener("click", () => {
          files.splice(Number(btn.dataset.remove), 1);
          if (!files.length) {
            panel.classList.add("hidden");
            dz.classList.remove("hidden");
          }
          refresh();
        });
      });
    }

    function addFiles(list) {
      const filtered = opts.filter ? list.filter(opts.filter) : list;
      if (!filtered.length) {
        Aseo.setStatus(status, "Formato no válido.", true);
        return;
      }
      if (opts.multiple) files = files.concat(filtered);
      else files = [filtered[0]];
      dz.classList.add("hidden");
      panel.classList.remove("hidden");
      refresh();
      Aseo.setStatus(status, "");
    }

    Aseo.bindDropzone({
      dropzone: dz,
      input,
      browseBtn,
      accept: opts.accept,
      multiple: opts.multiple,
      onFiles: addFiles,
    });

    if (addMoreBtn) {
      addMoreBtn.addEventListener("click", () => input.click());
      panel.addEventListener("dragover", (e) => {
        e.preventDefault();
        panel.classList.add("is-dragover");
      });
      panel.addEventListener("dragleave", () => panel.classList.remove("is-dragover"));
      panel.addEventListener("drop", (e) => {
        e.preventDefault();
        panel.classList.remove("is-dragover");
        const list = [...(e.dataTransfer.files || [])];
        if (list.length) addFiles(list);
      });
    }

    clearBtn.addEventListener("click", () => {
      files = [];
      panel.classList.add("hidden");
      dz.classList.remove("hidden");
      Aseo.setStatus(status, "");
      refresh();
    });

    runBtn.addEventListener("click", async () => {
      runBtn.disabled = true;
      try {
        await opts.onRun(files, { status, body, runBtn });
      } catch (err) {
        console.error(err);
        Aseo.setStatus(status, err.message || "Error al procesar.", true);
      } finally {
        runBtn.disabled = files.length === 0;
      }
    });

    return { getFiles: () => files, status, body };
  }

})(window.Aseo);
