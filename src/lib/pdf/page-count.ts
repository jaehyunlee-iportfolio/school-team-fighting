/**
 * react-pdf로 만든 PDF Blob의 페이지 수를 빠르게 추정.
 * PDF 카탈로그의 `/Type /Page` (단, `/Pages` 제외) 객체 수를 카운트한다.
 * 페이지 트리에 비표준 형식이 섞이면 부정확할 수 있지만, 본 프로젝트의
 * react-pdf 산출물에는 충분히 정확하다.
 */
export async function getPdfPageCount(blob: Blob): Promise<number> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let text = "";
  const chunk = 65536;
  for (let i = 0; i < bytes.length; i += chunk) {
    text += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunk))
    );
  }
  const matches = text.match(/\/Type\s*\/Page(?![A-Za-z])/g);
  return matches ? matches.length : 1;
}
