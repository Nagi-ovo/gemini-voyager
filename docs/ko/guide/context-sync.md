# 기억 운반: 컨텍스트 동기화 (실험적)

**다른 차원, 부드러운 공유**

웹에서 로직을 추론하고, IDE에서 코드를 구현하세요. Gemini Voyager는 차원의 벽을 허물어 IDE가 웹의 "사고 과정"을 즉시 공유받을 수 있게 합니다.

## 반복되는 화면 전환과 작별하세요

개발자들이 가장 번거로워하는 일: 웹에서 해결책을 충분히 논의한 후 VS Code/Trae/Cursor로 돌아왔을 때, 마치 처음 보는 사람처럼 요구 사항을 다시 설명해야 하는 상황입니다. 할당량과 응답 속도 때문에 웹은 "두뇌", IDE는 "손"이 됩니다. Voyager는 그들이 하나의 영혼을 공유하게 합니다.

## 아주 간단한 3단계, 같은 호흡으로

1. **CoBridge 설치 및 실행**:
   **CoBridge** 플러그인을 설치하세요. 웹 인터페이스와 로컬 IDE를 연결하는 핵심 브리지 역할을 합니다.
   - **[마켓플레이스에서 설치](https://open-vsx.org/extension/windfall/co-bridge)**

   ![CoBridge 확장 프로그램](/assets/CoBridge-extension.png)

   설치 후 오른쪽 아이콘을 클릭하고 서버를 시작합니다.
   ![CoBridge 서버 시작](/assets/CoBridge-on.png)

2. **연결 확인 (Handshake)**:
   - Voyager 설정에서 "컨텍스트 동기화"를 활성화합니다.
   - 포트 번호를 맞춥니다. "IDE Online"이 표시되면 연결된 것입니다.

   ![컨텍스트 동기화 패널](/assets/context-sync-console.png)

3. **클릭 한 번으로 동기화**: **"Sync to IDE"**를 클릭합니다. 복잡한 **데이터 테이블**부터 직관적인 **참조 이미지**까지 모두 즉시 IDE로 전송됩니다.

   ![동기화 완료](/assets/sync-done.png)

## IDE에 뿌리 내리기

동기화가 완료되면 IDE 루트 디렉토리에 `.cobridge/AI_CONTEXT.md` 파일이 생성됩니다. Trae, Cursor, Copilot 중 무엇을 사용하든 각각의 Rule 파일을 통해 이 "기억"을 자동으로 읽어옵니다.

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

## 그것의 원칙

- **오염 제로**: CoBridge는 자동으로 `.gitignore`를 처리하여 개인적인 대화가 Git 저장소에 푸시되지 않도록 보장합니다.
- **산업 표준 호환**: 전체 Markdown 형식을 사용하여 IDE의 AI가 마치 제품 설명서를 읽는 것처럼 부드럽게 내용을 파악할 수 있습니다.
- **전문가 팁**: 대화가 오래전 내용이라면 [타임라인]을 사용하여 위로 스크롤해 웹이 컨텍스트를 "기억"하게 한 뒤 동기화하는 것이 더 효과적입니다.

---

## 지금 바로 시작하세요

**생각은 이미 클라우드에서 준비되었습니다. 이제 로컬에 뿌리를 내리게 하세요.**

- **[CoBridge 확장 프로그램 설치](https://open-vsx.org/extension/windfall/co-bridge)**: 당신의 차원 관문을 찾아 클릭 한 번으로 "동기화된 호흡"을 경험하세요.
- **[GitHub 저장소 방문](https://github.com/Winddfall/CoBridge)**: CoBridge의 기저 로직을 깊이 탐구하거나 이 "영혼 동기화" 프로젝트에 Star를 눌러주세요.

> **거대 모델은 이제 더 이상 기억을 잃지 않으며, 즉시 실전에 투입 가능합니다.**
