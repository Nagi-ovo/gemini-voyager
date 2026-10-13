# 직접 플러그인 만들기

로컬 플러그인은 나를 위해 직접 만드는 플러그인입니다. Gemini, AI Studio, ChatGPT, Claude 또는 DeepSeek의 모양이나 레이아웃을 바꾸며, 내 브라우저 안에만 존재합니다. PR을 보낼 필요도, Voyager 소스를 받을 필요도 없습니다.

다른 Voyager 플러그인과 마찬가지로 선언형입니다. `plugin.json` 매니페스트와 CSS로 이루어지며, 자체 코드는 실행하지 않습니다. Voyager가 가져올 때 검사하고 변경 사항을 적용하며, 끄면 모든 변경을 되돌립니다. 가져온 플러그인은 꺼진 상태로 시작하므로 먼저 내용을 검토할 수 있습니다.

## 만드는 세 가지 방법

### 원하는 변경을 설명하고 AI에게 쓰게 하기

1. 바꾸고 싶은 사이트를 열고 Voyager 팝업에서 **로컬 플러그인** 카드를 찾습니다(Gemini와 AI Studio에서는 설정의 맨 마지막 항목입니다).
2. **한 문장으로 화면 바꾸기**를 선택하고, 바꾸고 싶은 내용을 한 문장으로 적습니다("내 메시지를 좁게 하고 사이드바를 숨겨 줘"). 그다음 **프롬프트 만들기**를 선택합니다.
3. 프롬프트를 원하는 AI 채팅에 직접 복사해 넣고, 답변 전체를 다시 붙여 넣은 뒤 **답변 검사**를 선택합니다.
4. Voyager가 이 플러그인이 무엇을 바꾸는지 쉬운 말로 보여 줍니다. 가져온 다음 플러그인 목록에서 켜세요.

Voyager는 프롬프트를 어디에도 보내지 않습니다. 어떤 AI를 쓸지 고르고, 텍스트를 양방향으로 옮기는 일은 사용자가 합니다.

### 코딩 에이전트에게 맡기기

코딩 에이전트(Claude Code, Codex, Cursor 등)를 쓰고 있다면 Voyager의 플러그인 skill을 전달하세요.

```text
https://voyager.nagi.fun/skills/write-voyager-plugin/SKILL.md
```

**로컬 플러그인** 카드에서 **한 문장으로 화면 바꾸기**를 열면 이 skill을 위한 **skill 링크 복사** 버튼이 있습니다. skill에는 전체 규약이 담겨 있습니다. 매니페스트 필드, 각 사이트가 선언한 내용, 프리미티브, 플러그인이 할 수 없는 일까지 포함됩니다. 원하는 변경을 에이전트에게 요청하면, 에이전트가 폴더를 만들고 `plugin.json`과 `style.css`를 작성한 뒤 오프라인으로 검사합니다. 그다음 팝업에서 **파일 가져오기**를 선택하고 두 파일을 고르면 됩니다.

skill을 계속 설치해 두려면 `write-voyager-plugin/SKILL.md` 파일을 에이전트의 skills 폴더에 저장하세요(Claude Code라면 `~/.claude/skills/`).

### 직접 작성하기

Node.js 18 이상에서 다음처럼 실행합니다.

```sh
npx create-voyager-plugin@latest init my-plugin --site claude
# my-plugin/plugin.json과 my-plugin/style.css를 편집
npx create-voyager-plugin@latest check my-plugin
```

`init`은 이미 검사를 통과하는 `plugin.json`과 `style.css`, 그리고 해당 사이트의 규칙을 담은 `AGENTS.md`를 만듭니다. `--site`에는 `gemini`, `aistudio`, `chatgpt`, `claude`, `deepseek` 중 하나를 지정합니다.

`check`는 팝업에서 가져올 때와 같은 검사를 오프라인으로 실행합니다. 가져올 수 있는 플러그인이면 종료 코드 0으로 끝나고, 아니면 문제마다 `path: message` 형식의 한 줄씩 출력합니다. 기계가 읽을 수 있는 출력이 필요하면 `--json`을 붙이세요.

## 플러그인이 할 수 있는 일

- CSS 추가. 플러그인이 페이지에 붙이는 `gv-` 클래스 아래로 범위가 제한됩니다.
- 클래스 추가, 안전한 속성이나 인라인 스타일 설정, 요소 숨기기. 대상은 사이트가 선언한 시맨틱 앵커(`userTurn`, `assistantTurn`, `composer` 등)나 CSS 선택자입니다.
- 팝업에 설정 제공: 스위치, 슬라이더, 드롭다운. 설정값은 `{{key}}` 토큰을 통해 CSS에 전달됩니다.
- ChatGPT, Claude, DeepSeek에서는 Voyager 프리미티브(수식 복사, 타임라인, Mermaid 다이어그램 등)를 켜고, Voyager 자체 UI의 색조를 바꿀 수 있습니다.

## 할 수 없는 일

플러그인은 JavaScript를 실행하거나, 클릭과 키 입력에 반응하거나, 네트워크에서 무엇이든(글꼴, 이미지, 스타일시트) 불러오거나, 메시지의 내용을 읽거나 고쳐 쓰거나, 다른 사이트에서 실행될 수 없습니다. 요청에 이런 기능이 필요하면, 작성 자료가 AI에게 그 사실을 알리고 실제로 동작하는 가장 가까운 버전을 만들도록 안내합니다.

## 가져올 때 검사하는 규칙

공통 매니페스트 검사([플러그인 기여 가이드](./plugin-contribution.md) 참고) 외에도, 로컬 플러그인은 다음을 지켜야 합니다.

- Voyager가 지원하는 사이트 안의 URL에만 매칭할 것
- 매칭되는 모든 사이트가 선언한 시맨틱 앵커만 사용할 것
- `addClass`마다 정확히 하나의 클래스를 추가하고, 그 클래스는 `gv-`로 시작할 것
- 설정은 boolean, number, select만 사용할 것(string과 color는 아직 팝업 컨트롤이 없습니다)
- Gemini와 AI Studio에서는 `theme`을 쓰지 말 것. 프리미티브는 각 사이트가 허용하는 것만 사용할 것. Gemini에서는 `formulaCopy`, `vimInput`, `userLatex`, `codeCollapse`, `mermaid`, `wavedrom`, `echarts`, `sendShortcut`, `draftSave`, `turnNavigator`를, AI Studio에서는 `formulaCopy`와 `sendShortcut`을 쓸 수 있습니다. 이들은 Voyager 자체 설정과 같은 코드를 실행합니다. `formulaCopy`와 `vimInput`(수식 복사와 입력창 Vim 모드)은 페이지마다 내장 설정이나 플러그인 중 하나만 실행됩니다. 페이지를 불러올 때나 둘 다 실행 중이 아닐 때는 내장 설정이 먼저 실행되고, 그 뒤에는 이미 실행 중인 쪽이 계속 실행되며 다른 쪽은 일시 중지로 표시됩니다. 한쪽을 끄면 다른 쪽이 기능을 넘겨받습니다. `userLatex`, `codeCollapse`, `mermaid`, `wavedrom`, `echarts`는 요소 단위로 대상을 차지하므로 내장 설정과 함께 실행됩니다. 상대가 이미 차지한 줄이나 코드 블록은 상대가 처리합니다.

개인용 Gemini에서는 `params.dataBackend: "shared"`와 `engine: ">=1.9.0"`을 지정하면 로컬 `turnNavigator`를 쓸 수 있습니다. 공식 타임라인과 같은 네이티브 별표 및 계층 데이터를 읽고 쓰며, 대화, 계정, 턴 식별 매개변수는 재정의할 수 없습니다. 공식 **타임라인 표시** 설정과 충돌하므로, 로컬 플러그인을 켜기 전에 그 설정을 끄세요. 공식 타임라인으로 돌아가려면 먼저 로컬 플러그인을 끄고 설정을 켜세요. Business, Enterprise, 사용자 지정 사이트 범위는 지원하지 않습니다.

번역(`i18n`)은 선택 사항입니다.

## 공유하기

로컬 플러그인은 내 브라우저에만 있습니다. 다른 곳으로 옮기려면 플러그인 목록에서 JSON을 내보내세요. 모두에게 도움이 될 것 같다면 공식 카탈로그에 제안할 수 있습니다. 그 절차는 [플러그인 기여 가이드](./plugin-contribution.md)에서 설명합니다.

전송 단축키 플러그인은 모든 사이트에서 페이지당 하나만 실행됩니다. 한 플러그인이 전송 모드를 쥐고 있으면 다른 플러그인은 충돌을 알리고 일시 중지 상태로 남습니다. 선택 사항인 `mode`(`"engine": ">=next"` 필요, 1.9.0에서 출시)는 `ctrlEnterSends`(기본값) 또는 `enterSends`입니다. IME 입력 확정 과정에서는 전송되지 않습니다. Gemini와 AI Studio도 이를 허용하며, 지원 모드는 아래와 같습니다.

Gemini에서는 `sendShortcut`이 공식 Ctrl/Cmd+Enter 기능을 대신할 수 있습니다. 공식 스위치를 끈 다음 로컬 플러그인을 켜세요. `ctrlEnterSends`만 지원되며, Enterprise에서는 동작하지 않습니다. `composerRoot`는 기본 입력창과 편집 입력창을 모두 포함하고, `sendButton`은 중지 버튼을 제외합니다.

AI Studio에서 `sendShortcut`에는 `params.mode: "enterSends"`가 필요합니다. 공식 Enter 전송 스위치를 끄면 로컬 플러그인이 전송을 넘겨받습니다. Ctrl/Cmd+Enter는 줄바꿈을 추가하고, Shift/Alt+Enter는 사이트의 동작을 따릅니다.

Gemini에서 `draftSave`는 공식 기능과 같은 `gvDraft_<전체 pathname>` 기록을 공유합니다. `/u/N` 경로와 Gem 경로도 포함됩니다. 끄더라도 저장된 초안은 그대로 남으며, 같은 페이지의 여러 플러그인이 이 기록을 함께 사용할 수 있습니다. 페이지를 닫을 때 마지막 입력을 저장하려고 시도하지만, 브라우저가 닫히는 순간 비동기 저장이 끝난다고 보장할 수는 없습니다. 쓰기와 정리는 이 페이지 안에서만 조정됩니다. 같은 `/u/N` 슬롯 안에서 이메일을 바꿔도 저장된 초안은 공유됩니다.
