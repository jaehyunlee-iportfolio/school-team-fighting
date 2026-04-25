# 출장신청서 PDF → Drive Desktop 자동 정리

웹 앱(`/trip`)에서 생성한 출장신청서 PDF들을 증빙번호별 Google Drive 폴더로 자동 이동/복사하는 CLI 스크립트.

## 동작 원리

1. PDF 파일명 규칙: `<증빙번호>_<원본파일명>.pdf`
   - 예: `D-4-1_1. 내부결재문서_출장신청서_이영규_제주_250624.pdf`
   - 웹 앱이 CSV 「비고(증빙번호)」 컬럼을 읽어 자동으로 prefix를 붙입니다.
2. 스크립트가 prefix를 파싱하여 Google Drive Desktop으로 동기화된 로컬 폴더의 매칭 하위 폴더로 이동:
   - `D-4-1_파일명.pdf` → `<drive>/D-4-1/파일명.pdf`
3. Drive Desktop이 자동으로 클라우드에 동기화.

## 준비

### 1. Python (3.9+)
```bash
python3 --version
```
macOS에는 기본 탑재되어 있어요.

### 2. tqdm 설치 (진행률 표시용, 선택)
```bash
pip3 install tqdm
```
없어도 동작합니다 (진행률만 안 보임).

### 3. Google Drive Desktop
- https://www.google.com/drive/download/ 에서 설치
- D-4.출장비 폴더가 **로컬 동기화** 활성화되어 있어야 함
- 동기화된 로컬 경로 확인 (보통)
  ```
  ~/Library/CloudStorage/GoogleDrive-<your_email>/My Drive/.../D-4.출장비
  ```

## 사용법

### 기본 (이동 + dry-run으로 먼저 확인 권장)
```bash
python3 scripts/upload_to_drive.py \
  --src ~/Downloads/출장신청서_PDFs \
  --drive "~/Library/CloudStorage/GoogleDrive-isprofound@iportfolio.co.kr/My Drive/D-4.출장비" \
  --dry-run
```

### 실제 이동
```bash
python3 scripts/upload_to_drive.py \
  --src ~/Downloads/출장신청서_PDFs \
  --drive "~/Library/CloudStorage/GoogleDrive-isprofound@iportfolio.co.kr/My Drive/D-4.출장비"
```

### 옵션

| 옵션 | 기본 | 설명 |
|---|---|---|
| `--src` | (필수) | PDF가 모여 있는 원본 폴더 |
| `--drive` | (필수) | Drive Desktop이 동기화한 D-4.출장비 폴더 경로 |
| `--mode {move,copy}` | `move` | move=원본 삭제, copy=원본 유지 |
| `--report PATH` | 자동 | CSV 결과 보고서 경로 (기본: `<src>/upload_report_<timestamp>.csv`) |
| `--dry-run` | off | 실제 이동 없이 시뮬레이션만 |
| `--overwrite` | off | 대상에 동명 파일 있으면 덮어쓰기 (기본은 `_dup1`, `_dup2` suffix) |

## 결과

### 콘솔 요약
```
처리 결과 요약  (총 12건)
  ✅ 성공         10
  ⚠️  증빙번호 누락 1
  ⚠️  폴더 없음     1
```

### CSV 보고서
| status | filename | evidence_no | target_folder | target_filename | reason |
|---|---|---|---|---|---|
| OK | D-4-1_홍길동.pdf | D-4-1 | .../D-4-1 | 홍길동.pdf | move 완료 |
| MISSING_PREFIX | UNKNOWN_김철수.pdf | | | | 파일명에 증빙번호 prefix 없음 |
| FOLDER_NOT_FOUND | D-4-999_박영희.pdf | D-4-999 | .../D-4-999 | 박영희.pdf | Drive에 D-4-999 폴더 없음 |
| ERROR | D-4-2_이영수.pdf | D-4-2 | .../D-4-2 | 이영수.pdf | PermissionError: ... |

## 문제 해결

| 증상 | 원인 / 해결 |
|---|---|
| `--drive 폴더를 찾을 수 없어요` | Drive Desktop 동기화 경로를 정확히. 경로에 공백 있으면 따옴표로 감싸기 |
| `D-4-XX 폴더 없음` | Drive에 해당 폴더가 없거나 동기화가 아직 끝나지 않음. Drive Desktop 동기화 상태 확인 |
| `MISSING_PREFIX` | 웹 앱에서 PDF 생성 전 CSV 「비고(증빙번호)」 컬럼이 비어 있는 행이었음. CSV 보완 후 재생성 |
| Drive 동기화가 안 됨 | Drive Desktop 앱이 실행 중인지, 로그인 상태인지, "스트리밍" vs "미러" 모드 확인 |

## 권장 워크플로우

1. 웹 앱 `/trip` 에서 출장신청서 PDF 일괄 생성 → ZIP 다운로드
2. ZIP 압축 풀기
3. **dry-run으로 먼저 확인**:
   ```bash
   python3 scripts/upload_to_drive.py --src <unzip된 폴더> --drive "<drive 경로>" --dry-run
   ```
4. CSV 보고서 + 콘솔 출력으로 매칭 결과 검토
5. 문제 없으면 `--dry-run` 빼고 실제 이동
6. Drive 웹/Desktop에서 동기화 완료 확인
