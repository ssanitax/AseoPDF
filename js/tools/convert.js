/* global pdfjsLib, PDFLib, JSZip, mammoth, XLSX, html2canvas, jspdf */
window.AseoTools = window.AseoTools || {};

(function () {
  "use strict";
  const Aseo = window.Aseo;

  function simpleDropUI(body, opts) {
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

  /* ——— JPG / PNG → PDF ——— */
  window.AseoTools["jpg-a-pdf"] = async function (body) {
    simpleDropUI(body, {
      lede: "Elige una o varias imágenes JPG o PNG.",
      browse: "Elegir imágenes",
      runLabel: "Crear PDF",
      accept: "image/jpeg,image/jpg,image/png,.jpg,.jpeg,.png",
      multiple: true,
      filter: (f) => /\.(jpe?g|png)$/i.test(f.name) || /^image\/(jpeg|png)$/.test(f.type),
      optionsHtml: `
        <label class="opt-row"><span>Orientación de página</span>
          <select id="pageFit">
            <option value="fit">Ajustar a la imagen</option>
            <option value="a4">Centrar en A4</option>
          </select>
        </label>`,
      onRun: async (files, { status }) => {
        Aseo.setStatus(status, "Creando PDF…");
        const { PDFDocument } = PDFLib;
        const doc = await PDFDocument.create();
        const fit = body.querySelector("#pageFit").value;
        for (const file of files) {
          const bytes = await file.arrayBuffer();
          const isPng = /png$/i.test(file.name) || file.type === "image/png";
          const img = isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
          let page;
          if (fit === "a4") {
            page = doc.addPage([595.28, 841.89]);
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
            page = doc.addPage([img.width, img.height]);
            page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
          }
        }
        const out = await doc.save();
        const name = files.length === 1 ? `${Aseo.baseName(files[0].name)}.pdf` : "imagenes.pdf";
        Aseo.downloadBytes(out, name, "application/pdf");
        Aseo.setStatus(status, "PDF descargado.");
      },
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

  /* ——— Unir PDF ——— */
  window.AseoTools["unir-pdf"] = async function (body) {
    simpleDropUI(body, {
      lede: "Selecciona varios PDF para unirlos en orden.",
      browse: "Elegir PDFs",
      runLabel: "Unir PDF",
      accept: "application/pdf,.pdf",
      multiple: true,
      filter: (f) => /\.pdf$/i.test(f.name) || f.type === "application/pdf",
      onRun: async (files, { status }) => {
        if (files.length < 2) throw new Error("Necesitas al menos dos PDF.");
        Aseo.setStatus(status, "Uniendo…");
        const { PDFDocument } = PDFLib;
        const out = await PDFDocument.create();
        for (const file of files) {
          const src = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
          const pages = await out.copyPages(src, src.getPageIndices());
          pages.forEach((p) => out.addPage(p));
        }
        Aseo.downloadBytes(await out.save(), "unido.pdf", "application/pdf");
        Aseo.setStatus(status, "PDF unido descargado.");
      },
    });
  };

  /* ——— Dividir PDF ——— */
  window.AseoTools["dividir-pdf"] = async function (body) {
    simpleDropUI(body, {
      lede: "Divide un PDF por rangos de páginas (ej. 1-3,5,7-9).",
      browse: "Elegir PDF",
      runLabel: "Dividir",
      accept: "application/pdf,.pdf",
      multiple: false,
      filter: (f) => /\.pdf$/i.test(f.name) || f.type === "application/pdf",
      optionsHtml: `
        <label class="opt-row"><span>Modo</span>
          <select id="splitMode">
            <option value="each">Una página por archivo</option>
            <option value="range">Por rangos</option>
          </select>
        </label>
        <label class="opt-row" id="rangeRow"><span>Rangos</span>
          <input type="text" id="ranges" placeholder="1-3, 5, 8-10" />
        </label>`,
      onRun: async (files, { status }) => {
        const file = files[0];
        const mode = body.querySelector("#splitMode").value;
        Aseo.setStatus(status, "Dividiendo…");
        const { PDFDocument } = PDFLib;
        const src = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
        const total = src.getPageCount();
        const base = Aseo.baseName(file.name);
        const zip = new JSZip();

        function parseRanges(text) {
          const parts = text.split(/[,;\s]+/).filter(Boolean);
          const groups = [];
          for (const part of parts) {
            if (part.includes("-")) {
              const [a, b] = part.split("-").map((n) => parseInt(n, 10));
              if (!a || !b || a < 1 || b > total || a > b) throw new Error(`Rango inválido: ${part}`);
              const idx = [];
              for (let i = a; i <= b; i++) idx.push(i - 1);
              groups.push(idx);
            } else {
              const n = parseInt(part, 10);
              if (!n || n < 1 || n > total) throw new Error(`Página inválida: ${part}`);
              groups.push([n - 1]);
            }
          }
          if (!groups.length) throw new Error("Indica al menos un rango.");
          return groups;
        }

        let groups;
        if (mode === "each") {
          groups = Array.from({ length: total }, (_, i) => [i]);
        } else {
          groups = parseRanges(body.querySelector("#ranges").value.trim());
        }

        for (let g = 0; g < groups.length; g++) {
          const out = await PDFDocument.create();
          const copied = await out.copyPages(src, groups[g]);
          copied.forEach((p) => out.addPage(p));
          const bytes = await out.save();
          const label =
            groups[g].length === 1
              ? `p${groups[g][0] + 1}`
              : `p${groups[g][0] + 1}-${groups[g][groups[g].length - 1] + 1}`;
          zip.file(`${base}-${label}.pdf`, bytes);
        }

        if (groups.length === 1) {
          const name = Object.keys(zip.files)[0];
          Aseo.downloadBlob(await zip.file(name).async("blob"), name);
        } else {
          Aseo.downloadBlob(await zip.generateAsync({ type: "blob" }), `${base}-dividido.zip`);
        }
        Aseo.setStatus(status, "Descarga lista.");
      },
    });
    const modeSel = body.querySelector("#splitMode");
    const rangeRow = body.querySelector("#rangeRow");
    const sync = () => {
      rangeRow.style.display = modeSel.value === "range" ? "" : "none";
    };
    modeSel.addEventListener("change", sync);
    sync();
  };

  /* ——— Rotar PDF ——— */
  window.AseoTools["rotar-pdf"] = async function (body) {
    simpleDropUI(body, {
      lede: "Rota todas las páginas del PDF.",
      browse: "Elegir PDF",
      runLabel: "Rotar y descargar",
      accept: "application/pdf,.pdf",
      multiple: false,
      filter: (f) => /\.pdf$/i.test(f.name) || f.type === "application/pdf",
      optionsHtml: `
        <label class="opt-row"><span>Ángulo</span>
          <select id="angle">
            <option value="90">90° horaria</option>
            <option value="180">180°</option>
            <option value="270">90° antihoraria</option>
          </select>
        </label>`,
      onRun: async (files, { status }) => {
        Aseo.setStatus(status, "Rotando…");
        const angle = Number(body.querySelector("#angle").value);
        const { PDFDocument, degrees } = PDFLib;
        const doc = await PDFDocument.load(await files[0].arrayBuffer(), { ignoreEncryption: true });
        doc.getPages().forEach((p) => p.setRotation(degrees((p.getRotation().angle + angle) % 360)));
        Aseo.downloadBytes(
          await doc.save(),
          `${Aseo.baseName(files[0].name)}-rotado.pdf`,
          "application/pdf"
        );
        Aseo.setStatus(status, "PDF rotado descargado.");
      },
    });
  };

  /* ——— Comprimir PDF ——— */
  window.AseoTools["comprimir-pdf"] = async function (body) {
    simpleDropUI(body, {
      lede: "Reduce el peso re-renderizando las páginas como imágenes.",
      browse: "Elegir PDF",
      runLabel: "Comprimir",
      accept: "application/pdf,.pdf",
      multiple: false,
      filter: (f) => /\.pdf$/i.test(f.name) || f.type === "application/pdf",
      optionsHtml: `
        <label class="opt-row"><span>Nivel</span>
          <select id="level">
            <option value="1.2">Suave</option>
            <option value="1" selected>Medio</option>
            <option value="0.75">Fuerte</option>
          </select>
        </label>
        <p class="help">La compresión rasteriza el contenido; el texto deja de ser seleccionable.</p>`,
      onRun: async (files, { status }) => {
        const file = files[0];
        const scale = Number(body.querySelector("#level").value) || 1;
        Aseo.setStatus(status, "Comprimiendo…");
        const data = new Uint8Array(await file.arrayBuffer());
        const srcPdf = await pdfjsLib.getDocument({ data: data.slice() }).promise;
        const { PDFDocument } = PDFLib;
        const out = await PDFDocument.create();
        for (let i = 1; i <= srcPdf.numPages; i++) {
          Aseo.setStatus(status, `Página ${i}/${srcPdf.numPages}…`);
          const page = await srcPdf.getPage(i);
          const canvas = await Aseo.pdfPageToCanvas(page, scale);
          const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.72));
          const bytes = await blob.arrayBuffer();
          const img = await out.embedJpg(bytes);
          const p = out.addPage([img.width, img.height]);
          p.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
        }
        const result = await out.save();
        Aseo.downloadBytes(result, `${Aseo.baseName(file.name)}-comprimido.pdf`, "application/pdf");
        Aseo.setStatus(
          status,
          `Listo. Original ${Aseo.formatBytes(file.size)} → ${Aseo.formatBytes(result.length)}.`
        );
      },
    });
  };

  /* ——— Word → PDF ——— */
  window.AseoTools["word-a-pdf"] = async function (body) {
    simpleDropUI(body, {
      lede: "Convierte un .docx a PDF (maquetación aproximada).",
      browse: "Elegir Word",
      runLabel: "Convertir a PDF",
      accept: ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      multiple: false,
      filter: (f) => /\.docx$/i.test(f.name),
      onRun: async (files, { status }) => {
        Aseo.setStatus(status, "Leyendo documento…");
        const arrayBuffer = await files[0].arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer });
        const host = document.createElement("div");
        host.className = "html-capture";
        host.innerHTML = result.value || "<p>(Documento vacío)</p>";
        document.body.appendChild(host);
        Aseo.setStatus(status, "Generando PDF…");
        const canvas = await html2canvas(host, { scale: 2, backgroundColor: "#ffffff" });
        host.remove();
        const img = canvas.toDataURL("image/jpeg", 0.92);
        const { jsPDF } = jspdf;
        const pdf = new jsPDF({ unit: "pt", format: "a4" });
        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();
        const margin = 40;
        const usableW = pageW - margin * 2;
        const imgH = (canvas.height * usableW) / canvas.width;
        let heightLeft = imgH;
        let position = margin;
        pdf.addImage(img, "JPEG", margin, position, usableW, imgH);
        heightLeft -= pageH - margin * 2;
        while (heightLeft > 0) {
          position = margin - (imgH - heightLeft);
          pdf.addPage();
          pdf.addImage(img, "JPEG", margin, position, usableW, imgH);
          heightLeft -= pageH - margin * 2;
        }
        pdf.save(`${Aseo.baseName(files[0].name)}.pdf`);
        Aseo.setStatus(status, "PDF descargado.");
      },
    });
  };

  /* ——— PDF → Word ——— */
  window.AseoTools["pdf-a-word"] = async function (body) {
    simpleDropUI(body, {
      lede: "Extrae el texto del PDF a un documento Word editable.",
      browse: "Elegir PDF",
      runLabel: "Crear Word",
      accept: "application/pdf,.pdf",
      multiple: false,
      filter: (f) => /\.pdf$/i.test(f.name) || f.type === "application/pdf",
      onRun: async (files, { status }) => {
        Aseo.setStatus(status, "Extrayendo texto…");
        const data = new Uint8Array(await files[0].arrayBuffer());
        const pdf = await pdfjsLib.getDocument({ data: data.slice() }).promise;
        const paragraphs = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const text = content.items.map((it) => it.str).join(" ").replace(/\s+/g, " ").trim();
          if (text) paragraphs.push(text);
          paragraphs.push(""); // page break feel
        }
        const escape = (s) =>
          s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const html = `<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office"
          xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8">
          <title>${escape(Aseo.baseName(files[0].name))}</title></head><body>
          ${paragraphs.map((t) => `<p>${escape(t || "")}</p>`).join("\n")}
          </body></html>`;
        Aseo.downloadBlob(
          new Blob(["\ufeff", html], { type: "application/msword" }),
          `${Aseo.baseName(files[0].name)}.doc`
        );
        Aseo.setStatus(status, "Word descargado. La maquetación original no se conserva.");
      },
    });
  };

  /* ——— Excel → PDF ——— */
  window.AseoTools["excel-a-pdf"] = async function (body) {
    simpleDropUI(body, {
      lede: "Convierte la primera hoja de un .xlsx o .csv a PDF.",
      browse: "Elegir Excel / CSV",
      runLabel: "Convertir a PDF",
      accept: ".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv",
      multiple: false,
      filter: (f) => /\.(xlsx|xls|csv)$/i.test(f.name),
      onRun: async (files, { status }) => {
        Aseo.setStatus(status, "Leyendo hoja…");
        const file = files[0];
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const html = XLSX.utils.sheet_to_html(sheet);
        const host = document.createElement("div");
        host.className = "html-capture sheet-capture";
        host.innerHTML = html;
        document.body.appendChild(host);
        Aseo.setStatus(status, "Generando PDF…");
        const canvas = await html2canvas(host, { scale: 1.5, backgroundColor: "#ffffff" });
        host.remove();
        const { jsPDF } = jspdf;
        const pdf = new jsPDF({
          unit: "pt",
          format: canvas.width > canvas.height ? "a4" : "a4",
          orientation: canvas.width > canvas.height ? "landscape" : "portrait",
        });
        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();
        const margin = 24;
        const usableW = pageW - margin * 2;
        const imgH = (canvas.height * usableW) / canvas.width;
        const img = canvas.toDataURL("image/jpeg", 0.9);
        let heightLeft = imgH;
        let y = margin;
        pdf.addImage(img, "JPEG", margin, y, usableW, imgH);
        heightLeft -= pageH - margin * 2;
        while (heightLeft > 0) {
          y = margin - (imgH - heightLeft);
          pdf.addPage();
          pdf.addImage(img, "JPEG", margin, y, usableW, imgH);
          heightLeft -= pageH - margin * 2;
        }
        pdf.save(`${Aseo.baseName(file.name)}.pdf`);
        Aseo.setStatus(status, "PDF descargado.");
      },
    });
  };

  /* ——— PDF → Excel ——— */
  window.AseoTools["pdf-a-excel"] = async function (body) {
    simpleDropUI(body, {
      lede: "Extrae el texto del PDF a una hoja Excel (una fila por línea).",
      browse: "Elegir PDF",
      runLabel: "Crear Excel",
      accept: "application/pdf,.pdf",
      multiple: false,
      filter: (f) => /\.pdf$/i.test(f.name) || f.type === "application/pdf",
      onRun: async (files, { status }) => {
        Aseo.setStatus(status, "Extrayendo…");
        const data = new Uint8Array(await files[0].arrayBuffer());
        const pdf = await pdfjsLib.getDocument({ data: data.slice() }).promise;
        const rows = [["Pagina", "Texto"]];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          let line = "";
          let lastY = null;
          for (const item of content.items) {
            const y = item.transform ? item.transform[5] : null;
            if (lastY !== null && y !== null && Math.abs(y - lastY) > 2) {
              if (line.trim()) rows.push([i, line.trim()]);
              line = "";
            }
            line += item.str + (item.hasEOL ? "" : " ");
            lastY = y;
          }
          if (line.trim()) rows.push([i, line.trim()]);
        }
        const ws = XLSX.utils.aoa_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "PDF");
        const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
        Aseo.downloadBytes(
          out,
          `${Aseo.baseName(files[0].name)}.xlsx`,
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        Aseo.setStatus(status, "Excel descargado.");
      },
    });
  };

  /* ——— PowerPoint → PDF ——— */
  window.AseoTools["ppt-a-pdf"] = async function (body) {
    simpleDropUI(body, {
      lede: "Convierte un .pptx usando las imágenes embebidas de cada diapositiva.",
      browse: "Elegir PowerPoint",
      runLabel: "Convertir a PDF",
      accept: ".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation",
      multiple: false,
      filter: (f) => /\.pptx$/i.test(f.name),
      onRun: async (files, { status }) => {
        Aseo.setStatus(status, "Leyendo presentación…");
        const zip = await JSZip.loadAsync(await files[0].arrayBuffer());
        const media = Object.keys(zip.files)
          .filter((p) => /^ppt\/media\//i.test(p) && /\.(png|jpe?g|gif|emf|wmf)$/i.test(p))
          .sort();
        if (!media.length) {
          throw new Error(
            "No se encontraron imágenes en el PPTX. Las diapositivas solo con formas/texto no se pueden convertir aquí."
          );
        }
        const { PDFDocument } = PDFLib;
        const doc = await PDFDocument.create();
        let added = 0;
        for (const path of media) {
          const bytes = await zip.file(path).async("uint8array");
          try {
            let img;
            if (/\.png$/i.test(path)) img = await doc.embedPng(bytes);
            else if (/\.jpe?g$/i.test(path)) img = await doc.embedJpg(bytes);
            else continue;
            const page = doc.addPage([img.width, img.height]);
            page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
            added++;
          } catch (_) {
            /* skip unsupported */
          }
        }
        if (!added) throw new Error("No se pudo incrustar ninguna imagen del PPTX.");
        Aseo.downloadBytes(
          await doc.save(),
          `${Aseo.baseName(files[0].name)}.pdf`,
          "application/pdf"
        );
        Aseo.setStatus(status, `PDF con ${added} imagen(es) descargado.`);
      },
    });
  };

  /* ——— HTML → PDF ——— */
  window.AseoTools["html-a-pdf"] = async function (body) {
    simpleDropUI(body, {
      lede: "Convierte un archivo .html local a PDF.",
      browse: "Elegir HTML",
      runLabel: "Convertir a PDF",
      accept: ".html,.htm,text/html",
      multiple: false,
      filter: (f) => /\.html?$/i.test(f.name) || f.type === "text/html",
      onRun: async (files, { status }) => {
        Aseo.setStatus(status, "Renderizando HTML…");
        const html = await files[0].text();
        const host = document.createElement("div");
        host.className = "html-capture";
        host.innerHTML = html;
        document.body.appendChild(host);
        const canvas = await html2canvas(host, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
        host.remove();
        const { jsPDF } = jspdf;
        const pdf = new jsPDF({ unit: "pt", format: "a4" });
        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();
        const margin = 28;
        const usableW = pageW - margin * 2;
        const imgH = (canvas.height * usableW) / canvas.width;
        const img = canvas.toDataURL("image/jpeg", 0.92);
        let heightLeft = imgH;
        let y = margin;
        pdf.addImage(img, "JPEG", margin, y, usableW, imgH);
        heightLeft -= pageH - margin * 2;
        while (heightLeft > 0) {
          y = margin - (imgH - heightLeft);
          pdf.addPage();
          pdf.addImage(img, "JPEG", margin, y, usableW, imgH);
          heightLeft -= pageH - margin * 2;
        }
        pdf.save(`${Aseo.baseName(files[0].name)}.pdf`);
        Aseo.setStatus(status, "PDF descargado.");
      },
    });
  };
})();
