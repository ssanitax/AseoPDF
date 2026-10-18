/* global Aseo, AseoTools */

(function () {
  "use strict";

  const hubView = document.getElementById("hubView");
  const toolView = document.getElementById("toolView");
  const toolRoot = document.getElementById("toolRoot");
  const toolsGrid = document.getElementById("toolsGrid");
  const searchInput = document.getElementById("searchInput");

  function renderHub(filter) {
    const q = (filter || "").trim().toLowerCase();
    const tools = Aseo.TOOLS.filter((t) => {
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.desc.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q)
      );
    });

    const categories = [...new Set(tools.map((t) => t.category))];
    toolsGrid.innerHTML = categories
      .map((cat) => {
        const cards = tools
          .filter((t) => t.category === cat)
          .map(
            (t) => `
          <a class="tool-card" href="#/${t.id}">
            <span class="tool-card-icon" aria-hidden="true">${t.icon}</span>
            <span class="tool-card-body">
              <span class="tool-card-name">${t.name}</span>
              <span class="tool-card-desc">${t.desc}</span>
            </span>
          </a>`
          )
          .join("");
        return `
          <section class="tool-section">
            <h2>${cat}</h2>
            <div class="tool-cards">${cards}</div>
          </section>`;
      })
      .join("");

    if (!tools.length) {
      toolsGrid.innerHTML = `<p class="empty-search">No hay herramientas para “${filter}”.</p>`;
    }
  }

  async function showTool(id) {
    const tool = Aseo.getTool(id);
    if (!tool) {
      location.hash = "#/";
      return;
    }
    hubView.classList.add("hidden");
    toolView.classList.remove("hidden");
    const body = Aseo.renderToolChrome(toolRoot, tool);
    const runner = AseoTools[id];
    if (!runner) {
      body.innerHTML = `<p class="status is-error">Esta herramienta aún no está disponible.</p>`;
      return;
    }
    await runner(body, tool);
  }

  function showHub() {
    toolView.classList.add("hidden");
    hubView.classList.remove("hidden");
    toolRoot.innerHTML = "";
    renderHub(searchInput.value);
  }

  function route() {
    const hash = location.hash.replace(/^#\/?/, "");
    if (!hash || hash === "/") showHub();
    else showTool(hash).catch((err) => {
      console.error(err);
      toolRoot.innerHTML = `<p class="status is-error">Error al cargar la herramienta.</p>`;
    });
  }

  searchInput.addEventListener("input", () => {
    if (!hubView.classList.contains("hidden")) renderHub(searchInput.value);
  });

  window.addEventListener("hashchange", route);
  renderHub("");
  route();
})();
