/* global pdfjsLib, PDFLib, JSZip, XLSX, docx, html2canvas, jspdf */

window.Aseo = window.Aseo || {};

(function (Aseo) {
  "use strict";

  if (typeof pdfjsLib !== "undefined") {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }

  Aseo.downloadBlob = function (blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  Aseo.downloadBytes = function (bytes, filename, type) {
    Aseo.downloadBlob(new Blob([bytes], { type: type || "application/octet-stream" }), filename);
  };

  Aseo.baseName = function (name) {
    return (name || "archivo").replace(/\.[^.]+$/, "");
  };

  Aseo.readAsArrayBuffer = function (file) {
    return file.arrayBuffer();
  };

  Aseo.readAsDataURL = function (file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  Aseo.readAsText = function (file) {
    return file.text();
  };

  Aseo.loadImage = function (src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  };

  Aseo.formatBytes = function (n) {
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    return (n / (1024 * 1024)).toFixed(1) + " MB";
  };

  Aseo.setStatus = function (el, msg, isError) {
    if (!el) return;
    el.textContent = msg || "";
    el.classList.toggle("is-error", !!isError);
  };

  /** Generic multi-file drop UI helper */
  Aseo.bindDropzone = function (opts) {
    const {
      dropzone,
      input,
      browseBtn,
      accept,
      multiple,
      onFiles,
    } = opts;

    if (accept) input.setAttribute("accept", accept);
    input.multiple = !!multiple;

    const open = () => input.click();
    if (browseBtn) browseBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      open();
    });
    dropzone.addEventListener("click", (e) => {
      if (e.target.closest("button, a, input, label")) return;
      open();
    });
    dropzone.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });

    input.addEventListener("change", () => {
      if (input.files && input.files.length) onFiles([...input.files]);
      input.value = "";
    });

    ["dragenter", "dragover"].forEach((ev) => {
      dropzone.addEventListener(ev, (e) => {
        e.preventDefault();
        dropzone.classList.add("dragover");
      });
    });
    ["dragleave", "drop"].forEach((ev) => {
      dropzone.addEventListener(ev, (e) => {
        e.preventDefault();
        dropzone.classList.remove("dragover");
      });
    });
    dropzone.addEventListener("drop", (e) => {
      const files = [...(e.dataTransfer.files || [])];
      if (files.length) onFiles(files);
    });
  };

  Aseo.renderToolChrome = function (root, tool) {
    root.innerHTML = `
      <div class="tool-page">
        <a class="btn btn-back" href="#/">← Todas las herramientas</a>
        <header class="tool-header">
          <p class="tool-kicker">${tool.category}</p>
          <h1>${tool.name}</h1>
          <p class="tool-desc">${tool.desc}</p>
        </header>
        <div id="toolBody" class="tool-body"></div>
      </div>
    `;
    return root.querySelector("#toolBody");
  };

  Aseo.fileListHtml = function (files) {
    if (!files.length) return "";
    return `
      <ul class="file-list">
        ${files
          .map(
            (f, i) => `
          <li>
            <span class="file-list-name">${f.name}</span>
            <span class="file-list-meta">${Aseo.formatBytes(f.size)}</span>
            <button type="button" class="btn btn-ghost btn-sm" data-remove="${i}">Quitar</button>
          </li>`
          )
          .join("")}
      </ul>
    `;
  };

  Aseo.pdfPageToCanvas = async function (page, scale) {
    const viewport = page.getViewport({ scale: scale || 2 });
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas;
  };

  Aseo.TOOLS = [
    {
      id: "quitar-anuncios",
      name: "Quitar anuncios",
      category: "Organizar",
      desc: "Elimina páginas y recorta márgenes de publicidad.",
      icon: "✂",
    },
    {
      id: "unir-pdf",
      name: "Unir PDF",
      category: "Organizar",
      desc: "Combina varios PDF en uno solo.",
      icon: "⧉",
    },
    {
      id: "dividir-pdf",
      name: "Dividir PDF",
      category: "Organizar",
      desc: "Separa páginas en grupos y descarga un PDF por grupo.",
      icon: "⊟",
    },
    {
      id: "rotar-pdf",
      name: "Rotar PDF",
      category: "Organizar",
      desc: "Rota el PDF entero o página a página, con vista previa.",
      icon: "↻",
    },
    {
      id: "comprimir-pdf",
      name: "Comprimir PDF",
      category: "Organizar",
      desc: "Reduce el peso re-renderizando páginas.",
      icon: "▽",
    },
    {
      id: "firmar-pdf",
      name: "Firmar PDF",
      category: "Editar",
      desc: "Dibuja o sube tu firma y colócala en las páginas.",
      icon: "✎",
    },
    {
      id: "proteger-pdf",
      name: "Proteger PDF",
      category: "Editar",
      desc: "Añade o quita contraseña de apertura (AES-256).",
      icon: "⊛",
    },
    {
      id: "marca-agua",
      name: "Marca de agua",
      category: "Editar",
      desc: "Texto o imagen/logo, con color, vista previa y numeración.",
      icon: "〰",
    },
    {
      id: "redactar-pdf",
      name: "Tachar datos",
      category: "Editar",
      desc: "Cubre información sensible con negro (irrecuperable).",
      icon: "█",
    },
    {
      id: "jpg-a-pdf",
      name: "JPG a PDF",
      category: "Convertir",
      desc: "Junta JPG/PNG en un PDF, con vista previa de orientación.",
      icon: "▣",
    },
    {
      id: "pdf-a-jpg",
      name: "PDF a JPG",
      category: "Convertir",
      desc: "Exporta cada página del PDF como imagen JPG.",
      icon: "◉",
    },
    {
      id: "pdf-a-png",
      name: "PDF a PNG",
      category: "Convertir",
      desc: "Exporta cada página del PDF como imagen PNG.",
      icon: "◎",
    },
    {
      id: "word-a-pdf",
      name: "Word a PDF",
      category: "Convertir",
      desc: "Convierte .docx a PDF respetando páginas y márgenes.",
      icon: "W",
    },
    {
      id: "pdf-a-word",
      name: "PDF a Word",
      category: "Convertir",
      desc: "PDF a Word con vista de página y texto con estilos.",
      icon: "¶",
    },
    {
      id: "excel-a-pdf",
      name: "Excel a PDF",
      category: "Convertir",
      desc: "Pasa una hoja de Excel/CSV a PDF paginado.",
      icon: "▦",
    },
    {
      id: "pdf-a-excel",
      name: "PDF a Excel",
      category: "Convertir",
      desc: "Extrae texto del PDF a Excel (con detección de columnas).",
      icon: "▤",
    },
    {
      id: "ppt-a-pdf",
      name: "PowerPoint a PDF",
      category: "Convertir",
      desc: "Convierte .pptx a PDF en el orden de las diapositivas.",
      icon: "▶",
    },
    {
      id: "html-a-pdf",
      name: "HTML a PDF",
      category: "Convertir",
      desc: "Convierte HTML local a PDF A4 paginado.",
      icon: "</>",
    },
  ];

  Aseo.getTool = function (id) {
    return Aseo.TOOLS.find((t) => t.id === id);
  };
})(window.Aseo);
