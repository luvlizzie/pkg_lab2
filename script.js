const fileInput = document.getElementById('fileInput');
const fileCount = document.getElementById('fileCount');
const tbody = document.querySelector('#resultTable tbody');
const progress = document.getElementById('progress');

const processedFiles = new Set();
let fileQueue = [];
const BATCH_SIZE = 50;

fileInput.addEventListener('change', async (e) => {
  fileQueue = [...e.target.files];
  tbody.innerHTML = "";
  processedFiles.clear();
  
  fileCount.textContent = `Выбрано файлов: ${fileQueue.length}`;
  progress.textContent = `Обработано 0 из ${fileQueue.length}`;
  
  processBatch(fileQueue.length, 0);
});

async function processBatch(total, done) {
  const batch = fileQueue.splice(0, BATCH_SIZE);

  for (const file of batch) {
    const ext = file.name.split(".").pop().toLowerCase();
    if (!(file.type.startsWith("image/") || ["pcx","tif","tiff","gif","bmp"].includes(ext))) continue;

    const key = file.name + "_" + file.size;
    if (processedFiles.has(key)) continue;
    processedFiles.add(key);

    const row = document.createElement("tr");
    row.innerHTML = `<td>${file.name}</td>
                     <td>—</td>
                     <td>—</td>
                     <td>—</td>
                     <td>—</td>`;
    tbody.appendChild(row);

    const buf = await file.arrayBuffer();
    const view = new DataView(buf);
    let dpi = "—", depth = "—";

    try {

      if (ext === "jpg" || ext === "jpeg") {
        const img = new Image();
        img.onload = () => row.cells[1].textContent = `${img.width} × ${img.height}`;
        img.src = URL.createObjectURL(file);

        for (let i = 0; i < view.byteLength - 2; i++) {
          const marker = view.getUint16(i, false);
          if (marker >= 0xFFC0 && marker <= 0xFFC3) {
            depth = view.getUint8(i + 4) * view.getUint8(i + 5) + " бит"; 
            break;
          }
        }
        if (depth === "—") depth = "24 бит";

        let jpegCompression = "JPEG (неизвестно)";
        let foundJFIF = false;

        for (let i = 0; i < view.byteLength - 12; i++) {
          const marker = view.getUint16(i, false);
          if (marker === 0xFFC0) jpegCompression = "Baseline DCT (JPEG)";
          if (marker === 0xFFC2) jpegCompression = "Progressive DCT (JPEG)";

          if (!foundJFIF && view.getUint32(i, false) === 0x4A464946) { 
            foundJFIF = true;
            const units = view.getUint8(i + 7);
            const xd = view.getUint16(i + 8, false);
            const yd = view.getUint16(i + 10, false);

            if (units === 1) dpi = `${xd} × ${yd} dpi`;
            else if (units === 2) dpi = `${Math.round(xd * 2.54)} × ${Math.round(yd * 2.54)} dpi`;
          }
        }

        if (dpi === "—") dpi = "72 × 72 dpi";
        row.cells[4].textContent = jpegCompression;
      }

      else if (ext === "png") {
        const img = new Image();
        img.onload = () => row.cells[1].textContent = `${img.width} × ${img.height}`;
        img.src = URL.createObjectURL(file);

        if (view.getUint32(12, false) === 0x49484452) { 
          const bitDepth = view.getUint8(24);
          const colorType = view.getUint8(25);
          let channels = {0:1,2:3,3:1,4:2,6:4}[colorType] || 3;
          depth = `${bitDepth * channels} бит`;
        }

        let foundDpi = false;
        let i = 8;
        while (i < view.byteLength) {
          const length = view.getUint32(i, false);
          const type = view.getUint32(i + 4, false);
          if (type === 0x70485973) { 
            const xppu = view.getUint32(i + 8, false);
            const unit = view.getUint8(i + 16);
            if (unit === 1) dpi = `${Math.round(xppu * 0.0254)} dpi`;
            foundDpi = true;
            break;
          }
          i += 12 + length;
        }
        if (!foundDpi) dpi = "72 × 72 dpi";
        row.cells[4].textContent = "Deflate (PNG)";
      }

      else if (ext === "gif") {
        const w = view.getUint16(6, true);
        const h = view.getUint16(8, true);
        row.cells[1].textContent = `${w} × ${h}`;
        const packed = view.getUint8(10);
        const n = packed & 0b00000111;
        const colors = 2 ** (n + 1);
        depth = `8 бит (палитра, ${colors} цветов)`;
        dpi = "72 × 72 dpi";
        row.cells[4].textContent = "LZW (GIF)";
      }

      else if (ext === "bmp") {
        const w = view.getInt32(18, true);
        const h = Math.abs(view.getInt32(22, true));
        row.cells[1].textContent = `${w} × ${h}`;

        const bpp = view.getUint16(28, true);
        depth = `${bpp} бит`;

        const xppm = view.getInt32(38, true);
        const yppm = view.getInt32(42, true);
        if (xppm > 0 && yppm > 0) dpi = `${Math.round(xppm * 0.0254)} × ${Math.round(yppm * 0.0254)} dpi`;
        else dpi = "72 × 72 dpi";

        row.cells[4].textContent = "RLE / None (BMP)";
      }

      else if (ext === "tif" || ext === "tiff") {
        depth = "обычно 24 бит";
        dpi = "72 × 72 dpi";

        const img = new Image();
        img.onload = () => row.cells[1].textContent = `${img.width} × ${img.height}`;
        img.src = URL.createObjectURL(file);

        row.cells[4].textContent = "TIFF";
      }

      else if (ext === "pcx") {
        const w = view.getUint16(8, true) - view.getUint16(4, true) + 1;
        const h = view.getUint16(10, true) - view.getUint16(6, true) + 1;
        row.cells[1].textContent = `${w} × ${h}`;

        const bpp = view.getUint8(3) * view.getUint8(65);
        depth = `${bpp} бит`;

        dpi = `${view.getUint16(12, true)} dpi`;
        row.cells[4].textContent = "RLE (PCX)";
      }

    } catch(e){}

    row.cells[2].textContent = dpi;
    row.cells[3].textContent = depth;

    done++;
    progress.textContent = `Обработано ${done} из ${total}`;
  }

  if (fileQueue.length > 0) {
    setTimeout(() => processBatch(total, done), 30);
  }
}
