# 광장 서버 (Cloudflare Worker + Durable Object)

세계음악분수 공개 주소에서 친구들이 같은 광장에서 만나도록 위치를 주고받는 실시간 서버입니다.

## 올리는 방법 (한 번만)
1. Cloudflare 무료 계정을 만듭니다.
2. 이 폴더에서 `npm install` → `npx wrangler login` (브라우저에서 허용) → `npx wrangler deploy`
3. 나온 주소(예: `https://sac-fountain-plaza.<계정>.workers.dev`)를 `wss://` 로 바꿔 index.html의 `__PLAZA_URL__` 자리에 넣습니다.

서버 주소가 없으면 페이지는 자동으로 공개 MQTT 중계 서버로 연결됩니다.

## 방 나누기
주소 끝에 `#방이름`을 붙이면(예: `.../sac-music-fountain/#class3`) 같은 방 이름끼리만 만납니다.
