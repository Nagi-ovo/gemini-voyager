# Deep Research 내보내기

Deep Research 대화의 전체 "생각(Thinking)" 내용을 아름답게 서식이 지정된 Markdown 파일로 내보낼 수 있습니다.

## 주요 기능

- **클릭 한 번으로 내보내기**: 대화 메뉴(⋮)에 다운로드 버튼이 나타납니다.
- **구조화된 형식**: 생각 단계, 생각 항목, 조사한 웹사이트를 원래 순서대로 보존합니다.
- **다국어 헤더**: Markdown 파일에는 영어와 중국어 섹션 헤더가 모두 포함됩니다. (참고: 추후 한국어 지원 예정)
- **자동 명명**: 파일은 정리가 용이하도록 타임스탬프와 함께 저장됩니다 (예: `deep-research-thinking-20240128-153045.md`).

## 사용 방법

1. Gemini에서 Deep Research 대화를 엽니다.
2. 대화에서 **공유 및 내보내기** 버튼을 클릭합니다.
3. "생각 내용 다운로드 (下载 Thinking 内容)"를 선택합니다.
4. Markdown 파일이 자동으로 다운로드됩니다.

![Deep Research 내보내기](/assets/deepresearch_download_thinking.png)

## 내보낸 파일 형식

내보낸 Markdown 파일에는 다음이 포함됩니다:

- **제목**: 대화 제목
- **메타데이터**: 내보낸 시간 및 총 생각 단계 수
- **생각 단계**: 각 단계는 다음을 포함합니다:
  - 생각 항목 (제목 및 내용)
  - 조사한 웹사이트 (링크 및 제목)

### 예시 구조

```markdown
# Deep Research 대화 제목

**导出时间 / Exported At:** 2025-12-28 17:25:35
**总思考阶段 / Total Phases:** 3

---

## 思考阶段 1 / Thinking Phase 1

### 생각 제목 1

생각 내용...

### 생각 제목 2

생각 내용...

#### 研究网站 / Researched Websites

- [domain.com](https://example.com) - 페이지 제목
- [another.com](https://another.com) - 다른 제목

---

## 思考阶段 2 / Thinking Phase 2

...
```

## 프라이버시

모든 추출 및 형식 지정은 브라우저에서 100% 로컬로 이루어집니다. 외부 서버로 어떠한 데이터도 전송되지 않습니다.
