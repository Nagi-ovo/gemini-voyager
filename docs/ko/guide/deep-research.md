# Deep Research 내보내기

Deep Research가 생성한 최종 보고서를 내보내거나, 전체 "생각(Thinking)" 과정을 Markdown 파일로 저장할 수 있습니다.

## 1. 보고서 내보내기 (PDF / 이미지)

Deep Research가 생성한 보고서는 서식이 잘 갖춰진 PDF나 공유하기 좋은 단일 이미지로 내보낼 수 있습니다(Markdown과 JSON 형식도 지원합니다). 보고서의 **Share & Export** 메뉴를 열고 **보고서 저장**을 선택하세요.

![보고서 내보내기](/assets/deep-research-report-export.png)

## 2. 생각 과정 내보내기 (Markdown)

최종 보고서와 함께, Deep Research 대화의 전체 "생각" 내용도 내보낼 수 있습니다.

### 기능

- **클릭 한 번으로 내보내기**: 보고서의 **Share & Export** 메뉴에 다운로드 옵션이 나타납니다.
- **구조화된 형식**: 생각 단계, 생각 항목, 조사한 웹사이트를 원래 순서대로 보존합니다.
- **읽기 쉬운 제목**: 섹션 제목은 영어로 표시됩니다. Voyager를 다른 언어로 설정했다면, 각 제목에 해당 언어가 영어와 함께 표시됩니다.
- **자동 이름 지정**: 정리하기 쉽도록 파일에 타임스탬프가 붙습니다(예: `deep-research-thinking-20240128-153045.md`).

### 사용 방법

1. Gemini™에서 Deep Research 대화를 엽니다.
2. 보고서의 **Share & Export** 버튼을 클릭합니다.
3. **생각 내용 다운로드**를 선택합니다.
4. Markdown 파일이 자동으로 다운로드됩니다.

![Deep Research 생각 과정 내보내기](/assets/deepresearch_download_thinking.png)

### 내보낸 파일 형식

내보낸 Markdown 파일에는 다음 내용이 들어 있습니다.

- **Title**: 대화 제목
- **Metadata**: 내보낸 시각과 전체 생각 단계 수
- **Thinking Phases**: 각 단계에는 다음이 포함됩니다.
  - 생각 항목(제목과 내용)
  - 조사한 웹사이트(링크와 제목)

#### 예시 구조

```markdown
# Deep Research Conversation Title

**Exported At:** 2025-12-28 17:25:35
**Total Phases:** 3

---

## Thinking Phase 1

### Thought Title 1

Thought content...

### Thought Title 2

Thought content...

#### Researched Websites

- [domain.com](https://example.com) - Page Title
- [another.com](https://another.com) - Another Title

---

## Thinking Phase 2

...
```

## 프라이버시

모든 추출과 서식 변환은 100% 브라우저 안에서 로컬로 이루어집니다. 외부 서버로 어떤 데이터도 전송되지 않습니다.
