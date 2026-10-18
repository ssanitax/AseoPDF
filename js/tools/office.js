/* global pdfjsLib, PDFLib, JSZip, mammoth, XLSX, html2canvas, jspdf */
window.AseoTools = window.AseoTools || {};

(function () {
  "use strict";
  const Aseo = window.Aseo;
  const simpleDropUI = Aseo.simpleDropUI;

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
