/* global pdfjsLib, PDFLib, JSZip, mammoth, XLSX, html2canvas, jspdf */
window.AseoTools = window.AseoTools || {};

(function () {
  "use strict";
  const Aseo = window.Aseo;
  const simpleDropUI = Aseo.simpleDropUI;

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

})();
