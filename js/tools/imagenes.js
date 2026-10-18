/* global pdfjsLib, PDFLib, JSZip, mammoth, XLSX, html2canvas, jspdf */
window.AseoTools = window.AseoTools || {};

(function () {
  "use strict";
  const Aseo = window.Aseo;
  const simpleDropUI = Aseo.simpleDropUI;

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

})();
