# NanoBanana 옵션

::: warning 브라우저 호환성
현재 **NanoBanana** 워터마크 제거 기능은 브라우저 API 제한으로 인해 **Safari에서 지원되지 않습니다**. 이 기능을 사용해야 하는 경우 **Chrome** 또는 **Firefox**를 사용하는 것을 권장합니다.

Safari 사용자는 다운로드한 이미지를 [banana.ovo.re](https://banana.ovo.re/)와 같은 도구 사이트에 업로드하여 수동으로 제거할 수 있습니다(단, 이미지 해상도에 따라 모든 이미지가 성공적으로 복구되는 것은 아닙니다).
:::

**AI 이미지를 순수하게 유지하세요.**

Gemini가 생성한 이미지에는 기본적으로 눈에 보이는 워터마크가 포함되어 있습니다. 이는 안전을 위한 조치이지만, 완벽하게 깨끗한 이미지가 필요한 창의적인 상황이 있을 수 있습니다.

## 무손실 복구

NanoBanana는 **역 알파 블렌딩 (Reverse Alpha Blending)** 알고리즘을 사용합니다.

- **AI 인페인팅이 아닙니다**: 기존의 워터마크 제거 방식은 종종 AI를 사용하여 해당 영역을 "뭉개는" 방식을 사용하며, 이는 픽셀 세부 정보를 파괴합니다.
- **완벽한 픽셀 복구**: 우리는 수학적 계산을 통해 투명한 워터마크 레이어를 정밀하게 제거하여 100% 원본 픽셀을 복원합니다.
- **품질 저하 제로**: 처리된 이미지는 워터마크가 없는 모든 영역에서 원본과 동일하게 유지됩니다.

## 사용 방법

1. **활성화**: Gemini Voyager 설정 패널 끝부분에 있는 "NanoBanana 옵션"을 찾아 활성화합니다.
2. **자동 처리**: 이제 생성하는 모든 이미지가 백그라운드에서 자동으로 처리됩니다.
3. **직접 다운로드**:
   - 처리된 이미지 위에 마우스를 올리면 🍌 버튼이 나타납니다.
   - **🍌 버튼은 기존의 다운로드 버튼을 완전히 대체**하여 항상 100% 워터마크가 제거된 이미지를 직접 받을 수 있도록 보장합니다.

<div style="text-align: center; margin-top: 30px;">
  <img src="/assets/nanobanana.png" alt="NanoBanana 데모" style="border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.15); max-width: 100%;"/>
</div>

## 감사 인사

이 기능은 [journey-ad (Jad)](https://github.com/journey-ad)의 [gemini-watermark-remover](https://github.com/journey-ad/gemini-watermark-remover) 프로젝트를 기반으로 하며, 이는 [allenk](https://github.com/allenk)의 [원본 C++ 구현](https://github.com/allenk/GeminiWatermarkTool)을 JavaScript로 포팅한 것입니다. 커뮤니티에 대한 그들의 기여에 감사드립니다. 🧡

## 프라이버시 및 보안

모든 처리는 **사용자의 브라우저 내에서 로컬로** 이루어집니다. 이미지는 제3자 서버로 절대 업로드되지 않으므로 프라이버시와 창의적 보안이 보장됩니다.
