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
- 페이지 데이터(Voyager가 ChatGPT 페이지를 알아보는 데 쓰는 사이트 데이터)를 다음 정기 확인을 기다리지 않고 바로 다시 받기

## 동작 원칙

**로컬에서만.** 브리지는 `127.0.0.1`을 통해서만, 그리고 페어링한 뒤에만 이 컴퓨터의 프로그램과 통신합니다.

**자기 탭을 씁니다.** 각 작업은 Voyager가 연 ChatGPT 탭에서 실행되고, 끝나면 탭을 닫습니다.

**기본은 한 번에 하나씩.** 작업은 기본적으로 하나씩 차례로 실행됩니다. 팝업의 **로컬 브리지** 카드에서 **작업 병렬 실행**을 켜고 **동시에 실행할 작업 수**(2~10, 기본 3)를 정하면 각자 자기 탭에서 나란히 실행되고, 입력과 클릭은 여전히 차례로 진행됩니다. 병렬 실행에는 0.4.0보다 새로운 Voyager CLI가 필요하며, 이전 `voyager serve`에서는 여전히 한 번에 하나씩 실행됩니다.

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
voyager ask --drive ./paper.pdf "방법 부분을 요약해 줘"  # Google Drive에 올려 ChatGPT 자체 Drive 앱이 읽게 함
voyager ask --repo owner/name "CI가 왜 실패해?"          # ChatGPT 자체 GitHub 앱이 저장소를 읽음
```

답변은 `response.md`로 저장되며, 기본으로 채팅 모드의 GPT-6 Pro를 씁니다.

두 옵션 모두 ChatGPT 자체의 Google Drive 앱과 GitHub 앱을 쓰므로 먼저 ChatGPT에서 연결해 두세요. 프롬프트에 문장을 덧붙일 뿐이라 새 Voyager 버전은 필요 없습니다. `--drive`는 rclone으로 `VOYAGER_DRIVE_REMOTE`(예: `gdrive:Voyager`) 아래 새 폴더에 파일을 올리며, 이 remote는 ChatGPT의 Drive 앱과 같은 Google 계정이어야 합니다. `--attach`의 64 MiB 제한이 없고, 파일은 Drive에 남습니다. `--repo`는 ChatGPT에게 새 `chatgpt/*` 브랜치에만 커밋해 달라고 요청하지만, 이는 요청일 뿐 제한이 아닙니다. 앱은 GitHub 설치 범위 안이라면 어디에든 쓸 수 있습니다. ChatGPT가 저장소에 접근하지 못하면 voyager는 종료 코드 3으로 멈추니, [GitHub 설치 설정](https://github.com/settings/installations)에서 저장소를 추가하세요.

긴 답변을 기다리는 법, 각 종료 코드의 의미, 전체 명령은 [CLI README](https://github.com/voyager-crew/voyager-cli#readme)를 보세요. Claude Code, Codex 등 에이전트용 안내는 [SKILL.md](https://github.com/voyager-crew/voyager-cli/blob/main/skills/voyager/SKILL.md)에 있습니다.

## 주의 사항 및 면책

- Voyager와 Voyager CLI는 커뮤니티 오픈 소스 프로젝트로, OpenAI와 관련이 없으며 OpenAI의 승인을 받지 않았습니다.
- 브리지는 직접 로그인한 브라우저에서 웹 버전 ChatGPT를 자동으로 조작합니다. OpenAI [이용 약관](https://openai.com/policies/terms-of-use/)은 자동화되거나 프로그래밍 방식으로 출력을 추출하는 것을 제한하므로, 사용 전에 약관에 맞는지 스스로 판단하세요. 이로 인해 계정에 제한이 생기더라도 그 위험은 본인이 집니다.
- 비슷한 도구도 같은 입장입니다. 예를 들어 [oracle](https://github.com/steipete/oracle)는 브라우저 모드를 직접 켜야 하는 실험 기능으로 두고, 위험을 피하고 싶은 사람에게는 API를 권합니다. 보장된 방법이 필요하다면 OpenAI API를 사용하세요.
- 브리지는 자신의 컴퓨터에서 자신의 편의를 위해 쓰는 도구입니다. 본인 계정만 연결하고, 다른 사람에게 서비스를 제공하거나 계정을 공유하거나 사용량을 되파는 데 쓰지 말며, 합법적인 목적에만 사용하세요.
