// Client-side receipt photo compression, so uploads stay fast on mobile data.
// Always re-encodes to JPEG, regardless of the source format.

function canvasToBlob(canvas, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Downscales to maxDim on the long edge, then steps JPEG quality down until
// under maxBytes (or the quality floor is hit). Returns { base64, mimeType }.
export function compressImage(file, { maxBytes = 200 * 1024, maxDim = 1600 } = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = async () => {
      URL.revokeObjectURL(objectUrl);
      try {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);

        let quality = 0.8;
        let blob = await canvasToBlob(canvas, quality);
        while (blob.size > maxBytes && quality > 0.3) {
          quality -= 0.1;
          blob = await canvasToBlob(canvas, quality);
        }

        const base64 = await blobToBase64(blob);
        resolve({ base64, mimeType: "image/jpeg" });
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not load image"));
    };

    img.src = objectUrl;
  });
}
