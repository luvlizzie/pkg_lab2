const fileInput = document.getElementById('fileInput');
const fileCount = document.getElementById('fileCount');
const tbody = document.querySelector('#resultTable tbody');
const progress = document.getElementById('progress');

const processedFiles = new Set();
let fileQueue = [];
const BATCH_SIZE = 50;

function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

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

        let dpi = "—";
        let depthStr = "—";
        let width = 0, height = 0;
        let compressionType = "Неизвестно";
        let bppForCalc = 0;

        try {
            if (ext === "jpg" || ext === "jpeg") {
                compressionType = "JPEG (DCT)";
                let bitsPerPixel = 0;
              
                for (let i = 0; i < view.byteLength - 2; i++) {
                    const marker = view.getUint16(i, false);
                    if (marker >= 0xFFC0 && marker <= 0xFFC3) {
                        const precision = view.getUint8(i + 4);
                        height = view.getUint16(i + 5, false);
                        width = view.getUint16(i + 7, false);
                        const components = view.getUint8(i + 9);
                        bitsPerPixel = precision * components;
                        depthStr = bitsPerPixel + " бит";

                        if (marker === 0xFFC0) compressionType = "JPEG (Baseline)";
                        if (marker === 0xFFC2) compressionType = "JPEG (Progressive)";
                        break;
                    }
                }
                if (!bitsPerPixel) bitsPerPixel = 24;
                bppForCalc = bitsPerPixel;

                let foundJFIF = false;
                for (let i = 0; i < view.byteLength - 12; i++) {
                    if (!foundJFIF && view.getUint32(i, false) === 0x4A464946) {
                        foundJFIF = true;
                        const units = view.getUint8(i + 7);
                        const xd = view.getUint16(i + 8, false);
                        const yd = view.getUint16(i + 10, false);
                        if (xd > 0 && yd > 0) {
                            if (units === 1) dpi = (xd === yd) ? `${xd} dpi` : `${xd}x${yd} dpi`;
                            else if (units === 2) dpi = `${Math.round(xd * 2.54)} dpi`;
                        }
                    }
                }
                if (dpi === "—") dpi = "72 dpi";
            }
            else if (ext === "png") {
                compressionType = "Deflate (LZ77)";
                if (view.getUint32(12, false) === 0x49484452) {
                    width = view.getUint32(16, false);
                    height = view.getUint32(20, false);
                    const bitDepth = view.getUint8(24);
                    const colorType = view.getUint8(25);
                    let channels = {0:1, 2:3, 3:1, 4:2, 6:4}[colorType] || 3;

                    bppForCalc = bitDepth * channels;
                    depthStr = `${bppForCalc} бит`;
                }
                let i = 8;
                while (i < view.byteLength) {
                    const length = view.getUint32(i, false);
                    const type = view.getUint32(i + 4, false);
                    if (type === 0x70485973) { 
                        const xppu = view.getUint32(i + 8, false);
                        if (view.getUint8(i + 16) === 1) {
                            dpi = Math.round(xppu * 0.0254) + " dpi";
                        }
                        break;
                    }
                    i += 12 + length;
                }
                if (dpi === "—") dpi = "72 dpi";
            }
            else if (ext === "gif") {
                compressionType = "LZW";
                width = view.getUint16(6, true);
                height = view.getUint16(8, true);
                const packed = view.getUint8(10);
                const colors = 2 ** ((packed & 7) + 1);
                depthStr = `8 бит (${colors} цв.)`;
                bppForCalc = 8;
                dpi = "72 dpi";
            }
            else if (ext === "bmp") {
                width = Math.abs(view.getInt32(18, true));
                height = Math.abs(view.getInt32(22, true));
                const bpp = view.getUint16(28, true);
                depthStr = bpp + " бит";
                bppForCalc = bpp;

                const compMethod = view.getUint32(30, true);
                compressionType = (compMethod === 0) ? "Без сжатия" : "RLE / Bitfields";

                const xppm = view.getInt32(38, true);
                const yppm = view.getInt32(42, true);

                if (xppm > 0 && yppm > 0) {
                    const xDpi = Math.round(xppm * 0.0254);
                    const yDpi = Math.round(yppm * 0.0254);
                    dpi = (xDpi === yDpi) ? `${xDpi} dpi` : `${xDpi}x${yDpi} dpi`;
                } else {
                    dpi = "72 dpi";
                }
            }
            else if (ext === "pcx") {
                compressionType = "RLE";
                width = view.getUint16(8, true) - view.getUint16(4, true) + 1;
                height = view.getUint16(10, true) - view.getUint16(6, true) + 1;
                const planes = view.getUint8(65);
                const bppPlane = view.getUint8(3);
                bppForCalc = planes * bppPlane;
                depthStr = bppForCalc + " бит";
                
                const xDpi = view.getUint16(12, true);
                const yDpi = view.getUint16(14, true);
                if (xDpi > 0) {
                    dpi = (xDpi === yDpi) ? `${xDpi} dpi` : `${xDpi}x${yDpi} dpi`;
                } else {
                    dpi = "72 dpi";
                }
            }
            else if (ext === "tif" || ext === "tiff") {
                compressionType = "TIFF (Container)";
                const img = new Image();
                await new Promise(r => {
                    img.onload = r;
                    img.onerror = r;
                    img.src = URL.createObjectURL(file);
                });
                width = img.width;
                height = img.height;
                depthStr = "24 бит";
                bppForCalc = 24;
                dpi = "72 dpi";
            }
            const fileSizeStr = formatBytes(file.size);
            row.cells[1].innerHTML = `<b>${width} × ${height}</b><br><span style="color:#7f8c8d">${fileSizeStr}</span>`;
            row.cells[2].textContent = dpi;
            row.cells[3].textContent = depthStr;

            let compDetails = `<span style="font-weight:bold; color:#8e44ad; display:block; margin-bottom:4px;">${compressionType}</span>`;

            if (width > 0 && height > 0 && bppForCalc > 0) {
                const rawBytes = (width * height * bppForCalc) / 8;
                const rawSizeStr = formatBytes(rawBytes);

                const ratio = (rawBytes / file.size);
                const ratioStr = ratio.toFixed(1);

                const savedPercent = ((1 - (file.size / rawBytes)) * 100).toFixed(1);

                let analysisClass = "comp-stat";
                let explanation = "";

                if (ratio > 1) {
                    explanation = `Сжат в <b style="color:#27ae60; font-weight:600">${ratioStr} раз</b><br>` +
                    `Экономия: ${savedPercent}%<br>` +
                    `<small>В памяти (Raw): ${rawSizeStr}</small>`;
                } else if (ratio === 1) {
                    explanation = `Без изменений (1:1)<br><small>Raw: ${rawSizeStr}</small>`;
                } else {
                    explanation = `<span style="color:#c0392b">Файл больше Raw на ${Math.abs(savedPercent)}%</span><br>` +
                    `<small>Raw: ${rawSizeStr}</small>`;
                }

                compDetails += `<span style="font-size:0.9em; color:#555; display:block">${explanation}</span>`;
            } else {
                compDetails += `<span style="font-size:0.9em; color:#555; display:block">Нет данных для расчета</span>`;
            }

            row.cells[4].innerHTML = compDetails;

        } catch(err) {
            console.error(err);
            row.cells[1].textContent = "Ошибка чтения";
            row.cells[4].textContent = "Ошибка анализа";
        }

        done++;
        progress.textContent = `Обработано ${done} из ${total}`;
    }

    if (fileQueue.length > 0) {
        setTimeout(() => processBatch(total, done), 20);
    }
}
