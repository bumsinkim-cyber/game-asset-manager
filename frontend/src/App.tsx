import { useState, useRef, useCallback, useEffect } from 'react'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const WS_BASE = API_BASE.replace(/^http/, 'ws')

const DEFAULT_NEGATIVE = 'blurry, low quality, watermark, text, logo, signature, ugly, distorted, deformed'

const BG_SIZES = [
  { label: '1536×1024 (가로)', value: '1536x1024' },
  { label: '1024×1024 (정방형)', value: '1024x1024' },
  { label: '1024×1536 (세로)', value: '1024x1536' },
]

const CHAR_SIZES = [
  { label: '1024×1024 (권장)', value: '1024x1024' },
  { label: '1792×1024 (가로)', value: '1792x1024' },
  { label: '1024×1792 (세로)', value: '1024x1792' },
]

const OBJ_TYPE_LABELS: Record<string, string> = {
  item: '아이템/수집물',
  prop: '배경 소품',
  platform: '플랫폼/지형',
  obstacle: '장애물/트랩',
}

type Tab = 'backgrounds' | 'characters' | 'objects' | 'ui'

interface Progress {
  current: number
  total: number
  label: string
  status: 'idle' | 'generating' | 'complete'
}

// Background types
interface BgImage {
  level: string; world: number; stage: number
  url: string | null; prompt: string | null
  status: 'pending' | 'generating' | 'done' | 'error'; error?: string
}

const EXPRESSIONS = [
  { value: 'neutral',    label: '기본' },
  { value: 'happy',      label: '기쁨' },
  { value: 'angry',      label: '분노' },
  { value: 'sad',        label: '슬픔' },
  { value: 'surprised',  label: '놀람' },
  { value: 'determined', label: '결의' },
]

// Character types
interface ExpressionData {
  png_url: string; gif_urls: Record<string, string>
  status: 'pending' | 'generating' | 'done' | 'error'; error?: string
}

interface CharResult {
  label: string; char_type: string; world: number | null
  prompt: string | null; status: 'pending' | 'generating' | 'done' | 'error'; error?: string
  expressions: Record<string, ExpressionData>
}

function emptyExpressions(): Record<string, ExpressionData> {
  return Object.fromEntries(
    EXPRESSIONS.map(e => [e.value, { png_url: '', gif_urls: {}, status: 'pending' as const }])
  )
}

const MOTIONS = [
  { value: 'idle',    label: 'Idle' },
  { value: 'attack',  label: 'Attack' },
  { value: 'run',     label: 'Run' },
  { value: 'jump',    label: 'Jump' },
  { value: 'hurt',    label: 'Hurt' },
  { value: 'victory', label: 'Victory' },
]

// UI asset types
const UI_CATEGORIES = [
  { value: 'bubble', label: '말풍선', items: [{ v: 'dialogue', l: '대화' }, { v: 'thought', l: '생각' }, { v: 'shout', l: '외침' }] },
  { value: 'button', label: '버튼',   items: [{ v: 'normal', l: '기본' }, { v: 'hover', l: '호버' }, { v: 'disabled', l: '비활성' }] },
  { value: 'panel',  label: '패널/창', items: [{ v: 'inventory', l: '인벤토리' }, { v: 'popup', l: '팝업' }, { v: 'dialog', l: '대화창' }] },
  { value: 'hud',    label: 'HUD',    items: [{ v: 'hp_bar', l: 'HP바' }, { v: 'mp_bar', l: 'MP바' }, { v: 'exp_bar', l: 'EXP바' }, { v: 'minimap', l: '미니맵' }] },
  { value: 'icon',   label: '아이콘', items: [{ v: 'skill', l: '스킬' }, { v: 'item', l: '아이템' }, { v: 'system', l: '시스템' }] },
]

interface UIResult {
  category: string; item: string; label: string; itemLabel: string
  png_url: string | null; prompt: string | null
  status: 'pending' | 'generating' | 'done' | 'error'; error?: string
}

function buildUISlots(categories: string[]): UIResult[] {
  const slots: UIResult[] = []
  for (const cat of UI_CATEGORIES.filter(c => categories.includes(c.value)))
    for (const { v, l } of cat.items)
      slots.push({ category: cat.value, item: v, label: `${cat.value}_${v}`, itemLabel: l, png_url: null, prompt: null, status: 'pending' })
  return slots
}

// Object types
interface ObjResult {
  label: string; obj_type: string; world: number
  png_url: string | null; prompt: string | null
  status: 'pending' | 'generating' | 'done' | 'error'; error?: string
}

const idleProgress = (): Progress => ({ current: 0, total: 0, label: '', status: 'idle' })

async function downloadFile(url: string) {
  const filename = url.split('/').pop() ?? 'download'
  try {
    const resp = await fetch(url)
    const blob = await resp.blob()
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(blobUrl)
  } catch {
    window.open(url, '_blank')
  }
}

function buildBgSlots(worlds: number, stages: number): BgImage[] {
  const imgs: BgImage[] = []
  for (let w = 1; w <= worlds; w++)
    for (let s = 1; s <= stages; s++)
      imgs.push({ level: `${w}-${s}`, world: w, stage: s, url: null, prompt: null, status: 'pending' })
  return imgs
}

function buildCharSlots(hero: boolean, enemies: boolean, npc: boolean, worlds: number): CharResult[] {
  const slots: CharResult[] = []
  if (hero) slots.push({ label: 'hero', char_type: 'hero', world: null, prompt: null, status: 'pending', expressions: emptyExpressions() })
  if (enemies) for (let w = 1; w <= worlds; w++)
    slots.push({ label: `enemy_w${w}`, char_type: 'enemy', world: w, prompt: null, status: 'pending', expressions: emptyExpressions() })
  if (npc) slots.push({ label: 'npc', char_type: 'npc', world: null, prompt: null, status: 'pending', expressions: emptyExpressions() })
  return slots
}

function buildObjSlots(types: string[], worlds: number): ObjResult[] {
  const slots: ObjResult[] = []
  for (let w = 1; w <= worlds; w++)
    for (const t of types)
      slots.push({ label: `${t}_w${w}`, obj_type: t, world: w, png_url: null, prompt: null, status: 'pending' })
  return slots
}

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('backgrounds')

  // ── Shared ──
  const [apiToken, setApiToken] = useState(() => localStorage.getItem('api_token') ?? '')
  const [baseTheme, setBaseTheme] = useState('medieval fantasy forest')
  const [styleKeywords, setStyleKeywords] = useState('digital art, stylized, vibrant')
  const [trendKeywords, setTrendKeywords] = useState('')
  const [isSearchingTrends, setIsSearchingTrends] = useState(false)
  const [worlds, setWorlds] = useState(3)

  // ── Background ──
  const [stagesPerWorld, setStagesPerWorld] = useState(5)
  const [negativePrompt, setNegativePrompt] = useState(DEFAULT_NEGATIVE)
  const [bgSize, setBgSize] = useState('1536x1024')
  const [bgImages, setBgImages] = useState<BgImage[]>([])
  const [bgProgress, setBgProgress] = useState<Progress>(idleProgress())
  const [isGenBg, setIsGenBg] = useState(false)
  const [bgSessionId, setBgSessionId] = useState<string | null>(null)
  const bgWs = useRef<WebSocket | null>(null)

  // ── Characters ──
  const [genHero, setGenHero] = useState(true)
  const [genEnemies, setGenEnemies] = useState(true)
  const [genNpc, setGenNpc] = useState(false)
  const [charSize, setCharSize] = useState('1024x1024')
  const [selectedMotions, setSelectedMotions] = useState<string[]>(['idle', 'attack', 'jump', 'hurt', 'victory'])
  const [characters, setCharacters] = useState<CharResult[]>([])
  const [charProgress, setCharProgress] = useState<Progress>(idleProgress())
  const [isGenChar, setIsGenChar] = useState(false)
  const [charSessionId, setCharSessionId] = useState<string | null>(null)
  const charWs = useRef<WebSocket | null>(null)

  // ── Objects ──
  const [objTypes, setObjTypes] = useState<string[]>(['item', 'prop', 'platform', 'obstacle'])
  const [objSize, setObjSize] = useState('1024x1024')
  const [objects, setObjects] = useState<ObjResult[]>([])
  const [objProgress, setObjProgress] = useState<Progress>(idleProgress())
  const [isGenObj, setIsGenObj] = useState(false)
  const [objSessionId, setObjSessionId] = useState<string | null>(null)
  const objWs = useRef<WebSocket | null>(null)

  // ── UI Assets ──
  const [uiCategories, setUiCategories] = useState<string[]>(['bubble', 'button', 'panel', 'hud', 'icon'])
  const [uiSize, setUiSize] = useState('1024x1024')
  const [uiAssets, setUiAssets] = useState<UIResult[]>([])
  const [uiProgress, setUiProgress] = useState<Progress>(idleProgress())
  const [isGenUI, setIsGenUI] = useState(false)
  const [uiSessionId, setUiSessionId] = useState<string | null>(null)
  const uiWs = useRef<WebSocket | null>(null)

  // ── Lightbox ──
  const [lightbox, setLightbox] = useState<{ src: string; label: string; prompt?: string | null } | null>(null)

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(null) }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [])

  const searchTrends = async () => {
    setIsSearchingTrends(true)
    try {
      const res = await fetch(`${API_BASE}/api/search-trends`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: baseTheme, genre: 'mobile game' }),
      })
      setTrendKeywords((await res.json()).keywords)
    } catch { alert('트랜드 검색 실패. 백엔드가 실행 중인지 확인하세요.') }
    finally { setIsSearchingTrends(false) }
  }

  // ── Background generation ──
  const startBg = useCallback(() => {
    if (!apiToken.trim()) { alert('API 토큰을 입력하세요.'); return }
    setBgImages(buildBgSlots(worlds, stagesPerWorld))
    setBgSessionId(null); setIsGenBg(true)
    setBgProgress({ current: 0, total: worlds * stagesPerWorld, label: '', status: 'generating' })
    const ws = new WebSocket(`${WS_BASE}/ws/generate`)
    bgWs.current = ws
    ws.onopen = () => ws.send(JSON.stringify({
      base_theme: baseTheme, style_keywords: styleKeywords, negative_prompt: negativePrompt,
      worlds, stages_per_world: stagesPerWorld, api_token: apiToken,
      model: 'gpt-image-1.5', size: bgSize, trend_keywords: trendKeywords,
    }))
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      if (msg.type === 'progress') {
        setBgProgress(p => ({ ...p, current: msg.current, label: msg.level }))
        setBgImages(prev => prev.map(i => i.level === msg.level ? { ...i, status: 'generating' } : i))
      } else if (msg.type === 'image') {
        setBgProgress(p => ({ ...p, current: msg.current }))
        setBgImages(prev => prev.map(i => i.level === msg.level
          ? { ...i, url: `${API_BASE}${msg.url}`, prompt: msg.prompt, status: 'done' } : i))
      } else if (msg.type === 'error' && msg.level) {
        setBgImages(prev => prev.map(i => i.level === msg.level
          ? { ...i, status: 'error', error: msg.message } : i))
      } else if (msg.type === 'complete') {
        setIsGenBg(false); setBgSessionId(msg.session_id)
        setBgProgress(p => ({ ...p, status: 'complete', current: msg.total }))
      }
    }
    ws.onerror = () => { setIsGenBg(false); alert('WebSocket 오류. 백엔드를 확인하세요.') }
    ws.onclose = () => setIsGenBg(false)
  }, [apiToken, baseTheme, styleKeywords, negativePrompt, worlds, stagesPerWorld, bgSize, trendKeywords])

  // ── Character generation ──
  const startChar = useCallback(() => {
    if (!apiToken.trim()) { alert('API 토큰을 입력하세요.'); return }
    if (!genHero && !genEnemies && !genNpc) { alert('생성할 캐릭터 타입을 선택하세요.'); return }
    setCharacters(buildCharSlots(genHero, genEnemies, genNpc, worlds))
    setCharSessionId(null); setIsGenChar(true)
    const charCount = (genHero ? 1 : 0) + (genEnemies ? worlds : 0) + (genNpc ? 1 : 0)
    setCharProgress({ current: 0, total: charCount * EXPRESSIONS.length, label: '', status: 'generating' })
    const ws = new WebSocket(`${WS_BASE}/ws/generate-characters`)
    charWs.current = ws
    ws.onopen = () => ws.send(JSON.stringify({
      base_theme: baseTheme, style_keywords: styleKeywords, worlds, api_token: apiToken,
      model: 'gpt-image-1.5', size: charSize, generate_hero: genHero,
      generate_enemies: genEnemies, generate_npc: genNpc, trend_keywords: trendKeywords,
      selected_motions: selectedMotions,
    }))
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      if (msg.type === 'progress') {
        setCharProgress(p => ({ ...p, current: msg.current, label: msg.label }))
        setCharacters(prev => prev.map(c => c.label !== msg.char_label ? c : {
          ...c, status: 'generating',
          expressions: { ...c.expressions, [msg.expression]: { ...c.expressions[msg.expression], status: 'generating' } },
        }))
      } else if (msg.type === 'expression') {
        setCharProgress(p => ({ ...p, current: msg.current }))
        const gifUrls: Record<string, string> = {}
        if (msg.gif_urls) for (const [k, v] of Object.entries(msg.gif_urls)) gifUrls[k] = `${API_BASE}${v}`
        setCharacters(prev => prev.map(c => {
          if (c.label !== msg.char_label) return c
          const updatedExprs = {
            ...c.expressions,
            [msg.expression]: { png_url: `${API_BASE}${msg.png_url}`, gif_urls: gifUrls, status: 'done' as const },
          }
          const allSettled = (Object.values(updatedExprs) as ExpressionData[]).every(ex => ex.status === 'done' || ex.status === 'error')
          return { ...c, prompt: c.prompt ?? msg.prompt, status: allSettled ? 'done' : 'generating', expressions: updatedExprs }
        }))
      } else if (msg.type === 'error' && msg.char_label) {
        setCharacters(prev => prev.map(c => c.label !== msg.char_label ? c : {
          ...c, expressions: {
            ...c.expressions,
            [msg.expression]: { ...c.expressions[msg.expression], status: 'error', error: msg.message },
          },
        }))
      } else if (msg.type === 'complete') {
        setIsGenChar(false); setCharSessionId(msg.session_id)
        setCharProgress(p => ({ ...p, status: 'complete', current: msg.total }))
      }
    }
    ws.onerror = () => { setIsGenChar(false); alert('WebSocket 오류.') }
    ws.onclose = () => setIsGenChar(false)
  }, [apiToken, baseTheme, styleKeywords, worlds, charSize, genHero, genEnemies, genNpc, trendKeywords, selectedMotions])

  // ── Object generation ──
  const startObj = useCallback(() => {
    if (!apiToken.trim()) { alert('API 토큰을 입력하세요.'); return }
    if (objTypes.length === 0) { alert('오브젝트 타입을 선택하세요.'); return }
    setObjects(buildObjSlots(objTypes, worlds))
    setObjSessionId(null); setIsGenObj(true)
    setObjProgress({ current: 0, total: objTypes.length * worlds, label: '', status: 'generating' })
    const ws = new WebSocket(`${WS_BASE}/ws/generate-objects`)
    objWs.current = ws
    ws.onopen = () => ws.send(JSON.stringify({
      base_theme: baseTheme, style_keywords: styleKeywords, worlds, object_types: objTypes,
      api_token: apiToken, model: 'gpt-image-1.5', size: objSize, trend_keywords: trendKeywords,
    }))
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      if (msg.type === 'progress') {
        setObjProgress(p => ({ ...p, current: msg.current, label: msg.label }))
        setObjects(prev => prev.map(o => o.label === msg.label ? { ...o, status: 'generating' } : o))
      } else if (msg.type === 'object') {
        setObjProgress(p => ({ ...p, current: msg.current }))
        setObjects(prev => prev.map(o => o.label === msg.label
          ? { ...o, png_url: `${API_BASE}${msg.png_url}`, prompt: msg.prompt, status: 'done' } : o))
      } else if (msg.type === 'error' && msg.label) {
        setObjects(prev => prev.map(o => o.label === msg.label
          ? { ...o, status: 'error', error: msg.message } : o))
      } else if (msg.type === 'complete') {
        setIsGenObj(false); setObjSessionId(msg.session_id)
        setObjProgress(p => ({ ...p, status: 'complete', current: msg.total }))
      }
    }
    ws.onerror = () => { setIsGenObj(false); alert('WebSocket 오류.') }
    ws.onclose = () => setIsGenObj(false)
  }, [apiToken, baseTheme, styleKeywords, worlds, objTypes, objSize, trendKeywords])

  // ── UI generation ──
  const startUI = useCallback(() => {
    if (!apiToken.trim()) { alert('API 토큰을 입력하세요.'); return }
    if (uiCategories.length === 0) { alert('UI 카테고리를 선택하세요.'); return }
    const slots = buildUISlots(uiCategories)
    setUiAssets(slots); setUiSessionId(null); setIsGenUI(true)
    setUiProgress({ current: 0, total: slots.length, label: '', status: 'generating' })
    const ws = new WebSocket(`${WS_BASE}/ws/generate-ui`)
    uiWs.current = ws
    ws.onopen = () => ws.send(JSON.stringify({
      base_theme: baseTheme, style_keywords: styleKeywords, api_token: apiToken,
      model: 'gpt-image-1.5', size: uiSize, trend_keywords: trendKeywords,
      ui_categories: uiCategories,
    }))
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      if (msg.type === 'progress') {
        setUiProgress(p => ({ ...p, current: msg.current, label: msg.label }))
        setUiAssets(prev => prev.map(a => a.label === msg.label ? { ...a, status: 'generating' } : a))
      } else if (msg.type === 'ui_asset') {
        setUiProgress(p => ({ ...p, current: msg.current }))
        setUiAssets(prev => prev.map(a => a.label === msg.label
          ? { ...a, png_url: `${API_BASE}${msg.png_url}`, prompt: msg.prompt, status: 'done' } : a))
      } else if (msg.type === 'error' && msg.label) {
        setUiAssets(prev => prev.map(a => a.label === msg.label
          ? { ...a, status: 'error', error: msg.message } : a))
      } else if (msg.type === 'complete') {
        setIsGenUI(false); setUiSessionId(msg.session_id)
        setUiProgress(p => ({ ...p, status: 'complete', current: msg.total }))
      }
    }
    ws.onerror = () => { setIsGenUI(false); alert('WebSocket 오류.') }
    ws.onclose = () => setIsGenUI(false)
  }, [apiToken, baseTheme, styleKeywords, uiCategories, uiSize, trendKeywords])

  const bgWorldNums = [...new Set(bgImages.map(i => i.world))].sort((a, b) => a - b)
  const bgWorldGroups = bgWorldNums.map(world => ({
    world, imgs: bgImages.filter(img => img.world === world),
  }))
  const bgGridCols = bgWorldGroups.length > 0
    ? Math.min(bgWorldGroups[0].imgs.length, 8)
    : Math.min(stagesPerWorld, 8)

  const charHero = characters.filter(c => c.char_type === 'hero')
  const charEnemies = characters.filter(c => c.char_type === 'enemy')
  const charNpc = characters.filter(c => c.char_type === 'npc')

  const toggleObjType = (t: string) =>
    setObjTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])

  const resetBg   = () => { setBgImages([]);    setBgProgress(idleProgress());   setBgSessionId(null) }
  const resetChar = () => { setCharacters([]);  setCharProgress(idleProgress()); setCharSessionId(null) }
  const resetObj  = () => { setObjects([]);     setObjProgress(idleProgress());  setObjSessionId(null) }
  const resetUI   = () => { setUiAssets([]);    setUiProgress(idleProgress());   setUiSessionId(null) }

  const toggleUICategory = (cat: string) =>
    setUiCategories(prev => prev.includes(cat) ? prev.filter(x => x !== cat) : [...prev, cat])

  const hasResults = activeTab === 'backgrounds' ? bgImages.length > 0
    : activeTab === 'characters' ? characters.length > 0
    : activeTab === 'objects' ? objects.length > 0
    : uiAssets.length > 0

  const activeProg = activeTab === 'backgrounds' ? bgProgress
    : activeTab === 'characters' ? charProgress
    : activeTab === 'objects' ? objProgress : uiProgress
  const isGenerating = activeTab === 'backgrounds' ? isGenBg
    : activeTab === 'characters' ? isGenChar
    : activeTab === 'objects' ? isGenObj : isGenUI

  return (
    <div className="flex h-screen bg-gray-950 text-gray-100 overflow-hidden">
      {/* ── Sidebar ── */}
      <aside className="w-[360px] shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800 shrink-0">
          <h1 className="text-base font-bold text-purple-400">Game Asset Generator</h1>
          <p className="text-[11px] text-gray-600 mt-0.5">bagelcode codeb · GPT Image</p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* API Token */}
          <FormSection title="인증">
            <Field label="API 토큰">
              <input type="password" value={apiToken}
                onChange={e => { setApiToken(e.target.value); localStorage.setItem('api_token', e.target.value) }}
                className={inp} placeholder="aiproxy_xxxxxxxxxxxx" />
            </Field>
          </FormSection>

          {/* Theme (공통) */}
          <FormSection title="테마 설정">
            <Field label="기본 테마 *">
              <textarea value={baseTheme} onChange={e => setBaseTheme(e.target.value)}
                rows={3} className={cx(inp, 'resize-none')}
                placeholder="예: medieval fantasy forest, sci-fi neon dungeon" />
            </Field>
            <Field label="스타일 키워드">
              <input value={styleKeywords} onChange={e => setStyleKeywords(e.target.value)}
                className={inp} placeholder="digital art, stylized, cel shading" />
            </Field>
            <Field label="월드 수">
              <input type="number" min={1} max={10} value={worlds}
                onChange={e => setWorlds(Math.max(1, Math.min(10, +e.target.value)))} className={inp} />
            </Field>
          </FormSection>

          {/* 트랜드 */}
          <FormSection title="트랜드 분석">
            <button onClick={searchTrends} disabled={isSearchingTrends || !baseTheme.trim()}
              className="w-full bg-blue-800 hover:bg-blue-700 disabled:opacity-40 rounded-md px-3 py-2 text-sm font-medium transition-colors">
              {isSearchingTrends ? '분석 중...' : '최신 트랜드 검색'}
            </button>
            {trendKeywords && (
              <Field label="검색 결과 (편집 가능)">
                <textarea value={trendKeywords} onChange={e => setTrendKeywords(e.target.value)}
                  rows={3} className={cx(inp, 'resize-none text-[11px]')} />
              </Field>
            )}
          </FormSection>

          {/* 탭별 설정 */}
          {activeTab === 'backgrounds' && (
            <FormSection title="배경 설정">
              <Field label="스테이지/월드">
                <input type="number" min={1} max={20} value={stagesPerWorld}
                  onChange={e => setStagesPerWorld(Math.max(1, Math.min(20, +e.target.value)))} className={inp} />
              </Field>
              <Field label="이미지 크기">
                {BG_SIZES.map(s => (
                  <button key={s.value} onClick={() => setBgSize(s.value)}
                    className={`w-full text-left text-sm px-3 py-1.5 rounded border mb-1 transition-colors ${
                      bgSize === s.value ? 'border-purple-500 bg-purple-900/30 text-purple-300' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}>
                    {s.label}
                  </button>
                ))}
              </Field>
              <Field label="네거티브 프롬프트">
                <textarea value={negativePrompt} onChange={e => setNegativePrompt(e.target.value)}
                  rows={2} className={cx(inp, 'resize-none text-[11px]')} />
              </Field>
              <p className="text-xs text-gray-500">
                총 <span className="text-purple-400 font-bold">{worlds * stagesPerWorld}</span>장
              </p>
            </FormSection>
          )}

          {activeTab === 'characters' && (
            <FormSection title="캐릭터 설정">
              <Field label="생성할 캐릭터">
                {[
                  { key: 'hero', label: '주인공 (Hero)', val: genHero, set: setGenHero },
                  { key: 'enemy', label: `적 (Enemy) × ${worlds}`, val: genEnemies, set: setGenEnemies },
                  { key: 'npc', label: 'NPC', val: genNpc, set: setGenNpc },
                ].map(({ key, label, val, set }) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer py-1">
                    <input type="checkbox" checked={val} onChange={e => set(e.target.checked)}
                      className="accent-purple-500" />
                    <span className="text-sm text-gray-300">{label}</span>
                  </label>
                ))}
              </Field>
              <p className="text-[11px] text-gray-600">6개 표정 (기본·기쁨·분노·슬픔·놀람·결의) 자동 생성</p>
              <Field label="모션 GIF">
                <div className="grid grid-cols-2 gap-1">
                  {MOTIONS.map(m => (
                    <label key={m.value} className="flex items-center gap-1.5 cursor-pointer py-0.5">
                      <input type="checkbox"
                        checked={selectedMotions.includes(m.value)}
                        onChange={() => setSelectedMotions(prev =>
                          prev.includes(m.value) ? prev.filter(x => x !== m.value) : [...prev, m.value]
                        )}
                        className="accent-purple-500" />
                      <span className="text-xs text-gray-300">{m.label}</span>
                    </label>
                  ))}
                </div>
              </Field>
              <Field label="이미지 크기">
                {CHAR_SIZES.map(s => (
                  <button key={s.value} onClick={() => setCharSize(s.value)}
                    className={`w-full text-left text-sm px-3 py-1.5 rounded border mb-1 transition-colors ${
                      charSize === s.value ? 'border-purple-500 bg-purple-900/30 text-purple-300' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}>
                    {s.label}
                  </button>
                ))}
              </Field>
            </FormSection>
          )}

          {activeTab === 'ui' && (
            <FormSection title="UI 에셋 설정">
              <Field label="카테고리 선택">
                {UI_CATEGORIES.map(cat => (
                  <label key={cat.value} className="flex items-center gap-2 cursor-pointer py-1">
                    <input type="checkbox" checked={uiCategories.includes(cat.value)}
                      onChange={() => toggleUICategory(cat.value)} className="accent-purple-500" />
                    <span className="text-sm text-gray-300">{cat.label}</span>
                    <span className="text-[10px] text-gray-600">{cat.items.map(i => i.l).join('·')}</span>
                  </label>
                ))}
              </Field>
              <Field label="이미지 크기">
                {[{ label: '1024×1024 (권장)', value: '1024x1024' }, { label: '1792×1024 (가로)', value: '1792x1024' }].map(s => (
                  <button key={s.value} onClick={() => setUiSize(s.value)}
                    className={`w-full text-left text-sm px-3 py-1.5 rounded border mb-1 transition-colors ${
                      uiSize === s.value ? 'border-purple-500 bg-purple-900/30 text-purple-300' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}>
                    {s.label}
                  </button>
                ))}
              </Field>
              <p className="text-xs text-gray-500">
                총 <span className="text-purple-400 font-bold">
                  {UI_CATEGORIES.filter(c => uiCategories.includes(c.value)).reduce((s, c) => s + c.items.length, 0)}
                </span>장
              </p>
            </FormSection>
          )}

          {activeTab === 'objects' && (
            <FormSection title="오브젝트 설정">
              <Field label="오브젝트 타입 선택">
                {Object.entries(OBJ_TYPE_LABELS).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer py-1">
                    <input type="checkbox" checked={objTypes.includes(key)} onChange={() => toggleObjType(key)}
                      className="accent-purple-500" />
                    <span className="text-sm text-gray-300">{label}</span>
                  </label>
                ))}
              </Field>
              <Field label="이미지 크기">
                {CHAR_SIZES.map(s => (
                  <button key={s.value} onClick={() => setObjSize(s.value)}
                    className={`w-full text-left text-sm px-3 py-1.5 rounded border mb-1 transition-colors ${
                      objSize === s.value ? 'border-purple-500 bg-purple-900/30 text-purple-300' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}>
                    {s.label}
                  </button>
                ))}
              </Field>
              <p className="text-xs text-gray-500">
                총 <span className="text-purple-400 font-bold">{objTypes.length * worlds}</span>장
              </p>
            </FormSection>
          )}
        </div>

        {/* Action buttons */}
        <div className="p-4 border-t border-gray-800 space-y-2 shrink-0">
          {isGenerating ? (
            <button onClick={() => { bgWs.current?.close(); charWs.current?.close(); objWs.current?.close(); uiWs.current?.close() }}
              className="w-full bg-red-800 hover:bg-red-700 rounded-lg px-4 py-2.5 font-semibold transition-colors">
              ⏹ 생성 중단
            </button>
          ) : (
            <button
              onClick={activeTab === 'backgrounds' ? startBg : activeTab === 'characters' ? startChar : activeTab === 'objects' ? startObj : startUI}
              disabled={!baseTheme.trim() || !apiToken.trim()}
              className="w-full bg-purple-700 hover:bg-purple-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg px-4 py-2.5 font-semibold transition-colors">
              {activeTab === 'backgrounds' && `▶ 배경 생성 (${worlds * stagesPerWorld}장)`}
              {activeTab === 'characters' && `▶ 캐릭터 생성`}
              {activeTab === 'objects' && `▶ 오브젝트 생성 (${objTypes.length * worlds}장)`}
              {activeTab === 'ui' && `▶ UI 에셋 생성`}
            </button>
          )}
          {!isGenerating && (() => {
            const sid = activeTab === 'backgrounds' ? bgSessionId : activeTab === 'characters' ? charSessionId : activeTab === 'objects' ? objSessionId : uiSessionId
            const reset = activeTab === 'backgrounds' ? resetBg : activeTab === 'characters' ? resetChar : activeTab === 'objects' ? resetObj : resetUI
            return (
              <div className="flex gap-2">
                {sid && (
                  <button onClick={() => window.open(`${API_BASE}/api/download/${sid}`)}
                    className="flex-1 bg-gray-800 hover:bg-gray-700 rounded-lg px-3 py-2 text-sm transition-colors">
                    ↓ ZIP
                  </button>
                )}
                {hasResults && (
                  <button onClick={reset}
                    className={`${sid ? '' : 'w-full '}bg-gray-800 hover:bg-red-900/60 border border-gray-700 hover:border-red-700 rounded-lg px-3 py-2 text-sm text-gray-400 hover:text-red-400 transition-colors`}>
                    초기화
                  </button>
                )}
              </div>
            )
          })()}
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="flex-1 overflow-y-auto flex flex-col">
        {/* Tabs */}
        <div className="shrink-0 border-b border-gray-800 bg-gray-900/80 flex">
          {([
            { id: 'backgrounds', label: '배경' },
            { id: 'characters', label: '캐릭터' },
            { id: 'objects', label: '오브젝트' },
            { id: 'ui', label: 'UI 에셋' },
          ] as { id: Tab; label: string }[]).map(({ id, label }) => (
            <button key={id} onClick={() => setActiveTab(id)}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === id
                  ? 'border-purple-500 text-purple-400'
                  : 'border-transparent text-gray-500 hover:text-gray-300'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* Progress */}
        {activeProg.status !== 'idle' && (
          <div className="shrink-0 bg-gray-900/95 backdrop-blur border-b border-gray-800 px-6 py-3">
            <div className="flex justify-between text-sm mb-1.5">
              <span className={activeProg.status === 'complete' ? 'text-green-400 font-medium' : 'text-gray-300'}>
                {activeProg.status === 'complete' ? `✓ 완료 — ${activeProg.total}개` : `생성 중: ${activeProg.label}`}
              </span>
              <span className="text-gray-500 text-xs font-mono">{activeProg.current} / {activeProg.total}</span>
            </div>
            <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-500 ${activeProg.status === 'complete' ? 'bg-green-500' : 'bg-purple-500'}`}
                style={{ width: `${activeProg.total ? (activeProg.current / activeProg.total) * 100 : 0}%` }} />
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 p-6 overflow-y-auto">

          {/* ── Backgrounds tab ── */}
          {activeTab === 'backgrounds' && (
            bgWorldGroups.length > 0 ? (
              <div className="space-y-8">
                {bgWorldGroups.map(({ world, imgs }) => (
                  <div key={world}>
                    <div className="flex items-center gap-3 mb-3">
                      <h2 className="text-sm font-semibold text-gray-300 whitespace-nowrap">World {world}</h2>
                      <div className="flex-1 h-px bg-gray-800" />
                      <span className="text-xs text-gray-600 font-mono">{imgs.filter(i => i.status === 'done').length}/{imgs.length}</span>
                    </div>
                    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${bgGridCols}, minmax(0, 1fr))` }}>
                      {imgs.map(img => (
                        <AssetCard key={img.level} label={img.level} status={img.status}
                          imgSrc={img.url} error={img.error} aspectRatio="16/9"
                          onClick={() => img.url && setLightbox({ src: img.url, label: `Level ${img.level}`, prompt: img.prompt })} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : <EmptyState icon="🌄" title="배경 이미지 생성" sub="레벨별 게임 배경을 자동으로 생성합니다" />
          )}

          {/* ── Characters tab ── */}
          {activeTab === 'characters' && (
            characters.length > 0 ? (
              <div className="space-y-8">
                {/* Hero */}
                {charHero.length > 0 && (
                  <CharGroup title="주인공 (Hero)" chars={charHero} onLightbox={setLightbox} />
                )}
                {/* Enemies */}
                {charEnemies.length > 0 && (
                  <CharGroup title="적 캐릭터 (Enemy)" chars={charEnemies} onLightbox={setLightbox} />
                )}
                {/* NPC */}
                {charNpc.length > 0 && (
                  <CharGroup title="NPC" chars={charNpc} onLightbox={setLightbox} />
                )}
              </div>
            ) : <EmptyState icon="🧙" title="캐릭터 생성" sub="PNG + Idle GIF 애니메이션을 함께 생성합니다" />
          )}

          {/* ── UI Assets tab ── */}
          {activeTab === 'ui' && (
            uiAssets.length > 0 ? (
              <div className="space-y-8">
                {UI_CATEGORIES.filter(cat => uiAssets.some(a => a.category === cat.value)).map(cat => (
                  <div key={cat.value}>
                    <div className="flex items-center gap-3 mb-3">
                      <h2 className="text-sm font-semibold text-gray-300 whitespace-nowrap">{cat.label}</h2>
                      <div className="flex-1 h-px bg-gray-800" />
                      <span className="text-xs text-gray-600 font-mono">
                        {uiAssets.filter(a => a.category === cat.value && a.status === 'done').length}/{uiAssets.filter(a => a.category === cat.value).length}
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-3">
                      {uiAssets.filter(a => a.category === cat.value).map(asset => (
                        <div key={asset.label} className="space-y-1">
                          <p className="text-[10px] text-gray-500 text-center">{asset.itemLabel}</p>
                          <AssetCard label={asset.itemLabel} status={asset.status} imgSrc={asset.png_url}
                            error={asset.error} aspectRatio="1/1"
                            onClick={() => asset.png_url && setLightbox({ src: asset.png_url, label: `${cat.label} · ${asset.itemLabel}`, prompt: asset.prompt })} />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : <EmptyState icon="🎨" title="UI 에셋 생성" sub="말풍선·버튼·패널·HUD·아이콘을 테마에 맞게 생성합니다" />
          )}

          {/* ── Objects tab ── */}
          {activeTab === 'objects' && (
            objects.length > 0 ? (
              <div className="space-y-8">
                {[...new Set(objects.map(o => o.world))].sort((a, b) => a - b).map(world => {
                  const worldObjs = objects.filter(o => o.world === world)
                  if (worldObjs.length === 0) return null
                  return (
                    <div key={world}>
                      <div className="flex items-center gap-3 mb-3">
                        <h2 className="text-sm font-semibold text-gray-300 whitespace-nowrap">World {world}</h2>
                        <div className="flex-1 h-px bg-gray-800" />
                        <span className="text-xs text-gray-600 font-mono">{worldObjs.filter(o => o.status === 'done').length}/{worldObjs.length}</span>
                      </div>
                      <div className="grid grid-cols-4 gap-3">
                        {worldObjs.map(obj => (
                          <div key={obj.label} className="space-y-1">
                            <p className="text-[10px] text-gray-500 text-center">{OBJ_TYPE_LABELS[obj.obj_type] ?? obj.obj_type}</p>
                            <AssetCard label={obj.label} status={obj.status} imgSrc={obj.png_url}
                              error={obj.error} aspectRatio="1/1"
                              onClick={() => obj.png_url && setLightbox({ src: obj.png_url, label: obj.label, prompt: obj.prompt })} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : <EmptyState icon="🗝️" title="오브젝트 생성" sub="아이템·소품·플랫폼·장애물을 월드별로 생성합니다" />
          )}
        </div>
      </main>

      {/* ── Lightbox ── */}
      {lightbox && (
        <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-8"
          onClick={() => setLightbox(null)}>
          <div className="max-w-3xl w-full" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <span className="text-purple-400 font-mono font-bold">{lightbox.label}</span>
              <div className="flex gap-2">
                <button onClick={e => { e.stopPropagation(); downloadFile(lightbox.src) }}
                  className="text-xs bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded text-gray-300 transition-colors">다운로드</button>
                <button onClick={() => setLightbox(null)} className="text-gray-400 hover:text-white text-xl w-8 h-8 flex items-center justify-center">×</button>
              </div>
            </div>
            <img src={lightbox.src} alt={lightbox.label} className="w-full rounded-lg shadow-2xl" />
            {lightbox.prompt && (
              <p className="mt-3 text-[11px] text-gray-600 font-mono bg-gray-900/60 px-3 py-2 rounded leading-relaxed">{lightbox.prompt}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CharCard({ c, onLightbox }: {
  c: CharResult
  onLightbox: (lb: { src: string; label: string; prompt?: string | null }) => void
}) {
  const [activeExpr, setActiveExpr] = useState('neutral')
  const [activeMotion, setActiveMotion] = useState('idle')

  const exprData = c.expressions[activeExpr]
  const motionKeys = exprData?.status === 'done' ? Object.keys(exprData.gif_urls) : []
  const previewSrc = exprData?.status === 'done'
    ? (exprData.gif_urls[activeMotion] ?? exprData.png_url)
    : null
  const exprLabel = EXPRESSIONS.find(e => e.value === activeExpr)?.label ?? activeExpr

  return (
    <div className="bg-gray-900/40 border border-gray-800 rounded-lg p-3 space-y-3">
      {/* 헤더 */}
      <p className="text-[11px] text-gray-500 font-medium">
        {c.char_type === 'enemy' && c.world ? `Enemy · World ${c.world}` : c.char_type.toUpperCase()}
      </p>

      {/* 6개 표정 썸네일 */}
      <div className="grid grid-cols-6 gap-1.5">
        {EXPRESSIONS.map(ex => {
          const ed = c.expressions[ex.value]
          const isActive = activeExpr === ex.value
          return (
            <div key={ex.value}
              onClick={() => { if (ed?.status === 'done') { setActiveExpr(ex.value); setActiveMotion('idle') } }}
              className={`rounded border-2 overflow-hidden transition-all ${
                ed?.status === 'done' ? 'cursor-pointer' : 'cursor-default'} ${
                isActive && ed?.status === 'done' ? 'border-purple-500' : 'border-transparent hover:border-gray-600'}`}>
              <div className="aspect-square relative bg-gray-950">
                {ed?.status === 'done' ? (
                  <img src={ed.png_url} alt={ex.label} className="w-full h-full object-contain" loading="lazy" />
                ) : ed?.status === 'generating' ? (
                  <div className="w-full h-full flex items-center justify-center">
                    <div className="w-2.5 h-2.5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : (
                  <div className="w-full h-full bg-gray-800/50" />
                )}
                <span className="absolute bottom-0 inset-x-0 text-center text-[7px] bg-black/60 text-gray-400 py-0.5 leading-tight">
                  {ex.label}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* 선택된 표정 상세 (모션 GIF + 다운로드) */}
      {exprData?.status === 'done' && previewSrc && (
        <div className="flex gap-3">
          <div
            className="w-20 h-20 shrink-0 bg-gray-950 rounded overflow-hidden cursor-pointer border border-gray-800 hover:border-purple-600 transition-colors"
            onClick={() => onLightbox({ src: previewSrc, label: `${c.label} · ${exprLabel} · ${activeMotion}`, prompt: c.prompt })}>
            <img src={previewSrc} alt={activeExpr} className="w-full h-full object-contain" />
          </div>
          <div className="flex flex-col gap-1.5 min-w-0 flex-1">
            <p className="text-[10px] text-gray-500">{exprLabel} — {activeMotion}</p>
            {motionKeys.length > 0 && (
              <div className="flex flex-wrap gap-0.5">
                {motionKeys.map(m => (
                  <button key={m} onClick={() => setActiveMotion(m)}
                    className={`text-[9px] px-1.5 py-0.5 rounded transition-colors ${
                      activeMotion === m ? 'bg-purple-700 text-white' : 'bg-gray-800 text-gray-500 hover:text-gray-300'}`}>
                    {m}
                  </button>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-0.5 mt-auto">
              <button onClick={() => downloadFile(exprData.png_url)}
                className="text-[9px] bg-gray-800 hover:bg-gray-700 px-1.5 py-0.5 rounded text-gray-400">PNG</button>
              {motionKeys.map(m => (
                <button key={m} onClick={() => downloadFile(exprData.gif_urls[m])}
                  className="text-[9px] bg-gray-800 hover:bg-gray-700 px-1.5 py-0.5 rounded text-gray-400">{m}</button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function CharGroup({ title, chars, onLightbox }: {
  title: string
  chars: CharResult[]
  onLightbox: (lb: { src: string; label: string; prompt?: string | null }) => void
}) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <h2 className="text-sm font-semibold text-gray-300 whitespace-nowrap">{title}</h2>
        <div className="flex-1 h-px bg-gray-800" />
      </div>
      <div className="space-y-3">
        {chars.map(c => <CharCard key={c.label} c={c} onLightbox={onLightbox} />)}
      </div>
    </div>
  )
}

function AssetCard({ label, status, imgSrc, error, aspectRatio, onClick }: {
  label: string; status: string; imgSrc: string | null
  error?: string; aspectRatio: string; onClick: () => void
}) {
  const border = status === 'done' ? 'border-gray-700 hover:border-purple-500 cursor-pointer'
    : status === 'generating' ? 'border-purple-600/60 animate-pulse'
    : status === 'error' ? 'border-red-900' : 'border-gray-800'

  return (
    <div className={`relative bg-gray-900 border rounded overflow-hidden transition-all ${border}`}
      style={{ aspectRatio }} onClick={onClick}>
      <div className="absolute top-1 left-1 z-10 bg-black/70 text-[9px] px-1 py-0.5 rounded text-purple-300 font-mono">{label}</div>
      {status === 'done' && imgSrc ? (
        <img src={imgSrc} alt={label} className="w-full h-full object-contain" loading="lazy" />
      ) : status === 'generating' ? (
        <div className="w-full h-full flex flex-col items-center justify-center gap-1">
          <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-[9px] text-purple-400">생성 중</span>
        </div>
      ) : status === 'error' ? (
        <div className="w-full h-full flex items-center justify-center p-2">
          <span className="text-red-400 text-[9px] text-center break-all">{error?.slice(0, 80) ?? '오류'}</span>
        </div>
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <span className="text-gray-800 text-[9px]">대기</span>
        </div>
      )}
    </div>
  )
}

function EmptyState({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <div className="h-full min-h-[400px] flex items-center justify-center">
      <div className="text-center text-gray-700">
        <div className="text-6xl mb-5">{icon}</div>
        <p className="text-xl font-medium text-gray-500">{title}</p>
        <p className="text-sm mt-2">{sub}</p>
      </div>
    </div>
  )
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-[10px] font-semibold text-gray-600 uppercase tracking-widest border-b border-gray-800 pb-1">{title}</h3>
      {children}
    </div>
  )
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1 ${className}`}>
      <label className="text-[11px] text-gray-500">{label}</label>
      {children}
    </div>
  )
}

const inp = 'w-full bg-gray-800 border border-gray-700 rounded px-2.5 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-purple-500 transition-colors'
function cx(...classes: string[]) { return classes.filter(Boolean).join(' ') }
