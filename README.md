# AseoPDF

Suite estática para organizar y convertir PDFs (y formatos habituales) **en el navegador**. Sin Python, sin servidor: apta para **GitHub Pages**.

## Herramientas

### Organizar
- **Quitar anuncios** — excluir páginas y recortar márgenes
- **Unir PDF**
- **Dividir PDF**
- **Rotar PDF**
- **Comprimir PDF** (rasteriza páginas)

### Convertir
- JPG / PNG → PDF
- PDF → JPG / PNG
- Word (.docx) → PDF *(aproximado)*
- PDF → Word *(texto extraído a .doc)*
- Excel / CSV → PDF
- PDF → Excel *(texto por líneas)*
- PowerPoint (.pptx) → PDF *(imágenes embebidas)*
- HTML → PDF

Las conversiones Office son best-effort en cliente: no replican la fidelidad de un convertidor en servidor.

## Uso local

```bash
# desde esta carpeta
python -m http.server 8080
```

Abre `http://127.0.0.1:8080/`.

## GitHub Pages

1. Sube el contenido de esta carpeta a un repositorio.
2. **Settings → Pages** → branch `main` → `/ (root)`.
3. Abre la URL del sitio.

## Privacidad

Los archivos no se suben a ningún servidor; el procesamiento ocurre en tu máquina.
