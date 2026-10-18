# ChatGPT 로컬 브리지

'ChatGPT · 로컬 브리지'는 Voyager의 공식 플러그인이며, 기본값은 꺼짐입니다.

켜고 페어링하면 Voyager가 이 컴퓨터의 로컬 프로그램에 ChatGPT 페이지 작업 몇 가지를 제공합니다. 프로그램이 할 일을 요청하면, Voyager가 직접 연 탭에서 브라우저에 이미 로그인해 둔 그 ChatGPT로 처리합니다. ChatGPT 입장에서는 내 브라우저에서 온 평범한 대화일 뿐입니다.

## 제공하는 작업

- 대화 열기: 새 대화 또는 기존 대화
- 모델 선택: 채팅 모드에서만 고르며, ChatGPT를 Work 모드로 바꾸지 않습니다
- 프롬프트 보내기(첨부 파일 포함 가능)
- 답변을 기다렸다가 읽기
- 기존 대화의 최신 답변 읽기
- 프로젝트 목록 보기, 만들기
- 프로젝트 파일 목록 보기, 업로드, 삭제(삭제는 즉시 반영되며 되돌릴 수 없음)

## 동작 원칙

**로컬에서만.** 브리지는 `127.0.0.1`을 통해서만, 그리고 페어링한 뒤에만 이 컴퓨터의 프로그램과 통신합니다.

**자기 탭을 씁니다.** 각 작업은 Voyager가 연 ChatGPT 탭에서 실행되고, 끝나면 탭을 닫습니다.

**한 번에 하나씩.** 동시에 하나의 작업만 실행됩니다.

**로그인과 보안 확인은 직접 하세요.** ChatGPT가 로그인이나 보안 확인을 요구하면 브리지는 멈추고 알려 줍니다. 우회하지 않습니다.

**요금제도 함께.** 모든 결과에는 페이지가 마지막으로 알려 준 ChatGPT 요금제(`Pro Lite ($100)`, `Pro ($200)` 등)가 표시됩니다.

**브라우저.** Chrome에서 테스트했습니다. Edge와 Firefox용 Voyager에도 브리지가 들어 있지만, Safari용에는 없습니다.

## 참고 사용법: Voyager CLI

[Voyager CLI](https://github.com/voyager-crew/voyager-cli)(npm `@voyager-crew/cli`, 명령어 `voyager`)는 이 작업들을 바탕으로 만든 참고용 클라이언트입니다. 터미널에서 ChatGPT에 질문하거나 코딩 에이전트에게 맡길 수 있습니다.

### 세 단계로 연결

1. CLI를 설치하세요(Node.js 20.3 이상 필요).

   ```sh
   npm install -g @voyager-crew/cli
   ```

2. Voyager 팝업에서 **플러그인**을 열고 **ChatGPT · 로컬 브리지**를 켠 뒤 chatgpt.com 접근을 허용하세요.
3. 한 번만 페어링하세요.

   ```sh
   voyager pair
   ```

   표시된 8자리 코드를 팝업의 '로컬 브리지' 설정에 입력하세요.

### 몇 가지 예

```sh
voyager ask "이 스택 트레이스를 설명해 줘" --attach crash.log
voyager ask --chat <link|id> "엣지 케이스는?"       # 기존 대화에서 이어서 질문
voyager read <link|id>                              # 대화의 최신 답변 저장
voyager project upload "Thesis" ./thesis            # 프로젝트의 모든 대화가 읽을 수 있음
voyager ask --project "Thesis" "논증이 가장 약한 곳은 어디야?"
```

답변은 `response.md`로 저장되며, 기본으로 채팅 모드의 GPT-6 Pro를 씁니다.

긴 답변을 기다리는 법, 각 종료 코드의 의미, 전체 명령은 [CLI README](https://github.com/voyager-crew/voyager-cli#readme)를 보세요. Claude Code, Codex 등 에이전트용 안내는 [SKILL.md](https://github.com/voyager-crew/voyager-cli/blob/main/skills/voyager/SKILL.md)에 있습니다.
