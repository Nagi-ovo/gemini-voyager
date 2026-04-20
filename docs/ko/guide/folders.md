# 제대로 된 폴더 관리

AI 채팅을 정리하는 것이 왜 그렇게 힘들까요?
우리가 해결했습니다. 당신의 생각을 위한 파일 시스템을 구축했습니다.

<div style="display: flex; gap: 20px; margin-top: 20px; flex-wrap: wrap; margin-bottom: 40px;">
  <div style="flex: 1; min-width: 300px; text-align: center;">
    <p><b>Gemini™</b></p>
    <img src="/assets/gemini-folders.png" alt="Gemini 폴더" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"/>
  </div>
  <div style="flex: 1; min-width: 300px; text-align: center;">
    <p><b>AI Studio</b></p>
    <img src="/assets/aistudio-folders.png" alt="AI Studio 폴더" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"/>
  </div>
</div>

## 정리의 물리학

단순히 직관적입니다.

- **드래그 앤 드롭**: 대화를 선택하세요. 폴더에 넣으세요. 직접 만지는 듯한 느낌을 줍니다.
- **계층 구조**: 프로젝트에는 하위 프로젝트가 있습니다. 폴더 안에 폴더를 만드세요. _당신만의_ 방식으로 구조화하세요.
- **폴더 간격**: 사이드바 밀도를 자유롭게 조정할 수 있습니다.
  > _참고: Mac Safari에서는 조정 사항이 실시간으로 반영되지 않을 수 있습니다. 페이지를 새로고침하면 적용됩니다._
- **즉시 동기화**: 데스크탑에서 정리하세요. 노트북에서도 그대로 확인할 수 있습니다.

## 전문가 팁

- **다중 선택**: 대화를 길게 눌러 다중 선택 모드로 진입한 다음, 여러 채팅을 선택하여 한 번에 이동할 수 있습니다.
- **이름 바꾸기**: 폴더를 더블 클릭하여 이름을 바꿉니다.
- **아이콘**: Gem의 유형(코딩, 창의적 등)을 자동으로 감지하여 적절한 아이콘을 할당합니다. 당신은 아무것도 할 필요가 없습니다.

## 플랫폼별 기능 차이

### 공통 기능

- **기본 관리**: 드래그 앤 드롭, 이름 바꾸기, 다중 선택.
- **스마트 인식**: 대화 유형을 자동으로 감지하여 적절한 아이콘 할당.
- **계층 구조**: 폴더 중첩(중첩 계층) 지원.
- **AI Studio 지원**: 위의 고급 기능들은 곧 AI Studio에서도 지원될 예정입니다.
- **Google Drive 동기화**: 폴더 구조를 Google Drive와 동기화.

### Gemini 전용 기능

#### 보관된 대화 숨기기

대화를 폴더에 보관하면 "정리 완료"지만, 기본적으로는 메인 사이드바 목록에도 계속 남아 자리를 차지합니다. 확장 프로그램 팝업 → **폴더 옵션** 에서 **보관된 대화 숨기기** 를 켜면 메인 목록에는 진행 중인 대화만 표시됩니다. AI 채팅의 진정한 인박스 제로.

- 처음으로 대화를 폴더에 보관할 때 Voyager가 폴더 영역에 작은 카드를 띄워 원클릭으로 활성화할 수 있도록 안내합니다. 원하지 않으면 "나중에"를 눌러 주세요. 다시 표시되지 않습니다.
- 보관된 대화는 **삭제되지 않습니다**——폴더 안에서 언제든 확인할 수 있습니다.
- 팝업에서 언제든 전환할 수 있습니다.

#### 색상 맞춤 설정

폴더 아이콘을 클릭하여 색상을 맞춤 설정하세요. 7가지 기본 색상 중에서 선택하거나 색상 피커를 사용하여 원하는 색상을 선택할 수 있습니다.

<img src="/assets/folder-color.png" alt="폴더 색상" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin-top: 10px; max-width: 600px;"/>

#### 계정 분리

헤더의 "사람" 아이콘을 클릭하면 다른 Google 계정의 채팅을 즉시 필터링할 수 있습니다. 여러 계정을 사용할 때 작업 공간을 깨끗하게 유지하세요.

<img src="/assets/current-user-only.png" alt="계정 분리" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin-top: 10px; max-width: 600px;"/>

#### AI 자동 정리

채팅이 너무 많고, 정리하기 귀찮다고요? Gemini한테 맡기세요.

원클릭으로 현재 대화 구조를 복사하고, Gemini에 붙여넣으면 바로 가져올 수 있는 폴더 계획을 생성해 줍니다 — 순식간에 정리 완료.

**1단계: 대화 구조 복사**

확장 프로그램 팝업의 폴더 섹션 하단에서 **AI 정리** 버튼을 클릭하세요. 미분류 대화와 기존 폴더 구조를 자동으로 수집하고, 프롬프트를 생성하여 클립보드에 복사합니다.

<img src="/assets/ai-auto-folder.png" alt="AI Organize Button" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 400px;"/>

**2단계: Gemini가 분류하게 하기**

클립보드 내용을 Gemini 대화에 붙여넣으세요. 채팅 제목을 분석한 뒤 JSON 폴더 계획을 출력해 줍니다.

**3단계: 결과 가져오기**

폴더 패널 메뉴에서 **폴더 가져오기**를 클릭하고, **또는 JSON 직접 붙여넣기**를 선택한 다음, Gemini가 반환한 JSON을 붙여넣고 **가져오기**를 클릭하세요.

<div style="display: flex; gap: 16px; margin-top: 12px; flex-wrap: wrap; margin-bottom: 24px;">
  <div style="text-align: center;">
    <img src="/assets/ai-auto-folder-2.png" alt="Import Menu" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 240px;"/>
  </div>
  <div style="text-align: center;">
    <img src="/assets/ai-auto-folder-3.png" alt="Paste JSON Import" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 400px;"/>
  </div>
</div>

- **증분 병합**: 기본적으로 "병합" 전략을 사용합니다 — 새 폴더와 할당만 추가하며, 기존 정리를 절대 파괴하지 않습니다.
- **다국어 지원**: 프롬프트는 설정된 언어를 자동으로 사용하고, 폴더 이름도 해당 언어로 생성됩니다.

#### 폴더를 프로젝트처럼 쓰기

새 채팅에 가벼운 "프로젝트 프리셋"을 붙이고 싶다면, 원하는 폴더를 프로젝트처럼 사용할 수 있습니다.
이 아이디어는 Claude Projects를 참고했지만, Voyager에서는 더 가벼운 방식으로 구현했습니다. 공유 컨텍스트 워크스페이스가 아니라 폴더 단위의 첫 메시지 지침과 자동 분류입니다.

1. 확장 프로그램 팝업에서 `폴더를 프로젝트로 사용 활성화`를 켭니다.
2. 폴더를 우클릭한 뒤 `지침 설정` 또는 `지침 편집`을 선택합니다.
3. 새 Gemini 채팅을 열고, 입력창 옆 폴더 선택기에서 그 폴더를 고릅니다.
4. 첫 메시지를 보냅니다.

이후 동작:

- 첫 전송이 끝나면 해당 대화가 자동으로 그 폴더에 들어갑니다.
- 폴더에 지침이 있으면 Voyager는 첫 전송 때만 그 지침을 임시로 앞에 붙입니다.
- 폴더에 지침이 없어도 빠르게 분류하는 용도로 쓸 수 있습니다.
- 같은 폴더 안의 채팅끼리는 **자동으로** 기억을 공유하거나 서로의 내용을 읽지 않습니다.
- 초안 자동 저장에는 당신이 입력한 본문만 남고, 숨겨진 지침이 입력창에 다시 나타나지 않습니다.

### AI Studio 전용 기능

- **사이드바 너비 조절**: 사이드바 가장자리를 드래그하여 자유롭게 조절.
- **라이브러리 드래그 지원**: Library 목록에서 폴더로 직접 드래그 앤 드롭 내보내기.
