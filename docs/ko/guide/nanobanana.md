# Image Refinement (워터마크 제거)

::: tip Safari 지원
v1.6.0부터 **Image Refinement**가 Safari에서 바로 작동하며, 워터마크가 없는 전체 크기 다운로드도 지원합니다. Chrome, Edge, Firefox, Safari가 이제 같은 내장 워크플로를 공유합니다.
:::

**AI 이미지를 깨끗하게.**

Gemini™가 생성한 이미지에는 기본적으로 눈에 보이는 워터마크가 들어갑니다. 안전을 위한 장치이지만, 창작 작업에서는 완전히 깨끗한 이미지가 필요할 때가 있습니다.

## 손실 없는 복원

Image Refinement는 **역 알파 블렌딩(Reverse Alpha Blending)** 알고리즘을 사용합니다.

- **AI 인페인팅이 아닙니다**: 기존의 워터마크 제거는 AI로 해당 영역을 "뭉개는" 경우가 많아 픽셀 세부 정보가 손상됩니다.
- **픽셀 단위의 정확성**: 수학적 계산으로 투명한 워터마크 층만 정확히 걷어내어 원본 픽셀 100%를 복원합니다.
- **화질 손실 없음**: 처리된 이미지는 워터마크가 없는 모든 영역이 원본과 똑같습니다.

## 사용 방법

Voyager 팝업에서 **Image Refinement 옵션**을 찾으세요. 두 스위치는 직접 켜기 전까지 꺼져 있습니다.

- **다운로드 시 워터마크 제거** (권장): Gemini의 다운로드 버튼을 누르면 저장되는 파일에서 워터마크가 제거됩니다. 다운로드 버튼에 작은 🍌 배지가 표시되면 기능이 켜진 상태입니다. 버튼 자체는 여전히 Gemini의 버튼입니다.
- **미리보기에서 워터마크 제거** (불안정): 화면에 보이는 이미지도 함께 정리합니다. 처리 속도가 느리고, 처리 중에 이미지가 잠깐 깜빡일 수 있습니다.

## Gemini의 내장 옵션

Gemini는 자체 표시 워터마크 스위치를 순차적으로 제공하고 있습니다. **설정 → Media watermark → Off**입니다. 계정에 이 옵션이 있다면 그것을 사용하고 Voyager의 워터마크 제거는 끄세요. Gemini의 옵션이 더 안정적입니다. Voyager는 이에 대해 한 번 안내 메시지를 표시하며, 최근 이미지가 이미 워터마크 없이 생성되고 있으면 그 사실도 알려 줍니다. 아직 스위치가 보이지 않는다면 Voyager를 계속 사용하세요. 어느 쪽이든 SynthID와 C2PA 메타데이터는 그대로 남습니다.

<div style="text-align: center; margin-top: 30px;">
  <img src="/assets/nanobanana.png" alt="Image Refinement 데모" style="border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.15); max-width: 100%;"/>
</div>

## 감사의 말

이 기능은 [journey-ad (Jad)](https://github.com/journey-ad)의 [gemini-watermark-remover](https://github.com/journey-ad/gemini-watermark-remover) 프로젝트를 기반으로 합니다. 이 프로젝트는 [allenk](https://github.com/allenk)의 [원본 C++ 구현](https://github.com/allenk/GeminiWatermarkTool)을 JavaScript로 옮긴 것입니다. 커뮤니티에 기여해 주신 분들께 감사드립니다. 🧡
보존해야 하는 MIT 고지는 [THIRD_PARTY_NOTICES.md](https://github.com/voyager-crew/voyager/blob/main/THIRD_PARTY_NOTICES.md)에서 확인할 수 있습니다.

## 개인정보 및 보안

모든 처리는 **사용자의 브라우저 안에서 로컬로** 이루어집니다. 이미지는 어떤 제3자 서버에도 업로드되지 않으므로 개인정보와 창작물의 보안이 지켜집니다.
