# 컨텍스트 동기화: 기억 전달 (실험적)

**서로 다른 차원, 원활한 공유**

웹에서 로직을 반복하고, IDE에서 코드를 구현하세요. Gemini Voyager는 차원의 장벽을 허물어 웹의 "사고 과정"을 IDE에 즉시 전달합니다.

## 끊임없는 전환과 작별하세요

개발자들의 가장 큰 고통: 웹에서 솔루션을 철저히 논의한 후 VS Code/Trae/Cursor로 돌아오면, 처음 보는 사이처럼 요구 사항을 다시 설명해야 한다는 것입니다. 할당량과 응답 속도 때문에 웹은 "두뇌"이고 IDE는 "손"입니다. Voyager는 그들이 같은 영혼을 공유하게 합니다.

## 동기화를 위한 세 가지 간단한 단계

1. **CoBridge 설치 및 실행**:
   VS Code에 **CoBridge** 확장 프로그램을 설치하세요. 이는 웹 인터페이스와 로컬 IDE를 연결하는 핵심 브리지 역할을 합니다.
   - **[VS Code Marketplace에서 설치](https://open-vsx.org/extension/windfall/co-bridge)**

   ![CoBridge 확장 프로그램](/assets/CoBridge-extension.png)

   설치 후 왼쪽 사이드바의 아이콘을 클릭하고 서버를 시작합니다.
   ![CoBridge 서버 켜짐](/assets/CoBridge-on.png)

2. **연결 확인 (Handshake)**:
   - Voyager 설정에서 "컨텍스트 동기화 (Context Sync)"를 활성화합니다.
   - 포트 번호를 맞춥니다. "IDE 온라인 (IDE Online)"이 표시되면 연결된 것입니다.

   ![컨텍스트 동기화 콘솔](/assets/context-sync-console.png)

3. **클릭 한 번으로 동기화**: **"IDE로 동기화 (Sync to IDE)"**를 클릭합니다.

   ![동기화 완료](/assets/sync-done.png)

## IDE에 뿌리 내리기

동기화 후 IDE의 루트 디렉토리에 `.vscode/AI_CONTEXT_SYNC.md` 파일이 나타납니다. Trae, Cursor, Copilot 등 어떤 도구를 사용하든 각자의 규칙 파일을 통해 이 "기억"을 자동으로 읽게 됩니다. **이제 AI 모델은 더 이상 기억 상실을 겪지 않고 즉시 작업을 시작할 수 있습니다.**

## 원칙

- **오염 제로 (Zero Pollution)**: CoBridge는 자동으로 `.gitignore`를 처리하여 개인적인 대화가 Git 저장소에 푸시되지 않도록 보장합니다.
- **산업 표준 호환**: 전체 Markdown 형식을 사용하여 IDE의 AI가 마치 설명서를 읽는 것처럼 부드럽게 내용을 파악할 수 있습니다.
- **전문가 팁**: 이전 대화인 경우 [타임라인]을 사용하여 위로 스크롤하면 웹이 컨텍스트를 "기억"하게 되어 더 나은 동기화 결과를 얻을 수 있습니다.

---

## 도약할 준비가 되었습니다

**로직은 클라우드에서 완성되었습니다. 이제 로컬에 뿌리를 내리게 하세요.**

- **[CoBridge 확장 프로그램 설치](https://open-vsx.org/extension/windfall/co-bridge)**: 당신의 차원 관문을 찾아 클릭 한 번으로 "동기화된 호흡"을 활성화하세요.
- **[GitHub 저장소 접속](https://github.com/Winddfall/CoBridge)**: CoBridge의 기저 로직을 깊이 탐구하거나 이 "영혼 동기화" 프로젝트에 Star를 눌러주세요.

> **더 이상 LLM의 기억 상실은 없습니다. 오직 순수하고 즉각적인 생산성만이 존재합니다.**
