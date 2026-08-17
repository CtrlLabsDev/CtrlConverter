/* global JSZip */

const drop = document.getElementById("drop");
const fileInput = document.getElementById("file");
const filesList = document.getElementById("files");
const runBtn = document.getElementById("run");
const clearBtn = document.getElementById("clear");
const bar = document.getElementById("bar");
const statusEl = document.getElementById("status");

const formatEl = document.getElementById("format");
const widthEl = document.getElementById("width");
const zipNameEl = document.getElementById("zipname");

const OUTPUT_QUALITY = 1;

let queue = []; // File[]

function humanBytes(bytes) {
  const units = ["B","KB","MB","GB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

function setProgress(pct, text) {
  bar.style.width = `${pct}%`;
  statusEl.textContent = text || "";
}

function addFiles(fileList) {
  const arr = Array.from(fileList).filter(f => f.type.startsWith("image/"));
  queue.push(...arr);
  render();
}

function render() {
  filesList.innerHTML = "";
  queue.forEach((f) => {
    const li = document.createElement("li");
    li.innerHTML = `<span>${f.name}</span><small>${humanBytes(f.size)}</small>`;
    filesList.appendChild(li);
  });
  setProgress(0, queue.length ? `${queue.length} imagem(ns) na fila.` : "Adicione imagens para começar.");
}

function baseName(name) {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

function extFor(fmt) {
  if (fmt === "jpeg") return "jpg";
  return fmt;
}

function mimeFor(fmt) {
  if (fmt === "webp") return "image/webp";
  if (fmt === "jpeg") return "image/jpeg";
  if (fmt === "png") return "image/png";
  return "image/webp";
}

async function fileToBitmap(file) {
  // createImageBitmap é rápido e eficiente
  return await createImageBitmap(file);
}

function resizeToCanvas(bitmap, maxWidth) {
  const srcW = bitmap.width;
  const srcH = bitmap.height;

  let outW = srcW;
  let outH = srcH;

  if (maxWidth && maxWidth > 0 && srcW > maxWidth) {
    outW = maxWidth;
    outH = Math.round((srcH * outW) / srcW);
  }

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;

  const ctx = canvas.getContext("2d", { alpha: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, outW, outH);

  return canvas;
}

function canvasToBlob(canvas, mime) {
  return new Promise((resolve) => {
    // qualidade só vale pra webp/jpeg
    const q = (mime === "image/webp" || mime === "image/jpeg")
      ? OUTPUT_QUALITY
      : undefined;

    canvas.toBlob((blob) => resolve(blob), mime, q);
  });
}

async function blobToUint8(blob) {
  const buf = await blob.arrayBuffer();
  return new Uint8Array(buf);
}

// UX: clique no drop abre seletor
drop.addEventListener("click", () => fileInput.click());
drop.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") fileInput.click();
});

// Drag & drop
drop.addEventListener("dragover", (e) => { e.preventDefault(); });
drop.addEventListener("drop", (e) => {
  e.preventDefault();
  addFiles(e.dataTransfer.files);
});

fileInput.addEventListener("change", (e) => addFiles(e.target.files));

clearBtn.addEventListener("click", () => {
  queue = [];
  render();
});

runBtn.addEventListener("click", async () => {
  if (!queue.length) return;

  runBtn.disabled = true;
  clearBtn.disabled = true;

  const fmt = formatEl.value;
  const maxW = Number(widthEl.value || 0);
  const zipName = (zipNameEl.value || "ctrlconverter").trim();

  // Checagem de suporte do browser ao mime escolhido
  const mime = mimeFor(fmt);
  const test = document.createElement("canvas");
  const testMimeOk = test.toDataURL(mime).startsWith(`data:${mime}`);
  if (!testMimeOk) {
    setProgress(0, `Seu navegador não suporta saída em ${fmt.toUpperCase()} aqui. Tente WebP/JPEG/PNG.`);
    runBtn.disabled = false;
    clearBtn.disabled = false;
    return;
  }

  const zip = new JSZip();

  try {
    for (let i = 0; i < queue.length; i++) {
      const file = queue[i];
      setProgress(Math.round((i / queue.length) * 100), `Processando ${i + 1}/${queue.length}: ${file.name}`);

      const bitmap = await fileToBitmap(file);
      const canvas = resizeToCanvas(bitmap, maxW);

      const outBlob = await canvasToBlob(canvas, mime);

      if (!outBlob) {
        throw new Error(`Falha ao gerar blob para ${file.name}`);
      }

      const outBytes = await blobToUint8(outBlob);
      const outName = `${baseName(file.name)}.${extFor(fmt)}`;

      zip.file(outName, outBytes);

      // cleanup
      bitmap.close?.();
    }

    setProgress(99, "Gerando ZIP…");
    const zipBlob = await zip.generateAsync({ type: "blob" });

    const a = document.createElement("a");
    a.href = URL.createObjectURL(zipBlob);
    a.download = `${zipName}.zip`;
    a.click();
    URL.revokeObjectURL(a.href);

    setProgress(100, "Concluído! ZIP baixado ✅");
  } catch (err) {
    console.error(err);
    setProgress(0, "Erro ao processar. Veja o console.");
  } finally {
    runBtn.disabled = false;
    clearBtn.disabled = false;
  }
});

// init
render();
