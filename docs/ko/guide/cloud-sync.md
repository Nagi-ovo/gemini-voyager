# 클라우드 동기화

폴더, 프롬프트 라이브러리 및 기타 데이터를 Google Drive에 동기화하여 여러 기기에서 일관된 환경을 유지하세요.

## 주요 기능

- **다중 기기 동기화**: Google Drive를 사용하여 여러 컴퓨터 간에 설정을 동기화 상태로 유지합니다.
- **데이터 프라이버시**: 데이터가 본인의 Google Drive 저장소에 직접 저장되므로 제3자 서버 없이 프라이버시가 보장됩니다.
- **유연한 동기화**: 수동 업로드 및 데이터 다운로드/병합을 지원합니다.

::: info
**출시 예정**: 다음 버전에서는 별표 표시된 대화 동기화가 지원될 예정입니다.
:::

## 사용 방법

1. Gemini 페이지 우측 하단의 확장 프로그램 아이콘을 클릭하여 설정 패널을 엽니다.
2. **클라우드 동기화 (Cloud Sync)** 섹션을 찾습니다.
3. **Google 계정으로 로그인 (Sign in with Google)**을 클릭하고 권한 승인을 완료합니다.
4. 승인이 완료되면 **클라우드에 업로드 (Upload to Cloud)**를 클릭하여 로컬 데이터를 클라우드로 동기화하거나, **다운로드 및 병합 (Download & Merge)**을 클릭하여 클라우드 데이터를 로컬로 가져옵니다.

### 💡 빠른 동기화

가장 쉬운 방법은 왼쪽 사이드바의 폴더 영역 상단에 있는 **"클라우드에 업로드"** 또는 **"다운로드 및 병합"** 버튼을 클릭하는 것입니다.

<img src="/assets/cloud-sync.png" alt="클라우드 동기화 빠른 버튼" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin-top: 10px; max-width: 600px;"/>

::: warning
**보안 권장 사항: 이중 보호**  
클라우드 동기화는 매우 편리하지만, 정기적으로 **로컬 파일**을 사용하여 핵심 데이터를 백업하는 것을 강력히 권장합니다.

1. **전체 내보내기**: 설정 패널 하단의 "백업 및 복원 (Backup & Restore)"에서 모든 설정, 폴더, 프롬프트가 포함된 전체 패키지를 내보냅니다.
   <img src="/assets/manual-export-all.png" alt="전체 내보내기" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin-top: 10px; max-width: 600px;"/>
2. **모든 폴더 내보내기**: 설정 패널의 "폴더 (Folders)" 섹션에서 "내보내기 (Export)"를 클릭하여 프롬프트를 제외한 모든 폴더와 대화를 백업합니다.
   <img src="/assets/manual-folder-export.png" alt="모든 폴더 내보내기" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin-top: 10px; max-width: 600px;"/>
   :::
