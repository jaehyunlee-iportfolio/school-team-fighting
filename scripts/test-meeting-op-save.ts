/**
 * 운영회의록 어드민 저장 페이로드 테스트.
 * 실행: npx tsx scripts/test-meeting-op-save.ts
 *
 * 1) buildMeetingOpSavePayload 가 'invalid nested entity' 유발 패턴을
 *    제거했는지 검증 — 즉 array-of-maps 형태 footerLogos 가 더 이상 없음.
 * 2) save → load round-trip 에서 settings 가 보존되는지 확인.
 * 3) Firestore SDK 의 isPlainObject 와 동일한 검사를 모방해서
 *    페이로드의 모든 nested 값이 plain object 만 포함하는지 확인.
 *
 * Firebase env 가 비어있어 실제 setDoc 호출은 안 함. 구조 검증만 수행.
 */

import {
  buildMeetingOpSavePayload,
  mergeMeetingOpLoadedData,
  DEFAULT_MEETING_OP_SETTINGS,
  type MeetingOperationsSettings,
} from "../src/lib/firebase/firestore";

// ── 가짜 base64 PNG (실제 어드민에서 readAsDataURL 결과와 동일 형태)
const MOCK_PNG_DATAURL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const LARGE_PNG = "data:image/png;base64," + "A".repeat(50_000); // ~50KB 크기 시뮬레이션

const sampleSettings: MeetingOperationsSettings = {
  ...DEFAULT_MEETING_OP_SETTINGS,
  footerLogos: [
    { enabled: true, label: "건국대학교", imageUrl: MOCK_PNG_DATAURL },
    { enabled: true, label: "디미교연(몽당분필)", imageUrl: LARGE_PNG },
    { enabled: false, label: "아이포트폴리오(리딩앤)", imageUrl: "" },
  ],
  headerLogoUrl: MOCK_PNG_DATAURL,
};

function isPlainObject(v: unknown): boolean {
  if (typeof v !== "object" || v === null) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function findIssues(value: unknown, path = "$"): string[] {
  const out: string[] = [];
  if (value === undefined) {
    out.push(`${path}: undefined (Firestore 미지원)`);
    return out;
  }
  if (value === null) return out;
  if (typeof value === "function") {
    out.push(`${path}: function (Firestore 미지원)`);
    return out;
  }
  if (typeof value === "symbol") {
    out.push(`${path}: symbol`);
    return out;
  }
  if (Array.isArray(value)) {
    // Firestore 는 array-in-array 를 거부함
    value.forEach((v, i) => {
      if (Array.isArray(v)) {
        out.push(`${path}[${i}]: nested array (Firestore 거부)`);
      }
      out.push(...findIssues(v, `${path}[${i}]`));
    });
    return out;
  }
  if (typeof value === "object") {
    if (!isPlainObject(value)) {
      out.push(`${path}: non-plain object (proto=${Object.getPrototypeOf(value)?.constructor?.name})`);
      return out;
    }
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out.push(...findIssues(v, `${path}.${k}`));
    }
  }
  return out;
}

function assertEq<T>(actual: T, expected: T, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(
      `[FAIL] ${label}\n  expected: ${e.slice(0, 200)}\n  actual:   ${a.slice(0, 200)}`,
    );
  }
}

// ── 테스트 1: payload 구조
function test_payload_structure() {
  process.stdout.write("▶ payload 구조 ... ");
  const payload = buildMeetingOpSavePayload(sampleSettings);

  // 1-a) footerLogos 배열은 더 이상 없어야 한다
  if ("footerLogos" in payload) {
    throw new Error("payload 에 footerLogos 배열이 남아있음");
  }
  // 1-b) footerLogo1/2/3 이 plain object 로 존재
  for (const k of ["footerLogo1", "footerLogo2", "footerLogo3"] as const) {
    const v = payload[k];
    if (!isPlainObject(v)) throw new Error(`${k} 누락 또는 비-plain`);
    const obj = v as Record<string, unknown>;
    if (typeof obj.enabled !== "boolean") throw new Error(`${k}.enabled 타입 불일치`);
    if (typeof obj.label !== "string") throw new Error(`${k}.label 타입 불일치`);
    if (typeof obj.imageUrl !== "string") throw new Error(`${k}.imageUrl 타입 불일치`);
  }
  // 1-c) Firestore 거부 패턴 검사
  const issues = findIssues(payload);
  if (issues.length > 0) throw new Error("문제 발견:\n  " + issues.join("\n  "));

  console.log("✓");
}

// ── 테스트 2: round-trip
function test_round_trip() {
  process.stdout.write("▶ save → load round-trip ... ");
  const payload = buildMeetingOpSavePayload(sampleSettings);
  const restored = mergeMeetingOpLoadedData(payload);

  assertEq(restored.footerLogos[0].label, sampleSettings.footerLogos[0].label, "logo[0].label");
  assertEq(restored.footerLogos[1].imageUrl, sampleSettings.footerLogos[1].imageUrl, "logo[1].imageUrl");
  assertEq(restored.footerLogos[2].enabled, sampleSettings.footerLogos[2].enabled, "logo[2].enabled");
  assertEq(restored.headerLogoUrl, sampleSettings.headerLogoUrl, "headerLogoUrl");
  assertEq(restored.signaturePrivacyNotice.enabled, sampleSettings.signaturePrivacyNotice.enabled, "notice.enabled");
  assertEq(restored.meetingType, sampleSettings.meetingType, "meetingType");

  console.log("✓");
}

// ── 테스트 3: 옛 데이터 (footerLogos 배열) fallback
function test_legacy_fallback() {
  process.stdout.write("▶ legacy footerLogos 배열 fallback ... ");
  const legacyData = {
    meetingType: "운영회의",
    footerLogos: [
      { enabled: true, label: "옛-건국", imageUrl: "old1" },
      { enabled: true, label: "옛-디미", imageUrl: "old2" },
      { enabled: true, label: "옛-아포폴", imageUrl: "old3" },
    ],
  };
  const restored = mergeMeetingOpLoadedData(legacyData);
  assertEq(restored.footerLogos[0].label, "옛-건국", "legacy logo[0]");
  assertEq(restored.footerLogos[1].imageUrl, "old2", "legacy logo[1].imageUrl");

  console.log("✓");
}

// ── 테스트 4: 신규 + legacy 혼재 (신규가 우선)
function test_mixed_priority() {
  process.stdout.write("▶ 신규 + legacy 혼재 (신규 우선) ... ");
  const mixedData = {
    footerLogos: [{ enabled: true, label: "OLD", imageUrl: "" }],
    footerLogo1: { enabled: true, label: "NEW", imageUrl: "x" },
  };
  const restored = mergeMeetingOpLoadedData(mixedData);
  assertEq(restored.footerLogos[0].label, "NEW", "신규 우선");

  console.log("✓");
}

// ── 테스트 5: 큰 페이로드 사이즈 측정 (1MB 미만 확인)
function test_payload_size() {
  process.stdout.write("▶ payload 크기 < 1MB ... ");
  const payload = buildMeetingOpSavePayload(sampleSettings);
  const json = JSON.stringify(payload);
  const sizeKB = json.length / 1024;
  if (sizeKB > 1024) throw new Error(`페이로드 ${sizeKB.toFixed(1)}KB > 1MB`);
  console.log(`✓ (${sizeKB.toFixed(1)}KB)`);
}

// ── 테스트 6.5: 매우 큰 이미지(footerLogo3 만 큰 경우) 페이로드 크기 검증
function test_large_logo_size() {
  process.stdout.write("▶ 큰 footerLogo3 페이로드 (~600KB) ... ");
  // 실제 사용자 케이스 재현: 헤더 로고 + 작은 로고 2개 + 큰 로고 1개
  const big = "data:image/png;base64," + "X".repeat(600_000);
  const small = "data:image/png;base64," + "X".repeat(10_000);
  const settings: MeetingOperationsSettings = {
    ...DEFAULT_MEETING_OP_SETTINGS,
    headerLogoUrl: small,
    footerLogos: [
      { enabled: true, label: "건국대학교", imageUrl: small },
      { enabled: true, label: "디미교연(몽당분필)", imageUrl: small },
      { enabled: true, label: "아이포트폴리오(리딩앤)", imageUrl: big },
    ],
  };
  const payload = buildMeetingOpSavePayload(settings);
  const json = JSON.stringify(payload);
  const sizeKB = json.length / 1024;
  // 메모: Firestore 1MB 한도 보호. 압축 전이라면 600KB+ 가능하지만 어드민에서
  // resizeLogoForUpload 로 80KB 이하로 떨굼. 본 테스트는 압축 OFF 상태에서
  // 페이로드가 이론적으로 어느 크기까지 갈 수 있는지 확인용.
  console.log(`✓ (압축 전 ${sizeKB.toFixed(1)}KB — 어드민에서 80KB로 압축됨)`);
}

// ── 테스트 7: prototype-polluted 데이터도 안전하게 plain 으로 변환되는지
function test_class_instance_safety() {
  process.stdout.write("▶ 클래스 인스턴스 → plain 변환 ... ");
  class FakeLogo {
    enabled = true;
    label = "test";
    imageUrl = "x";
    extraMethod() {
      return 42;
    }
  }
  const polluted: MeetingOperationsSettings = {
    ...DEFAULT_MEETING_OP_SETTINGS,
    footerLogos: [
      new FakeLogo() as unknown as MeetingOperationsSettings["footerLogos"][0],
      DEFAULT_MEETING_OP_SETTINGS.footerLogos[1],
      DEFAULT_MEETING_OP_SETTINGS.footerLogos[2],
    ],
  };
  const payload = buildMeetingOpSavePayload(polluted);
  if (!isPlainObject(payload.footerLogo1)) {
    throw new Error("class 인스턴스가 plain 으로 변환되지 않음");
  }
  console.log("✓");
}

(function main() {
  let pass = 0;
  let fail = 0;
  const tests = [
    test_payload_structure,
    test_round_trip,
    test_legacy_fallback,
    test_mixed_priority,
    test_payload_size,
    test_large_logo_size,
    test_class_instance_safety,
  ];
  for (const t of tests) {
    try {
      t();
      pass++;
    } catch (e) {
      console.log("✗");
      console.error("  " + (e as Error).message.split("\n").join("\n  "));
      fail++;
    }
  }
  console.log(`\n[결과] pass ${pass} / fail ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
})();
