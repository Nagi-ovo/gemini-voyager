# 플러그인 기여 가이드

Voyager의 플러그인 시스템은 선언형 플러그인을 중심으로 설계되어 있습니다. 플러그인의 메타데이터와 DOM 작업은 `plugin.json`에 기술하고, 시각적 변경은 CSS에 기술합니다. 플러그인은 원격 JavaScript를 실행하지 않습니다. Voyager에 내장된 플러그인 엔진이 매니페스트와 스타일을 해석합니다.

그래야 플러그인을 더 쉽게 검토하고 유지할 수 있습니다. 플러그인을 기여하려면 먼저 이 문서부터 읽어 주세요.

## 나만 쓸 플러그인: 로컬 플러그인

내 브라우저에서만 필요한 플러그인이라면 이 과정을 거칠 필요가 없습니다. 로컬 플러그인으로 만들어 팝업에서 가져오면 됩니다. Issue도, PR도, 저장소 체크아웃도 필요 없습니다. [직접 플러그인 만들기](./write-a-plugin.md)에서 세 가지 제작 방법을 설명합니다. `create-voyager-plugin` 검사 도구와 코딩 에이전트용 skill도 포함됩니다.

## 권장 절차

1. 아이디어가 플러그인에 맞는지 확인합니다. 읽기 너비, 레이아웃 수정, 테마 조정, 페이지 요소 숨기기나 표시, 간단한 사이트 대응 등이 보통 좋은 후보입니다.
2. 먼저 Voyager 저장소에 Issue를 엽니다. 문제, 대상 웹사이트, 기존 플러그인과의 차이를 설명하고, 코딩이나 PR은 관리자의 명시적 승인을 받은 뒤에 시작하세요.
3. 메타데이터, 사이트 매칭, 설정, 기여 항목은 `plugin.json`에 작성합니다.
4. 스타일은 같은 플러그인 디렉터리의 `style.css`에 넣고, `contributes.styles`에서 참조합니다.
5. 로컬에서 테스트하고, 테스트 페이지, 스크린샷, 짧은 녹화를 PR에 포함하세요. 공식 카탈로그에 넣을 준비가 되었는지는 관리자가 판단합니다.

## 디렉터리 구조

공식 내장 플러그인은 `src/features/plugins/catalog/` 아래에 있으며, 플랫폼마다 디렉터리 하나를 씁니다.

```
src/features/plugins/catalog/
  marketplace.json                        문서 플러그인 스토어가 읽는 색인
  sites/<site>/site.json                  사이트 어댑터(데이터 형태)
  sites/<site>/plugins/<id>/plugin.json   선언형 플러그인
  sites/<site>/plugins/<id>/style.css     플러그인 스타일
  sites/<site>/plugins/<id>/README.md     무엇을 왜 고치는지 설명
```

검색은 자동입니다. `catalog/sites/index.ts`가 `import.meta.glob`으로 모든 `site.json`과 `plugin.json`을 찾습니다. 따라서 사이트나 플러그인을 추가하려면 파일만 추가하면 되며, 수정해야 할 매핑 테이블은 없습니다.

`marketplace.json`은 그 매핑 테이블이 아닙니다. 문서 플러그인 스토어가 읽는 색인일 뿐이며, 테스트가 이 파일이 자동 검색 결과와 일치하는지 확인합니다. 그래서 새 플러그인은 여기에도 항목을 추가해야 합니다. `source`는 카탈로그 기준 상대 경로이며, 예를 들어 `sites/deepseek/plugins/reading-width/plugin.json`처럼 씁니다. 다만 `sites/gemini/`와 `sites/aistudio/` 아래 플러그인은 예외입니다. 이 플러그인들은 Voyager에 함께 포함되므로 `marketplace.json`에 들어가지 않습니다.

플러그인의 `matches`는 그 플러그인이 속한 사이트의 `matches` 범위 안에 있어야 합니다. 사이트 범위를 벗어나는 플러그인은 빌드에 실패합니다.

## 시맨틱 선택자 키

`site.json`은 고정된 시맨틱 키 목록을 사이트별 CSS 선택자에 연결합니다. 이 목록은 `src/features/plugins/sites/semanticKeys.ts`에 정의되어 있으며, `site.json`은 이 목록의 키만 사용할 수 있습니다. 목록에 없는 키는 거부됩니다.

- `userTurn`: 사용자 메시지 컨테이너.
- `assistantTurn`: 어시스턴트 메시지 컨테이너.
- `thinkingBlock`: 어시스턴트 턴 안의 추론 섹션.
- `codeBlock`: 렌더링된 코드 블록.
- `composer`: 사용자가 입력하는 프롬프트 입력창.
- `sidebar`: 대화 목록 또는 내비게이션 레일.
- `sidePanel`: 아티팩트나 캔버스 같은 보조 패널.
- `headerActions`: 대화 화면 오른쪽 위의 액션 묶음.
- `scrollContainer`: 대화를 스크롤하는 요소.
- `composerRoot`: 프롬프트 입력창과 그 액션 버튼을 감싸는 컨테이너.
- `sendButton`: 프롬프트를 전송하는 버튼. 사이트에 따라 입력 내용이 있을 때만 보이기도 합니다.

사이트는 실제로 제공할 수 있는 키만 선언합니다. 플러그인은 원시 선택자 대신 DOM 작업의 `target`에 `{ "kind": "semantic", "key": "userTurn" }`을 써서 키를 참조합니다. 그러면 사이트가 리디자인되어도 `site.json` 한 파일만 고치면 됩니다.

`conversationIdPattern`은 선택자가 아니라 별도의 `site.json` 필드입니다. URL 경로에 대한 정규식이며, 첫 번째 캡처 그룹이 대화 ID가 됩니다. 예: `^/chat/([^/?#]+)`.

## 새 플랫폼 추가하기

새 채팅 웹사이트를 추가하는 작업은 두 개의 층으로 나뉩니다.

1. **사이트 어댑터** `catalog/sites/<site>/site.json`: Voyager에게 웹사이트를 인식하는 방법과 사용자 턴, 어시스턴트 턴, 입력창, 사이드바, 테마 표식을 찾는 방법을 알려 줍니다.
2. **플러그인** `catalog/sites/<site>/plugins/<id>/`: 그 웹사이트에서 사용자가 겪는 문제 하나를 해결합니다. 읽기 너비나 렌더링 수정 같은 것입니다.

`site.json`에는 `id`(디렉터리 이름과 같아야 합니다), `label`, `matches`, `selectors`, `theme`, `brandColor`, `capabilities`가 들어가며, 선택 항목으로 `conversationIdPattern`과 `turnKeyAttributes`를 둘 수 있습니다. `turnKeyAttributes`는 페이지가 사용자 메시지를 다시 렌더링할 때도 그 메시지의 정체성을 유지하는 속성 이름입니다. 메시지 전송 추적(폴더 Activity와 타임라인 타임스탬프에서 사용)은 이 속성이 설정된 사이트에서만, 그리고 `composer`, `userTurn`, `conversationIdPattern`과 함께 실행됩니다. `src/features/plugins/sites/siteAdapterData.ts`의 `validateSiteAdapterData`가 이를 검증하며, `bun run catalog:build`는 게시 전에 모든 사이트와 플러그인을 검증합니다.

모든 플러그인 플랫폼은 데이터입니다. 현재 사이트는 ChatGPT, Claude, DeepSeek입니다. Gemini와 AI Studio는 자체 `site.json`(`catalog/sites/gemini/`, `catalog/sites/aistudio/`)을 가진 Voyager 네이티브 화면입니다. 이 둘은 패키지에 포함되어 배포되며 원격 카탈로그에는 게시되지 않습니다. 다섯 개 어댑터인 `adapters/gemini.ts`, `aistudio.ts`, `claude.ts`, `chatgpt.ts`, `deepseek.ts`는 모두 `site.json`을 감싸는 한 줄짜리 셸입니다. TypeScript가 아니라 JSON을 편집하세요.

게시되는 사이트별 카탈로그에도 사이트 데이터가 포함되므로, `site.json`의 선택자 수정은 확장 프로그램 릴리스 없이도 사용자에게 전달될 수 있습니다. 다만 완전히 새로운 사이트는 여전히 `site.json`이 필요합니다. 호스트 권한과 콘텐츠 스크립트 등록은 패키지에 포함되어 배포되어야 하기 때문입니다.

DeepSeek 같은 새 플랫폼을 추가할 때는 어댑터 작업을 플랫폼 계약에 집중하세요. `site.json`, 필요한 선택자 테스트, 지원 내용을 설명하는 최소한의 문서를 하나의 완결된 변경으로 묶으세요. 사이트 레지스트리는 파일 자체에서 새 어댑터를 찾으므로 등록 목록을 수정할 필요가 없습니다. 플러그인마다 새 사이트를 추가하지는 마세요.

어댑터가 승인된 뒤에는 후속 플러그인을 별도의 집중된 변경으로 제출할 수 있습니다. 여러 변경이 서로 의존한다면 스택 PR 체인이 유용합니다. 각 후속 브랜치는 이전 브랜치를 기반으로 하고, 각 PR은 자신의 점진적 기능만 보여 줍니다. 이 체인도 같은 범위 원칙을 따라야 합니다. PR마다 명확한 사용자 목표 하나와 필요한 테스트 및 정리 작업을 담으세요.

사이트 지원에는 모델 API 연동이 필요하지 않습니다. 새 플랫폼을 위해 정적 콘텐츠 스크립트나 필수 호스트 권한을 추가하지 마세요. 플러그인만 제공하는 사이트는 기존의 선택적 권한과 동적 등록 흐름을 사용하면 됩니다.

선택적 권한과 동적 등록 경로는 브라우저 버전에 따라 다릅니다. Chrome과 Edge는 확장 프로그램이 사용하는 흐름을 지원합니다. Firefox는 선택적 호스트 권한에 128 이상이 필요하고, Safari는 동적 콘텐츠 스크립트 등록에 16.4 이상이 필요합니다. 더 오래된 지원 브라우저에서는 필요한 API가 지속적인 허용을 제공할 수 없으므로, 팝업이 사용자 지정 사이트의 플러그인 활성화를 올바르게 거부할 수 있습니다. 이를 피하려고 관리자 승인 없이 넓은 정적 호스트 권한을 추가하지 마세요.

## 플러그인 범위

플러그인은 플랫폼 기준으로 기계적으로 나누기보다, 해결하는 사용자 문제를 기준으로 범위를 정해야 합니다.

카탈로그 플러그인은 사이트 폴더 하나에 속하며, 그 `matches`의 모든 항목은 해당 폴더의 `site.json`이 포함해야 합니다(그렇지 않으면 `bun run plugin:check`가 실패합니다). 그래서 플러그인 하나로 Claude와 ChatGPT를 함께 다룰 수는 없습니다. 읽기 너비, 페이지 내비게이션, 코드 블록 레이아웃처럼 같은 기능이 여러 플랫폼에 맞는다면, 사이트 폴더마다 플러그인을 하나씩 만드세요(예: `sites/claude/plugins/reading-width`와 `sites/chatgpt/plugins/reading-width`). 그리고 이름, 설정, 설명은 일관되게 맞추세요.

플랫폼마다 설정, DOM 로직, 사용자에게 보이는 문구가 많이 다르다면 플러그인을 나누는 편이 더 명확합니다. "모든 것을 다루기" 위해 관련 없는 동작을 한 플러그인에 억지로 넣지 마세요. 플러그인 하나는 명확한 문제 하나를 해결해야 합니다.

간단한 원칙:

- 사용자 목표, 설정이 같고 선택자만 다르다면: 사이트 폴더마다 플러그인을 하나씩 만들고, 이름과 설정을 일관되게 맞춥니다.
- 테마는 같지만 플랫폼 동작이 많이 다르다면: 나누되, 이름과 설명은 서로 관련되게 유지합니다.
- 목표가 다르다면: 합치지 않습니다.

## 중복 플러그인 피하기

제출 전에 플러그인 마켓과 기존 공식 플러그인을 확인하세요. 좋은 플러그인이 이미 있다면 비슷한 것을 새로 만들기보다 기존 플러그인을 개선하세요.

중복 플러그인은 다음과 같은 분명한 개선이 있을 때만 받아들일 가치가 있습니다.

- 원래 플러그인이 다루지 않는 중요한 플랫폼을 지원한다.
- 원래 플러그인이 해결하지 못하는 호환성 문제를 고친다.
- 성능, 접근성, 유지보수성이 명확히 더 낫다.
- 이름만 바꾸거나 스타일만 살짝 바꾼 복사본이 아니라, 의미 있게 다른 사용자 경험을 제공한다.

이렇게 해야 마켓이 깔끔하게 유지되고 사용자가 고르기 쉬워집니다.

## 최소 예시

빈 디렉터리에서 시작하지 말고 스캐폴드를 사용하세요. `bun run plugin:new <id-segment> --site <site>`는 `catalog/sites/<site>/plugins/<id-segment>/`에 `plugin.json`, `style.css`, `README.md`를 만들고, `marketplace.json` 항목도 자동으로 추가합니다. 이 결과물은 출발점일 뿐 승인이 아닙니다. 채워 넣을 매니페스트는 다음 형태입니다.

```json
{
  "$schema": "https://voyager.nagi.fun/plugin.schema.json",
  "id": "your-name.example-plugin",
  "name": "Example Plugin",
  "version": "1.0.0",
  "description": "A short description of what this plugin improves.",
  "author": "your-name",
  "category": "readability",
  "license": "MIT",
  "engine": ">=1.0.0",
  "tier": "declarative",
  "matches": ["https://claude.ai/*"],
  "contributes": {
    "styles": [{ "file": "style.css" }],
    "domOps": [
      {
        "op": "addClass",
        "target": "body",
        "className": "gv-plugin-example"
      }
    ]
  }
}
```

`$schema` 줄은 선택 사항이며 편집기에서만 씁니다. 매니페스트 JSON 스키마를 가리켜서 입력하는 동안 파일이 검증되고 자동 완성됩니다. `site.json`에는 `https://voyager.nagi.fun/site.schema.json`에 있는 별도의 스키마가 있습니다.

`style.css`에는 일반 CSS를 쓸 수 있지만, 플러그인 스타일은 자신의 `gv-plugin-*` 클래스 아래로 범위를 제한해야 합니다.

```css
.gv-plugin-example .some-target {
  max-width: 880px;
}
```

## 매니페스트 참고 사항

- `id`에는 `your-name.reading-width`처럼 역도메인 형식이나 작성자 접두사를 써서 충돌을 피하세요.
- `matches`는 좁게 유지하세요. 플러그인이 정말로 실행되어야 하는 웹사이트에만 매칭하세요.
- 플러그인의 `matches`에 여러 호스트를 넣는 것은 사이트의 `site.json`이 그 호스트들을 모두 포함할 때만 가능합니다(예: chatgpt.com과 chat.openai.com). 다른 사이트를 지원하려면 그 사이트 폴더에 플러그인을 추가하세요.
- 권장 `category` 값: `render-fix`, `theme`, `layout`, `readability`, `productivity`, `integration`, `other`.
- `engine`에는 필요한 플러그인 엔진 버전을 지정하세요. 공식 플러그인을 예시로 참고할 수 있습니다.
- 가능하면 중국어, 영어 등 주요 언어를 위한 `i18n`을 추가하세요.

## CSS와 리소스 제한

선언형 플러그인은 신뢰할 수 없는 입력으로 검증되므로, 리소스는 자체적으로 완결되도록 하세요.

- `@import`를 사용하지 마세요.
- 원격 이미지, 외부 글꼴, 원격 CSS를 참조하지 마세요.
- 일반 CSS, 사용자 지정 속성, Voyager 설정값 치환은 사용할 수 있습니다.
- 플러그인 클래스에는 `gv-plugin-` 접두사를 붙여, 스타일이 호스트 웹사이트나 Voyager 자체로 새어 나가지 않게 하세요.

플러그인에 설정이 필요하다면 가능한 한 숫자 설정으로 시작하세요. 예를 들어 읽기 너비 플러그인은 설정값을 CSS 변수에 써 두고, CSS가 그 값을 사용하게 할 수 있습니다.

## DOM 작업의 경계

선언형 플러그인이 현재 지원하는 작업은 다음과 같습니다.

- `addClass`: 대상 요소에 클래스를 추가합니다.
- `setAttribute`: 속성을 설정합니다.
- `setStyle`: 인라인 스타일이나 CSS 변수를 설정합니다. 값 끝에 `!important`를 붙이면 그 우선순위로 적용됩니다. 이전 Voyager 버전은 이런 값을 버리므로, 플러그인이 이 기능에 의존한다면 `engine`을 `>=next`로 설정하세요. `margin` 같은 축약 속성은 개별 longhand 단위로 추적되므로, 한 플러그인을 꺼도 다른 플러그인의 `margin-top`이 지워지지 않습니다.
- `hide`: 대상 요소를 숨깁니다.

대상은 CSS 선택자이거나, `{ "kind": "semantic", "key": "userTurn" }` 형태로 쓴 위의 시맨틱 키일 수 있습니다. 시맨틱 키는 보통 더 안정적이지만, 현재 사이트 어댑터가 그 키를 선언하고 있어야 합니다.

선언형 작업은 되돌릴 수 있어야 하며, 여러 번 실행해도 안전해야 합니다. 일회성 페이지 상태에 의존하지 마세요. 페이지 DOM이 절대 바뀌지 않는다고 가정하지도 마세요.

### 프리미티브

일부 동작은 CSS와 되돌릴 수 있는 DOM 편집만으로는 표현할 수 없습니다. 프리미티브는 Voyager에 포함된 퍼스트파티 코드이며, 매니페스트가 `native` 작업을 통해 이름으로 호출할 수 있습니다.

```json
{
  "engine": ">=1.3.0",
  "requires": { "handlers": ["formulaCopy"] },
  "contributes": {
    "domOps": [{ "op": "native", "handler": "formulaCopy", "params": {} }]
  }
}
```

매니페스트는 프리미티브를 고르고 설정만 합니다. 로직을 제공하지는 않으며, 실행 전에 해당 프리미티브가 `params`를 검증합니다.

프리미티브를 사용하는 플러그인에는 두 가지 규칙이 적용됩니다.

- 플러그인이 매칭하는 모든 사이트는 프리미티브가 읽는 시맨틱 키를 선언해야 합니다(예: `mermaid`는 `assistantTurn`과 `codeBlock`을 읽습니다). `requires.handlers`는 선택 사항입니다. `native` 작업이 이미 해당 프리미티브를 의미하기 때문입니다.
- `engine`은 프리미티브가 처음 배포된 엔진 버전 이상이어야 합니다. `formulaCopy`는 엔진 1.3.0에서 배포되었으므로, 이를 쓰는 플러그인은 `">=1.3.0"`을 선언해야 합니다. 더 낮은 범위는 `bun run catalog:build`에서 실패합니다. 이전 Voyager는 사용자에게 업데이트를 요청하지 않고 핸들러가 없다고 보고하기 때문입니다.

프리미티브는 확장만 가능합니다. 새 매개변수는 항상 선택 사항이며, 호환되지 않는 변경은 새 이름으로 배포됩니다.

동작을 바꾸는 플러그인은 한 줄짜리 `changelog`를 함께 둘 수 있으며, 팝업이 이를 버전 옆에 표시합니다. 이 문장은 `name` 및 `description` 옆의 `i18n.<locale>.changelog` 아래에 번역해 두세요.

## 일반 플러그인을 쓰지 말아야 할 때

기능이 JavaScript를 실행하거나, 네트워크 요청을 가로채거나, Voyager 내부 데이터를 읽거나 쓰거나, 복잡한 런타임 로직에 의존해야 한다면 일반 선언형 플러그인에 맞지 않습니다.

먼저 Issue를 열고 필요한 기능을 설명하세요. 정말로 내장 기능이 필요하다면, Formula Copy처럼 Voyager 저장소에 내장/네이티브 플러그인으로 구현하는 것을 검토할 수 있습니다.

## PR을 열기 전에

`bun run plugin:check <plugin dir>`을 실행하고 그 출력을 PR에 붙여 넣으세요. 매니페스트와 CSS부터 사이트 범위, 프리미티브, 시맨틱 키, 10개 locale, README까지 모든 문제를 한 번에 보고하며, CI도 번들된 모든 플러그인에 같은 검사를 실행합니다.

- 플러그인은 기본적으로 꺼져 있고, 사용자가 직접 켭니다.
- 거의 같은 플러그인이 없는지 확인했습니다. 있다면 기존 플러그인을 먼저 개선하세요.
- 대상 웹사이트에서 라이트 테마와 다크 테마를 모두 테스트했습니다.
- `matches`가 관련 없는 사이트를 포함하지 않습니다.
- 원격 리소스를 사용하지 않습니다.
- 플러그인 디렉터리에 `plugin.json`, 필요한 CSS 파일, 짧은 README가 있습니다.
- 공식 플러그인이라면 디렉터리가 `catalog/sites/<site>/plugins/<id>/` 아래에 있고, `matches`가 사이트의 `matches` 범위 안에 있으며, `catalog/marketplace.json`에 등록되어 있습니다(Voyager와 함께 배포되는 Gemini와 AI Studio 플러그인은 제외).
- PR에 테스트 페이지, 스크린샷 또는 녹화, 영향을 받는 페이지 영역을 설명했습니다.

단순하고, 집중되어 있고, 되돌릴 수 있게 유지하세요. 명확한 문제 하나를 해결하는 플러그인이 훨씬 쉽게 병합되고 유지됩니다.
