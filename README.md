# school-team-fighting

D-4 출장비 CSV를 업로드하면 출장신청서 PDF를 자동으로 만들어 주는 사내 도구입니다.

## 주요 기능

- **CSV → PDF 자동 변환**: D-4 출장비 시트(CSV)를 올리면 출장신청서 PDF를 한꺼번에 생성
- **결재 서명 자동 배치**: 결재자 서명 이미지(PNG/JPG)를 PDF 결재란에 삽입
- **기안자 손글씨 서명**: 거래처 첫 번째 이름을 손글씨 폰트(나눔펜)로 기안란에 표시
- **두 가지 생성 모드**:
  - **바로 생성** — ZIP 한 개로 전체 PDF 다운로드
  - **미리보기** — PDF를 행마다 확인 후 개별 다운로드
- **결재 그룹 자동 감지**: CSV 파일명에서 iPF / 디미 그룹을 자동 인식
- **어드민 설정**: 서명 정책, 결재자 직위, 관리자 이메일을 Firebase에서 관리

## 기술 스택

| 영역 | 기술 |
|---|---|
| 프레임워크 | Next.js 16 (App Router) |
| 언어 | TypeScript |
| UI | React 19, Tailwind CSS, shadcn/ui (@base-ui/react) |
| PDF 생성 | @react-pdf/renderer |
| CSV 파싱 | papaparse |
| 파일 압축 | jszip |
| 인증/DB | Firebase Auth (Google), Firestore |
| 배포 | Vercel |

## 프로젝트 구조

```
src/
├── app/                        # Next.js App Router 페이지
│   ├── layout.tsx              # 루트 레이아웃 (AuthProvider, 폰트, 메타)
│   ├── page.tsx                # / → 로그인 여부에 따라 /trip 또는 /login 리다이렉트
│   ├── login/
│   │   └── page.tsx            # Google 로그인 페이지
│   └── (app)/                  # 인증 필요 영역 (URL에 (app)은 안 나옴)
│       ├── layout.tsx          # LoginGate + AppShell (사이드바)
│       ├── trip/
│       │   └── page.tsx        # 출장신청서 도구 메인
│       └── admin/
│           └── page.tsx        # 어드민 설정 (서명 정책, 결재 그룹, 관리자)
│
├── components/
│   ├── trip-tool.tsx           # 3단계 플로우: 자료 입력 → 검토 → 결과
│   ├── pdf/
│   │   └── business-trip-document.tsx  # A4 출장신청서 PDF 레이아웃
│   ├── app-shell.tsx           # 반응형 레이아웃 (사이드바 + 메인)
│   ├── sidebar.tsx             # 좌측 네비게이션 (출장신청서, 어드민)
│   ├── auth-provider.tsx       # Firebase Auth Context
│   ├── login-gate.tsx          # 비인증 사용자 → /login 리다이렉트
│   └── ui/                     # shadcn/ui 컴포넌트 (button, input, dialog 등)
│
└── lib/
    ├── csv/
    │   └── parseD4.ts          # D-4 CSV 파싱, 날짜 변환, 경고 생성
    ├── approval/
    │   └── labels.ts           # 결재 그룹(iPF/디미) 라벨, 파일명 감지
    ├── names/
    │   └── parseName.ts        # 거래처에서 이름 추출
    ├── pdf/
    │   └── register-pdf-fonts.ts  # PDF용 폰트 등록 (Pretendard, 나눔펜)
    ├── firebase/
    │   ├── config.ts           # Firebase 앱 초기화 (lazy, SSR 안전)
    │   ├── auth.ts             # Google 로그인/로그아웃
    │   └── firestore.ts        # 어드민 이메일, 결재 설정 CRUD
    └── utils.ts                # cn() (clsx + tailwind-merge)
```

### 기타 파일

```
public/fonts/               # Pretendard, 나눔펜 폰트 파일
assets/signature_images/    # 기본 서명 이미지 원본 (iPF, 디미)
.cursor/rules/              # Cursor AI 디자인 시스템 규칙
```

## 시작하기

### 사전 준비

- Node.js 18 이상
- Firebase 프로젝트 (Auth + Firestore)

### 설치

```bash
npm install
```

### 환경 변수

`.env.local.example`을 `.env.local`로 복사하고 값을 채우세요:

```
NEXT_PUBLIC_FIREBASE_API_KEY=your-api-key
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
```

### Firebase 설정

1. [Firebase Console](https://console.firebase.google.com)에서 **Authentication** → Google 로그인 사용
2. **Firestore** 데이터베이스 생성
3. Firestore `admin_emails` 컬렉션에 초기 관리자 문서 추가:
   - 문서 ID: `your-email@iportfolio.co.kr`
   - 필드: `email` (string), `addedBy` (string) = `"seed"`

### 개발 서버

```bash
npm run dev
```

`http://localhost:3000`에서 확인하세요.

### 빌드

```bash
npm run build
```

## 사용 방법

1. `@iportfolio.co.kr` Google 계정으로 로그인
2. **1단계 — 자료**: D-4 출장비 CSV 파일 업로드, 결재 서명 이미지 첨부 (선택)
3. **2단계 — 검토**: 파싱된 데이터 확인, 누락 항목 점검
4. **3단계 — 결과**: ZIP 또는 개별 PDF 다운로드

## 배포

Vercel에 연결하고 환경 변수 2개를 설정하면 자동 배포됩니다.
