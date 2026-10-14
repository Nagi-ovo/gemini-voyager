import type { HomeFeaturesContent } from '../types';

export const ko: HomeFeaturesContent = {
  timeline: {
    eyebrow: '타임라인',
    title: '스크롤하지 마세요. 날아보세요.',
    body: '오른쪽의 점 하나하나가 당신이 던진 질문입니다. 마우스를 올리면 어떤 질문인지 보이고, 클릭하면 바로 그곳으로 이동합니다. 레일 위에 잠시 머무르면 목록 버튼이 나타나고, 누르면 대화 전체를 한눈에 보며 검색할 수 있습니다.',
    hint: '해 보세요: 점 클릭 · 길게 눌러 별표 · 레일에 마우스를 올려 전체 보기',
    overview: '대화 전체 보기',
    searchPlaceholder: '이 대화에서 검색',
    noMatch: '"{q}"와(과) 일치하는 질문이 없습니다',
  },
  folders: {
    eyebrow: '폴더',
    title: '당신의 생각을 위한 파일 시스템.',
    body: 'Gemini 사이드바 안에 그대로. 2단계 폴더, 별표 대화는 맨 위에, 검색까지.',
    hint: '해 보세요: 다른 대화 열기 · 폴더로 드래그 · "고양이" 검색',
    heading: '폴더',
    searchPlaceholder: '폴더 및 채팅 검색',
    newFolder: '새 폴더',
    noMatch: '"{q}"와(과) 일치하는 폴더나 채팅이 없습니다',
    star: '별표 표시',
  },
  prompts: {
    eyebrow: '프롬프트 라이브러리',
    title: '버리지 마세요. 저장하세요.',
    body: '자주 쓰는 문장은 한 번만 저장하면 어떤 웹 AI에서든 불러올 수 있어요. DeepSeek Harness 같은 로컬 WebUI에서도요.',
    hint: '해 보세요: 하나를 고르면 왼쪽 입력창에 들어갑니다. 그다음 전송을 누르세요',
    add: '추가',
    searchPlaceholder: '프롬프트 또는 태그 검색',
    all: '모두',
    saved: '저장 보관함',
    settings: '설정',
    noMatch: '"{q}"와(과) 일치하는 프롬프트가 없습니다',
  },
  composer: {
    replies: [
      '여기는 데모라서 미리 써 둔 말만 할 수 있어요. 그래도 방금 보낸 메시지로 타임라인에 점이 하나 생겼어요. 길게 누르면 별표를 달 수 있어요.',
      "진짜 답은 평소 쓰는 AI에게 물어보세요. 자주 쓰는 문장이라면 프롬프트 라이브러리의 '{add}'로 저장해 두면 다음엔 한 번에 입력돼요.",
      '알겠어요. 하나 알려 드리면, 이 대화를 폴더로 끌어다 놓으면 기록을 뒤질 필요가 없어요.',
      '저는 정해진 데모 답변이에요. Voyager를 설치하면 이 타임라인, 폴더, 프롬프트 라이브러리가 실제로 쓰는 Gemini, ChatGPT, Claude, DeepSeek에 나타나요.',
    ],
    placeholder: '아무거나 물어보거나 프롬프트를 골라 보세요',
    send: '전송',
    ball: '프롬프트 라이브러리 열기',
  },
  demo: { replay: '다시 보기', close: '데모 종료', prev: '이전 기능', next: '다음 기능' },
  replyLeads: {
    table: '표로 정리했어요:',
    summary: '세 줄 요약:',
    todo: '하나씩 체크해 보세요:',
    plain: '쉽게 말하면:',
  },
  chats: {
    kyoto: {
      title: '교토 2박 3일 일정',
      star: true,
      starred: [3],
      turns: [
        [
          '11월에 교토 가는데 3일 일정 어떻게 짜면 좋을까?',
          '11월은 단풍이 절정인 시기예요. 지역별로 나눠서 다니는 걸 추천해요:\n- 1일차 히가시야마: 기요미즈데라, 니넨자카, 야사카 신사\n- 2일차 아라시야마: 대나무 숲, 덴류지, 사가노 도롯코 열차\n- 3일차 후시미 이나리, 오후에는 니시키 시장',
        ],
        [
          '기요미즈데라는 몇 시에 가야 덜 붐벼?',
          '문을 여는 6시부터 7시 사이가 가장 한산해요. 무대에 아침 햇살이 들어오는 모습도 이때가 제일 예쁘고, 9시가 넘으면 단체 관광객이 몰려와요.',
        ],
        [
          '아라시야마 도롯코 열차는 미리 예약해야 해?',
          '단풍철에는 한 달 전쯤 공식 사이트에서 예약하는 게 좋아요. 진행 방향 오른쪽 좌석에 앉으면 호즈강 협곡이 잘 보여요.',
        ],
        [
          '숙소는 어느 쪽이 이동하기 제일 편해?',
          '교토역이나 시조 가와라마치 근처요. 교토역은 후시미와 아라시야마 가는 길목이고, 가와라마치는 저녁 먹고 산책하기 좋아요.',
        ],
        [
          '줄 안 서는 라멘집 있을까?',
          '12시와 6시 식사 시간만 피하면 대부분 줄 없이 들어갈 수 있어요. 가와라마치 근처 동네 라멘집은 밤 9시 이후면 거의 바로 앉을 수 있어요.',
        ],
      ],
      extra: {
        table: [
          ['일차', '오전', '오후'],
          ['1일차', '기요미즈데라', '니넨자카, 야사카 신사'],
          ['2일차', '대나무 숲', '덴류지, 도롯코 열차'],
          ['3일차', '후시미 이나리', '니시키 시장'],
        ],
        summary: [
          '단풍철에는 히가시야마, 아라시야마, 후시미로 나눠서 다니기',
          '기요미즈데라는 아침 6~7시, 도롯코 열차는 한 달 전에 예약',
          '숙소는 교토역이나 가와라마치, 식사는 피크 시간을 피해서',
        ],
        translation:
          'Skip the 12 pm and 6 pm rush and most ramen shops have no line. Around Kawaramachi, small local spots are usually walk-in after 9 pm.',
        todo: [
          '도롯코 열차 예약 (한 달 전)',
          '교토역 근처 숙소 예약',
          '기요미즈데라 개장 시간 확인',
          'ICOCA 카드 구입',
        ],
      },
    },
    packing: {
      title: '출발 전 짐 싸기',
      turns: [
        [
          '11월 교토 가는데 두꺼운 패딩 필요해?',
          '아침저녁은 8도 안팎, 낮에는 15도 정도예요. 긴팔 위에 경량 패딩이나 플리스 하나면 충분해요.',
        ],
        [
          '일본 콘센트 우리나라랑 달라?',
          '달라요. 일본은 납작한 핀 두 개짜리 A형에 100V라서 한국 플러그는 그대로 안 꽂혀요. "돼지코"라고 부르는 변환 어댑터를 챙기세요. 휴대폰·노트북 충전기는 프리볼트라 어댑터만 끼우면 되지만, 드라이어나 고데기는 사용 전압을 꼭 확인하세요.',
        ],
        [
          '스이카랑 ICOCA 중에 뭐가 나아?',
          '둘 다 간사이에서 쓸 수 있어요. 간사이에서는 ICOCA가 더 흔하고, 교토역 발매기에서 바로 살 수 있어요.',
        ],
      ],
      extra: {
        table: [
          ['물건', '챙길까?', '메모'],
          ['경량 패딩', '필수', '아침저녁 8도'],
          ['돼지코', '필수', 'A형, 100V'],
          ['교통카드', '현지 구입', 'ICOCA'],
        ],
        summary: [
          '경량 패딩이나 플리스에 긴팔이면 충분',
          '일본은 A형 100V라 돼지코 필수',
          '교통카드는 교토역에서 ICOCA 구입',
        ],
        translation:
          'Both work in Kansai, but ICOCA is more common there. You can buy one from the ticket machines at Kyoto Station.',
        todo: ['경량 패딩', '긴팔 두 벌', '돼지코와 충전기, 보조배터리', '여권과 숙소 예약 확인서'],
      },
    },
    dinner: {
      title: '냉장고 털어서 저녁 메뉴',
      turns: [
        [
          '냉장고에 계란, 토마토, 양파 반 개 있는데 저녁 뭐 해 먹지?',
          '토마토 달걀볶음이 제일 빨라요. 10분이면 돼요: 달걀을 스크램블해서 덜어 두고, 양파와 토마토를 즙이 나올 때까지 볶은 다음 달걀을 다시 넣고 섞어 주세요.',
        ],
        [
          '국도 하나 있었으면 좋겠어',
          '남은 토마토로 토마토 달걀국을 끓여 보세요. 토마토를 살짝 볶다가 물을 붓고 끓으면 풀어 둔 달걀을 둘러 넣고, 소금으로 간하면 끝이에요.',
        ],
        [
          '대파 없어도 괜찮아?',
          '괜찮아요. 불 끄기 직전에 후추를 살짝 뿌리거나 참기름 몇 방울을 넣으면 충분히 향이 살아요.',
        ],
      ],
      extra: {
        table: [
          ['메뉴', '재료', '시간'],
          ['토마토 달걀볶음', '달걀 3개, 토마토 1개, 양파 반 개', '10분'],
          ['토마토 달걀국', '토마토 1개, 달걀 1개', '8분'],
        ],
        summary: [
          '메인은 토마토 달걀볶음',
          '국은 토마토 달걀국',
          '대파가 없으면 후추나 참기름으로 향 내기',
        ],
        translation:
          'Sure. A pinch of black pepper or a few drops of sesame oil just before you take it off the heat brings out the flavor just as well.',
        todo: ['밥 안치기', '달걀 스크램블해서 덜어 두기', '토마토와 양파 볶기', '달걀국 끓이기'],
      },
    },
    week: {
      title: '일주일 도시락 메뉴',
      turns: [
        [
          '일주일 치 회사 도시락 메뉴 짜 줘. 너무 손 많이 안 가게',
          '주말에 메인 반찬 세 가지를 한꺼번에 만들어 두세요: 간장 닭다리살 조림, 소불고기, 마늘 브로콜리 볶음. 1인분씩 나눠 냉동해 두고, 평일에는 하나씩 꺼내 갓 지은 밥과 싸 가면 돼요.',
        ],
        [
          '하루 5천 원 안으로 가능할까?',
          '가능해요. 닭다리살과 불고기용 소고기는 대용량으로 사고 브로콜리는 제철일 때 사면, 한 끼에 3,500원 정도 나와요.',
        ],
      ],
      extra: {
        table: [
          ['요일', '메인 반찬'],
          ['월', '간장 닭다리살 조림'],
          ['화', '소불고기'],
          ['수', '간장 닭다리살 조림'],
          ['목', '소불고기'],
          ['금', '마늘 브로콜리 볶음과 닭다리살'],
        ],
        summary: [
          '주말에 메인 반찬 세 가지를 만들어 소분 냉동',
          '평일에는 밥만 새로 짓기',
          '한 끼에 3,500원 정도',
        ],
        translation:
          'Yes. Buy boneless chicken thighs and bulgogi beef in bulk and get broccoli while it is in season, and each meal comes to about 3,500 won.',
        todo: ['닭다리살 1kg', '불고기용 소고기 600g', '브로콜리 3송이', '도시락 용기 10개'],
      },
    },
    landlord: {
      title: '집주인에게 보일러 고장 알리기',
      turns: [
        [
          '보일러가 고장 났는데 집주인한테 어떻게 말하는 게 좋을까?',
          '언제부터 어떤 증상인지 먼저 말하고, 수리 기사를 언제 부를 수 있는지 여쭤본 다음, 집에 있는 시간을 알려 드리면 돼요.',
        ],
        [
          '문자로 보낼 내용 써 줘',
          '사장님 안녕하세요, 302호입니다. 어젯밤부터 보일러가 점화가 안 돼서 온수가 안 나오고 있어요. 혹시 이번 주 안에 수리 기사님 방문을 잡아 주실 수 있을까요? 평일 저녁이랑 주말에는 집에 있어서 시간 맞춰 드릴 수 있어요. 감사합니다!',
        ],
      ],
      extra: {
        table: [
          ['전할 내용', '어떻게 말할까'],
          ['증상', '어젯밤부터 점화가 안 됨'],
          ['요청', '수리 기사 방문'],
          ['가능한 시간', '평일 저녁과 주말'],
        ],
        summary: [
          '증상과 시작 시점부터 말하기',
          '수리 기사 방문을 부탁하기',
          '집에 있는 시간 알려 드리기',
        ],
        translation:
          "Hello, this is the tenant in unit 302. The boiler hasn't been able to ignite since last night, so there's no hot water. Could you arrange for a repair technician to come by sometime this week? I'm home on weekday evenings and weekends, so I can work around their schedule. Thank you!",
        todo: ['보일러 에러 코드 사진 찍기', '집주인에게 문자 보내기', '수리 일정 잡기'],
      },
    },
    run: {
      title: '러닝할 때 무릎 통증',
      turns: [
        [
          '요즘 달리면 무릎 바깥쪽이 아파. 계속 뛰어도 될까?',
          '무릎 바깥쪽 통증은 장경인대가 뭉쳐서 생기는 경우가 많아요. 3~5일 정도 쉬고, 통증이 사라지면 짧은 조깅부터 다시 시작하세요. 걸을 때도 아프다면 정형외과에서 진료를 받아 보세요.',
        ],
        [
          '도움 되는 스트레칭 있어?',
          '- 폼롤러로 허벅지 바깥쪽 풀기, 한쪽당 2분\n- 선 자세에서 다리 꼬고 옆으로 늘리기, 한쪽당 30초\n- 옆으로 누워 다리 들어 올리기, 한쪽당 15회',
        ],
      ],
      extra: {
        table: [
          ['동작', '시간 또는 횟수'],
          ['폼롤러 풀기', '한쪽당 2분'],
          ['다리 꼬고 옆으로 늘리기', '한쪽당 30초'],
          ['옆으로 누워 다리 들기', '한쪽당 15회'],
        ],
        summary: [
          '무릎 바깥쪽 통증은 대개 장경인대 문제',
          '3~5일은 쉬기',
          '매일 폼롤러와 엉덩이 근력 운동',
        ],
        translation:
          '- Foam-roll the outer thigh, 2 minutes per side\n- Standing cross-leg stretch, 30 seconds per side\n- Side-lying leg raises, 15 reps per side',
        todo: ['3일 쉬기', '매일 폼롤러로 풀기', '하루 3세트 다리 들기', '다시 뛸 땐 3km부터'],
      },
    },
    cat: {
      title: '고양이가 밥을 잘 안 먹어요',
      turns: [
        [
          '고양이가 이틀째 사료를 잘 안 먹어. 괜찮은 걸까?',
          '먼저 기운, 물 마시는 양, 화장실 상태를 살펴보세요. 활발한데 입맛만 까다로운 거라면 다른 맛 사료를 줘 보고, 24시간 넘게 아예 안 먹는다면 바로 동물병원에 가세요.',
        ],
        [
          '사료는 어떻게 바꿔야 해?',
          '일주일에 걸쳐 천천히 바꾸세요. 처음 이틀은 새 사료 4분의 1, 다음 사흘은 절반, 마지막 이틀은 4분의 3으로요.',
        ],
      ],
      extra: {
        table: [
          ['기간', '새 사료 비율'],
          ['1–2일차', '25%'],
          ['3–5일차', '50%'],
          ['6–7일차', '75%'],
        ],
        summary: [
          '기운, 물, 화장실 상태부터 확인',
          '24시간 넘게 안 먹으면 동물병원',
          '사료는 일주일에 걸쳐 교체',
        ],
        translation:
          'Switch over a week: a quarter new food for the first two days, half for the next three, and three quarters for the last two.',
        todo: ['오늘 먹은 양 기록하기', '다른 맛 사료 소포장 사기', '일주일 비율대로 섞어 주기'],
      },
    },
    headphones: {
      title: '노이즈 캔슬링 헤드폰 고르기',
      turns: [
        [
          '출퇴근용 노캔 헤드폰 어떻게 골라야 해?',
          '먼저 예산을 정하고, 노이즈 캔슬링 성능, 착용감, 배터리 세 가지를 비교하세요. 시끄러운 지하철이라면 노캔 성능이 우선이고, 하루에 몇 시간씩 쓴다면 착용감이 더 중요해요.',
        ],
        [
          '안경 쓰면 불편해?',
          '네. 오버이어 이어컵이 안경다리를 눌러서 밀폐가 깨지고 노캔 효과도 떨어져요. 안경을 쓴다면 이어폰형이 더 편해요.',
        ],
      ],
      extra: {
        table: [
          ['유형', '노이즈 캔슬링', '안경 착용 시'],
          ['오버이어', '더 강함', '안경다리를 누름'],
          ['이어폰형', '충분함', '문제없음'],
        ],
        summary: ['예산부터 정하기', '지하철 출퇴근이면 노캔 성능 우선', '안경을 쓴다면 이어폰형'],
        translation:
          'Yes. Over-ear cups press on the arms of your glasses, which breaks the seal and weakens the noise cancelling. If you wear glasses, earbuds are the more comfortable choice.',
        todo: ['예산 정하기', '매장에서 두 모델 착용해 보기', '배터리와 케이스 크기 비교하기'],
      },
    },
  },
  tree: [
    {
      folder: '여행',
      open: true,
      kids: [{ folder: '교토', open: true, kids: [{ chat: 'kyoto' }, { chat: 'packing' }] }],
    },
    { folder: '요리', kids: [{ chat: 'dinner' }, { chat: 'week' }] },
    { chat: 'landlord' },
    { chat: 'run' },
    { chat: 'cat' },
    { chat: 'headphones' },
  ],
  current: 'kyoto',
  promptList: [
    { name: '표로 정리하기', tag: '정리', text: '위 내용을 표로 정리해 줘.', reply: 'table' },
    { name: '세 줄 요약', tag: '정리', text: '이 대화를 세 줄로 요약해 줘.', reply: 'summary' },
    {
      name: '체크리스트 만들기',
      tag: '정리',
      text: '하나씩 체크할 수 있는 할 일 목록으로 만들어 줘.',
      reply: 'todo',
    },
    {
      name: '자연스러운 영어로',
      tag: '번역',
      text: '방금 답변을 자연스러운 영어로 번역해 줘.',
      reply: 'translate',
    },
    {
      name: '더 쉽게 설명하기',
      tag: '공부',
      text: '방금 말한 걸 한 문장으로 쉽게 다시 말해 줘.',
      reply: 'plain',
    },
  ],
  groups: [
    {
      title: '보는 즐거움',
      items: [
        {
          icon: 'move-horizontal',
          name: '대화 너비',
          detail: '대화 영역을 넓혀 코드와 표가 한 줄에',
        },
        { icon: 'a-large-small', name: '글꼴 크기', detail: '대화 글꼴 크기만 따로 조절' },
        { icon: 'clock-3', name: '메시지 타임스탬프', detail: '메시지마다 보낸 시간 표시' },
        {
          icon: 'workflow',
          name: 'Mermaid 다이어그램',
          detail: '순서도와 시퀀스 다이어그램을 바로 렌더링',
        },
        { icon: 'snowflake,rain,sakura', name: '시각 효과', detail: '눈, 비, 벚꽃' },
      ],
    },
    {
      title: '내 데이터',
      items: [
        { icon: 'file-down', name: '대화 내보내기', detail: 'Markdown, PDF, JSON, 이미지' },
        { icon: 'microscope', name: 'Deep Research 내보내기', detail: '사고 과정과 출처 링크까지' },
        { icon: 'cloud', name: '클라우드 동기화', detail: 'Google Drive, Safari에서는 iCloud' },
        { icon: 'list-x', name: '일괄 삭제', detail: '여러 대화를 골라 한 번에 삭제' },
        { icon: 'image', name: '워터마크 제거', detail: 'Nano Banana 이미지를 손실 없이 복원' },
      ],
    },
    {
      title: '간편한 조작',
      items: [
        { icon: 'quote', name: '인용 답장', detail: '한 구절을 선택해 바로 이어서 질문' },
        {
          icon: 'corner-down-left',
          name: '전송 동작',
          detail: 'Enter는 줄바꿈, Ctrl+Enter로 전송',
        },
        { icon: 'star', name: '기본 모델', detail: '새 대화는 늘 쓰던 모델로 시작' },
        { icon: 'git-branch', name: '대화 분기', detail: '원하는 지점에서 갈라져 다르게 물어보기' },
        { icon: 'sigma', name: '수식 복사', detail: '클릭 한 번으로 LaTeX나 Word 수식 복사' },
      ],
    },
    {
      title: '열린 생태계',
      items: [
        { icon: 'puzzle', name: '플러그인 마켓', detail: '공식·커뮤니티 플러그인을 원클릭 설치' },
        { icon: 'globe', name: '여러 사이트 지원', detail: 'Claude, ChatGPT, DeepSeek에서도' },
        {
          icon: 'monitor',
          name: '로컬 웹 UI',
          detail: 'OpenCode 같은 로컬 화면에서도 프롬프트 라이브러리를',
        },
        { icon: 'code', name: '컨텍스트 동기화', detail: '대화 컨텍스트를 VS Code로 보내기' },
        {
          icon: 'panel-left-close',
          name: '사이드바 자동 숨김',
          detail: '마우스를 떼면 접혀서 대화에 집중',
        },
      ],
    },
  ],
};
