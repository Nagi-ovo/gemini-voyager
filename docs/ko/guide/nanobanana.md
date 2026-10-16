# Image Refinement (워터마크 제거)

::: tip Safari 지원
v1.6.0부터 **Image Refinement**가 Safari에서 직접 작동하며, 워터마크가 제거된 전체 크기 이미지 다운로드도 지원합니다. Chrome, Edge, Firefox, Safari에서 동일한 내장 흐름을 사용할 수 있습니다.
:::

**AI 이미지를 순수하게 유지하세요.**

Gemini™가 생성한 이미지에는 기본적으로 눈에 보이는 워터마크가 포함되어 있습니다. 이는 안전을 위한 조치이지만, 완벽하게 깨끗한 이미지가 필요한 창의적인 상황이 있을 수 있습니다.

## 무손실 복구

Image Refinement는 **역 알파 블렌딩 (Reverse Alpha Blending)** 알고리즘을 사용합니다.

- **AI 인페인팅이 아닙니다**: 기존의 워터마크 제거 방식은 종종 AI를 사용하여 해당 영역을 "뭉개는" 방식을 사용하며, 이는 픽셀 세부 정보를 파괴합니다.
- **완벽한 픽셀 복구**: 우리는 수학적 계산을 통해 투명한 워터마크 레이어를 정밀하게 제거하여 100% 원본 픽셀을 복원합니다.
- **품질 저하 제로**: 처리된 이미지는 워터마크가 없는 모든 영역에서 원본과 동일하게 유지됩니다.

## 사용 방법

Voyager 팝업의 **내보내기 및 이미지**에서 원하는 항목을 켜세요. 두 항목 모두 기본값은 꺼짐입니다.

- **다운로드 시 워터마크 제거** (권장): Gemini의 다운로드 버튼을 누르면 저장되는 파일에서 워터마크가 제거됩니다. 다운로드 버튼에 작은 🍌 배지가 표시되면 기능이 켜진 상태입니다. 버튼 자체는 여전히 Gemini의 버튼입니다.
- **미리보기에서 워터마크 제거** (**실험적** 기능): 화면에 보이는 이미지도 함께 정리합니다. 처리 속도가 느리고, 처리 중에 이미지가 잠깐 깜빡일 수 있습니다.

다운로드 시 제거를 끄면 이후 다운로드에는 워터마크 제거를 적용하지 않습니다. 이미 처리 중인 다운로드는 시작 당시 설정으로 완료되며, 스위치를 바꿨다고 같은 파일을 두 번 저장하지 않습니다. 미리보기에서 제거를 끄면 Voyager가 바꾼 이미지 중 처리 결과가 그대로 표시되고 있는 이미지만 원본으로 되돌립니다. 이후 Gemini가 변경한 이미지는 덮어쓰지 않습니다.

## Gemini의 내장 옵션

Gemini는 자체 표시 워터마크 스위치를 순차적으로 제공하고 있습니다. **설정 → Media watermark → Off**입니다. 계정에 이 옵션이 있다면 그것을 사용하고 Voyager의 워터마크 제거는 끄세요. Gemini의 옵션이 더 안정적입니다. Voyager는 이에 대해 한 번 안내 메시지를 표시하며, 최근 이미지가 이미 워터마크 없이 생성되고 있으면 그 사실도 알려 줍니다. 아직 스위치가 보이지 않는다면 Voyager를 계속 사용하세요. 어느 쪽이든 SynthID와 C2PA 메타데이터는 그대로 남습니다.

<div style="text-align: center; margin-top: 30px;">
  <img src="/assets/nanobanana.png" alt="Image Refinement 데모" style="border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.15); max-width: 100%;"/>
</div>

## 감사 인사

이 기능은 [journey-ad (Jad)](https://github.com/journey-ad)의 [gemini-watermark-remover](https://github.com/journey-ad/gemini-watermark-remover) 프로젝트를 기반으로 하며, 이는 [allenk](https://github.com/allenk)의 [원본 C++ 구현](https://github.com/allenk/GeminiWatermarkTool)을 JavaScript로 포팅한 것입니다. 커뮤니티에 대한 그들의 기여에 감사드립니다. 🧡
보존된 제3자 MIT 고지는 [THIRD_PARTY_NOTICES.md](https://github.com/voyager-crew/voyager/blob/main/THIRD_PARTY_NOTICES.md)에서 확인할 수 있습니다.

## 프라이버시 및 보안

모든 처리는 **사용자의 브라우저 내에서 로컬로** 이루어집니다. 이미지는 제3자 서버로 절대 업로드되지 않으므로 프라이버시와 창의적 보안이 보장됩니다.
