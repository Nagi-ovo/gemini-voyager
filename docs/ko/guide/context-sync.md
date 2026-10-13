# 기억 운반: 컨텍스트 동기화 (실험적)

**다른 차원, 자연스러운 공유**

웹에서 로직을 다듬고, IDE에서 코드를 구현하세요. Voyager는 이 차원의 벽을 허물어, IDE가 웹에서의 "사고 과정"을 즉시 공유받게 합니다.

## 탭을 오가는 번거로움 끝내기

개발자가 가장 크게 느끼는 불편: 웹에서 해결책을 충분히 논의한 뒤 VS Code, Trae, Cursor로 돌아가면, 요구 사항을 처음 보는 사람에게 설명하듯 다시 말해야 합니다. 할당량과 응답 속도 때문에 웹은 "두뇌", IDE는 "손"의 역할을 맡게 됩니다. Voyager는 둘이 같은 맥락을 공유하게 합니다.

## 동기화는 세 단계면 충분합니다

1. **CoBridge 설치 및 실행**:
   VS Code 또는 호환 편집기에 **CoBridge** 확장 프로그램을 설치하세요. 웹 인터페이스와 로컬 IDE를 잇는 핵심 브리지입니다.
   - **[Open VSX에서 설치](https://open-vsx.org/extension/windfall/co-bridge)**

   ![CoBridge 확장 프로그램](/assets/CoBridge-extension.png)

   설치한 뒤 **아무 작업 디렉터리나 열고**, 오른쪽의 아이콘을 클릭해 서버를 시작하세요.
   ![CoBridge 서버 켜짐](/assets/CoBridge-on.png)

2. **연결 확인 (Handshake)**:
   - Voyager 팝업의 **컨텍스트 동기화** 섹션에서 **동기화 모드**를 **수동**으로 설정합니다.
   - **서버 포트**를 CoBridge가 사용 중인 포트와 맞추세요. **IDE 온라인**이 보이면 연결된 것입니다.

   ![컨텍스트 동기화 콘솔](/assets/context-sync-console.png)

3. **클릭 한 번으로 동기화**: **"IDE 로 동기화"**를 클릭하세요. 복잡한 **데이터 표**든 직관적인 **참고 이미지**든 모두 IDE로 즉시 동기화됩니다.

   ![동기화 완료](/assets/sync-done.png)

## IDE에 뿌리 내리기

동기화가 끝나면 IDE 작업 디렉터리에 `.cobridge/AI_CONTEXT.md` 파일이 생성됩니다. Trae, Cursor, Copilot 중 무엇을 쓰든, 각 도구의 Rule 파일을 통해 이 "기억"을 자동으로 읽습니다.

```
your-project/
├── .cobridge/
│   ├── images/
│   │   ├── context_img_1_1.png
│   │   └── context_img_1_2.png
│   └── AI_CONTEXT.md
├── .github/
│   └── copilot-instructions.md
├── .gitignore
├── .traerules
└── .cursorrules
```

## 원칙

- **오염 없음**: CoBridge가 `.gitignore`를 자동으로 처리하므로, 개인적인 대화가 Git 저장소에 푸시되지 않습니다.
- **업계 표준 준수**: 전체를 Markdown 형식으로 만들어, IDE의 AI가 설명서를 읽듯 자연스럽게 이해합니다.
- **전문가 팁**: 대화가 오래전 내용이라면 먼저 [타임라인](/ko/guide/timeline)으로 위로 스크롤해서, 웹이 맥락을 다시 불러오게 한 뒤 동기화하면 결과가 더 좋습니다.

---

## 시작할 준비가 되었습니다

**논리는 이미 클라우드에서 준비되었습니다. 이제 로컬에 뿌리내리게 하세요.**

- **[CoBridge 확장 프로그램 설치](https://open-vsx.org/extension/windfall/co-bridge)**: 차원의 관문을 찾아 클릭 한 번으로 "동기화된 호흡"을 시작하세요.
- **[GitHub 저장소 방문](https://github.com/Winddfall/CoBridge)**: CoBridge의 내부 로직을 깊이 살펴보거나, 이 "영혼 동기화" 프로젝트에 Star를 남겨 주세요.

> **LLM은 이제 기억을 잃지 않습니다. 설치하자마자 바로 실전에 투입할 수 있습니다.**
