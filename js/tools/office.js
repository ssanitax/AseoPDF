/* global pdfjsLib, PDFLib, JSZip, XLSX, html2canvas, jspdf, docx */
window.AseoTools = window.AseoTools || {};

(function () {
  "use strict";
  const Aseo = window.Aseo;
  const simpleDropUI = Aseo.simpleDropUI;

  function htmlCanvasToPagedPdf(canvas, margins) {
    const { jsPDF } = jspdf;
    const pdf = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const marginTop = margins.top;
    const marginBottom = margins.bottom;
    const marginLeft = margins.left;
    const marginRight = margins.right;
    const usableW = pageW - marginLeft - marginRight;
    const usableH = pageH - marginTop - marginBottom;
    const pxPerPt = canvas.width / usableW;
    const pageSlicePx = Math.max(1, Math.floor(usableH * pxPerPt));

    let srcY = 0;
    let pageIndex = 0;
    while (srcY < canvas.height) {
      const sliceH = Math.min(pageSlicePx, canvas.height - srcY);
      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = canvas.width;
      pageCanvas.height = sliceH;
      const ctx = pageCanvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      ctx.drawImage(
        canvas,
        0,
        srcY,
        canvas.width,
        sliceH,
        0,
        0,
        canvas.width,
        sliceH
      );
      const imgData = pageCanvas.toDataURL("image/jpeg", 0.93);
      const drawH = sliceH / pxPerPt;
      if (pageIndex > 0) pdf.addPage();
      pdf.addImage(imgData, "JPEG", marginLeft, marginTop, usableW, drawH);
      srcY += pageSlicePx;
      pageIndex += 1;
    }
    return pdf;
  }

  async function waitForImages(root) {
    const imgs = [...root.querySelectorAll("img")];
    await Promise.all(
      imgs.map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise((resolve) => {
              img.onload = resolve;
              img.onerror = resolve;
            })
      )
    );
  }

  function canvasToPdfPage(pdf, canvas, pageIndex, pageSizePt) {
    const pageW = pageSizePt ? pageSizePt[0] : pdf.internal.pageSize.getWidth();
    const pageH = pageSizePt ? pageSizePt[1] : pdf.internal.pageSize.getHeight();
    if (pageIndex > 0) {
      if (pageSizePt) pdf.addPage(pageSizePt);
      else pdf.addPage();
    } else if (pageSizePt) {
      // primera página ya creada en A4; redimensionar no es trivial en jsPDF,
      // así que dibujamos ajustado al tamaño actual
    }
    const curW = pdf.internal.pageSize.getWidth();
    const curH = pdf.internal.pageSize.getHeight();
    const ratio = Math.min(curW / canvas.width, curH / canvas.height);
    const drawW = canvas.width * ratio;
    const drawH = canvas.height * ratio;
    const x = (curW - drawW) / 2;
    const y = (curH - drawH) / 2;
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.93), "JPEG", x, y, drawW, drawH);
  }

  async function renderDomToPagedPdf(host, margins) {
    await waitForImages(host);
    const canvas = await html2canvas(host, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
      windowWidth: Math.max(host.scrollWidth, host.offsetWidth),
      windowHeight: Math.max(host.scrollHeight, host.offsetHeight),
    });
    return htmlCanvasToPagedPdf(canvas, margins);
  }

  /* ——— Word → PDF ——— */
  window.AseoTools["word-a-pdf"] = async function (body) {
    simpleDropUI(body, {
      lede: "Convierte un .docx a PDF respetando mejor páginas y márgenes del documento.",
      browse: "Elegir Word",
      runLabel: "Convertir a PDF",
      accept: ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      multiple: false,
      filter: (f) => /\.docx$/i.test(f.name),
      onRun: async (files, { status }) => {
        if (!window.docx || typeof docx.renderAsync !== "function") {
          throw new Error("No se pudo cargar el visor de Word (docx-preview).");
        }

        Aseo.setStatus(status, "Leyendo documento…");
        const arrayBuffer = await files[0].arrayBuffer();

        const host = document.createElement("div");
        host.className = "docx-render-host";
        const bodyBox = document.createElement("div");
        const styleBox = document.createElement("div");
        host.appendChild(styleBox);
        host.appendChild(bodyBox);
        document.body.appendChild(host);

        try {
          Aseo.setStatus(status, "Renderizando como en Word…");
          await docx.renderAsync(arrayBuffer, bodyBox, styleBox, {
            className: "docx",
            inWrapper: true,
            breakPages: true,
            ignoreLastRenderedPageBreak: false,
            ignoreWidth: false,
            ignoreHeight: false,
            useBase64URL: true,
            renderHeaders: true,
            renderFooters: true,
            renderFootnotes: true,
            renderEndnotes: true,
          });

          await waitForImages(bodyBox);

          const { jsPDF } = jspdf;
          const pdf = new jsPDF({ unit: "pt", format: "a4" });
          const pages = [...bodyBox.querySelectorAll("section.docx")];

          if (pages.length) {
            for (let i = 0; i < pages.length; i++) {
              Aseo.setStatus(status, `Generando página ${i + 1}/${pages.length}…`);
              const canvas = await html2canvas(pages[i], {
                scale: 2,
                backgroundColor: "#ffffff",
                useCORS: true,
                logging: false,
                windowWidth: pages[i].scrollWidth,
                windowHeight: pages[i].scrollHeight,
              });
              canvasToPdfPage(pdf, canvas, i);
            }
          } else {
            // Fallback si el documento no trae saltos de página detectables
            Aseo.setStatus(status, "Generando PDF…");
            const target = bodyBox.querySelector(".docx-wrapper") || bodyBox;
            const canvas = await html2canvas(target, {
              scale: 2,
              backgroundColor: "#ffffff",
              useCORS: true,
              logging: false,
              windowWidth: target.scrollWidth,
              windowHeight: target.scrollHeight,
            });
            const fallback = htmlCanvasToPagedPdf(canvas, {
              top: 72,
              bottom: 72,
              left: 72,
              right: 72,
            });
            fallback.save(`${Aseo.baseName(files[0].name)}.pdf`);
            Aseo.setStatus(status, "PDF descargado.");
            return;
          }

          pdf.save(`${Aseo.baseName(files[0].name)}.pdf`);
          Aseo.setStatus(status, "PDF descargado.");
        } finally {
          host.remove();
        }
      },
    });
  };

  function xmlEscape(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function pdfItemFontSize(item) {
    const t = item.transform;
    if (!t) return 11;
    const size = Math.sqrt(t[0] * t[0] + t[1] * t[1]);
    return size > 0.5 ? size : Math.abs(t[3]) || 11;
  }

  function inferRunStyle(item, styles, page) {
    let name = item.fontName || "";
    try {
      const obj = page.commonObjs.get(item.fontName);
      if (obj && obj.name) name = String(obj.name);
    } catch (_) {
      /* ignore */
    }
    const style = (styles && styles[item.fontName]) || {};
    if (style.fontFamily) name += ` ${style.fontFamily}`;
    const n = name.toLowerCase();
    return {
      bold: /bold|black|heavy|demi|extrabold|semibold/.test(n),
      italic: /italic|oblique/.test(n),
      fontSize: pdfItemFontSize(item),
    };
  }

  function pdfPageToStyledLines(content, page) {
    const styles = content.styles || {};
    const lines = [];
    let current = null;
    let lastY = null;

    function pushLine() {
      if (!current || !current.runs.length) return;
      current.runs.forEach((r) => {
        r.text = r.text.replace(/\s+/g, " ");
      });
      current.runs = current.runs.filter((r) => r.text && r.text.trim());
      if (current.runs.length) {
        if (current.runs[0].text.startsWith(" ")) current.runs[0].text = current.runs[0].text.trimStart();
        const last = current.runs[current.runs.length - 1];
        last.text = last.text.trimEnd();
        lines.push(current);
      }
      current = null;
    }

    function sameStyle(a, b) {
      return (
        a &&
        b &&
        a.bold === b.bold &&
        a.italic === b.italic &&
        Math.abs(a.fontSize - b.fontSize) < 0.6
      );
    }

    for (const item of content.items) {
      const str = item.str || "";
      if (!str && !item.hasEOL) continue;
      const y = item.transform ? item.transform[5] : null;
      const style = inferRunStyle(item, styles, page);

      if (lastY !== null && y !== null && Math.abs(y - lastY) > 2.5) pushLine();

      if (!current) current = { runs: [], fontSize: style.fontSize };
      current.fontSize = Math.max(current.fontSize, style.fontSize);

      if (str) {
        const lastRun = current.runs[current.runs.length - 1];
        if (lastRun && sameStyle(lastRun, style)) lastRun.text += str;
        else {
          current.runs.push({
            text: str,
            bold: style.bold,
            italic: style.italic,
            fontSize: style.fontSize,
          });
        }
      }

      if (item.hasEOL) {
        pushLine();
        lastY = null;
      } else {
        lastY = y;
      }
    }
    pushLine();

    // Unir runs adyacentes pegando espacio si hace falta
    lines.forEach((line) => {
      for (let i = 1; i < line.runs.length; i++) {
        const prev = line.runs[i - 1];
        const cur = line.runs[i];
        if (!/\s$/.test(prev.text) && !/^\s/.test(cur.text)) {
          prev.text += " ";
        }
      }
      line.text = line.runs.map((r) => r.text).join("").trim();
    });

    return lines.filter((l) => l.text);
  }

  function runToXml(run) {
    const halfPts = Math.max(16, Math.round(run.fontSize * 2));
    const rPr = [
      run.bold ? "<w:b/>" : "",
      run.italic ? "<w:i/>" : "",
      `<w:sz w:val="${halfPts}"/>`,
      `<w:szCs w:val="${halfPts}"/>`,
    ].join("");
    return `<w:r><w:rPr>${rPr}</w:rPr><w:t xml:space="preserve">${xmlEscape(run.text)}</w:t></w:r>`;
  }

  function imageParagraphXml(relId, cx, cy) {
    return `<w:p>
      <w:r>
        <w:drawing>
          <wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
            xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"
            distT="0" distB="0" distL="0" distR="0">
            <wp:extent cx="${cx}" cy="${cy}"/>
            <wp:docPr id="${relId.replace(/\D/g, "") || 1}" name="Pagina"/>
            <a:graphic>
              <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
                <pic:pic>
                  <pic:nvPicPr>
                    <pic:cNvPr id="0" name="page.png"/>
                    <pic:cNvPicPr/>
                  </pic:nvPicPr>
                  <pic:blipFill>
                    <a:blip r:embed="${relId}"/>
                    <a:stretch><a:fillRect/></a:stretch>
                  </pic:blipFill>
                  <pic:spPr>
                    <a:xfrm>
                      <a:off x="0" y="0"/>
                      <a:ext cx="${cx}" cy="${cy}"/>
                    </a:xfrm>
                    <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
                  </pic:spPr>
                </pic:pic>
              </a:graphicData>
            </a:graphic>
          </wp:inline>
        </w:drawing>
      </w:r>
    </w:p>`;
  }

  async function canvasToPngBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("No se pudo capturar la página."))), "image/png");
    });
  }

  async function buildStyledDocx(pages) {
    // pages: [{ lines, imageBlob, width, height }]
    const zip = new JSZip();
    const media = zip.folder("word").folder("media");
    const bodyParts = [];
    const docRels = [
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>`,
    ];
    // document.xml.rels starts at rId2 for images; rId1 reserved unused in doc rels - use rIdImg
    const imageRels = [];

    const maxWidthEmu = 5486400; // ~6 in
    const emuPerPx = 9525; // 96 dpi approx

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      if (i > 0) bodyParts.push(`<w:p><w:r><w:br w:type="page"/></w:r></w:p>`);

      if (page.imageBlob) {
        const relId = `rId${i + 2}`;
        const fileName = `page-${i + 1}.png`;
        media.file(fileName, page.imageBlob);
        imageRels.push(
          `<Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${fileName}"/>`
        );
        let cx = Math.round(page.width * emuPerPx);
        let cy = Math.round(page.height * emuPerPx);
        if (cx > maxWidthEmu) {
          const scale = maxWidthEmu / cx;
          cx = maxWidthEmu;
          cy = Math.round(cy * scale);
        }
        bodyParts.push(imageParagraphXml(relId, cx, cy));
      }

      if (page.lines && page.lines.length) {
        bodyParts.push(
          `<w:p><w:pPr><w:spacing w:before="200"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="20"/></w:rPr><w:t>Texto editable</w:t></w:r></w:p>`
        );
        page.lines.forEach((line) => {
          const avgSize =
            line.runs.reduce((s, r) => s + r.fontSize, 0) / Math.max(line.runs.length, 1);
          const isHeading = avgSize >= 16;
          const pPr = isHeading
            ? `<w:pPr><w:spacing w:before="160" w:after="80"/></w:pPr>`
            : `<w:pPr><w:spacing w:after="40"/></w:pPr>`;
          bodyParts.push(`<w:p>${pPr}${line.runs.map(runToXml).join("")}</w:p>`);
        });
      }
    }

    if (!bodyParts.length) bodyParts.push(`<w:p/>`);

    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${bodyParts.join("\n    ")}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/>
    </w:sectPr>
  </w:body>
</w:document>`;

    const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

    const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${docRels.join("\n  ")}
</Relationships>`;

    const documentRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${imageRels.join("\n  ")}
</Relationships>`;

    zip.file("[Content_Types].xml", contentTypes);
    zip.folder("_rels").file(".rels", rootRels);
    zip.folder("word").file("document.xml", documentXml);
    zip.folder("word").folder("_rels").file("document.xml.rels", documentRels);
    return zip.generateAsync({ type: "blob" });
  }

  /* ——— PDF → Word ——— */
  window.AseoTools["pdf-a-word"] = async function (body) {
    simpleDropUI(body, {
      lede: "Crea un Word con la vista de cada página y el texto editable (negrita, cursiva y tamaños).",
      browse: "Elegir PDF",
      runLabel: "Crear Word",
      accept: "application/pdf,.pdf",
      multiple: false,
      filter: (f) => /\.pdf$/i.test(f.name) || f.type === "application/pdf",
      onRun: async (files, { status }) => {
        Aseo.setStatus(status, "Leyendo PDF…");
        const data = new Uint8Array(await files[0].arrayBuffer());
        const pdf = await pdfjsLib.getDocument({ data: data.slice() }).promise;
        const pages = [];
        let totalLines = 0;

        for (let i = 1; i <= pdf.numPages; i++) {
          Aseo.setStatus(status, `Procesando página ${i}/${pdf.numPages}…`);
          const page = await pdf.getPage(i);
          await page.getOperatorList();
          const content = await page.getTextContent();
          const lines = pdfPageToStyledLines(content, page);
          totalLines += lines.length;

          const canvas = await Aseo.pdfPageToCanvas(page, 1.5);
          const imageBlob = await canvasToPngBlob(canvas);
          pages.push({
            lines,
            imageBlob,
            width: canvas.width,
            height: canvas.height,
          });
        }

        if (!pages.length) throw new Error("No se pudo leer el PDF.");

        Aseo.setStatus(status, "Creando Word…");
        const blob = await buildStyledDocx(pages);
        Aseo.downloadBlob(blob, `${Aseo.baseName(files[0].name)}.docx`);
        Aseo.setStatus(
          status,
          totalLines
            ? "Word descargado: imagen de cada página + texto editable con estilos básicos."
            : "Word descargado con la vista de cada página (el PDF no tenía texto seleccionable)."
        );
      },
    });
  };

  function clusterColumnXs(xs, threshold) {
    const sorted = [...xs].sort((a, b) => a - b);
    const clusters = [];
    sorted.forEach((x) => {
      const last = clusters[clusters.length - 1];
      if (!last || x - last.center > threshold) clusters.push({ sum: x, n: 1, center: x });
      else {
        last.sum += x;
        last.n += 1;
        last.center = last.sum / last.n;
      }
    });
    return clusters.map((c) => c.center);
  }

  function pdfPageToTableRows(content) {
    const items = content.items
      .filter((it) => (it.str || "").trim())
      .map((it) => ({
        str: it.str,
        x: it.transform ? it.transform[4] : 0,
        y: it.transform ? it.transform[5] : 0,
      }));
    if (!items.length) return [];

    const xs = items.map((it) => it.x);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const colCenters = clusterColumnXs(xs, Math.max(18, (maxX - minX) / 12));

    const rowMap = new Map();
    items.forEach((it) => {
      const yKey = Math.round(it.y / 3) * 3;
      if (!rowMap.has(yKey)) rowMap.set(yKey, Array(colCenters.length).fill(""));
      let best = 0;
      let bestDist = Infinity;
      colCenters.forEach((cx, idx) => {
        const d = Math.abs(cx - it.x);
        if (d < bestDist) {
          bestDist = d;
          best = idx;
        }
      });
      const row = rowMap.get(yKey);
      row[best] = row[best] ? `${row[best]} ${it.str}`.trim() : it.str.trim();
    });

    return [...rowMap.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, cells]) => cells);
  }

  async function getPptSlideImagePaths(zip) {
    const slides = Object.keys(zip.files)
      .filter((p) => /^ppt\/slides\/slide\d+\.xml$/i.test(p))
      .sort((a, b) => {
        const na = Number((a.match(/slide(\d+)/i) || [])[1] || 0);
        const nb = Number((b.match(/slide(\d+)/i) || [])[1] || 0);
        return na - nb;
      });

    const perSlide = [];
    for (const slidePath of slides) {
      const relPath = slidePath.replace(
        /ppt\/slides\/(slide\d+)\.xml$/i,
        "ppt/slides/_rels/$1.xml.rels"
      );
      const relFile = zip.file(relPath);
      if (!relFile) {
        perSlide.push([]);
        continue;
      }
      const relXml = await relFile.async("string");
      const targets = [...relXml.matchAll(/Target="([^"]+)"/g)].map((m) => m[1]);
      const mediaPaths = targets
        .map((t) => {
          const normalized = t.replace(/\\/g, "/");
          if (/media\//i.test(normalized)) {
            const name = normalized.split(/media\//i).pop();
            return name ? `ppt/media/${name}` : null;
          }
          return null;
        })
        .filter((p) => p && /\.(png|jpe?g)$/i.test(p) && zip.file(p));
      perSlide.push([...new Set(mediaPaths)]);
    }
    return perSlide;
  }

  /* ——— Excel → PDF ——— */
  window.AseoTools["excel-a-pdf"] = async function (body) {
    let workbook = null;

    simpleDropUI(body, {
      lede: "Convierte una hoja de Excel o CSV a PDF con páginas y márgenes correctos.",
      browse: "Elegir Excel / CSV",
      runLabel: "Convertir a PDF",
      accept: ".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv",
      multiple: false,
      filter: (f) => /\.(xlsx|xls|csv)$/i.test(f.name),
      optionsHtml: `
        <label class="opt-row"><span>Hoja</span>
          <select id="sheetName"><option value="">—</option></select>
        </label>
        <label class="opt-row"><span>Orientación</span>
          <select id="sheetOrient">
            <option value="auto" selected>Automática</option>
            <option value="portrait">Vertical</option>
            <option value="landscape">Horizontal</option>
          </select>
        </label>`,
      onFilesChange: async (files) => {
        const sel = body.querySelector("#sheetName");
        if (!sel) return;
        sel.innerHTML = "";
        workbook = null;
        if (!files.length) {
          sel.innerHTML = `<option value="">—</option>`;
          return;
        }
        try {
          const buf = await files[0].arrayBuffer();
          workbook = XLSX.read(buf, { type: "array" });
          workbook.SheetNames.forEach((name, idx) => {
            const opt = document.createElement("option");
            opt.value = name;
            opt.textContent = name;
            if (idx === 0) opt.selected = true;
            sel.appendChild(opt);
          });
        } catch (err) {
          console.error(err);
          sel.innerHTML = `<option value="">Error al leer hojas</option>`;
        }
      },
      onRun: async (files, { status }) => {
        Aseo.setStatus(status, "Leyendo hoja…");
        const file = files[0];
        if (!workbook) {
          const buf = await file.arrayBuffer();
          workbook = XLSX.read(buf, { type: "array" });
        }
        const sheetName =
          (body.querySelector("#sheetName") && body.querySelector("#sheetName").value) ||
          workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) throw new Error("No se encontró la hoja seleccionada.");

        const html = XLSX.utils.sheet_to_html(sheet);
        const host = document.createElement("div");
        host.className = "html-capture sheet-capture";
        host.innerHTML = `<h2 class="sheet-title">${sheetName}</h2>${html}`;
        document.body.appendChild(host);

        Aseo.setStatus(status, "Generando PDF…");
        await waitForImages(host);
        const canvas = await html2canvas(host, {
          scale: 2,
          backgroundColor: "#ffffff",
          logging: false,
          windowWidth: host.scrollWidth,
          windowHeight: host.scrollHeight,
        });
        host.remove();

        const orientSel = body.querySelector("#sheetOrient")?.value || "auto";
        const landscape =
          orientSel === "landscape" ||
          (orientSel === "auto" && canvas.width > canvas.height * 1.05);

        // Recortar por páginas con márgenes (reutiliza lógica en pt A4)
        const margins = { top: 36, bottom: 36, left: 36, right: 36 };
        const { jsPDF } = jspdf;
        const pdf = new jsPDF({
          unit: "pt",
          format: "a4",
          orientation: landscape ? "landscape" : "portrait",
        });
        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();
        const usableW = pageW - margins.left - margins.right;
        const usableH = pageH - margins.top - margins.bottom;
        const pxPerPt = canvas.width / usableW;
        const pageSlicePx = Math.max(1, Math.floor(usableH * pxPerPt));

        let srcY = 0;
        let pageIndex = 0;
        while (srcY < canvas.height) {
          const sliceH = Math.min(pageSlicePx, canvas.height - srcY);
          const pageCanvas = document.createElement("canvas");
          pageCanvas.width = canvas.width;
          pageCanvas.height = sliceH;
          const ctx = pageCanvas.getContext("2d");
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
          ctx.drawImage(canvas, 0, srcY, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
          if (pageIndex > 0) pdf.addPage();
          pdf.addImage(
            pageCanvas.toDataURL("image/jpeg", 0.92),
            "JPEG",
            margins.left,
            margins.top,
            usableW,
            sliceH / pxPerPt
          );
          srcY += pageSlicePx;
          pageIndex += 1;
        }

        pdf.save(`${Aseo.baseName(file.name)}-${sheetName}.pdf`);
        Aseo.setStatus(status, `PDF de la hoja “${sheetName}” descargado.`);
      },
    });
  };

  /* ——— PDF → Excel ——— */
  window.AseoTools["pdf-a-excel"] = async function (body) {
    simpleDropUI(body, {
      lede: "Extrae el texto del PDF a Excel intentando detectar columnas.",
      browse: "Elegir PDF",
      runLabel: "Crear Excel",
      accept: "application/pdf,.pdf",
      multiple: false,
      filter: (f) => /\.pdf$/i.test(f.name) || f.type === "application/pdf",
      optionsHtml: `
        <label class="opt-row"><span>Modo</span>
          <select id="excelMode">
            <option value="table" selected>Detectar columnas</option>
            <option value="lines">Una fila por línea</option>
          </select>
        </label>`,
      onRun: async (files, { status }) => {
        Aseo.setStatus(status, "Extrayendo…");
        const data = new Uint8Array(await files[0].arrayBuffer());
        const pdf = await pdfjsLib.getDocument({ data: data.slice() }).promise;
        const mode = body.querySelector("#excelMode")?.value || "table";
        const wb = XLSX.utils.book_new();
        let totalCells = 0;

        if (mode === "lines") {
          const rows = [["Pagina", "Texto"]];
          for (let i = 1; i <= pdf.numPages; i++) {
            Aseo.setStatus(status, `Página ${i}/${pdf.numPages}…`);
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            const lines = pdfPageToStyledLines(content, page);
            lines.forEach((line) => rows.push([i, line.text]));
            totalCells += lines.length;
          }
          const ws = XLSX.utils.aoa_to_sheet(rows);
          ws["!cols"] = [{ wch: 10 }, { wch: 80 }];
          XLSX.utils.book_append_sheet(wb, ws, "PDF");
        } else {
          for (let i = 1; i <= pdf.numPages; i++) {
            Aseo.setStatus(status, `Página ${i}/${pdf.numPages}…`);
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            const table = pdfPageToTableRows(content);
            totalCells += table.reduce((n, r) => n + r.filter(Boolean).length, 0);
            const sheetName = `Pág ${i}`.slice(0, 31);
            const ws = XLSX.utils.aoa_to_sheet(table.length ? table : [[""]]);
            XLSX.utils.book_append_sheet(wb, ws, sheetName);
          }
        }

        if (!totalCells) {
          throw new Error(
            "Este PDF no tiene texto seleccionable (puede ser solo imagen)."
          );
        }

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
      lede: "Convierte un .pptx a PDF (diapositivas en orden; mejor con fotos/capturas).",
      browse: "Elegir PowerPoint",
      runLabel: "Convertir a PDF",
      accept: ".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation",
      multiple: false,
      filter: (f) => /\.pptx$/i.test(f.name),
      onRun: async (files, { status }) => {
        Aseo.setStatus(status, "Leyendo presentación…");
        const zip = await JSZip.loadAsync(await files[0].arrayBuffer());
        const { PDFDocument } = PDFLib;
        const doc = await PDFDocument.create();
        const slideW = 960;
        const slideH = 540;
        let added = 0;

        const perSlide = await getPptSlideImagePaths(zip);
        const queues =
          perSlide.length && perSlide.some((arr) => arr.length)
            ? perSlide
            : [
                Object.keys(zip.files)
                  .filter((p) => /^ppt\/media\//i.test(p) && /\.(png|jpe?g)$/i.test(p))
                  .sort(),
              ];

        for (let s = 0; s < queues.length; s++) {
          const paths = queues[s];
          if (!paths.length) continue;
          Aseo.setStatus(status, `Diapositiva ${s + 1}/${queues.length}…`);
          let best = null;
          for (const path of paths) {
            try {
              const bytes = await zip.file(path).async("uint8array");
              const img = /\.png$/i.test(path)
                ? await doc.embedPng(bytes)
                : await doc.embedJpg(bytes);
              if (!best || img.width * img.height > best.width * best.height) best = img;
            } catch (_) {
              /* skip */
            }
          }
          if (!best) continue;
          const page = doc.addPage([slideW, slideH]);
          const scale = Math.min(slideW / best.width, slideH / best.height);
          const w = best.width * scale;
          const h = best.height * scale;
          page.drawImage(best, {
            x: (slideW - w) / 2,
            y: (slideH - h) / 2,
            width: w,
            height: h,
          });
          added += 1;
        }

        if (!added) {
          throw new Error(
            "No se pudieron convertir las diapositivas. Este modo funciona mejor si el PPTX contiene imágenes PNG/JPG."
          );
        }
        Aseo.downloadBytes(
          await doc.save(),
          `${Aseo.baseName(files[0].name)}.pdf`,
          "application/pdf"
        );
        Aseo.setStatus(status, `PDF con ${added} diapositiva(s) descargado.`);
      },
    });
  };

  /* ——— HTML → PDF ——— */
  window.AseoTools["html-a-pdf"] = async function (body) {
    simpleDropUI(body, {
      lede: "Convierte un archivo .html local a PDF paginado (A4).",
      browse: "Elegir HTML",
      runLabel: "Convertir a PDF",
      accept: ".html,.htm,text/html",
      multiple: false,
      filter: (f) => /\.html?$/i.test(f.name) || f.type === "text/html",
      onRun: async (files, { status }) => {
        Aseo.setStatus(status, "Renderizando HTML…");
        const html = await files[0].text();
        const host = document.createElement("div");
        host.className = "html-capture html-doc-capture";
        host.innerHTML = html;
        document.body.appendChild(host);
        try {
          const pdf = await renderDomToPagedPdf(host, {
            top: 48,
            bottom: 48,
            left: 48,
            right: 48,
          });
          pdf.save(`${Aseo.baseName(files[0].name)}.pdf`);
          Aseo.setStatus(status, "PDF descargado.");
        } finally {
          host.remove();
        }
      },
    });
  };

})();
