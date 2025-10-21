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
    if (!(file.type.startsWith("image/") || ["pcx","tif","tiff","gif"].includes(ext))) continue;

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
        img.onload = () => row.cells[1].textContent = img.width + " × " + img.height;
        img.src = URL.createObjectURL(file);
        depth = "24 бит";
        for (let i = 2; i < view.byteLength - 11; i++) {
          if (view.getUint32(i, false) === 0x4A464946) {
            const units = view.getUint8(i+7);
            const xdpi = view.getUint16(i+8, false);
            if (units === 1) dpi = xdpi + " dpi";
            break;
          }
          if (view.getUint16(i, false) === 0x011A) {
            const num = view.getUint32(i+8, true);
            const den = view.getUint32(i+12, true);
            if (den !== 0) dpi = Math.round(num/den) + " dpi";
          }
        }
      } 
      else if (ext === "png") {
        const img = new Image();
        img.onload = () => row.cells[1].textContent = img.width + " × " + img.height;
        img.src = URL.createObjectURL(file);
        if (view.getUint32(12, false) === 0x49484452) {
          const bitDepth = view.getUint8(24);
          const colorType = view.getUint8(25);
          let channels = {0:1,2:3,3:1,4:2,6:4}[colorType] || 3;
          depth = (bitDepth * channels) + " бит";
        }
        let i = 8;
        while (i < view.byteLength) {
          const length = view.getUint32(i, false);
          const type = view.getUint32(i+4, false);
          if (type === 0x70485973) {
            const xppu = view.getUint32(i+8, false);
            const unit = view.getUint8(i+16);
            if (unit === 1) dpi = Math.round(xppu * 0.0254) + " dpi";
            break;
          }
          i += 12 + length;
        }
      } 
      else if (ext === "gif") {
        const w = view.getUint16(6, true);
        const h = view.getUint16(8, true);
        row.cells[1].textContent = w + " × " + h;
        const packed = view.getUint8(10);
        const n = packed & 0b00000111;
        const colors = 2 ** (n+1);
        depth = "8 бит (палитра, " + colors + " цветов)";
      } 
      else if (ext === "bmp") {
        const w = view.getInt32(18, true);
        const h = view.getInt32(22, true);
        row.cells[1].textContent = w + " × " + Math.abs(h);
        const bpp = view.getUint16(28, true);
        depth = bpp + " бит";
        const xppm = view.getInt32(38, true);
        if (xppm > 0) dpi = Math.round(xppm * 0.0254) + " dpi";
      } 
      else if (ext === "tif" || ext === "tiff") {
        depth = "обычно 24 бит";
        dpi = "—";
        const img = new Image();
        img.onload = () => row.cells[1].textContent = img.width + " × " + img.height;
        img.src = URL.createObjectURL(file);
      } 
      else if (ext === "pcx") {
        const w = view.getUint16(8, true) - view.getUint16(4, true) + 1;
        const h = view.getUint16(10, true) - view.getUint16(6, true) + 1;
        row.cells[1].textContent = w + " × " + h;
        const bpp = view.getUint8(3) * view.getUint8(65);
        depth = bpp + " бит";
        dpi = view.getUint16(12, true) + " dpi";
      }
    } catch(e){}

    let comp = "—";
    if (ext.includes("jpg")) comp = "JPEG";
    else if (ext.includes("png")) comp = "Deflate (PNG)";
    else if (ext.includes("gif")) comp = "LZW (GIF)";
    else if (ext.includes("bmp")) comp = "RLE / None (BMP)";
    else if (ext.includes("tif")) comp = "TIFF";
    else if (ext.includes("pcx")) comp = "RLE (PCX)";

    row.cells[2].textContent = dpi;
    row.cells[3].textContent = depth;
    row.cells[4].textContent = comp;
    done++;
    progress.textContent = `Обработано ${done} из ${total}`;
  }

  if (fileQueue.length > 0) {
    setTimeout(() => processBatch(total, done), 30);
  }
}