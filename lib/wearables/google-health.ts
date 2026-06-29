/**
 * Google Health API client — the Fitbit Web API successor (legacy Fitbit Web API
 * sunsets ~Sept 2026). Server-only: reads OAuth client secrets from env and must
 * never be imported into a client component.
 *
 * Reads ONLY steps, sleep, and (optionally) resting HR / HRV. Calorie/energy
 * fields are never requested or read — wearable calorie estimates are
 * intentionally excluded.
 *
 * A few response field names (e.g. the steps daily-rollup aggregate field, the
 * daily HRV data-type id) were not fully nailed down in the docs, so parsing is
 * deliberately tolerant: we probe several candidate keys and coerce int64 values
 * that may arrive as strings. RHR/HRV are best-effort and never fatal.
 *
 * Docs: https://developers.google.com/health
 */

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const HEALTH_BASE = 'https://health.googleapis.com/v4'

/** Short-lived CSRF cookie holding the OAuth `state` between connect + callback. */
export const OAUTH_STATE_COOKIE = 'gh_oauth_state'

/**
 * Read scopes. Steps live under activity_and_fitness (no dedicated steps scope);
 * nutrition is logged INTAKE only (the nutrition-log data type), never the
 * activity_and_fitness "calories burned" estimate.
 */
export const GOOGLE_HEALTH_SCOPES = [
  'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
  'https://www.googleapis.com/auth/googlehealth.sleep.readonly',
  'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly',
  'https://www.googleapis.com/auth/googlehealth.nutrition.readonly',
  'openid',
  'email',
]

interface GoogleHealthConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
}

/** Trim whitespace + strip accidental wrapping quotes (common paste mistakes). */
function clean(raw: string | undefined): string {
  return (raw ?? '').trim().replace(/^['"]|['"]$/g, '')
}

function config(): GoogleHealthConfig {
  const clientId = clean(process.env.GOOGLE_HEALTH_CLIENT_ID)
  const clientSecret = clean(process.env.GOOGLE_HEALTH_CLIENT_SECRET)
  const redirectUri = clean(process.env.GOOGLE_HEALTH_REDIRECT_URI)
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      'Google Health is not configured (GOOGLE_HEALTH_CLIENT_ID / GOOGLE_HEALTH_CLIENT_SECRET / GOOGLE_HEALTH_REDIRECT_URI).',
    )
  }
  return { clientId, clientSecret, redirectUri }
}

export interface TokenSet {
  accessToken: string
  /** Google may omit a rotated refresh token on refresh; null then. */
  refreshToken: string | null
  /** ISO timestamp when the access token expires. */
  expiresAt: string
  scope: string | null
}

/** One day's imported recovery figures (calorie/energy intentionally absent). */
export interface DailyRecovery {
  date: string
  steps: number | null
  sleepMinutesAsleep: number | null
  sleepMinutesInPeriod: number | null
  sleepLightMin: number | null
  sleepDeepMin: number | null
  sleepRemMin: number | null
  sleepAwakeMin: number | null
  restingHr: number | null
  hrvMs: number | null
}

/** One day's imported nutrition INTAKE (logged food → Fitbit → Google Health). */
export interface DailyNutrition {
  date: string
  /** Total energy consumed, kcal. */
  calories: number | null
  protein: number | null
  carbs: number | null
  fat: number | null
}

/** One day's imported body composition. Weight is in KILOGRAMS (convert later). */
export interface DailyBody {
  date: string
  weightKg: number | null
  bodyFatPct: number | null
}

/* ------------------------------------------------------------------ */
/* OAuth                                                               */
/* ------------------------------------------------------------------ */

/** The Google consent URL to send the owner to. `state` is a CSRF token. */
export function buildAuthUrl(state: string): string {
  const { clientId, redirectUri } = config()
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_HEALTH_SCOPES.join(' '),
    access_type: 'offline', // required to receive a refresh_token
    prompt: 'consent', // force consent so a refresh_token is reliably re-issued
    include_granted_scopes: 'true',
    state,
  })
  return `${AUTH_URL}?${params.toString()}`
}

function tokenSetFromResponse(data: {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  scope?: string
}): TokenSet {
  if (!data.access_token) throw new Error('Token response missing access_token')
  const expiresInMs = (data.expires_in ?? 3600) * 1000
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: new Date(Date.now() + expiresInMs).toISOString(),
    scope: data.scope ?? null,
  }
}

/** Exchange an authorization code for tokens (callback). */
export async function exchangeCode(code: string): Promise<TokenSet> {
  const { clientId, clientSecret, redirectUri } = config()
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Token exchange failed (${res.status}): ${body.slice(0, 300)}`)
  }
  return tokenSetFromResponse(await res.json())
}

/** Error thrown when a refresh token is dead (revoked / Testing-mode 7-day expiry). */
export class ReauthRequiredError extends Error {
  constructor(message = 'Wearable refresh token is no longer valid; reconnect required.') {
    super(message)
    this.name = 'ReauthRequiredError'
  }
}

/** Mint a new access token from a stored refresh token. */
export async function refreshAccessToken(refreshToken: string): Promise<TokenSet> {
  const { clientId, clientSecret } = config()
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    // invalid_grant => the refresh token expired or was revoked.
    if (res.status === 400 && /invalid_grant/i.test(body)) {
      throw new ReauthRequiredError()
    }
    throw new Error(`Token refresh failed (${res.status}): ${body.slice(0, 300)}`)
  }
  const set = tokenSetFromResponse(await res.json())
  // A refresh response usually omits refresh_token; keep the existing one then.
  if (!set.refreshToken) set.refreshToken = refreshToken
  return set
}

/** The stable Google Health user id, or null if the shape is unexpected. */
export async function getIdentity(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(`${HEALTH_BASE}/users/me/identity`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) return null
    const data = (await res.json()) as Record<string, unknown>
    const candidate =
      (typeof data.id === 'string' && data.id) ||
      (typeof data.userId === 'string' && data.userId) ||
      (typeof data.name === 'string' && data.name) ||
      null
    return candidate ? String(candidate).replace(/^users\//, '') : null
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ */
/* Parsing helpers                                                     */
/* ------------------------------------------------------------------ */

function toInt(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v)
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) {
    return Math.round(Number(v))
  }
  return null
}

function toNum(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) {
    return Number(v)
  }
  return null
}

/** First key in `keys` that coerces to an int, else any int-ish value present. */
function pickInt(obj: unknown, keys: string[]): number | null {
  if (!obj || typeof obj !== 'object') return null
  const rec = obj as Record<string, unknown>
  for (const k of keys) {
    const n = toInt(rec[k])
    if (n != null) return n
  }
  for (const v of Object.values(rec)) {
    const n = toInt(v)
    if (n != null) return n
  }
  return null
}

/** Like pickInt, but preserves decimals (weight, body-fat %). */
function pickNum(obj: unknown, keys: string[]): number | null {
  if (!obj || typeof obj !== 'object') return null
  const rec = obj as Record<string, unknown>
  for (const k of keys) {
    const n = toNum(rec[k])
    if (n != null) return n
  }
  for (const v of Object.values(rec)) {
    const n = toNum(v)
    if (n != null) return n
  }
  return null
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function dayStr(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

/**
 * A Google Health CivilDateTime. NESTED (date + optional time), NOT flat — the
 * dailyRollUp `range` is a CivilTimeInterval of { start, end } CivilDateTimes,
 * each `{ date: { year, month, day }, time? }`. We omit `time` (defaults to
 * midnight). Sending a flat {year,...} or start/endTime is a 400.
 */
function civilDateTime(d: Date) {
  return {
    date: {
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
      day: d.getUTCDate(),
    },
  }
}

/** Parse a CivilDateTime (nested `{date:{...}}`, or a flat `{year,...}`) to YYYY-MM-DD. */
function civilToDateStr(v: unknown): string | null {
  if (!v || typeof v !== 'object') return null
  const obj = v as Record<string, unknown>
  const d = (
    obj.date && typeof obj.date === 'object' ? obj.date : obj
  ) as Record<string, unknown>
  const y = toInt(d.year)
  const m = toInt(d.month)
  const day = toInt(d.day)
  if (y == null || m == null || day == null) return null
  return `${y}-${pad(m)}-${pad(day)}`
}

interface Window {
  /** inclusive UTC midnight of the first day */
  start: Date
  /** exclusive UTC midnight just past the last day */
  end: Date
}

/** A closed-open UTC window covering the last `days` calendar days incl. today. */
function lookbackWindow(now: Date, days: number): Window {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (days - 1)),
  )
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  )
  return { start, end }
}

async function authedJson(
  url: string,
  accessToken: string,
  init?: RequestInit,
): Promise<unknown> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Google Health ${res.status} for ${url}: ${body.slice(0, 300)}`)
  }
  return res.json()
}

/* ------------------------------------------------------------------ */
/* Data reads                                                          */
/* ------------------------------------------------------------------ */

/** Daily step totals via the dailyRollUp aggregation (one bucket per day). */
async function fetchSteps(
  accessToken: string,
  win: Window,
): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  const body = {
    range: { start: civilDateTime(win.start), end: civilDateTime(win.end) },
    windowSizeDays: 1,
  }
  const data = (await authedJson(
    `${HEALTH_BASE}/users/me/dataTypes/steps/dataPoints:dailyRollUp`,
    accessToken,
    { method: 'POST', body: JSON.stringify(body) },
  )) as { rollupDataPoints?: Array<Record<string, unknown>> }

  for (const p of data.rollupDataPoints ?? []) {
    const date = civilToDateStr(p.civilStartTime)
    if (!date) continue
    const steps = pickInt(p.steps, ['count_sum', 'countSum', 'count', 'sum', 'value'])
    if (steps != null) out.set(date, steps)
  }
  return out
}

interface SleepDay {
  minutesAsleep: number | null
  minutesInPeriod: number | null
  lightMin: number | null
  deepMin: number | null
  remMin: number | null
  awakeMin: number | null
}

/** Sleep sessions (raw list), attributed to the wake date (interval.endTime). */
async function fetchSleep(
  accessToken: string,
  win: Window,
): Promise<Map<string, SleepDay>> {
  const out = new Map<string, SleepDay>()
  const filter = `sleep.interval.end_time >= "${win.start.toISOString()}" AND sleep.interval.end_time < "${win.end.toISOString()}"`
  const url = `${HEALTH_BASE}/users/me/dataTypes/sleep/dataPoints?pageSize=25&filter=${encodeURIComponent(filter)}`
  const data = (await authedJson(url, accessToken)) as {
    dataPoints?: Array<{ sleep?: Record<string, unknown> }>
  }

  for (const p of data.dataPoints ?? []) {
    const s = p.sleep
    if (!s) continue
    const interval = s.interval as { endTime?: string } | undefined
    if (!interval?.endTime) continue
    const wake = new Date(interval.endTime)
    if (Number.isNaN(wake.getTime())) continue
    const date = dayStr(wake)

    const summary = (s.summary ?? {}) as Record<string, unknown>
    const minutesAsleep = pickInt(summary, ['minutesAsleep'])
    const minutesInPeriod = pickInt(summary, [
      'minutesInSleepPeriod',
      'minutesInBed',
    ])

    // Stage minutes from the stages[] array (durations summed per type).
    const stageMin: Record<string, number> = {}
    const stages = (s.stages as Array<Record<string, unknown>> | undefined) ?? []
    for (const st of stages) {
      const type = String(st.type ?? '').toUpperCase()
      const a = typeof st.startTime === 'string' ? new Date(st.startTime).getTime() : NaN
      const b = typeof st.endTime === 'string' ? new Date(st.endTime).getTime() : NaN
      if (Number.isNaN(a) || Number.isNaN(b) || b <= a) continue
      const mins = Math.round((b - a) / 60000)
      stageMin[type] = (stageMin[type] ?? 0) + mins
    }
    const get = (...types: string[]) => {
      let sum = 0
      let any = false
      for (const t of types) {
        if (stageMin[t] != null) {
          sum += stageMin[t]
          any = true
        }
      }
      return any ? sum : null
    }

    const day: SleepDay = {
      minutesAsleep,
      minutesInPeriod,
      lightMin: get('LIGHT'),
      deepMin: get('DEEP'),
      remMin: get('REM'),
      awakeMin: get('AWAKE', 'RESTLESS'),
    }

    // If multiple sessions land on one wake date, keep the main sleep (longest).
    const existing = out.get(date)
    const score = (d: SleepDay) => d.minutesInPeriod ?? d.minutesAsleep ?? 0
    if (!existing || score(day) > score(existing)) out.set(date, day)
  }
  return out
}

/** Best-effort daily resting HR + HRV. Never throws; returns empty on any issue. */
async function fetchHeartMetrics(
  accessToken: string,
  win: Window,
): Promise<Map<string, { restingHr: number | null; hrvMs: number | null }>> {
  const out = new Map<string, { restingHr: number | null; hrvMs: number | null }>()

  async function listDaily(dataType: string): Promise<Array<Record<string, unknown>>> {
    try {
      const filter = `${dataType}.interval.end_time >= "${win.start.toISOString()}" AND ${dataType}.interval.end_time < "${win.end.toISOString()}"`
      const url = `${HEALTH_BASE}/users/me/dataTypes/${dataType}/dataPoints?pageSize=100&filter=${encodeURIComponent(filter)}`
      const data = (await authedJson(url, accessToken)) as {
        dataPoints?: Array<Record<string, unknown>>
      }
      return data.dataPoints ?? []
    } catch {
      return []
    }
  }

  function ensure(date: string) {
    const cur = out.get(date) ?? { restingHr: null, hrvMs: null }
    out.set(date, cur)
    return cur
  }
  function dateOf(point: Record<string, unknown>, key: string): string | null {
    const v = point[key] as { interval?: { endTime?: string } } | undefined
    const end = v?.interval?.endTime
    if (typeof end !== 'string') return null
    const d = new Date(end)
    return Number.isNaN(d.getTime()) ? null : dayStr(d)
  }

  for (const p of await listDaily('daily-resting-heart-rate')) {
    const date = dateOf(p, 'dailyRestingHeartRate') ?? dateOf(p, 'restingHeartRate')
    const val = pickInt(p.dailyRestingHeartRate ?? p.restingHeartRate, [
      'beatsPerMinute',
      'bpm',
      'value',
    ])
    if (date && val != null) ensure(date).restingHr = val
  }
  for (const p of await listDaily('daily-heart-rate-variability')) {
    const date =
      dateOf(p, 'dailyHeartRateVariability') ?? dateOf(p, 'heartRateVariability')
    const obj = (p.dailyHeartRateVariability ?? p.heartRateVariability) as
      | Record<string, unknown>
      | undefined
    const val =
      toNum(obj?.['averageHeartRateVariabilityMilliseconds']) ??
      toNum(obj?.['milliseconds']) ??
      toNum(obj?.['value'])
    if (date && val != null) ensure(date).hrvMs = val
  }
  return out
}

/**
 * Pull the last `days` calendar days of steps + sleep (+ best-effort RHR/HRV),
 * merged into one record per date. Steps and sleep failures propagate (so the
 * cron can mark the connection for reauth); heart metrics are best-effort.
 */
export async function fetchRecovery(
  accessToken: string,
  days = 3,
  now: Date = new Date(),
): Promise<DailyRecovery[]> {
  const win = lookbackWindow(now, days)
  const [steps, sleep, heart] = await Promise.all([
    fetchSteps(accessToken, win),
    fetchSleep(accessToken, win),
    fetchHeartMetrics(accessToken, win),
  ])

  const dates = new Set<string>([...steps.keys(), ...sleep.keys(), ...heart.keys()])
  const result: DailyRecovery[] = []
  for (const date of dates) {
    const s = sleep.get(date)
    const h = heart.get(date)
    result.push({
      date,
      steps: steps.get(date) ?? null,
      sleepMinutesAsleep: s?.minutesAsleep ?? null,
      sleepMinutesInPeriod: s?.minutesInPeriod ?? null,
      sleepLightMin: s?.lightMin ?? null,
      sleepDeepMin: s?.deepMin ?? null,
      sleepRemMin: s?.remMin ?? null,
      sleepAwakeMin: s?.awakeMin ?? null,
      restingHr: h?.restingHr ?? null,
      hrvMs: h?.hrvMs ?? null,
    })
  }
  result.sort((a, b) => a.date.localeCompare(b.date))
  return result
}

/**
 * Pull the last `days` calendar days of LOGGED nutrition intake (calories +
 * macros) via the nutrition-log dailyRollUp. INTAKE only — never the
 * activity_and_fitness "calories burned" estimate. Response field names are
 * parsed tolerantly (camelCase REST / snake_case proto) since the docs are terse.
 */
export async function fetchNutrition(
  accessToken: string,
  days = 3,
  now: Date = new Date(),
): Promise<DailyNutrition[]> {
  const win = lookbackWindow(now, days)
  const body = {
    range: { start: civilDateTime(win.start), end: civilDateTime(win.end) },
    windowSizeDays: 1,
  }
  const data = (await authedJson(
    `${HEALTH_BASE}/users/me/dataTypes/nutrition-log/dataPoints:dailyRollUp`,
    accessToken,
    { method: 'POST', body: JSON.stringify(body) },
  )) as { rollupDataPoints?: Array<Record<string, unknown>> }

  const out: DailyNutrition[] = []
  for (const p of data.rollupDataPoints ?? []) {
    const date = civilToDateStr(p.civilStartTime)
    if (!date) continue
    const nl = (p.nutritionLog ?? p.nutrition_log) as Record<string, unknown> | undefined
    if (!nl) continue

    const energy = (nl.energyQuantityRollup ?? nl.energy_quantity_rollup) as
      | Record<string, unknown>
      | undefined
    const calories = pickInt(energy, [
      'kilocaloriesSum',
      'kilocalories_sum',
      'kilocalories',
      'sum',
      'value',
    ])

    let protein: number | null = null
    let carbs: number | null = null
    let fat: number | null = null
    const nutrients = (nl.nutrientQuantityRollups ?? nl.nutrient_quantity_rollups) as
      | Array<Record<string, unknown>>
      | undefined
    for (const n of nutrients ?? []) {
      const type = String(n.nutrient ?? '').toUpperCase()
      const grams = toNum(n.quantityGrams ?? n.quantity_grams)
      if (grams == null) continue
      const g = Math.round(grams)
      // Match the documented Nutrient enum exactly so SATURATED_FAT / etc. don't
      // overwrite TOTAL_FAT.
      if (type === 'PROTEIN') protein = g
      else if (type === 'TOTAL_CARBOHYDRATE' || type === 'CARBOHYDRATE') carbs = g
      else if (type === 'TOTAL_FAT') fat = g
    }

    out.push({ date, calories, protein, carbs, fat })
  }
  out.sort((a, b) => a.date.localeCompare(b.date))
  return out
}

/** POST a dailyRollUp for one data type and return its rollup points. */
async function rollupPoints(
  accessToken: string,
  dataType: string,
  win: Window,
): Promise<Array<Record<string, unknown>>> {
  const body = {
    range: { start: civilDateTime(win.start), end: civilDateTime(win.end) },
    windowSizeDays: 1,
  }
  const data = (await authedJson(
    `${HEALTH_BASE}/users/me/dataTypes/${dataType}/dataPoints:dailyRollUp`,
    accessToken,
    { method: 'POST', body: JSON.stringify(body) },
  )) as { rollupDataPoints?: Array<Record<string, unknown>> }
  return data.rollupDataPoints ?? []
}

/**
 * Pull the last `days` of body composition — daily-average weight (kilograms)
 * and body-fat %. Each data type is best-effort (a missing scope / no readings
 * just yields nothing). Weight stays in KG here; the caller converts to the
 * user's unit.
 */
export async function fetchBody(
  accessToken: string,
  days = 7,
  now: Date = new Date(),
): Promise<DailyBody[]> {
  const win = lookbackWindow(now, days)
  const safe = async (dt: string) => {
    try {
      return await rollupPoints(accessToken, dt, win)
    } catch {
      return [] as Array<Record<string, unknown>>
    }
  }
  const [weightPts, bfPts] = await Promise.all([safe('weight'), safe('body-fat')])

  const map = new Map<string, DailyBody>()
  const ensure = (date: string) => {
    const cur = map.get(date) ?? { date, weightKg: null, bodyFatPct: null }
    map.set(date, cur)
    return cur
  }

  for (const p of weightPts) {
    const date = civilToDateStr(p.civilStartTime)
    if (!date) continue
    const kg = pickNum(p.weight ?? p['weight'], [
      'kilogramsAvg',
      'kilograms_avg',
      'kilograms',
      'avg',
      'value',
    ])
    if (kg != null) ensure(date).weightKg = kg
  }
  for (const p of bfPts) {
    const date = civilToDateStr(p.civilStartTime)
    if (!date) continue
    const pct = pickNum(p.bodyFat ?? p['body_fat'], [
      'bodyFatPercentageAvg',
      'body_fat_percentage_avg',
      'percentageAvg',
      'percentage',
      'avg',
      'value',
    ])
    if (pct != null) ensure(date).bodyFatPct = pct
  }

  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date))
}
