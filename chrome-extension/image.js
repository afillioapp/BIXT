// Ported from expense-tracker/lib/image.js. The web app's version takes a
// File and does its own crop-free resize; here the content script has
// already drawn the cropped selection onto a canvas (see content-script.js),
// so this just owns the "step JPEG quality down until small enough" part.

function bxCanvasToBlob(canvas, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

function bxBlobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Steps JPEG quality down until under maxBytes (or the quality floor is
// hit). Returns { base64, mimeType }.
async function bxCompressCanvas(canvas, { maxBytes = 200 * 1024 } = {}) {
  let quality = 0.8;
  let blob = await bxCanvasToBlob(canvas, quality);
  while (blob.size > maxBytes && quality > 0.3) {
    quality -= 0.1;
    blob = await bxCanvasToBlob(canvas, quality);
  }
  const base64 = await bxBlobToBase64(blob);
  return { base64, mimeType: "image/jpeg" };
}
