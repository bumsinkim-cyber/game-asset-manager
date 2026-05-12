# Game Asset Generator

bagelcode codeb(AI 프록시)를 이용해 게임 에셋을 대량 자동 생성하는 웹 툴입니다.

- **배경**: 월드 × 스테이지 구조로 레벨별 배경 이미지 생성
- **캐릭터**: 주인공 / 월드별 적 / NPC — 표정·모션(Idle·Attack·Run·Jump·Hurt·Victory) GIF 생성
- **오브젝트**: 아이템·배경소품·플랫폼·장애물 투명배경 PNG 생성
- **트랜드 분석**: Anthropic API로 최신 게임 트랜드 키워드 자동 검색

## 기술 스택

| 구분 | 기술 |
|------|------|
| 백엔드 | Python 3.11+, FastAPI, WebSocket, Pillow |
| 프론트엔드 | React 18, TypeScript, Vite, Tailwind CSS |
| 이미지 생성 | bagelcode aiproxy (`gpt-image-1.5`) |

## 로컬 실행

### 요구사항
- Python 3.11+
- Node.js 18+

### 1. 백엔드 실행

```bash
cd backend
pip install -r requirements.txt

# (선택) .env 설정 — 트랜드 검색 기능에 Anthropic API 키 필요
cp .env.example .env
# .env 파일에 ANTHROPIC_API_KEY 입력

uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 2. 프론트엔드 실행

```bash
cd frontend
npm install
npm run dev
```

### 3. 접속

브라우저에서 `http://localhost:5173` 열기

> **API 토큰**: bagelcode 내부 aiproxy 토큰(`aiproxy_xxx...`)을 UI에서 입력하세요.  
> 토큰은 localStorage에 저장되어 새로고침해도 유지됩니다.

---

### Windows 배치 파일 (빠른 실행)

```
start-backend.bat   ← 백엔드 자동 설치 + 실행
start-frontend.bat  ← 프론트엔드 자동 설치 + 실행
```

두 파일을 각각 더블클릭하면 됩니다.

## 프로젝트 구조

```
game-asset-generator/
├── backend/
│   ├── main.py                  # FastAPI 앱, WebSocket 엔드포인트
│   ├── requirements.txt
│   ├── .env.example
│   └── services/
│       ├── image_client.py      # aiproxy API 호출
│       ├── prompt_builder.py    # 배경 프롬프트 빌더
│       ├── character_builder.py # 캐릭터 프롬프트 빌더 (표정 포함)
│       ├── gif_maker.py         # Pillow GIF 애니메이션 생성
│       └── trend_searcher.py    # Anthropic API 트랜드 검색
├── frontend/
│   ├── src/
│   │   ├── App.tsx              # 메인 UI
│   │   └── main.tsx
│   ├── package.json
│   └── vite.config.ts
├── start-backend.bat
└── start-frontend.bat
```
