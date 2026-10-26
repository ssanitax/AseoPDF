/* global pdfjsLib, PDFLib, JSZip, mammoth, XLSX, html2canvas, jspdf */
window.AseoTools = window.AseoTools || {};

(function () {
  "use strict";
  const Aseo = window.Aseo;
  const simpleDropUI = Aseo.simpleDropUI;

  /* ——— JPG / PNG → PDF ——— */
  window.AseoTools["jpg-a-pdf"] = async function (body) {
    let objectUrls = [];

    function revokeUrls() {
      objectUrls.forEach((u) => URL.revokeObjectURL(u));
      objectUrls = [];
    }

    function loadImage(file) {
      return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        objectUrls.push(url);
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("No se pudo leer la imagen."));
        img.src = url;
      });
    }

    function drawFitPreview(canvas, img) {
      const maxW = 160;
      const maxH = 200;
      const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
    }

    function drawA4Preview(canvas, img) {
      const landscape = img.naturalWidth > img.naturalHeight;
      const pageW = landscape ? 200 : 160;
      const pageH = landscape
        ? Math.round(pageW * (595.28 / 841.89))
        : Math.round(pageW * (841.89 / 595.28));
      canvas.width = pageW;
      canvas.height = pageH;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, pageW, pageH);
      const scale = Math.min(pageW / img.naturalWidth, pageH / img.naturalHeight) * 0.92;
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      ctx.drawImage(img, (pageW - w) / 2, (pageH - h) / 2, w, h);
      ctx.strokeStyle = "rgba(28, 27, 25, 0.12)";
      ctx.strokeRect(0.5, 0.5, pageW - 1, pageH - 1);
    }

    async function updatePreviews(files) {
      const fitCanvas = body.querySelector("#previewFit");
      const a4Canvas = body.querySelector("#previewA4");
      const empty = body.querySelector("#orientEmpty");
      const compare = body.querySelector("#orientCompare");
      if (!fitCanvas || !a4Canvas) return;

      revokeUrls();
      if (!files.length) {
        if (empty) empty.classList.remove("hidden");
        if (compare) compare.classList.add("hidden");
        return;
      }
      if (empty) empty.classList.add("hidden");
      if (compare) compare.classList.remove("hidden");

      try {
        const img = await loadImage(files[0]);
        drawFitPreview(fitCanvas, img);
        drawA4Preview(a4Canvas, img);
        const note = body.querySelector("#orientNote");
        if (note) {
          note.textContent =
            files.length > 1
              ? `Vista previa con la primera imagen (${files.length} en total).`
              : "Vista previa de cómo quedará la página.";
        }
      } catch (err) {
        console.error(err);
        if (empty) {
          empty.textContent = "No se pudo generar la vista previa.";
          empty.classList.remove("hidden");
        }
        if (compare) compare.classList.add("hidden");
      }
    }

    function selectedFit() {
      const active = body.querySelector(".orient-card.active");
      return active ? active.dataset.fit : "fit";
    }

    simpleDropUI(body, {
      lede: "Elige una o varias imágenes JPG o PNG.",
      browse: "Elegir imágenes",
      runLabel: "Crear PDF",
      accept: "image/jpeg,image/jpg,image/png,.jpg,.jpeg,.png",
      multiple: true,
      filter: (f) => /\.(jpe?g|png)$/i.test(f.name) || /^image\/(jpeg|png)$/.test(f.type),
      optionsHtml: `
        <div class="orient-picker">
          <p class="opt-label">Orientación de página</p>
          <p id="orientEmpty" class="help">Sube una imagen para ver la vista previa.</p>
          <div id="orientCompare" class="orient-compare hidden" role="radiogroup" aria-label="Orientación de página">
            <button type="button" class="orient-card active" data-fit="fit" role="radio" aria-checked="true">
              <span class="orient-card-title">Ajustar a la imagen</span>
              <span class="orient-card-desc">La página tiene el mismo tamaño que la foto.</span>
              <div class="orient-stage"><canvas id="previewFit"></canvas></div>
            </button>
            <button type="button" class="orient-card" data-fit="a4" role="radio" aria-checked="false">
              <span class="orient-card-title">Centrar en A4</span>
              <span class="orient-card-desc">Se centra en A4 (vertical u horizontal según la foto).</span>
              <div class="orient-stage a4"><canvas id="previewA4"></canvas></div>
            </button>
          </div>
          <p id="orientNote" class="help"></p>
        </div>`,
      onFilesChange: updatePreviews,
      onRun: async (files, { status }) => {
        Aseo.setStatus(status, "Creando PDF…");
        const { PDFDocument } = PDFLib;
        const doc = await PDFDocument.create();
        const fit = selectedFit();
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          Aseo.setStatus(status, `Imagen ${i + 1}/${files.length}…`);
          const bytes = await file.arrayBuffer();
          const isPng = /png$/i.test(file.name) || file.type === "image/png";
          const img = isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
          if (fit === "a4") {
            const landscape = img.width > img.height;
            const page = doc.addPage(landscape ? [841.89, 595.28] : [595.28, 841.89]);
            const { width, height } = page.getSize();
            const scale = Math.min(width / img.width, height / img.height) * 0.92;
            const w = img.width * scale;
            const h = img.height * scale;
            page.drawImage(img, {
              x: (width - w) / 2,
              y: (height - h) / 2,
              width: w,
              height: h,
            });
          } else {
            const page = doc.addPage([img.width, img.height]);
            page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
          }
        }
        const out = await doc.save();
        const name = files.length === 1 ? `${Aseo.baseName(files[0].name)}.pdf` : "imagenes.pdf";
        Aseo.downloadBytes(out, name, "application/pdf");
        Aseo.setStatus(status, "PDF descargado.");
      },
    });

    body.querySelectorAll(".orient-card").forEach((card) => {
      card.addEventListener("click", () => {
        body.querySelectorAll(".orient-card").forEach((c) => {
          c.classList.remove("active");
          c.setAttribute("aria-checked", "false");
        });
        card.classList.add("active");
        card.setAttribute("aria-checked", "true");
      });
    });
  };

  /* ——— PDF → JPG / PNG ——— */
  async function pdfToImages(body, format) {
    const mime = format === "png" ? "image/png" : "image/jpeg";
    const ext = format === "png" ? "png" : "jpg";
    simpleDropUI(body, {
      lede: `Convierte cada página del PDF a ${ext.toUpperCase()}.`,
      browse: "Elegir PDF",
      runLabel: `Exportar ${ext.toUpperCase()}`,
      accept: "application/pdf,.pdf",
      multiple: false,
      filter: (f) => /\.pdf$/i.test(f.name) || f.type === "application/pdf",
      optionsHtml: `
        <label class="opt-row"><span>Calidad / escala</span>
          <select id="scale">
            <option value="1.5">Media</option>
            <option value="2" selected>Alta</option>
            <option value="3">Muy alta</option>
          </select>
        </label>`,
      onRun: async (files, { status }) => {
        const file = files[0];
        Aseo.setStatus(status, "Renderizando páginas…");
        const data = new Uint8Array(await file.arrayBuffer());
        const pdf = await pdfjsLib.getDocument({ data: data.slice() }).promise;
        const scale = Number(body.querySelector("#scale").value) || 2;
        const zip = new JSZip();
        const base = Aseo.baseName(file.name);
        for (let i = 1; i <= pdf.numPages; i++) {
          Aseo.setStatus(status, `Página ${i}/${pdf.numPages}…`);
          const page = await pdf.getPage(i);
          const canvas = await Aseo.pdfPageToCanvas(page, scale);
          const blob = await new Promise((res) =>
            canvas.toBlob(res, mime, format === "png" ? undefined : 0.92)
          );
          zip.file(`${base}-p${String(i).padStart(2, "0")}.${ext}`, blob);
        }
        if (pdf.numPages === 1) {
          const blob = await zip.file(Object.keys(zip.files)[0]).async("blob");
          Aseo.downloadBlob(blob, `${base}.${ext}`);
        } else {
          const zblob = await zip.generateAsync({ type: "blob" });
          Aseo.downloadBlob(zblob, `${base}-${ext}.zip`);
        }
        Aseo.setStatus(status, "Descarga lista.");
      },
    });
  }

  window.AseoTools["pdf-a-jpg"] = (body) => pdfToImages(body, "jpg");
  window.AseoTools["pdf-a-png"] = (body) => pdfToImages(body, "png");

})();
