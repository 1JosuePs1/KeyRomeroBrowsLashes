const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { Readable } = require('node:stream')
const test = require('node:test')
const vm = require('node:vm')
const ts = require('typescript')

function createApi(file, appointments, blockedTimes = []) {
  const queries = []
  const sql = async (strings, ...values) => {
    const query = strings.join('?').replace(/\s+/g, ' ').trim()
    queries.push(query)
    if (/^(CREATE|ALTER) TABLE/.test(query)) return []
    if (query.startsWith('SELECT date, enabled')) return []
    if (query.startsWith('SELECT blocked_times FROM availability_overrides')) return [{ blocked_times: blockedTimes }]
    if (query.startsWith('UPDATE availability_overrides SET blocked_times')) {
      blockedTimes.splice(0, blockedTimes.length, ...values[0])
      return []
    }
    if (query.startsWith('SELECT date::text, time FROM appointments WHERE id')) {
      return appointments.filter((item) => item.id === values[0])
    }
    if (query.startsWith('SELECT date::text, time FROM appointments')) {
      return appointments.filter((item) => !query.includes("status IS DISTINCT FROM 'archived'") || item.status !== 'archived')
    }
    if (query.startsWith('SELECT time FROM appointments')) {
      return appointments.filter((item) => item.date === values[0]
        && (!query.includes('id <>') || item.id !== values[1])
        && (!query.includes("status IS DISTINCT FROM 'archived'") || item.status !== 'archived'))
    }
    if (query.startsWith('UPDATE appointments SET status')) {
      appointments.find((item) => item.id === values[1]).status = values[0]
      return []
    }
    if (query.startsWith('DELETE FROM appointments')) {
      const index = appointments.findIndex((item) => item.id === values[0])
      return index < 0 ? [] : appointments.splice(index, 1)
    }
    throw new Error(`Unexpected query: ${query}`)
  }
  const source = fs.readFileSync(path.join(__dirname, '..', 'api', file), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  const exports = {}
  const requireMock = (name) => {
    if (name === '@neondatabase/serverless') return { neon: () => sql }
    if (name === './auth.js') return { isAdminRequest: () => true }
    if (name === './appointment-email.js') return { renderAppointmentEmail: () => '' }
    throw new Error(`Unexpected import: ${name}`)
  }
  vm.runInNewContext(code, { exports, require: requireMock, process: { env: { DATABASE_URL: 'test' } }, console })
  return { handler: exports.default, queries }
}

async function request(handler, method, body) {
  const input = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : [])
  input.method = method
  let status
  let result
  await handler(input, {
    writeHead(code) { status = code },
    end(data) { result = data && JSON.parse(data) },
  })
  return { status, body: result }
}

const appointment = () => ({ id: 'existing', date: '2026-11-16', time: '2:30 p. m.', status: 'archived' })

test('una cita archivada sigue apareciendo como hora ocupada', async () => {
  const api = createApi('availability.ts', [appointment()])
  const response = await request(api.handler, 'GET')
  assert.equal(response.status, 200)
  assert.deepEqual(response.body[0].blockedTimes, ['14:30'])
})

test('archivar una cita no libera su hora', async () => {
  const existing = { ...appointment(), status: 'pending' }
  const api = createApi('appointments.ts', [existing])
  const response = await request(api.handler, 'PATCH', { id: existing.id, status: 'archived' })
  assert.equal(response.status, 200)
  assert.equal(existing.status, 'archived')
  assert.equal(api.queries.some((query) => query.includes('availability_overrides')), false)
})

test('no se puede reservar ni mover otra cita a la hora archivada', async () => {
  const api = createApi('appointments.ts', [appointment(), { id: 'other', date: '2026-11-17', time: '10:00', status: 'pending' }])
  const created = await request(api.handler, 'POST', {
    manual: true, id: 'new', name: 'Clienta', date: '2026-11-16', time: '14:30', services: ['2D'],
  })
  const online = await request(api.handler, 'POST', {
    id: 'online', name: 'Clienta', phone: '88888888', email: 'test@example.com',
    date: '2026-11-16', time: '2:30 p. m.', services: ['2D'],
    receiptName: 'receipt.png', receiptDataUrl: 'data:image/png;base64,YQ==',
  })
  const moved = await request(api.handler, 'PUT', { id: 'other', date: '2026-11-16', time: '14:30' })
  assert.equal(created.status, 409)
  assert.equal(online.status, 409)
  assert.equal(moved.status, 409)
})

test('eliminar una cita libera su hora', async () => {
  const appointments = [appointment()]
  const blockedTimes = ['14:30', '16:00']
  const api = createApi('appointments.ts', appointments, blockedTimes)
  const response = await request(api.handler, 'DELETE', { id: 'existing' })
  assert.equal(response.status, 200)
  assert.equal(response.body.deleted, true)
  assert.deepEqual(blockedTimes, ['16:00'])
  const availability = await request(createApi('availability.ts', appointments).handler, 'GET')
  assert.deepEqual(availability.body, [])
})
