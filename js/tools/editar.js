/* global pdfjsLib, PDFLib */
window.AseoTools = window.AseoTools || {};

(function () {
  "use strict";
  const Aseo = window.Aseo;
  const simpleDropUI = Aseo.simpleDropUI;

  function isPdf(f) {
    return /\.pdf$/i.test(f.name) || f.type === "application/pdf";
  }

  async function loadPdfJs(bytes, password) {
    const opts = { data: bytes.slice() };
    if (password != null && password !== undefined) opts.password = password;
    return pdfjsLib.getDocument(opts).promise;
  }

  /* ——— Firmar PDF ——— */
  window.AseoTools["firmar-pdf"] = async function (body) {
    body.innerHTML = `
      <section class="dropzone tool-drop" id="dz" tabindex="0">
        <input type="file" id="fileInput" accept="application/pdf,.pdf" hidden />
        <div class="dropzone-inner compact">
          <p class="lede">1) Crea tu firma · 2) Haz clic en la página para colocarla · 3) Revisa cómo queda y descarga.</p>
          <button type="button" class="btn btn-primary" id="browseBtn">Elegir PDF</button>
          <p class="hint">También puedes soltar el archivo aquí</p>
        </div>
      </section>
      <section id="workspace" class="workspace edit-workspace hidden">
        <aside class="controls">
          <div class="file-meta">
            <p class="file-label">Archivo</p>
            <p id="fileName" class="file-name">—</p>
            <p id="pageCount" class="file-pages">0 páginas</p>
          </div>
          <div class="control-block">
            <h2>1. Tu firma</h2>
            <div class="mode-toggle" role="group" aria-label="Origen de la firma">
              <button type="button" class="mode-btn active" data-sig="draw" id="sigDraw">Dibujar</button>
              <button type="button" class="mode-btn" data-sig="image" id="sigImage">Imagen</button>
            </div>
            <div id="drawPanel" class="sig-panel">
              <div class="sig-pad-wrap">
                <canvas id="sigPad" class="sig-pad" width="320" height="120"></canvas>
              </div>
              <p class="help">Fondo transparente: solo se guarda el trazo.</p>
              <div class="actions compact-actions">
                <button type="button" class="btn btn-ghost" id="clearSigBtn">Borrar trazo</button>
              </div>
            </div>
            <div id="imagePanel" class="sig-panel hidden">
              <input type="file" id="sigFile" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" hidden />
              <button type="button" class="btn btn-ghost" id="sigBrowseBtn">Subir imagen de firma</button>
              <div id="sigImagePreview" class="sig-image-preview hidden"></div>
              <p id="sigFileLabel" class="help">El fondo blanco se vuelve transparente automáticamente.</p>
            </div>
            <label class="opt-row sig-size-row">
              <span>Tamaño de la firma</span>
              <span class="sig-size-ends"><small>Pequeña</small><input type="range" id="sigWidth" min="60" max="280" value="140" /><small>Grande</small></span>
            </label>
          </div>
          <div class="control-block">
            <h2>2. Colocar</h2>
            <p class="help">Haz clic en el PDF para poner la firma. Verás exactamente cómo queda. Pulsa × en una firma para quitarla.</p>
            <div class="stat"><span id="placeCount">0</span><small>en el documento</small></div>
            <div class="actions compact-actions">
              <button type="button" class="btn btn-ghost" id="clearPlacesBtn">Quitar todas</button>
            </div>
          </div>
          <div class="actions">
            <button type="button" class="btn btn-primary" id="exportBtn" disabled>Descargar PDF firmado</button>
            <button type="button" class="btn btn-ghost" id="resetBtn">Otro PDF</button>
          </div>
          <p id="status" class="status" role="status"></p>
        </aside>
        <div class="pages-panel edit-preview-panel">
          <div class="pages-toolbar">
            <h2>Así quedará</h2>
            <div class="page-nav">
              <button type="button" class="btn btn-ghost btn-sm" id="prevPage">←</button>
              <span id="pageLabel">Pág. 1</span>
              <button type="button" class="btn btn-ghost btn-sm" id="nextPage">→</button>
            </div>
          </div>
          <div class="edit-stage-wrap">
            <div id="editStage" class="edit-stage sig-stage">
              <canvas id="pageCanvas"></canvas>
              <div id="sigOverlays" class="sig-overlays"></div>
              <img id="sigGhost" class="sig-ghost hidden" alt="" draggable="false" />
            </div>
          </div>
          <div id="thumbs" class="edit-thumbs"></div>
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
      sigDraw: body.querySelector("#sigDraw"),
      sigImage: body.querySelector("#sigImage"),
      drawPanel: body.querySelector("#drawPanel"),
      imagePanel: body.querySelector("#imagePanel"),
      sigPad: body.querySelector("#sigPad"),
      clearSigBtn: body.querySelector("#clearSigBtn"),
      sigFile: body.querySelector("#sigFile"),
      sigBrowseBtn: body.querySelector("#sigBrowseBtn"),
      sigFileLabel: body.querySelector("#sigFileLabel"),
      sigImagePreview: body.querySelector("#sigImagePreview"),
      sigWidth: body.querySelector("#sigWidth"),
      placeCount: body.querySelector("#placeCount"),
      clearPlacesBtn: body.querySelector("#clearPlacesBtn"),
      exportBtn: body.querySelector("#exportBtn"),
      resetBtn: body.querySelector("#resetBtn"),
      status: body.querySelector("#status"),
      prevPage: body.querySelector("#prevPage"),
      nextPage: body.querySelector("#nextPage"),
      pageLabel: body.querySelector("#pageLabel"),
      pageCanvas: body.querySelector("#pageCanvas"),
      sigOverlays: body.querySelector("#sigOverlays"),
      sigGhost: body.querySelector("#sigGhost"),
      editStage: body.querySelector("#editStage"),
      thumbs: body.querySelector("#thumbs"),
    };

    const state = {
      pdfBytes: null,
      pdfDoc: null,
      fileName: "",
      pageCount: 0,
      pageIndex: 0,
      pageSizes: [],
      placements: [], // { id, pageIndex, x, y, width, height }
      sigMode: "draw",
      /** Transparent PNG ready for preview + embed */
      sigUrl: null,
      sigBytes: null,
      sigAspect: 0.4,
      placeId: 1,
      renderScale: 1.35,
    };

    const padCtx = els.sigPad.getContext("2d", { willReadFrequently: true });
    let drawing = false;
    let strokeDirty = false;

    function setStatus(msg, isError) {
      Aseo.setStatus(els.status, msg, isError);
    }

    function initPad() {
      padCtx.clearRect(0, 0, els.sigPad.width, els.sigPad.height);
      padCtx.strokeStyle = "#1c1b19";
      padCtx.lineWidth = 2.4;
      padCtx.lineCap = "round";
      padCtx.lineJoin = "round";
      strokeDirty = false;
    }
    initPad();

    function padPos(e) {
      const r = els.sigPad.getBoundingClientRect();
      const t = e.touches ? e.touches[0] : e;
      return {
        x: ((t.clientX - r.left) / r.width) * els.sigPad.width,
        y: ((t.clientY - r.top) / r.height) * els.sigPad.height,
      };
    }

    function startDraw(e) {
      e.preventDefault();
      drawing = true;
      const p = padPos(e);
      padCtx.beginPath();
      padCtx.moveTo(p.x, p.y);
    }
    function moveDraw(e) {
      if (!drawing) return;
      e.preventDefault();
      const p = padPos(e);
      padCtx.lineTo(p.x, p.y);
      padCtx.stroke();
      strokeDirty = true;
    }
    function endDraw() {
      if (!drawing) return;
      drawing = false;
      window.removeEventListener("mouseup", endDraw);
      window.removeEventListener("touchend", endDraw);
      if (strokeDirty && state.sigMode === "draw") refreshSignatureFromPad();
    }
    function armPadEnd() {
      window.addEventListener("mouseup", endDraw);
      window.addEventListener("touchend", endDraw);
    }

    els.sigPad.addEventListener("mousedown", (e) => {
      startDraw(e);
      armPadEnd();
    });
    els.sigPad.addEventListener("mousemove", moveDraw);
    els.sigPad.addEventListener(
      "touchstart",
      (e) => {
        startDraw(e);
        armPadEnd();
      },
      { passive: false }
    );
    els.sigPad.addEventListener("touchmove", moveDraw, { passive: false });
    els.clearSigBtn.addEventListener("click", () => {
      initPad();
      clearSignatureAsset();
      renderOverlays();
      setStatus("Trazo borrado.");
    });

    function clearSignatureAsset() {
      if (state.sigUrl) URL.revokeObjectURL(state.sigUrl);
      state.sigUrl = null;
      state.sigBytes = null;
      state.sigAspect = 0.4;
      els.sigGhost.classList.add("hidden");
      els.sigGhost.removeAttribute("src");
      els.sigImagePreview.classList.add("hidden");
      els.sigImagePreview.innerHTML = "";
    }

    function canvasToTransparentPng(sourceCanvas) {
      return new Promise((resolve, reject) => {
        sourceCanvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error("No se pudo crear la firma."));
            return;
          }
          blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)), reject);
        }, "image/png");
      });
    }

    /** Make near-white / light pixels transparent (for photo signatures). */
    function whitesToTransparent(img) {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth || img.width;
      c.height = img.naturalHeight || img.height;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, c.width, c.height);
      const d = imageData.data;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i];
        const g = d[i + 1];
        const b = d[i + 2];
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        // Near white / light gray → transparent
        if (max > 235 && max - min < 28) {
          d[i + 3] = 0;
        } else if (max > 210 && max - min < 20) {
          d[i + 3] = Math.round(d[i + 3] * ((235 - max) / 25));
        }
      }
      ctx.putImageData(imageData, 0, 0);
      return c;
    }

    function cropTransparentBounds(srcCanvas) {
      const ctx = srcCanvas.getContext("2d");
      const { width, height } = srcCanvas;
      const data = ctx.getImageData(0, 0, width, height).data;
      let minX = width;
      let minY = height;
      let maxX = -1;
      let maxY = -1;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (data[(y * width + x) * 4 + 3] > 8) {
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX < minX) return srcCanvas;
      const pad = 4;
      minX = Math.max(0, minX - pad);
      minY = Math.max(0, minY - pad);
      maxX = Math.min(width - 1, maxX + pad);
      maxY = Math.min(height - 1, maxY + pad);
      const w = maxX - minX + 1;
      const h = maxY - minY + 1;
      const out = document.createElement("canvas");
      out.width = w;
      out.height = h;
      out.getContext("2d").drawImage(srcCanvas, minX, minY, w, h, 0, 0, w, h);
      return out;
    }

    async function setSignatureFromCanvas(canvas) {
      const cropped = cropTransparentBounds(canvas);
      const bytes = await canvasToTransparentPng(cropped);
      if (state.sigUrl) URL.revokeObjectURL(state.sigUrl);
      state.sigBytes = bytes;
      state.sigUrl = URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
      state.sigAspect = cropped.height / Math.max(1, cropped.width);
      els.sigGhost.src = state.sigUrl;
      els.sigGhost.classList.remove("hidden");
      // Resize existing placements to new aspect (keep width)
      state.placements.forEach((p) => {
        p.height = p.width * state.sigAspect;
      });
      renderOverlays();
      updatePlaceUi();
    }

    async function refreshSignatureFromPad() {
      if (!padHasInk()) {
        clearSignatureAsset();
        renderOverlays();
        return;
      }
      try {
        await setSignatureFromCanvas(els.sigPad);
        setStatus("Firma lista. Haz clic en la página para colocarla.");
      } catch (err) {
        setStatus(err.message || "Error al preparar la firma.", true);
      }
    }

    function padHasInk() {
      const data = padCtx.getImageData(0, 0, els.sigPad.width, els.sigPad.height).data;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] > 8) return true;
      }
      return false;
    }

    function ensureSignature() {
      if (!state.sigBytes || !state.sigUrl) {
        throw new Error(
          state.sigMode === "image"
            ? "Sube una imagen de firma primero."
            : "Dibuja tu firma primero."
        );
      }
    }

    function setSigMode(mode) {
      state.sigMode = mode;
      els.sigDraw.classList.toggle("active", mode === "draw");
      els.sigImage.classList.toggle("active", mode === "image");
      els.drawPanel.classList.toggle("hidden", mode !== "draw");
      els.imagePanel.classList.toggle("hidden", mode !== "image");
      if (mode === "draw") {
        if (padHasInk()) refreshSignatureFromPad();
        else {
          clearSignatureAsset();
          renderOverlays();
          updatePlaceUi();
        }
      } else if (els.sigImagePreview.classList.contains("hidden")) {
        clearSignatureAsset();
        renderOverlays();
        updatePlaceUi();
      }
    }
    els.sigDraw.addEventListener("click", () => setSigMode("draw"));
    els.sigImage.addEventListener("click", () => setSigMode("image"));
    els.sigBrowseBtn.addEventListener("click", () => els.sigFile.click());
    els.sigFile.addEventListener("change", async () => {
      const f = els.sigFile.files && els.sigFile.files[0];
      els.sigFile.value = "";
      if (!f) return;
      try {
        setStatus("Preparando imagen…");
        const url = URL.createObjectURL(f);
        const img = await Aseo.loadImage(url);
        URL.revokeObjectURL(url);
        const cleaned = whitesToTransparent(img);
        await setSignatureFromCanvas(cleaned);
        els.sigImagePreview.innerHTML = `<img src="${state.sigUrl}" alt="Vista de firma" />`;
        els.sigImagePreview.classList.remove("hidden");
        els.sigFileLabel.textContent = f.name;
        setStatus("Firma lista. Haz clic en la página para colocarla.");
      } catch (err) {
        console.error(err);
        setStatus("No se pudo cargar la imagen.", true);
      }
    });

    els.sigWidth.addEventListener("input", () => {
      const w = Number(els.sigWidth.value);
      state.placements.forEach((p) => {
        p.width = w;
        p.height = w * state.sigAspect;
      });
      renderOverlays();
      updateGhostSize();
    });

    function updatePlaceUi() {
      els.placeCount.textContent = String(state.placements.length);
      els.exportBtn.disabled = !state.pdfBytes || state.placements.length === 0 || !state.sigBytes;
    }

    function pageDisplayMetrics() {
      const canvas = els.pageCanvas;
      const size = state.pageSizes[state.pageIndex];
      if (!size || !canvas.width) return null;
      const rect = canvas.getBoundingClientRect();
      return {
        size,
        displayW: rect.width || canvas.clientWidth || canvas.width,
        displayH: rect.height || canvas.clientHeight || canvas.height,
        rect,
        sx: (rect.width || canvas.clientWidth || canvas.width) / size.width,
        sy: (rect.height || canvas.clientHeight || canvas.height) / size.height,
      };
    }

    function updateGhostSize() {
      const m = pageDisplayMetrics();
      if (!m || !state.sigUrl) return;
      const wPdf = Number(els.sigWidth.value);
      const hPdf = wPdf * state.sigAspect;
      els.sigGhost.style.width = `${wPdf * m.sx}px`;
      els.sigGhost.style.height = `${hPdf * m.sy}px`;
    }

    function removePlacement(id) {
      state.placements = state.placements.filter((p) => p.id !== id);
      updatePlaceUi();
      renderOverlays();
      setStatus("Firma quitada.");
    }

    function renderOverlays() {
      els.sigOverlays.innerHTML = "";
      const m = pageDisplayMetrics();
      if (!m) return;
      const { size, sx, sy } = m;

      state.placements
        .filter((p) => p.pageIndex === state.pageIndex)
        .forEach((p) => {
          const el = document.createElement("div");
          el.className = "sig-place has-preview";
          el.dataset.id = String(p.id);
          el.style.left = `${p.x * sx}px`;
          el.style.top = `${(size.height - p.y - p.height) * sy}px`;
          el.style.width = `${p.width * sx}px`;
          el.style.height = `${p.height * sy}px`;

          if (state.sigUrl) {
            const img = document.createElement("img");
            img.src = state.sigUrl;
            img.alt = "Firma";
            img.draggable = false;
            el.appendChild(img);
          }

          const rm = document.createElement("button");
          rm.type = "button";
          rm.className = "sig-place-remove";
          rm.title = "Quitar esta firma";
          rm.setAttribute("aria-label", "Quitar esta firma");
          rm.textContent = "×";
          rm.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            removePlacement(p.id);
          });
          el.appendChild(rm);
          els.sigOverlays.appendChild(el);
        });

      updateGhostSize();
    }

    async function showPage(index) {
      state.pageIndex = index;
      els.pageLabel.textContent = `Pág. ${index + 1} / ${state.pageCount}`;
      const page = await state.pdfDoc.getPage(index + 1);
      const viewport = page.getViewport({ scale: state.renderScale });
      const canvas = els.pageCanvas;
      const ctx = canvas.getContext("2d");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: ctx, viewport }).promise;
      const real = page.getViewport({ scale: 1 });
      state.pageSizes[index] = { width: real.width, height: real.height };
      body.querySelectorAll(".edit-thumb").forEach((t) => {
        t.classList.toggle("active", Number(t.dataset.index) === index);
        const has = state.placements.some((p) => p.pageIndex === Number(t.dataset.index));
        t.classList.toggle("has-sig", has);
      });
      renderOverlays();
    }

    els.editStage.addEventListener("mousemove", (e) => {
      if (!state.sigUrl || !state.pdfBytes) {
        els.sigGhost.classList.add("hidden");
        return;
      }
      const m = pageDisplayMetrics();
      if (!m) return;
      const { rect } = m;
      if (
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom
      ) {
        els.sigGhost.classList.add("is-off");
        return;
      }
      if (e.target.closest(".sig-place-remove, .sig-place")) {
        els.sigGhost.classList.add("is-off");
        return;
      }
      els.sigGhost.classList.remove("hidden", "is-off");
      updateGhostSize();
      const stageRect = els.editStage.getBoundingClientRect();
      const w = parseFloat(els.sigGhost.style.width) || 0;
      const h = parseFloat(els.sigGhost.style.height) || 0;
      els.sigGhost.style.left = `${e.clientX - stageRect.left - w / 2}px`;
      els.sigGhost.style.top = `${e.clientY - stageRect.top - h / 2}px`;
    });
    els.editStage.addEventListener("mouseleave", () => {
      els.sigGhost.classList.add("is-off");
    });

    els.editStage.addEventListener("click", (e) => {
      if (!state.pdfBytes) return;
      if (e.target.closest(".sig-place-remove")) return;
      const m = pageDisplayMetrics();
      if (!m) return;
      const { size, rect, displayW, displayH } = m;
      if (
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom
      ) {
        return;
      }
      try {
        ensureSignature();
      } catch (err) {
        setStatus(err.message, true);
        return;
      }
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const wPdf = Number(els.sigWidth.value);
      const hPdf = wPdf * state.sigAspect;
      const pdfX = (cx / displayW) * size.width - wPdf / 2;
      const pdfY = size.height - (cy / displayH) * size.height - hPdf / 2;
      state.placements.push({
        id: state.placeId++,
        pageIndex: state.pageIndex,
        x: Math.max(0, Math.min(pdfX, size.width - wPdf)),
        y: Math.max(0, Math.min(pdfY, size.height - hPdf)),
        width: wPdf,
        height: hPdf,
      });
      updatePlaceUi();
      renderOverlays();
      body.querySelectorAll(".edit-thumb").forEach((t) => {
        const has = state.placements.some((p) => p.pageIndex === Number(t.dataset.index));
        t.classList.toggle("has-sig", has);
      });
      setStatus("Firma colocada. Puedes mover el tamaño, quitar con × o descargar.");
    });

    els.clearPlacesBtn.addEventListener("click", () => {
      state.placements = [];
      updatePlaceUi();
      renderOverlays();
      body.querySelectorAll(".edit-thumb").forEach((t) => t.classList.remove("has-sig"));
      setStatus("Firmas quitadas.");
    });
    els.prevPage.addEventListener("click", () => {
      if (state.pageIndex > 0) showPage(state.pageIndex - 1);
    });
    els.nextPage.addEventListener("click", () => {
      if (state.pageIndex < state.pageCount - 1) showPage(state.pageIndex + 1);
    });

    async function openFile(file) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const pdfDoc = await loadPdfJs(bytes);
      state.pdfBytes = bytes;
      state.pdfDoc = pdfDoc;
      state.fileName = file.name;
      state.pageCount = pdfDoc.numPages;
      state.pageIndex = 0;
      state.placements = [];
      state.pageSizes = [];
      els.fileName.textContent = file.name;
      els.pageCount.textContent = `${pdfDoc.numPages} página${pdfDoc.numPages === 1 ? "" : "s"}`;
      els.dz.classList.add("hidden");
      els.workspace.classList.remove("hidden");
      els.thumbs.innerHTML = "";
      for (let i = 0; i < pdfDoc.numPages; i++) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "edit-thumb";
        btn.dataset.index = String(i);
        btn.textContent = String(i + 1);
        btn.addEventListener("click", () => showPage(i));
        els.thumbs.appendChild(btn);
      }
      updatePlaceUi();
      await showPage(0);
      setStatus("Dibuja o sube tu firma; luego haz clic en la página. Verás la firma real antes de descargar.");
    }

    els.exportBtn.addEventListener("click", async () => {
      if (!state.placements.length) return;
      try {
        ensureSignature();
        setStatus("Firmando…");
        els.exportBtn.disabled = true;
        const { PDFDocument } = PDFLib;
        const doc = await PDFDocument.load(state.pdfBytes);
        const embedded = await doc.embedPng(state.sigBytes);
        const pages = doc.getPages();
        state.placements.forEach((p) => {
          const page = pages[p.pageIndex];
          if (!page) return;
          page.drawImage(embedded, {
            x: p.x,
            y: p.y,
            width: p.width,
            height: p.height,
          });
        });
        const out = await doc.save();
        Aseo.downloadBytes(out, `${Aseo.baseName(state.fileName)}-firmado.pdf`, "application/pdf");
        setStatus(`Listo. ${state.placements.length} firma${state.placements.length === 1 ? "" : "s"} aplicadas.`);
      } catch (err) {
        console.error(err);
        setStatus(err.message || "No se pudo firmar el PDF.", true);
      } finally {
        updatePlaceUi();
      }
    });

    function reset() {
      clearSignatureAsset();
      initPad();
      state.pdfBytes = null;
      state.pdfDoc = null;
      state.placements = [];
      els.workspace.classList.add("hidden");
      els.dz.classList.remove("hidden");
      setStatus("");
    }
    els.resetBtn.addEventListener("click", reset);

    Aseo.bindDropzone({
      dropzone: els.dz,
      input: els.input,
      browseBtn: els.browseBtn,
      accept: "application/pdf,.pdf",
      multiple: false,
      onFiles: (files) => {
        const f = files.find(isPdf);
        if (!f) {
          setStatus("Elige un PDF.", true);
          return;
        }
        openFile(f).catch((err) => {
          console.error(err);
          setStatus("No se pudo abrir el PDF.", true);
        });
      },
    });
  };

  /* ——— Proteger / Desbloquear ——— */
  window.AseoTools["proteger-pdf"] = async function (body) {
    simpleDropUI(body, {
      lede: "Añade una contraseña de apertura o quítala si ya conoces la actual.",
      browse: "Elegir PDF",
      runLabel: "Aplicar",
      accept: "application/pdf,.pdf",
      multiple: false,
      filter: isPdf,
      optionsHtml: `
        <div class="mode-toggle" role="group" aria-label="Modo">
          <button type="button" class="mode-btn active" id="modeProtect">Proteger</button>
          <button type="button" class="mode-btn" id="modeUnlock">Desbloquear</button>
        </div>
        <div id="protectOpts" class="mode-panel">
          <p class="help">El PDF pedirá esta contraseña al abrirlo. Cifrado AES-256 en tu navegador.</p>
          <label class="opt-row"><span>Contraseña</span>
            <input type="password" id="userPw" autocomplete="new-password" />
          </label>
          <label class="opt-row"><span>Repetir</span>
            <input type="password" id="userPw2" autocomplete="new-password" />
          </label>
          <label class="opt-row check-row">
            <input type="checkbox" id="blockCopy" checked />
            <span>Impedir copiar texto</span>
          </label>
          <label class="opt-row check-row">
            <input type="checkbox" id="blockModify" checked />
            <span>Impedir modificar</span>
          </label>
        </div>
        <div id="unlockOpts" class="mode-panel hidden">
          <p class="help">Introduce la contraseña actual. Se descargará un PDF sin protección.</p>
          <label class="opt-row"><span>Contraseña actual</span>
            <input type="password" id="unlockPw" autocomplete="current-password" />
          </label>
        </div>`,
      onFilesChange: (files) => {
        const modeProtect = body.querySelector("#modeProtect");
        const modeUnlock = body.querySelector("#modeUnlock");
        const protectOpts = body.querySelector("#protectOpts");
        const unlockOpts = body.querySelector("#unlockOpts");
        if (!modeProtect || modeProtect.dataset.bound) return;
        modeProtect.dataset.bound = "1";
        function setMode(mode) {
          modeProtect.classList.toggle("active", mode === "protect");
          modeUnlock.classList.toggle("active", mode === "unlock");
          protectOpts.classList.toggle("hidden", mode !== "protect");
          unlockOpts.classList.toggle("hidden", mode !== "unlock");
          body.dataset.protectMode = mode;
        }
        body.dataset.protectMode = "protect";
        modeProtect.addEventListener("click", () => setMode("protect"));
        modeUnlock.addEventListener("click", () => setMode("unlock"));
      },
      onRun: async (files, { status }) => {
        const file = files[0];
        const mode = body.dataset.protectMode || "protect";
        const { PDFDocument } = PDFLib;
        const bytes = new Uint8Array(await file.arrayBuffer());

        if (mode === "protect") {
          const pw = (body.querySelector("#userPw").value || "").trim();
          const pw2 = (body.querySelector("#userPw2").value || "").trim();
          if (!pw) {
            Aseo.setStatus(status, "Escribe una contraseña.", true);
            return;
          }
          if (pw !== pw2) {
            Aseo.setStatus(status, "Las contraseñas no coinciden.", true);
            return;
          }
          Aseo.setStatus(status, "Cifrando…");
          const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
          if (doc.isEncrypted) {
            Aseo.setStatus(
              status,
              "Este PDF ya está cifrado. Desbloquéalo primero y vuelve a protegerlo.",
              true
            );
            return;
          }
          const blockCopy = body.querySelector("#blockCopy").checked;
          const blockModify = body.querySelector("#blockModify").checked;
          doc.encrypt({
            userPassword: pw,
            ownerPassword: pw + "-owner",
            permissions: {
              printing: "highResolution",
              modifying: !blockModify,
              copying: !blockCopy,
              annotating: !blockModify,
              fillingForms: true,
              contentAccessibility: true,
              documentAssembly: !blockModify,
            },
          });
          const out = await doc.save();
          Aseo.downloadBytes(out, `${Aseo.baseName(file.name)}-protegido.pdf`, "application/pdf");
          Aseo.setStatus(status, "PDF protegido descargado.");
          return;
        }

        const unlockPw = body.querySelector("#unlockPw").value || "";
        Aseo.setStatus(status, "Desbloqueando…");
        let doc;
        try {
          doc = await PDFDocument.load(bytes, { password: unlockPw });
        } catch (err) {
          console.error(err);
          Aseo.setStatus(status, "Contraseña incorrecta o PDF no cifrado.", true);
          return;
        }
        const outDoc = await PDFDocument.create();
        const copied = await outDoc.copyPages(doc, doc.getPageIndices());
        copied.forEach((p) => outDoc.addPage(p));
        const out = await outDoc.save();
        Aseo.downloadBytes(out, `${Aseo.baseName(file.name)}-desbloqueado.pdf`, "application/pdf");
        Aseo.setStatus(status, "PDF sin contraseña descargado.");
      },
    });
  };

  /* ——— Marca de agua + numeración ——— */
  window.AseoTools["marca-agua"] = async function (body) {
    body.innerHTML = `
      <section class="dropzone tool-drop" id="dz" tabindex="0">
        <input type="file" id="fileInput" accept="application/pdf,.pdf" hidden />
        <div class="dropzone-inner compact">
          <p class="lede">Texto o imagen/logo como marca de agua, con vista previa en vivo y numeración opcional.</p>
          <button type="button" class="btn btn-primary" id="browseBtn">Elegir PDF</button>
          <p class="hint">También puedes soltar el archivo aquí</p>
        </div>
      </section>
      <section id="workspace" class="workspace edit-workspace hidden">
        <aside class="controls">
          <div class="file-meta">
            <p class="file-label">Archivo</p>
            <p id="fileName" class="file-name">—</p>
            <p id="pageCount" class="file-pages">0 páginas</p>
          </div>
          <div class="control-block">
            <h2>Marca de agua</h2>
            <label class="opt-row check-row">
              <input type="checkbox" id="useWm" checked />
              <span>Mostrar marca de agua</span>
            </label>
            <div class="mode-toggle" role="group" aria-label="Tipo de marca">
              <button type="button" class="mode-btn active" id="wmTypeText">Texto</button>
              <button type="button" class="mode-btn" id="wmTypeImage">Imagen / logo</button>
            </div>
            <div id="wmTextPanel" class="wm-type-panel">
              <label class="opt-row"><span>Texto</span>
                <input type="text" id="wmText" value="BORRADOR" maxlength="80" />
              </label>
              <label class="opt-row color-row"><span>Color</span>
                <input type="color" id="wmColor" value="#737373" />
                <span id="wmColorHex" class="range-val">#737373</span>
              </label>
            </div>
            <div id="wmImagePanel" class="wm-type-panel hidden">
              <input type="file" id="wmImageFile" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" hidden />
              <button type="button" class="btn btn-ghost" id="wmImageBrowse">Elegir imagen</button>
              <div id="wmImagePreview" class="sig-image-preview hidden"></div>
              <p id="wmImageLabel" class="help">PNG con transparencia va muy bien para logos.</p>
            </div>
            <label class="opt-row sig-size-row">
              <span>Tamaño</span>
              <span class="sig-size-ends"><small>Pequeño</small><input type="range" id="wmSize" min="20" max="100" value="48" /><small>Grande</small></span>
            </label>
            <label class="opt-row sig-size-row">
              <span>Opacidad</span>
              <span class="sig-size-ends"><small>Suave</small><input type="range" id="wmOpacity" min="8" max="90" value="28" /><small>Fuerte</small></span>
            </label>
            <label class="opt-row"><span>Ángulo</span>
              <select id="wmAngle">
                <option value="-45" selected>Diagonal</option>
                <option value="0">Horizontal</option>
                <option value="-30">−30°</option>
                <option value="-60">−60°</option>
              </select>
            </label>
            <label class="opt-row"><span>Posición</span>
              <select id="wmPos">
                <option value="center" selected>Centro</option>
                <option value="top">Arriba</option>
                <option value="bottom">Abajo</option>
                <option value="top-left">Arriba izquierda</option>
                <option value="top-right">Arriba derecha</option>
                <option value="bottom-left">Abajo izquierda</option>
                <option value="bottom-right">Abajo derecha</option>
              </select>
            </label>
          </div>
          <div class="control-block">
            <h2>Numeración</h2>
            <label class="opt-row check-row">
              <input type="checkbox" id="useNums" checked />
              <span>Numerar páginas</span>
            </label>
            <label class="opt-row"><span>Formato</span>
              <select id="numFormat">
                <option value="pag-de">Pág. X de Y</option>
                <option value="x-de-y">X / Y</option>
                <option value="solo">Solo número</option>
              </select>
            </label>
            <label class="opt-row"><span>Posición</span>
              <select id="numPos">
                <option value="bottom">Abajo centrado</option>
                <option value="bottom-right">Abajo derecha</option>
                <option value="top">Arriba centrado</option>
              </select>
            </label>
          </div>
          <div class="actions">
            <button type="button" class="btn btn-primary" id="exportBtn">Descargar PDF</button>
            <button type="button" class="btn btn-ghost" id="resetBtn">Otro PDF</button>
          </div>
          <p id="status" class="status" role="status"></p>
        </aside>
        <div class="pages-panel edit-preview-panel">
          <div class="pages-toolbar">
            <h2>Así quedará</h2>
            <div class="page-nav">
              <button type="button" class="btn btn-ghost btn-sm" id="prevPage">←</button>
              <span id="pageLabel">Pág. 1</span>
              <button type="button" class="btn btn-ghost btn-sm" id="nextPage">→</button>
            </div>
          </div>
          <div class="edit-stage-wrap">
            <div id="editStage" class="edit-stage wm-stage">
              <canvas id="pageCanvas"></canvas>
              <div id="wmOverlay" class="wm-overlay" aria-hidden="true"></div>
              <div id="numOverlay" class="num-overlay" aria-hidden="true"></div>
            </div>
          </div>
          <div id="thumbs" class="edit-thumbs"></div>
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
      useWm: body.querySelector("#useWm"),
      wmTypeText: body.querySelector("#wmTypeText"),
      wmTypeImage: body.querySelector("#wmTypeImage"),
      wmTextPanel: body.querySelector("#wmTextPanel"),
      wmImagePanel: body.querySelector("#wmImagePanel"),
      wmText: body.querySelector("#wmText"),
      wmColor: body.querySelector("#wmColor"),
      wmColorHex: body.querySelector("#wmColorHex"),
      wmImageFile: body.querySelector("#wmImageFile"),
      wmImageBrowse: body.querySelector("#wmImageBrowse"),
      wmImagePreview: body.querySelector("#wmImagePreview"),
      wmImageLabel: body.querySelector("#wmImageLabel"),
      wmSize: body.querySelector("#wmSize"),
      wmOpacity: body.querySelector("#wmOpacity"),
      wmAngle: body.querySelector("#wmAngle"),
      wmPos: body.querySelector("#wmPos"),
      useNums: body.querySelector("#useNums"),
      numFormat: body.querySelector("#numFormat"),
      numPos: body.querySelector("#numPos"),
      exportBtn: body.querySelector("#exportBtn"),
      resetBtn: body.querySelector("#resetBtn"),
      status: body.querySelector("#status"),
      prevPage: body.querySelector("#prevPage"),
      nextPage: body.querySelector("#nextPage"),
      pageLabel: body.querySelector("#pageLabel"),
      pageCanvas: body.querySelector("#pageCanvas"),
      wmOverlay: body.querySelector("#wmOverlay"),
      numOverlay: body.querySelector("#numOverlay"),
      editStage: body.querySelector("#editStage"),
      thumbs: body.querySelector("#thumbs"),
    };

    const state = {
      pdfBytes: null,
      pdfDoc: null,
      fileName: "",
      pageCount: 0,
      pageIndex: 0,
      pageSizes: [],
      wmKind: "text", // text | image
      imgUrl: null,
      imgBytes: null,
      imgMime: "image/png",
      imgAspect: 1,
      renderScale: 1.35,
    };

    function setStatus(msg, isError) {
      Aseo.setStatus(els.status, msg, isError);
    }

    function hexToRgb01(hex) {
      const h = (hex || "#737373").replace("#", "");
      const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
      return {
        r: ((n >> 16) & 255) / 255,
        g: ((n >> 8) & 255) / 255,
        b: (n & 255) / 255,
      };
    }

    function numLabel(i, total) {
      const fmt = els.numFormat.value;
      if (fmt === "pag-de") return `Pág. ${i + 1} de ${total}`;
      if (fmt === "x-de-y") return `${i + 1} / ${total}`;
      return String(i + 1);
    }

    function pageDisplayMetrics() {
      const canvas = els.pageCanvas;
      const size = state.pageSizes[state.pageIndex];
      if (!size || !canvas.width) return null;
      const rect = canvas.getBoundingClientRect();
      const displayW = rect.width || canvas.clientWidth || canvas.width;
      const displayH = rect.height || canvas.clientHeight || canvas.height;
      return { size, displayW, displayH, sx: displayW / size.width, sy: displayH / size.height };
    }

    function wmAnchor(size) {
      const pad = 36;
      switch (els.wmPos.value) {
        case "top":
          return { x: size.width / 2, y: size.height - pad };
        case "bottom":
          return { x: size.width / 2, y: pad };
        case "top-left":
          return { x: pad, y: size.height - pad };
        case "top-right":
          return { x: size.width - pad, y: size.height - pad };
        case "bottom-left":
          return { x: pad, y: pad };
        case "bottom-right":
          return { x: size.width - pad, y: pad };
        default:
          return { x: size.width / 2, y: size.height / 2 };
      }
    }

    function updatePreview() {
      const m = pageDisplayMetrics();
      const ov = els.wmOverlay;
      const nov = els.numOverlay;
      if (!m) return;
      const { size, sx, sy, displayW, displayH } = m;
      const opacity = Number(els.wmOpacity.value) / 100;
      const angle = Number(els.wmAngle.value);
      const sizePct = Number(els.wmSize.value);

      // Watermark overlay
      if (!els.useWm.checked) {
        ov.classList.add("hidden");
      } else if (state.wmKind === "text") {
        const text = (els.wmText.value || "").trim() || " ";
        ov.classList.remove("hidden");
        ov.innerHTML = "";
        const span = document.createElement("span");
        span.className = "wm-preview-text";
        span.textContent = text;
        span.style.color = els.wmColor.value;
        span.style.opacity = String(opacity);
        span.style.fontSize = `${Math.max(14, sizePct * sy * 0.85)}px`;
        span.style.transform = `rotate(${angle}deg)`;
        ov.appendChild(span);
        placeOverlayEl(ov, size, sx, sy, displayW, displayH, true);
      } else if (state.imgUrl) {
        ov.classList.remove("hidden");
        ov.innerHTML = "";
        const img = document.createElement("img");
        img.src = state.imgUrl;
        img.alt = "";
        img.className = "wm-preview-img";
        const wPdf = (size.width * sizePct) / 100;
        const hPdf = wPdf * state.imgAspect;
        img.style.width = `${wPdf * sx}px`;
        img.style.height = `${hPdf * sy}px`;
        img.style.opacity = String(opacity);
        img.style.transform = `rotate(${angle}deg)`;
        ov.appendChild(img);
        placeOverlayEl(ov, size, sx, sy, displayW, displayH, true);
      } else {
        ov.classList.add("hidden");
        ov.innerHTML = "";
      }

      // Page number overlay
      if (!els.useNums.checked) {
        nov.classList.add("hidden");
        nov.textContent = "";
      } else {
        nov.classList.remove("hidden");
        nov.textContent = numLabel(state.pageIndex, state.pageCount);
        const pos = els.numPos.value;
        nov.className = "num-overlay";
        if (pos === "top") nov.classList.add("is-top");
        else if (pos === "bottom-right") nov.classList.add("is-bottom-right");
        else nov.classList.add("is-bottom");
      }
    }

    function placeOverlayEl(ov, size, sx, sy, displayW, displayH) {
      const anchor = wmAnchor(size);
      const pos = els.wmPos.value;
      ov.style.left = "0";
      ov.style.top = "0";
      ov.style.width = `${displayW}px`;
      ov.style.height = `${displayH}px`;
      ov.style.display = "grid";
      const map = {
        center: "center",
        top: "start center",
        bottom: "end center",
        "top-left": "start start",
        "top-right": "start end",
        "bottom-left": "end start",
        "bottom-right": "end end",
      };
      ov.style.placeItems = map[pos] || "center";
      ov.style.padding = `${28 * sy}px ${28 * sx}px`;
    }

    function setWmKind(kind) {
      state.wmKind = kind;
      els.wmTypeText.classList.toggle("active", kind === "text");
      els.wmTypeImage.classList.toggle("active", kind === "image");
      els.wmTextPanel.classList.toggle("hidden", kind !== "text");
      els.wmImagePanel.classList.toggle("hidden", kind !== "image");
      updatePreview();
    }

    els.wmTypeText.addEventListener("click", () => setWmKind("text"));
    els.wmTypeImage.addEventListener("click", () => setWmKind("image"));
    els.wmImageBrowse.addEventListener("click", () => els.wmImageFile.click());
    els.wmImageFile.addEventListener("change", async () => {
      const f = els.wmImageFile.files && els.wmImageFile.files[0];
      els.wmImageFile.value = "";
      if (!f) return;
      try {
        if (state.imgUrl) URL.revokeObjectURL(state.imgUrl);
        const bytes = new Uint8Array(await f.arrayBuffer());
        const url = URL.createObjectURL(f);
        const img = await Aseo.loadImage(url);
        state.imgBytes = bytes;
        state.imgMime = f.type || "image/png";
        state.imgUrl = url;
        state.imgAspect = (img.naturalHeight || img.height) / Math.max(1, img.naturalWidth || img.width);
        els.wmImagePreview.innerHTML = `<img src="${url}" alt="Logo" />`;
        els.wmImagePreview.classList.remove("hidden");
        els.wmImageLabel.textContent = f.name;
        setWmKind("image");
        setStatus("Imagen cargada. Ajusta tamaño, opacidad y posición.");
      } catch (err) {
        console.error(err);
        setStatus("No se pudo cargar la imagen.", true);
      }
    });

    els.wmColor.addEventListener("input", () => {
      els.wmColorHex.textContent = els.wmColor.value;
      updatePreview();
    });

    [
      els.useWm,
      els.wmText,
      els.wmSize,
      els.wmOpacity,
      els.wmAngle,
      els.wmPos,
      els.useNums,
      els.numFormat,
      els.numPos,
    ].forEach((el) => {
      el.addEventListener("input", updatePreview);
      el.addEventListener("change", updatePreview);
    });

    async function showPage(index) {
      state.pageIndex = index;
      els.pageLabel.textContent = `Pág. ${index + 1} / ${state.pageCount}`;
      const page = await state.pdfDoc.getPage(index + 1);
      const viewport = page.getViewport({ scale: state.renderScale });
      const canvas = els.pageCanvas;
      const ctx = canvas.getContext("2d");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: ctx, viewport }).promise;
      const real = page.getViewport({ scale: 1 });
      state.pageSizes[index] = { width: real.width, height: real.height };
      body.querySelectorAll(".edit-thumb").forEach((t) => {
        t.classList.toggle("active", Number(t.dataset.index) === index);
      });
      updatePreview();
    }

    els.prevPage.addEventListener("click", () => {
      if (state.pageIndex > 0) showPage(state.pageIndex - 1);
    });
    els.nextPage.addEventListener("click", () => {
      if (state.pageIndex < state.pageCount - 1) showPage(state.pageIndex + 1);
    });

    async function openFile(file) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const pdfDoc = await loadPdfJs(bytes);
      state.pdfBytes = bytes;
      state.pdfDoc = pdfDoc;
      state.fileName = file.name;
      state.pageCount = pdfDoc.numPages;
      state.pageIndex = 0;
      state.pageSizes = [];
      els.fileName.textContent = file.name;
      els.pageCount.textContent = `${pdfDoc.numPages} página${pdfDoc.numPages === 1 ? "" : "s"}`;
      els.dz.classList.add("hidden");
      els.workspace.classList.remove("hidden");
      els.thumbs.innerHTML = "";
      for (let i = 0; i < pdfDoc.numPages; i++) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "edit-thumb";
        btn.dataset.index = String(i);
        btn.textContent = String(i + 1);
        btn.addEventListener("click", () => showPage(i));
        els.thumbs.appendChild(btn);
      }
      await showPage(0);
      setStatus("Ajusta la marca en vivo y descarga cuando te guste.");
    }

    els.exportBtn.addEventListener("click", async () => {
      const useWm = els.useWm.checked;
      const useNums = els.useNums.checked;
      if (!useWm && !useNums) {
        setStatus("Activa la marca de agua o la numeración.", true);
        return;
      }
      if (useWm && state.wmKind === "text" && !(els.wmText.value || "").trim()) {
        setStatus("Escribe el texto de la marca de agua.", true);
        return;
      }
      if (useWm && state.wmKind === "image" && !state.imgBytes) {
        setStatus("Sube una imagen o logo.", true);
        return;
      }
      try {
        setStatus("Aplicando…");
        els.exportBtn.disabled = true;
        const { PDFDocument, StandardFonts, rgb, degrees } = PDFLib;
        const doc = await PDFDocument.load(state.pdfBytes);
        const font = await doc.embedFont(StandardFonts.HelveticaBold);
        const fontReg = await doc.embedFont(StandardFonts.Helvetica);
        const pages = doc.getPages();
        const opacity = Number(els.wmOpacity.value) / 100;
        const sizePct = Number(els.wmSize.value);
        const angle = Number(els.wmAngle.value);
        const wmText = (els.wmText.value || "").trim();
        const color = hexToRgb01(els.wmColor.value);
        const total = pages.length;

        let embedded = null;
        if (useWm && state.wmKind === "image") {
          try {
            embedded =
              /png/i.test(state.imgMime) || state.imgMime === "image/webp"
                ? await doc.embedPng(state.imgBytes)
                : await doc.embedJpg(state.imgBytes);
          } catch (_) {
            // webp or odd png → draw to canvas png
            const img = await Aseo.loadImage(state.imgUrl);
            const c = document.createElement("canvas");
            c.width = img.naturalWidth || img.width;
            c.height = img.naturalHeight || img.height;
            c.getContext("2d").drawImage(img, 0, 0);
            const png = await new Promise((res, rej) =>
              c.toBlob((b) => (b ? b.arrayBuffer().then(res, rej) : rej(new Error("png"))), "image/png")
            );
            embedded = await doc.embedPng(new Uint8Array(png));
          }
        }

        pages.forEach((page, i) => {
          const { width, height } = page.getSize();
          if (useWm) {
            const anchor = wmAnchor({ width, height });
            if (state.wmKind === "text") {
              const fontSize = Math.max(10, (Math.min(width, height) * sizePct) / 100);
              const textWidth = font.widthOfTextAtSize(wmText, fontSize);
              // Approximate center pivot for rotation
              const x = anchor.x - textWidth / 2;
              const y = anchor.y - fontSize / 2;
              page.drawText(wmText, {
                x,
                y,
                size: fontSize,
                font,
                color: rgb(color.r, color.g, color.b),
                opacity,
                rotate: degrees(angle),
              });
            } else if (embedded) {
              const w = (width * sizePct) / 100;
              const h = w * (embedded.height / Math.max(1, embedded.width));
              page.drawImage(embedded, {
                x: anchor.x - w / 2,
                y: anchor.y - h / 2,
                width: w,
                height: h,
                opacity,
                rotate: degrees(angle),
              });
            }
          }
          if (useNums) {
            const label = numLabel(i, total);
            const nSize = 10;
            const tw = fontReg.widthOfTextAtSize(label, nSize);
            let x = (width - tw) / 2;
            let y = 18;
            if (els.numPos.value === "bottom-right") {
              x = width - tw - 24;
              y = 18;
            } else if (els.numPos.value === "top") {
              x = (width - tw) / 2;
              y = height - 28;
            }
            page.drawText(label, {
              x,
              y,
              size: nSize,
              font: fontReg,
              color: rgb(0.25, 0.25, 0.25),
            });
          }
        });

        const out = await doc.save();
        Aseo.downloadBytes(out, `${Aseo.baseName(state.fileName)}-marcado.pdf`, "application/pdf");
        setStatus("PDF descargado.");
      } catch (err) {
        console.error(err);
        setStatus(err.message || "No se pudo aplicar la marca de agua.", true);
      } finally {
        els.exportBtn.disabled = false;
      }
    });

    els.resetBtn.addEventListener("click", () => {
      if (state.imgUrl) URL.revokeObjectURL(state.imgUrl);
      state.pdfBytes = null;
      state.pdfDoc = null;
      state.imgUrl = null;
      state.imgBytes = null;
      els.wmImagePreview.classList.add("hidden");
      els.wmImagePreview.innerHTML = "";
      els.workspace.classList.add("hidden");
      els.dz.classList.remove("hidden");
      setStatus("");
    });

    Aseo.bindDropzone({
      dropzone: els.dz,
      input: els.input,
      browseBtn: els.browseBtn,
      accept: "application/pdf,.pdf",
      multiple: false,
      onFiles: (files) => {
        const f = files.find(isPdf);
        if (!f) {
          setStatus("Elige un PDF.", true);
          return;
        }
        openFile(f).catch((err) => {
          console.error(err);
          setStatus("No se pudo abrir el PDF.", true);
        });
      },
    });
  };

  /* ——— Tachar / redactar ——— */
  window.AseoTools["redactar-pdf"] = async function (body) {
    body.innerHTML = `
      <section class="dropzone tool-drop" id="dz" tabindex="0">
        <input type="file" id="fileInput" accept="application/pdf,.pdf" hidden />
        <div class="dropzone-inner compact">
          <p class="lede">Cubre datos sensibles con rectángulos negros. Al exportar, esas zonas se destruyen (no se pueden recuperar).</p>
          <button type="button" class="btn btn-primary" id="browseBtn">Elegir PDF</button>
          <p class="hint">También puedes soltar el archivo aquí</p>
        </div>
      </section>
      <section id="workspace" class="workspace edit-workspace hidden">
        <aside class="controls">
          <div class="file-meta">
            <p class="file-label">Archivo</p>
            <p id="fileName" class="file-name">—</p>
            <p id="pageCount" class="file-pages">0 páginas</p>
          </div>
          <div class="control-block">
            <h2>Tachones</h2>
            <p class="help">Arrastra en la página para pintar negro. Las páginas con tachones se rasterizan al descargar para borrar el texto debajo.</p>
            <div class="summary">
              <div class="stat"><span id="rectCount">0</span><small>tachones</small></div>
              <div class="stat"><span id="dirtyPages">0</span><small>págs. afectadas</small></div>
            </div>
            <div class="actions compact-actions">
              <button type="button" class="btn btn-ghost" id="undoBtn">Deshacer</button>
              <button type="button" class="btn btn-ghost" id="clearPageBtn">Limpiar página</button>
              <button type="button" class="btn btn-ghost" id="clearAllBtn">Limpiar todo</button>
            </div>
          </div>
          <div class="actions">
            <button type="button" class="btn btn-primary" id="exportBtn" disabled>Descargar PDF tachado</button>
            <button type="button" class="btn btn-ghost" id="resetBtn">Otro PDF</button>
          </div>
          <p id="status" class="status" role="status"></p>
        </aside>
        <div class="pages-panel edit-preview-panel">
          <div class="pages-toolbar">
            <h2>Página</h2>
            <div class="page-nav">
              <button type="button" class="btn btn-ghost btn-sm" id="prevPage">←</button>
              <span id="pageLabel">Pág. 1</span>
              <button type="button" class="btn btn-ghost btn-sm" id="nextPage">→</button>
            </div>
          </div>
          <div class="edit-stage-wrap">
            <div id="editStage" class="edit-stage redact-stage">
              <canvas id="pageCanvas"></canvas>
              <canvas id="overlayCanvas" class="redact-overlay"></canvas>
            </div>
          </div>
          <div id="thumbs" class="edit-thumbs"></div>
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
      rectCount: body.querySelector("#rectCount"),
      dirtyPages: body.querySelector("#dirtyPages"),
      undoBtn: body.querySelector("#undoBtn"),
      clearPageBtn: body.querySelector("#clearPageBtn"),
      clearAllBtn: body.querySelector("#clearAllBtn"),
      exportBtn: body.querySelector("#exportBtn"),
      resetBtn: body.querySelector("#resetBtn"),
      status: body.querySelector("#status"),
      prevPage: body.querySelector("#prevPage"),
      nextPage: body.querySelector("#nextPage"),
      pageLabel: body.querySelector("#pageLabel"),
      pageCanvas: body.querySelector("#pageCanvas"),
      overlayCanvas: body.querySelector("#overlayCanvas"),
      thumbs: body.querySelector("#thumbs"),
    };

    const state = {
      pdfBytes: null,
      pdfDoc: null,
      fileName: "",
      pageCount: 0,
      pageIndex: 0,
      pageSizes: [],
      /** rects[pageIndex] = [{x,y,w,h}] in PDF coords (origin bottom-left) */
      rects: [],
      renderScale: 1.4,
      drawing: false,
      start: null,
    };

    const octx = els.overlayCanvas.getContext("2d");

    function setStatus(msg, isError) {
      Aseo.setStatus(els.status, msg, isError);
    }

    function allRects() {
      return state.rects.flat();
    }

    function updateStats() {
      const total = allRects().length;
      const dirty = state.rects.filter((r) => r && r.length).length;
      els.rectCount.textContent = String(total);
      els.dirtyPages.textContent = String(dirty);
      els.exportBtn.disabled = !state.pdfBytes || total === 0;
    }

    function syncOverlaySize() {
      const c = els.pageCanvas;
      els.overlayCanvas.width = c.width;
      els.overlayCanvas.height = c.height;
      els.overlayCanvas.style.width = c.style.width || `${c.clientWidth}px`;
      els.overlayCanvas.style.height = c.style.height || `${c.clientHeight}px`;
    }

    function drawOverlay(tempRect) {
      const size = state.pageSizes[state.pageIndex];
      octx.clearRect(0, 0, els.overlayCanvas.width, els.overlayCanvas.height);
      if (!size) return;
      const sx = els.overlayCanvas.width / size.width;
      const sy = els.overlayCanvas.height / size.height;
      const list = state.rects[state.pageIndex] || [];
      octx.fillStyle = "#0a0a0a";
      list.forEach((r) => {
        const x = r.x * sx;
        const y = (size.height - r.y - r.h) * sy;
        octx.fillRect(x, y, r.w * sx, r.h * sy);
      });
      if (tempRect) {
        octx.fillStyle = "rgba(10,10,10,0.85)";
        const x = tempRect.x * sx;
        const y = (size.height - tempRect.y - tempRect.h) * sy;
        octx.fillRect(x, y, tempRect.w * sx, tempRect.h * sy);
      }
    }

    function pointerToPdf(e) {
      const size = state.pageSizes[state.pageIndex];
      const rect = els.overlayCanvas.getBoundingClientRect();
      const t = e.touches ? e.touches[0] : e;
      const cx = t.clientX - rect.left;
      const cy = t.clientY - rect.top;
      return {
        x: (cx / rect.width) * size.width,
        y: size.height - (cy / rect.height) * size.height,
      };
    }

    function normalizeRect(a, b) {
      const x1 = Math.min(a.x, b.x);
      const x2 = Math.max(a.x, b.x);
      const y1 = Math.min(a.y, b.y);
      const y2 = Math.max(a.y, b.y);
      return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
    }

    function onDown(e) {
      if (!state.pdfBytes) return;
      e.preventDefault();
      state.drawing = true;
      state.start = pointerToPdf(e);
      window.addEventListener("mouseup", onUp);
      window.addEventListener("touchend", onUp, { passive: false });
    }
    function onMove(e) {
      if (!state.drawing || !state.start) return;
      e.preventDefault();
      const cur = pointerToPdf(e);
      drawOverlay(normalizeRect(state.start, cur));
    }
    function onUp(e) {
      if (!state.drawing || !state.start) return;
      e.preventDefault();
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchend", onUp);
      let end;
      if (e.changedTouches && e.changedTouches[0]) {
        const rect = els.overlayCanvas.getBoundingClientRect();
        const size = state.pageSizes[state.pageIndex];
        const t = e.changedTouches[0];
        end = {
          x: ((t.clientX - rect.left) / rect.width) * size.width,
          y: size.height - ((t.clientY - rect.top) / rect.height) * size.height,
        };
      } else {
        end = pointerToPdf(e);
      }
      const r = normalizeRect(state.start, end);
      state.drawing = false;
      state.start = null;
      if (r.w < 3 || r.h < 3) {
        drawOverlay();
        return;
      }
      if (!state.rects[state.pageIndex]) state.rects[state.pageIndex] = [];
      state.rects[state.pageIndex].push(r);
      updateStats();
      drawOverlay();
      setStatus("Tachón añadido.");
    }

    els.overlayCanvas.addEventListener("mousedown", onDown);
    els.overlayCanvas.addEventListener("mousemove", onMove);
    els.overlayCanvas.addEventListener("touchstart", onDown, { passive: false });
    els.overlayCanvas.addEventListener("touchmove", onMove, { passive: false });

    async function showPage(index) {
      state.pageIndex = index;
      els.pageLabel.textContent = `Pág. ${index + 1} / ${state.pageCount}`;
      const page = await state.pdfDoc.getPage(index + 1);
      const viewport = page.getViewport({ scale: state.renderScale });
      const canvas = els.pageCanvas;
      const ctx = canvas.getContext("2d");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: ctx, viewport }).promise;
      const real = page.getViewport({ scale: 1 });
      state.pageSizes[index] = { width: real.width, height: real.height };
      syncOverlaySize();
      drawOverlay();
      body.querySelectorAll(".edit-thumb").forEach((t) => {
        t.classList.toggle("active", Number(t.dataset.index) === index);
        t.classList.toggle("has-redact", !!(state.rects[Number(t.dataset.index)] || []).length);
      });
    }

    els.undoBtn.addEventListener("click", () => {
      const list = state.rects[state.pageIndex];
      if (list && list.length) list.pop();
      updateStats();
      drawOverlay();
    });
    els.clearPageBtn.addEventListener("click", () => {
      state.rects[state.pageIndex] = [];
      updateStats();
      drawOverlay();
      setStatus("Página limpia.");
    });
    els.clearAllBtn.addEventListener("click", () => {
      state.rects = Array.from({ length: state.pageCount }, () => []);
      updateStats();
      drawOverlay();
      body.querySelectorAll(".edit-thumb").forEach((t) => t.classList.remove("has-redact"));
      setStatus("Todos los tachones quitados.");
    });
    els.prevPage.addEventListener("click", () => {
      if (state.pageIndex > 0) showPage(state.pageIndex - 1);
    });
    els.nextPage.addEventListener("click", () => {
      if (state.pageIndex < state.pageCount - 1) showPage(state.pageIndex + 1);
    });

    async function openFile(file) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const pdfDoc = await loadPdfJs(bytes);
      state.pdfBytes = bytes;
      state.pdfDoc = pdfDoc;
      state.fileName = file.name;
      state.pageCount = pdfDoc.numPages;
      state.pageIndex = 0;
      state.rects = Array.from({ length: pdfDoc.numPages }, () => []);
      state.pageSizes = [];
      els.fileName.textContent = file.name;
      els.pageCount.textContent = `${pdfDoc.numPages} página${pdfDoc.numPages === 1 ? "" : "s"}`;
      els.dz.classList.add("hidden");
      els.workspace.classList.remove("hidden");
      els.thumbs.innerHTML = "";
      for (let i = 0; i < pdfDoc.numPages; i++) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "edit-thumb";
        btn.dataset.index = String(i);
        btn.textContent = String(i + 1);
        btn.addEventListener("click", () => showPage(i));
        els.thumbs.appendChild(btn);
      }
      updateStats();
      await showPage(0);
      setStatus("Arrastra sobre el texto o dato que quieras tachar.");
    }

    els.exportBtn.addEventListener("click", async () => {
      if (!allRects().length) return;
      try {
        els.exportBtn.disabled = true;
        const { PDFDocument } = PDFLib;
        const out = await PDFDocument.create();
        const srcForCopy = await PDFDocument.load(state.pdfBytes);

        for (let i = 0; i < state.pageCount; i++) {
          Aseo.setStatus(els.status, `Procesando página ${i + 1}/${state.pageCount}…`);
          const pageRects = state.rects[i] || [];
          if (!pageRects.length) {
            const [copied] = await out.copyPages(srcForCopy, [i]);
            out.addPage(copied);
            continue;
          }
          // Flatten: render + black rects → image (true redaction)
          const page = await state.pdfDoc.getPage(i + 1);
          const scale = 2;
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          await page.render({ canvasContext: ctx, viewport }).promise;
          const size = page.getViewport({ scale: 1 });
          ctx.fillStyle = "#000";
          pageRects.forEach((r) => {
            const x = r.x * scale;
            const y = (size.height - r.y - r.h) * scale;
            ctx.fillRect(x, y, r.w * scale, r.h * scale);
          });
          const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.92));
          const imgBytes = new Uint8Array(await blob.arrayBuffer());
          const img = await out.embedJpg(imgBytes);
          const p = out.addPage([size.width, size.height]);
          p.drawImage(img, { x: 0, y: 0, width: size.width, height: size.height });
        }

        const result = await out.save();
        Aseo.downloadBytes(result, `${Aseo.baseName(state.fileName)}-tachado.pdf`, "application/pdf");
        setStatus("PDF tachado descargado. El texto cubierto ya no es recuperable.");
      } catch (err) {
        console.error(err);
        setStatus(err.message || "No se pudo generar el PDF.", true);
      } finally {
        updateStats();
      }
    });

    els.resetBtn.addEventListener("click", () => {
      state.pdfBytes = null;
      state.pdfDoc = null;
      state.rects = [];
      els.workspace.classList.add("hidden");
      els.dz.classList.remove("hidden");
      setStatus("");
    });

    Aseo.bindDropzone({
      dropzone: els.dz,
      input: els.input,
      browseBtn: els.browseBtn,
      accept: "application/pdf,.pdf",
      multiple: false,
      onFiles: (files) => {
        const f = files.find(isPdf);
        if (!f) {
          setStatus("Elige un PDF.", true);
          return;
        }
        openFile(f).catch((err) => {
          console.error(err);
          setStatus("No se pudo abrir el PDF.", true);
        });
      },
    });
  };
})();
