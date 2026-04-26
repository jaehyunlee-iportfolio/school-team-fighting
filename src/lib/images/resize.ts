/**
 * 업로드 사진을 PDF 임베드용으로 축소/JPEG 변환.
 * - 가로/세로 중 긴 변을 max로 맞춤 (그보다 작으면 원본 비율 유지)
 * - JPEG로 인코딩하여 data URL 반환 → @react-pdf Image로 바로 사용 가능
 */
export async function resizeImageToDataUrl(
  file: File,
  max: number = 1600,
  quality: number = 0.85
): Promise<string> {
  const dataUrl = await readAsDataUrl(file);
  const img = await loadImage(dataUrl);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const longest = Math.max(w, h);
  const scale = longest > max ? max / longest : 1;
  const dw = Math.round(w * scale);
  const dh = Math.round(h * scale);

  const canvas = document.createElement("canvas");
  canvas.width = dw;
  canvas.height = dh;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(img, 0, 0, dw, dh);
  return canvas.toDataURL("image/jpeg", quality);
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("이미지 로드 실패"));
    img.src = src;
  });
}
