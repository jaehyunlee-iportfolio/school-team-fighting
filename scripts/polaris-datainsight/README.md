# Polaris AI DataInsight Doc Extract — Tester

`.hwp` / `.hwpx` / `.docx` / `.pptx` / `.xlsx` 문서를 [Polaris AI DataInsight](https://datainsight.polarisoffice.com)
Doc Extract API로 추출하고 결과를 GUI에서 바로 확인하는 테스트 스크립트.

## 설치

```bash
pip3 install --user --break-system-packages -r scripts/requirements.txt
```

## API 키 설정

`.env` 파일을 만들고 키를 넣는다 (`.env.example` 참고).

```
POLARIS_DATAINSIGHT_API_KEY=datainsight-...
```

`.env`는 `.gitignore`에 의해 커밋되지 않음.

## 실행

```bash
python3 scripts/polaris-datainsight/gui.py
```

## 사용법

1. **입력 파일 선택** — `.hwp` / `.hwpx` / `.docx` / `.pptx` / `.xlsx` (≤ 25MB)
2. **추출 시작** 클릭 → API 호출 (최대 10분)
3. 결과 탭에서 확인:
   - **요약** — 페이지별 요소 카운트, 메타데이터
   - **표 (Markdown)** — 모든 표를 마크다운 테이블로 변환
   - **본문 텍스트** — 페이지별 텍스트 흐름
   - **원본 JSON** — unifiedSchema 전체

결과 ZIP과 JSON·이미지는 `output/` 폴더에 저장됨.

## 제약

| 항목 | 값 |
|------|-----|
| 최대 파일 크기 | 25MB |
| 타임아웃 | 10분 |
| Rate limit | 분당 10회 |
| 지원 형식 | `.hwp`, `.hwpx`, `.docx`, `.pptx`, `.xlsx` |

## 파일 구성

| 파일 | 역할 |
|------|------|
| `gui.py` | PySide6 GUI 진입점 |
| `extract.py` | API 호출 + ZIP 풀기 + JSON 파싱 + 표 마크다운 변환 |
| `pdf_render.py` | 추출 결과를 reportlab으로 보고서 PDF 생성 |
| `.env` | API 키 (gitignore됨) |
| `output/` | 추출 결과 저장 (gitignore됨) |
