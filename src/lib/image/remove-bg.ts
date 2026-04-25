export type CropBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Replace white-ish pixels with transparent ones on a canvas copy of `img`.
 * Pixels where R, G, B are all > `threshold` get alpha set to 0.
 */
export function removeWhiteBackground(
  img: HTMLImageElement,
  threshold = 230,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] > threshold && d[i + 1] > threshold && d[i + 2] > threshold) {
      d[i + 3] = 0;
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/**
 * Find the bounding box of all non-transparent pixels in `canvas`.
 * Returns percentage-based bounds (0-100) suitable for react-image-crop.
 * If the image is fully transparent, returns the full canvas area.
 */
export function autoCropBounds(canvas: HTMLCanvasElement): CropBounds {
  const ctx = canvas.getContext("2d")!;
  const { width: w, height: h } = canvas;
  const d = ctx.getImageData(0, 0, w, h).data;

  let minX = w;
  let minY = h;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const alpha = d[(y * w + x) * 4 + 3];
      if (alpha > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return { x: 0, y: 0, width: 100, height: 100 };
  }

  const pad = 4;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad);
  maxY = Math.min(h - 1, maxY + pad);

  return {
    x: (minX / w) * 100,
    y: (minY / h) * 100,
    width: ((maxX - minX + 1) / w) * 100,
    height: ((maxY - minY + 1) / h) * 100,
  };
}

/**
 * Crop `sourceCanvas` to the given pixel-based region and return a PNG data URL.
 */
export function cropCanvas(
  sourceCanvas: HTMLCanvasElement,
  pixelCrop: { x: number; y: number; width: number; height: number },
): string {
  const out = document.createElement("canvas");
  out.width = pixelCrop.width;
  out.height = pixelCrop.height;
  const ctx = out.getContext("2d")!;
  ctx.drawImage(
    sourceCanvas,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height,
  );
  return out.toDataURL("image/png");
}

/**
 * Load an image element from a data URL (or any src).
 */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("이미지를 불러올 수 없어요."));
    img.src = src;
  });
}
