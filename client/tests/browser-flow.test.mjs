import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { createServer } from 'vite'

const executable = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync)
test('browser: required consent, direct login, themes and confirmed actions preserve existing flows', { skip: !executable, timeout: 180000 }, async () => {
  process.env.VITE_API_URL = 'http://127.0.0.1:59998/api'
  const vite = await createServer({ root: resolve(import.meta.dirname, '..'), logLevel: 'silent', server: { host: '127.0.0.1', port: 0 } })
  const profileDir = mkdtempSync(join(tmpdir(), 'autocare-client-test-'))
  let chrome, socket
  try {
    await vite.listen()
    const origin = `http://127.0.0.1:${vite.httpServer.address().port}`
    chrome = spawn(executable, ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--remote-debugging-port=0', `--user-data-dir=${profileDir}`, '--window-size=1440,1000', 'about:blank'], { windowsHide: true, stdio: 'ignore' })
    async function waitFor(check, label, timeout = 10000) {
      const until = Date.now() + timeout
      while (Date.now() < until) { if (await check()) return; await delay(75) }
      throw new Error(`Timed out: ${label}`)
    }
    await waitFor(() => existsSync(join(profileDir, 'DevToolsActivePort')), 'Chrome startup')
    const port = readFileSync(join(profileDir, 'DevToolsActivePort'), 'utf8').split('\n')[0]
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json()
    socket = new WebSocket(target.webSocketDebuggerUrl)
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
    let sequence = 0
    const pending = new Map(), calls = [], failures = []
    function send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = ++sequence; const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)) }, 10000); pending.set(id, { resolve: value => { clearTimeout(timeout); resolve(value) }, reject: error => { clearTimeout(timeout); reject(error) } }); socket.send(JSON.stringify({ id, method, params }))
      })
    }
    const user = { _id: '111111111111111111111111', fullName: 'Juan Santos', email: 'juan@example.com', role: 'client', emailVerified: true }
    const vehicle = { _id: '222222222222222222222222', make: 'Toyota', model: 'Vios', year: 2025, plateNumber: 'ABC1234', transmission: 'automatic', currentMileage: 1200 }
    const service = { _id: '333333333333333333333333', name: 'Oil change', estimatedDuration: 60, estimatedPrice: 1000 }
    const slot = { _id: '444444444444444444444444', date: '2099-01-01', timeSlot: '10:00', maximumCapacity: 3, currentBookingCount: 0, isEnabled: true }
    const deskVehicle = { _id: '999999999999999999999999', make: 'Toyota', model: 'Fortuner', year: 2025, plateNumber: 'DSK 1234', transmission: 'automatic', currentMileage: 500 }
    const toyotaCatalog = [
        { _id: '707070707070707070707070', make: 'Toyota', model: '86', year: 2020, variant: null, imageUrl: '/toyota/86.jpg' },
      { _id: '101010101010101010101010', make: 'Toyota', model: 'Vios', year: 2025, variant: '1.3 XLE CVT', transmission: 'cvt', category: 'Sedan', fuelType: 'gasoline', seatingCapacity: 5, imageUrl: '' },
      { _id: '202020202020202020202020', make: 'Toyota', model: 'Fortuner', year: 2025, variant: '2.4 G 4x2 AT', transmission: 'automatic', category: 'SUV', fuelType: 'diesel', seatingCapacity: 7, imageUrl: '/toyota/fortuner.png' },
      { _id: '303030303030303030303030', make: 'Toyota', model: 'Fortuner', year: 2026, variant: '2.4 G 4x2 AT', transmission: 'automatic', category: 'SUV', fuelType: 'diesel', seatingCapacity: 7, imageUrl: '/toyota/missing.png' },
      { _id: '404040404040404040404040', make: 'Toyota', model: 'Raize', year: 2023, variant: '1.2 G CVT', transmission: 'cvt', category: 'Crossover', fuelType: 'gasoline', seatingCapacity: 5, imageUrl: '/toyota/raize.webp' },
      { _id: '505050505050505050505050', make: 'Toyota', model: 'Raize', year: 2025, variant: '1.2 G CVT', transmission: 'cvt', category: 'Crossover', fuelType: 'gasoline', seatingCapacity: 5, imageUrl: '/toyota/raize.webp' },
      { _id: '606060606060606060606060', make: 'Toyota', model: 'Raize', year: 2026, variant: '1.2 G CVT', transmission: 'cvt', category: 'Crossover', fuelType: 'gasoline', seatingCapacity: 5, imageUrl: '/toyota/raize.webp' },
    ]
    let bookingAvailabilityDate = ''
    let vehicles = [], plateConflict = true, walkInEmailConflict = true
    let staffItems = []
    let mechanicJob = null
    let notificationItems = [{ _id: '666666666666666666666666', title: 'Service update', message: 'Ready', type: 'job_order', isRead: false, createdAt: new Date(Date.now() - 300000).toISOString() },
      { _id: '777777777777777777777777', title: 'Booking update', message: 'Confirmed', type: 'booking', isRead: false, createdAt: new Date(Date.now() - 3600000).toISOString() }]
    let notificationReadFailure = false
    let credentialResendFails = true
    let recordLayoutFixtures = false
    let recordFixtureCount = 6
    socket.onmessage = event => {
      const data = JSON.parse(event.data)
      if (data.method === 'Runtime.exceptionThrown') failures.push(data.params.exceptionDetails.exception?.description || data.params.exceptionDetails.text)
      if (data.id) {
        const request = pending.get(data.id); pending.delete(data.id)
        if (data.error) request?.reject(new Error(data.error.message)); else request?.resolve(data.result)
      } else if (data.method === 'Fetch.requestPaused') {
        const { requestId, request } = data.params
        ;(async () => {
          const url = new URL(request.url)
          const headers = [{ name: 'Content-Type', value: 'application/json' }, { name: 'Access-Control-Allow-Origin', value: '*' }, { name: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' }, { name: 'Access-Control-Allow-Methods', value: 'GET, POST, PATCH, PUT, OPTIONS' }]
          let body = { items: [], count: 0 }, status = 200
          if (request.method !== 'OPTIONS') {
            calls.push({ path: url.pathname, method: request.method, body: request.postData })
            if (url.pathname === '/api/auth/me') body = { user }
            if (url.pathname === '/api/job-orders/active') body = { item: mechanicJob }
            if (url.pathname === '/api/job-orders') body = { items: mechanicJob ? [mechanicJob] : [] }
            if (/^\/api\/job-orders\/[a-f\d]{24}\/work$/.test(url.pathname) && request.method === 'PUT') {
              const work = JSON.parse(request.postData)
              mechanicJob = { ...mechanicJob, ...work, updatedAt: new Date().toISOString() }; body = { item: mechanicJob }
            }
            if (url.pathname === '/api/reports/summary') body = { totalBookings: 0, completedBookings: 0, completedServices: 0,
              completedEstimate: 0, bySource: { online: 0, 'walk-in': 0 }, byStatus: {}, bookingsByDate: [], mechanicWorkload: [] }
            if (url.pathname === '/api/auth/login') body = { accessToken: 'test-only-token', user }
            if (url.pathname === '/api/auth/change-temporary-password') { user.mustChangePassword = false; body = { accessToken: 'changed-test-token', user } }
            if (url.pathname === '/api/auth/change-password/request-code') {
              if (JSON.parse(request.postData || '{}').currentPassword === 'wrong') {
                status = 400; body = { errors: { currentPassword: 'Current password is incorrect.' } }
              } else body = { message: 'Verification code sent.', resendAfter: 1 }
            }
            if (url.pathname === '/api/auth/change-password/verify-code') {
              if (JSON.parse(request.postData || '{}').otp !== '012345') {
                status = 400; body = { errors: { otp: 'Invalid verification code.' } }
              } else body = { verificationToken: 'a'.repeat(64), expiresIn: 300 }
            }
            if (url.pathname === '/api/auth/change-password') body = { accessToken: 'password-updated-token', user }
            if (url.pathname === '/api/toyota/catalog') body = { items: toyotaCatalog, models: [
                { model: '86', years: [2020], imageUrl: '/toyota/86.jpg' },
                { model: 'Alphard', years: [], imageUrl: '/toyota/alphard.webp' },
              { model: 'Vios', years: [2025] },
              { model: 'Raize', years: [2026, 2025, 2023] },
              { model: 'Fortuner', years: [2026, 2025] },
            ] }
            if (url.pathname === '/api/toyota/years') body = { items: [...new Set(toyotaCatalog
              .filter(item => item.model.toLowerCase() === url.searchParams.get('model')?.toLowerCase())
              .map(item => item.year))].sort((a, b) => b - a) }
            if (url.pathname === '/api/toyota/variants') body = { items: toyotaCatalog.filter(item =>
              item.model.toLowerCase() === url.searchParams.get('model')?.toLowerCase()
              && item.year === Number(url.searchParams.get('year'))) }
            if (url.pathname === '/api/notifications/unread-count') body = { count: notificationItems.filter(item => !item.isRead).length }
            if (url.pathname === '/api/notifications' && request.method === 'GET') body = { items: notificationItems }
            if (url.pathname === '/api/notifications/read-all' && request.method === 'PATCH') { notificationItems = notificationItems.map(item => ({ ...item, isRead: true })); body = { modifiedCount: 2 } }
            if (/^\/api\/notifications\/[a-f\d]{24}\/read$/.test(url.pathname) && request.method === 'PATCH') {
              if (notificationReadFailure) { status = 503; body = { message: 'Please try again.' } }
              else {
                notificationItems = notificationItems.map(item => item._id === url.pathname.split('/')[3] ? { ...item, isRead: true } : item)
                body = { item: notificationItems.find(item => item._id === url.pathname.split('/')[3]) }
              }
            }
            if (url.pathname === '/api/bookings/walk-in/options') body = { services: [service], schedules: [slot] }
            if (url.pathname === '/api/bookings/walk-in/clients' && request.method === 'GET') body = { items: [{ _id: user._id, fullName: 'Juan Santos', phone: '09171234567', email: user.email, vehicleCount: 1, isWalkInCustomer: false }] }
            if (url.pathname === '/api/bookings/walk-in/email-check') body = { existingClient: url.searchParams.get('email') === 'existing@example.invalid',
              message: url.searchParams.get('email') === 'existing@example.invalid' ? 'Existing client account found.' : '' }
            if (url.pathname === `/api/bookings/walk-in/clients/${user._id}/vehicles` && request.method === 'GET') body = { items: [vehicle] }
            if (url.pathname === `/api/bookings/walk-in/clients/${user._id}/vehicles` && request.method === 'POST') body = { item: deskVehicle }
            if (url.pathname === '/api/bookings/walk-in' && request.method === 'POST') body = { item: { _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', status: 'checked_in', bookingType: 'walk-in' } }
            if (url.pathname === '/api/bookings/aaaaaaaaaaaaaaaaaaaaaaaa' && request.method === 'GET') body = { item: {
              _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', status: 'checked_in', bookingType: 'walk-in',
              bookingDate: bookingAvailabilityDate, bookingTime: '10:00', client: { fullName: 'Juan Santos' },
              vehicle: deskVehicle, services: [service], createdByStaff: { fullName: 'Desk Staff', staffId: 'STF-0001' },
            } }
            if (url.pathname === '/api/people/staff' && request.method === 'GET') body = { items: staffItems }
            if (url.pathname === '/api/people/staff/next-id' && request.method === 'GET') body = { staffId: 'STF-0001' }
            if (url.pathname === '/api/people/staff' && request.method === 'POST') {
              const values = JSON.parse(request.postData || '{}')
              staffItems = [{ _id: '888888888888888888888888', ...values, staffId: 'STF-0001',
                fullName: `${values.firstName} ${values.lastName}`, status: 'active' }]
              body = { item: staffItems[0], emailSent: true, message: 'Staff account created. Temporary sign-in details were emailed.' }
            }
            if (url.pathname === '/api/bookings/walk-in/new-client') {
              if (walkInEmailConflict) { status = 409; body = { errors: { email: 'This email belongs to a non-client account.' } }; walkInEmailConflict = false }
              else {
                const customer = JSON.parse(request.postData).customer
                const existingClient = customer.email.trim().toLowerCase() === 'existing@example.invalid'
                body = { item: { _id: '555555555555555555555555', status: 'checked_in', bookingType: 'walk-in' },
                  accountCreated: !existingClient && Boolean(customer.email), existingClient, emailSent: true,
                  ...(!existingClient && customer.email ? { account: { id: '111111111111111111111111', fullName: 'Maria Santos', email: customer.email.trim().toLowerCase() }, deliveryToken: 'b'.repeat(64) } : {}),
                  message: 'Walk-in customer, vehicle, and checked-in booking created.' }
              }
            }
            if (/^\/api\/bookings\/walk-in\/clients\/[a-f\d]{24}\/resend-credentials$/.test(url.pathname)) {
              body = { emailSent: !credentialResendFails, resendAfter: 0 }; credentialResendFails = false
            }
            if (url.pathname === '/api/auth/login' && JSON.parse(request.postData || '{}').password === 'wrong') { status = 401; body = { message: 'Invalid email or password.' } }
            if (url.pathname === '/api/vehicles' && request.method === 'GET') body = { items: vehicles }
            if (url.pathname === '/api/vehicles' && request.method === 'POST') {
              if (plateConflict) { status = 409; body = { message: 'This plate number is already registered.', errors: { plateNumber: 'This plate number is already registered.' } }; plateConflict = false }
              else { vehicles = [vehicle]; body = { item: vehicle } }
            }
            if (url.pathname === '/api/bookings/options') body = { services: [service] }
            if (url.pathname === '/api/schedules/available') body = { items: [slot] }
            if (url.pathname === '/api/bookings/availability') {
              const fromDate = url.searchParams.get('fromDate')
              const toDate = url.searchParams.get('toDate')
              const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
              const tomorrow = new Date(`${today}T00:00:00+08:00`)
              tomorrow.setDate(tomorrow.getDate() + 1)
              const nextDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(tomorrow)
              bookingAvailabilityDate = nextDay >= fromDate && nextDay <= toDate ? nextDay : today < fromDate ? fromDate : today
              body = { dates: [{ date: bookingAvailabilityDate, available: true, slots: [{
                scheduleId: slot._id, time: '10:00', estimatedEndTime: '11:00', available: true, mechanicCount: 2,
              }] }] }
            }
            if (url.pathname === '/api/schedules' && request.method === 'GET') body = { items: [{ ...slot, currentBookingCount: 2 }] }
            if (url.pathname === '/api/bookings' && request.method === 'POST') body = { item: { _id: '555555555555555555555555' } }
            if (recordLayoutFixtures && request.method === 'GET') {
              const longName = 'Long customer and vehicle record name '.repeat(3)
              const rows = Array.from({ length: recordFixtureCount }, (_, index) => ({
                id: String(index + 100), name: `${longName} ${index}`,
                fullName: `${longName} ${index}`, email: `person${index}@example.com`, phone: '09171234567',
                status: 'active', isArchived: false, staffId: `STF-${index}`, employeeId: `MECH-${index}`,
                availability: 'available', isWalkInCustomer: index % 2 === 0, vehicleCount: 1,
                ...vehicle, _id: String(index + 100).padStart(24, '0'), variant: longName,
                estimatedDuration: 60, estimatedPrice: 1000, description: longName, isActive: true,
                operationalStatus: 'operational', date: '2099-01-01', timeSlot: '10:00', isEnabled: true,
                maximumCapacity: 3, currentBookingCount: 1, processedBookings: 10,
                bookings: 1, completed: 1, assigned: 1, active: 0, processed: 1, jobs: 1, visits: 1,
              }))
              if (['/api/vehicles', '/api/people/staff', '/api/people/customers', '/api/mechanics', '/api/services', '/api/service-bays', '/api/schedules'].includes(url.pathname)) body = { items: rows }
              const bookingRows = rows.map(row => ({ _id: row._id, vehicle: { ...vehicle, model: longName },
                client: { fullName: longName }, bookingDate: '2099-01-01', bookingTime: '10:00', services: [{ ...service, name: longName }],
                bookingType: Number(row.id) % 2 ? 'walk-in' : 'online', status: 'completed',
                createdAt: '2026-10-14T00:00:00Z', updatedAt: '2026-10-14T01:00:00Z', completedAt: '2026-10-14T01:00:00Z' }))
              if (url.pathname === '/api/bookings') body = { items: bookingRows }
              if (/^\/api\/people\/customers\/[a-f\d]{24}$/.test(url.pathname)) body = { customer: rows[0], vehicles: [rows[0]], bookings: bookingRows }
              if (url.pathname === '/api/job-orders') body = { items: rows.map((row, index) => ({ _id: row._id, status: 'completed',
                updatedAt: '2026-10-14T00:00:00Z', booking: bookingRows[index], mechanic: { fullName: longName }, serviceBay: { name: longName } })) }
              if (url.pathname === '/api/maintenance-reminders') body = { items: rows.map(row => ({ _id: row._id, vehicle: { ...vehicle, model: longName },
                client: { fullName: longName }, service: { name: longName }, lastServiceDate: '2026-10-01', nextRecommendedServiceDate: '2026-11-01', status: 'pending' })) }
              if (url.pathname === '/api/reports/summary') body = { totalBookings: 6, completedBookings: 6, completedServices: 6, completedEstimate: 6000,
                bySource: { online: 3, 'walk-in': 3 }, byStatus: { completed: 6 }, bookingsByDate: rows,
                mechanicWorkload: rows, servicePopularity: rows, staffActivity: rows, serviceBayUsage: rows }
            }
            if (request.method === 'GET' && url.searchParams.has('page') && Array.isArray(body.items)) {
              const limit = Number(url.searchParams.get('limit') || 5)
              const totalItems = body.items.length; const totalPages = Math.ceil(totalItems / limit)
              const page = Math.min(Number(url.searchParams.get('page')), Math.max(1, totalPages))
              body = { ...body, items: body.items.slice((page - 1) * limit, page * limit), page, limit, totalItems, totalPages }
            }
            if (request.method === 'POST') await delay(150)
          }
          await send('Fetch.fulfillRequest', { requestId, responseCode: status, responseHeaders: headers, body: Buffer.from(JSON.stringify(body)).toString('base64') })
        })().catch(error => { if (!error.message.includes('Invalid InterceptionId')) failures.push(error.message) }) // Navigation can cancel an intercepted request.
      }
    }
    await send('Runtime.enable')
    await send('Page.enable')
    await send('Fetch.enable', { patterns: [{ urlPattern: 'http://127.0.0.1:59998/*' }] })
    async function evaluate(expression) {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
      if (result.exceptionDetails) throw new Error(`${result.exceptionDetails.exception?.description || result.exceptionDetails.text}\n${failures.join('\n')}`)
      return result.result.value
    }
    const text = value => evaluate(`document.body.innerText.includes(${JSON.stringify(value)})`)
    const count = path => calls.filter(call => call.method === 'POST' && call.path === path).length
    async function assertSharedScenery() {
      const backgrounds = await evaluate(`['.workspace-shell', '.MuiDrawer-paper', '.MuiAppBar-root', '#workspace-content'].map(selector => getComputedStyle(document.querySelector(selector)).backgroundImage.includes('fortuner-dashboard-scenery'))`)
      assert.deepEqual(backgrounds, [true, false, false, false], 'only the shared shell owns the scenic image')
      assert.match(await evaluate(`getComputedStyle(document.querySelector('.workspace-shell')).backgroundAttachment`), /fixed/)
      assert.match(await evaluate(`getComputedStyle(document.querySelector('.MuiDrawer-paper')).backgroundColor`), /rgba\(/)
      assert.match(await evaluate(`getComputedStyle(document.querySelector('.MuiAppBar-root')).backgroundColor`), /rgba\(/)
    }
    async function navigate(path) {
      await send('Page.navigate', { url: origin + path })
      await waitFor(() => path.startsWith('/mechanic/')
        ? evaluate(`Boolean(document.querySelector('#workspace-content'))`)
        : text('AutoCare'), path)
    }
    async function click(label, twice = false) {
      await waitFor(() => evaluate(`Array.from(document.querySelectorAll('button')).some(b => b.textContent.trim() === ${JSON.stringify(label)} && !b.disabled)`), `button ${label}`)
      await evaluate(`{ const b = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === ${JSON.stringify(label)} && !b.disabled); b.click(); ${twice ? 'b.click();' : ''} }`)
      await delay(100)
    }
    async function input(name, value) {
      await evaluate(`{ const el = document.querySelector('input[name="${name}"]'); if (!el) throw new Error('Missing ${name}'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); }`)
      await delay(75)
    }
    async function select(name, label) {
      await waitFor(() => evaluate(`Boolean(document.querySelector('input[name="${name}"]')) && !document.querySelector('input[name="${name}"]').disabled`), `selectable ${name}`)
      await evaluate(`document.querySelector('input[name="${name}"]').parentElement.querySelector('[role="combobox"]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))`)
      await waitFor(() => evaluate(`Array.from(document.querySelectorAll('[role="option"]')).some(el => el.textContent.includes(${JSON.stringify(label)}))`), `select ${name}`)
      await evaluate(`Array.from(document.querySelectorAll('[role="option"]')).find(el => el.textContent.includes(${JSON.stringify(label)})).click()`)
      await delay(100)
    }
    async function typeText(name, value) {
      await evaluate(`{ const el = document.querySelector('input[name="${name}"]'); el.focus(); el.select(); }`)
      await send('Input.insertText', { text: value })
      assert.equal(await evaluate(`document.querySelector('input[name="${name}"]').value`), value, `typing into ${name}`)
    }
    async function noDialog() { await waitFor(async () => !await evaluate(`Array.from(document.querySelectorAll('[role="dialog"]')).some(d => d.textContent.includes('Confirm action'))`), 'confirmation closed') }
    async function screenshot(name) {
      if (!process.env.CLIENT_SCREENSHOTS) return
      await delay(350)
      const directory = resolve(import.meta.dirname, '../screenshots')
      mkdirSync(directory, { recursive: true })
      const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
      writeFileSync(join(directory, `${name}.png`), Buffer.from(data, 'base64'))
    }

    await navigate('/login')
    assert.equal(await evaluate(`Boolean(document.querySelector('header [aria-label^="Switch to"]'))`), false)
    await typeText('email', 'draft@example.com')
    await screenshot('login-desktop')
    assert.equal(await evaluate(`document.querySelector('input[name="email"]').value`), 'draft@example.com')
    await navigate('/login')
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
    await screenshot('login-mobile')
    assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true, 'mobile login must not overflow')
    await send('Emulation.clearDeviceMetricsOverride')

    await navigate('/register')
    await waitFor(() => evaluate(`Boolean(document.querySelector('input[name="termsAccepted"]'))`), 'registration form mounted')
    assert.equal(await evaluate(`document.querySelector('input[name="termsAccepted"]').disabled`), true)
    assert.equal(await evaluate(`document.querySelector('[aria-label="Password requirements"]').textContent.includes('Satisfied:')`), false)
    await typeText('password', 'a')
    assert.equal(await evaluate(`document.querySelector('[aria-label="Password requirements"]').textContent.includes('Satisfied: One lowercase letter')`), true)
    await typeText('confirmPassword', 'b'); assert.equal(await text('Passwords do not match'), true)
    await typeText('confirmPassword', 'a'); assert.equal(await text('Passwords match'), true)
    await input('phone', '09abc17 123-45678999')
    assert.equal(await evaluate(`document.querySelector('input[name="phone"]').value`), '09171234567')
    await input('phone', '+63 (917) 123-45679999')
    assert.equal(await evaluate(`document.querySelector('input[name="phone"]').value`), '+639171234567')
    await evaluate(`{ const el = document.querySelector('input[name="phone"]'); el.focus(); el.select(); }`)
    await send('Input.insertText', { text: '09abc17 123-45678999' })
    assert.equal(await evaluate(`document.querySelector('input[name="phone"]').value`), '09171234567', 'browser text insertion is cleaned and capped')
    await input('phone', '0917'); assert.equal(await text('Enter a valid Philippine mobile number.'), true)
    await evaluate(`document.querySelector('input[name="firstName"]').focus()`)
    await send('Input.insertText', { text: 'Juan Santos' })
    assert.equal(await evaluate(`document.querySelector('input[name="firstName"]').value`), 'Juan Santos', 'normal typing must update the controlled input')
    await input('firstName', '')
    await click('Create account')
    assert.equal(await text('First name is required.'), true); await noDialog()
    assert.equal(await evaluate(`document.querySelector('input[name="termsAccepted"]').checked`), false)
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('button')).filter(button => button.textContent === 'Terms of Service & Privacy Policy').length`), 1)
    await click('Terms of Service & Privacy Policy')
    assert.deepEqual(await evaluate(`Array.from(document.querySelectorAll('[role="dialog"] h2')).map(heading => heading.textContent)`), ['Terms of Service & Privacy Policy', 'Terms of Service', 'Privacy Policy'])
    await click('Close')
    assert.equal(await evaluate(`document.querySelector('input[name="termsAccepted"]').checked`), false)
    assert.equal(await evaluate(`document.querySelector('input[name="termsAccepted"]').disabled`), false)
    for (const [key, value] of Object.entries({ firstName: 'Juan', lastName: 'Santos', email: user.email, phone: '09171234567', password: 'A secure passphrase 42!', confirmPassword: 'A secure passphrase 42!' })) await input(key, value)
    await click('Create account'); await noDialog()
    assert.equal(await text('Please agree to the Terms of Service and Privacy Policy.'), true)
    assert.equal(count('/api/auth/register'), 0)
    await evaluate(`document.querySelector('input[name="termsAccepted"]').click()`)
    await input('password', 'weakpassword'); await input('confirmPassword', 'weakpassword')
    await click('Create account'); await noDialog(); assert.equal(count('/api/auth/register'), 0)
    await input('password', 'A secure passphrase 42!'); await input('confirmPassword', 'different')
    await click('Create account'); await noDialog(); assert.equal(await text('Passwords do not match'), true)
    await input('confirmPassword', 'A secure passphrase 42!')
    await click('Create account'); assert.equal(await text('Are you sure you want to create this account?'), true); assert.equal(count('/api/auth/register'), 0)
    await click('No'); await noDialog(); assert.equal(await evaluate(`document.querySelector('input[name="firstName"]').value`), 'Juan')
    await click('Create account'); await click('Yes', true)
    await waitFor(() => text('Verify your email'), 'registration redirect'); await noDialog(); assert.equal(count('/api/auth/register'), 1)
    const registration = JSON.parse(calls.find(call => call.path === '/api/auth/register').body)
    assert.equal(registration.termsAccepted, true); assert.equal(registration.phone, '+639171234567')
    assert.equal(registration.firstName, 'Juan'); assert.equal(registration.lastName, 'Santos')
    assert.equal(registration.middleName, ''); assert.equal(registration.suffix, '')

    await evaluate(`{ const el = document.querySelector('input[aria-label="Digit 1"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '123456'); el.dispatchEvent(new Event('input', { bubbles: true })); }`)
    await click('Verify email', true); await waitFor(() => text('Account verified!'), 'OTP verification'); await noDialog(); assert.equal(count('/api/auth/verify-email'), 1)

    await navigate('/login'); await click('Sign in'); await noDialog(); assert.equal(count('/api/auth/login'), 0)
    await typeText('email', user.email); await typeText('password', 'wrong')
    await click('Sign in', true); await noDialog(); await waitFor(() => text('Invalid email or password.'), 'login failure')
    assert.equal(count('/api/auth/login'), 1)
    assert.equal(await evaluate(`document.querySelector('input[name="email"]').value`), user.email)
    await typeText('password', 'A secure passphrase 42!'); await click('Sign in', true)
    await waitFor(() => evaluate(`Boolean(document.querySelector('[aria-label="Juan Santos, Client. Open profile menu"]'))`), 'role redirect'); await noDialog(); assert.equal(count('/api/auth/login'), 2)
    await assertSharedScenery()
    assert.equal(await evaluate(`Boolean(document.querySelector('header [aria-label^="Switch to"]'))`), false)
    assert.deepEqual(await evaluate(`Array.from(document.querySelectorAll('nav[aria-label="Client navigation"] a')).map(item => item.textContent.trim())`),
      ['Dashboard', 'My Vehicles', 'Book Service', 'My Bookings', 'Maintenance'])
    await waitFor(() => evaluate(`Boolean(document.querySelector('[aria-label="View notifications, 2 unread"]'))`), 'unread bell')
    const notificationPageBefore = await evaluate('location.pathname')
    await evaluate(`document.querySelector('[aria-label="View notifications, 2 unread"]').click()`)
    await waitFor(() => evaluate(`Boolean(document.querySelector('[role="dialog"] button[aria-label="Service update, unread"]'))`), 'bell opens recent notifications')
    assert.equal(await evaluate('location.pathname'), notificationPageBefore, 'bell keeps the current page')
    assert.equal(await evaluate(`document.querySelector('[aria-label="View notifications, 2 unread"] .MuiBadge-badge').textContent`), '2')
    await screenshot('notifications-popover-light')
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] })
    await waitFor(() => evaluate(`document.documentElement.dataset.colorMode === 'dark'`), 'dark notification theme')
    assert.equal(await evaluate(`(() => {
      const panel = document.querySelector('[role="dialog"]');
      const probe = document.createElement('div'); probe.style.backgroundColor = 'var(--surface)';
      panel.appendChild(probe); const expected = getComputedStyle(probe).backgroundColor; probe.remove();
      return getComputedStyle(panel).backgroundColor === expected;
    })()`), true, 'popover matches the dark workspace surface')
    await screenshot('notifications-popover-dark')
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] })
    await evaluate(`document.querySelector('[aria-label="View notifications, 2 unread"]').click()`)
    await waitFor(() => evaluate(`!document.querySelector('[role="dialog"]')`), 'bell toggles closed')
    await evaluate(`document.querySelector('[aria-label="View notifications, 2 unread"]').click()`)
    await waitFor(() => evaluate(`Boolean(document.querySelector('[role="dialog"]'))`), 'popover reopened')
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
    await waitFor(() => evaluate(`!document.querySelector('[role="dialog"]')`), 'Escape closes notifications')
    await evaluate(`document.querySelector('[aria-label="View notifications, 2 unread"]').click()`)
    await waitFor(() => evaluate(`Boolean(document.querySelector('[role="dialog"]'))`), 'popover reopened for outside click')
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 400, y: 600, button: 'left', clickCount: 1 })
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 400, y: 600, button: 'left', clickCount: 1 })
    await waitFor(() => evaluate(`!document.querySelector('[role="dialog"]')`), 'outside click closes notifications')
    await evaluate(`document.querySelector('[aria-label="View notifications, 2 unread"]').click()`)
    await waitFor(() => evaluate(`Boolean(document.querySelector('button[aria-label="Service update, unread"]'))`), 'recent notification ready')
    notificationReadFailure = true
    await evaluate(`document.querySelector('button[aria-label="Service update, unread"]').click()`)
    await waitFor(() => text('We could not complete that request. Please try again.'), 'failed read stays in popover')
    assert.equal(await evaluate('location.pathname'), notificationPageBefore)
    notificationReadFailure = false
    await evaluate(`document.querySelector('button[aria-label="Service update, unread"]').click()`)
    await waitFor(() => evaluate(`location.pathname === '/client/bookings' && !document.querySelector('[role="dialog"]')`), 'read then navigate to relevant bookings')
    await waitFor(() => evaluate(`Boolean(document.querySelector('[aria-label="View notifications, 1 unread"]'))`), 'unread count decremented')
    await evaluate(`document.querySelector('[aria-label="View notifications, 1 unread"]').click()`)
    await waitFor(() => evaluate(`Boolean(document.querySelector('button[aria-label="Service update"]'))`), 'read notification no longer shows unread')
    await click('Mark all as read')
    await waitFor(() => evaluate(`Boolean(document.querySelector('[aria-label="View notifications"]'))`), 'bell unread dot clears')
    await click('View all notifications')
    await waitFor(() => evaluate(`location.pathname === '/client/notifications' && !document.querySelector('[role="dialog"]')`), 'view all opens full history')
    await navigate('/client/dashboard')
    await waitFor(() => evaluate(`Boolean(document.querySelector('[aria-label="Juan Santos, Client. Open profile menu"]'))`), 'client dashboard ready')

    await evaluate(`document.querySelector('[aria-label="Juan Santos, Client. Open profile menu"]').click()`)
    await waitFor(() => evaluate(`Array.from(document.querySelectorAll('[role="menuitem"]')).some(item => item.textContent.includes('Help & Support'))`), 'client profile menu')
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('[role="menuitem"]')).filter(item => item.textContent.includes('Dashboard')).length`), 0)
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
    await waitFor(() => evaluate(`!document.querySelector('[role="menu"]')`), 'Escape closes menu')
    await evaluate(`document.querySelector('[aria-label="Juan Santos, Client. Open profile menu"]').click()`)
    await evaluate(`document.querySelector('.MuiBackdrop-root').click()`)
    await waitFor(() => evaluate(`!document.querySelector('[role="menu"]')`), 'outside click closes menu')
    await navigate('/client/profile'); await waitFor(() => text('Profile Information'), 'client profile')
    assert.equal(await text('Address'), true)
    await navigate('/client/account-settings'); await waitFor(() => text('Account Settings'), 'client settings')
    await evaluate(`Array.from(document.querySelectorAll('[role="tab"]')).find(item => item.textContent === 'Appearance').click()`)
    await evaluate(`document.querySelector('input[value="dark"]').click()`)
    assert.equal(await evaluate('document.documentElement.dataset.colorMode'), 'dark')
    await assertSharedScenery()
    assert.equal(await evaluate(`localStorage.getItem('toyota-autocare.color-mode')`), 'dark')
    await navigate('/client/account-settings'); await waitFor(() => text('Account Settings'), 'settings refresh')
    await evaluate(`Array.from(document.querySelectorAll('[role="tab"]')).find(item => item.textContent === 'Appearance').click()`)
    assert.equal(await evaluate(`document.querySelector('input[value="dark"]').checked`), true)
    assert.equal(await evaluate('document.documentElement.dataset.colorMode'), 'dark')
    await evaluate(`document.querySelector('input[value="light"]').click()`)
    assert.equal(await evaluate(`document.querySelector('input[value="light"]').checked`), true)
    await evaluate(`document.querySelector('input[value="system"]').click()`)
    assert.equal(await evaluate(`document.querySelector('input[value="system"]').checked`), true)
    await evaluate(`Array.from(document.querySelectorAll('[role="tab"]')).find(item => item.textContent === 'Notifications').click()`)
    assert.equal(await text('Notification preferences are not saved yet.'), true)
    await navigate('/client/help-support'); await waitFor(() => text('To be configured'), 'client support')
    await navigate('/admin/account-settings'); await waitFor(() => evaluate(`location.pathname === '/client/dashboard'`), 'client role guard')

    await navigate('/client/vehicles')
    await waitFor(() => evaluate(`Boolean(document.querySelector('.MuiSelect-select'))`), 'vehicle records filter')
    assert.equal(await evaluate(`document.querySelector('.MuiSelect-select')?.textContent.includes('Current vehicles')`), true)
    assert.equal(await text('Records'), false, 'vehicle filter has no floating Records label')
    await evaluate(`document.querySelector('.MuiSelect-select').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))`)
    await waitFor(() => evaluate(`Boolean(document.querySelector('[role="option"]'))`), 'vehicle filter options')
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('[role="option"]')).map(item => item.textContent).join('|')`), 'Current vehicles|Archived vehicles|All registered vehicles')
    await evaluate(`Array.from(document.querySelectorAll('[role="option"]')).find(item => item.textContent === 'All registered vehicles').click()`)
    assert.equal(await evaluate(`document.querySelector('.MuiSelect-select')?.textContent.includes('All registered vehicles')`), true)
    await click('Add vehicle'); await click('Save'); await noDialog()
    assert.equal(await text('Model is required.'), true)
    assert.equal(await evaluate(`document.querySelector('[role="dialog"] input[name="make"]')?.value === 'Toyota' && document.querySelector('[role="dialog"] input[name="make"]')?.readOnly`), true, 'Add Vehicle fixes make to Toyota')
    await evaluate(`document.querySelector('input[name="model"]').parentElement.querySelector('[role="combobox"]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))`)
    await waitFor(() => evaluate(`Boolean(document.querySelector('[role="option"]'))`), 'model options')
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('[role="option"]')).some(item => item.textContent === 'Alphard')`), false, 'model without verified years is hidden')
    await evaluate(`Array.from(document.querySelectorAll('[role="option"]')).find(item => item.textContent === '86').click()`)
    await select('year', '2020')
    await waitFor(() => evaluate(`document.querySelector('input[name="variant"]')?.disabled`), 'no verified variant is read only')
    assert.equal(await evaluate(`Boolean(document.querySelector('[role="dialog"] img[src="/toyota/86.jpg"]'))`), true, 'year without variants retains an image')
    await select('transmission', 'MANUAL')
    await select('model', 'Raize')
    assert.equal(await evaluate(`document.querySelector('input[name="year"]').value`), '', 'changing model clears year')
    await evaluate(`document.querySelector('input[name="year"]').parentElement.querySelector('[role="combobox"]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))`)
    await waitFor(() => evaluate(`Boolean(document.querySelector('[role="option"]'))`), 'Raize years')
    assert.deepEqual(await evaluate(`Array.from(document.querySelectorAll('[role="option"]')).map(item => item.textContent).filter(label => /^\\d{4}$/.test(label))`), ['2026', '2025', '2023'])
    await evaluate(`Array.from(document.querySelectorAll('[role="option"]')).find(item => item.textContent === '2023').click()`)
    await select('model', 'Fortuner')
    assert.equal(await evaluate(`document.querySelector('input[name="year"]').value`), '', 'switching model clears selected year')
    assert.equal(await evaluate(`document.querySelector('input[name="variant"]').value`), '', 'switching model clears variant')
    await select('year', '2026')
    await waitFor(() => evaluate(`Boolean(document.querySelector('[role="dialog"] img[src="/toyota/fortuner-cutout.png"]'))`), 'broken year image falls back to model image')
    await select('year', '2025')
    assert.equal(await evaluate(`Boolean(document.querySelector('[role="dialog"] img[src="/toyota/fortuner-cutout.png"]'))`), true, 'Client image appears after model and year')
    await select('variant', '2.4 G 4x2 AT')
    assert.equal(await evaluate(`Boolean(document.querySelector('[role="dialog"] img[src="/toyota/fortuner-cutout.png"]'))`), true, 'Client sees the selected Toyota vehicle image')
    await waitFor(() => evaluate(`(() => {
      const image = document.querySelector('[role="dialog"] img[src="/toyota/fortuner-cutout.png"]');
      return image.complete && image.naturalWidth > 0;
    })()`), 'Fortuner cutout loaded')
    assert.equal(await evaluate(`(() => {
      const image = document.querySelector('[role="dialog"] img[src="/toyota/fortuner-cutout.png"]');
      const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, 1, 1).data[3] === 0 && getComputedStyle(image).objectFit === 'contain';
    })()`), true, 'Fortuner preview uses real transparency and contain sizing')
    await screenshot('fortuner-cutout-preview')
    await select('model', 'Vios'); await select('year', '2025'); await select('variant', '1.3 XLE CVT'); await input('plateNumber', 'ABC1234')
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('[role="dialog"] img')).some(img => img.alt === 'Toyota Vios' && img.src.includes('/images/toyota-placeholder.png'))`), true, 'missing model image uses Toyota placeholder')
    async function assertVehicleWorkspacePosition() {
      assert.equal(await evaluate(`(() => {
        const panel = document.querySelector('[role="dialog"]').getBoundingClientRect();
        const topbar = document.querySelector('.workspace-shell .MuiAppBar-root').getBoundingClientRect();
        const sidebar = window.innerWidth >= 1200 ? document.querySelector('.workspace-sidebar').getBoundingClientRect().right : 0;
        const available = window.innerWidth - sidebar;
        return panel.left >= sidebar + 16 && panel.top >= topbar.bottom + 16
          && panel.right <= window.innerWidth - 16 && panel.bottom <= window.innerHeight - 16
          && Math.abs((panel.left + panel.right) / 2 - (sidebar + available / 2)) < 2
          && (window.innerHeight <= 700
            ? Math.abs(panel.top - topbar.bottom - 24) < 2
            : Math.abs((panel.top + panel.bottom) / 2 - (topbar.bottom + window.innerHeight) / 2) < 2);
      })()`), true, 'vehicle panel stays centered inside the workspace below the topbar: ' + JSON.stringify(await evaluate(`({ panel: document.querySelector('[role="dialog"]').getBoundingClientRect().toJSON(), topbar: document.querySelector('.workspace-shell .MuiAppBar-root').getBoundingClientRect().toJSON(), width: innerWidth, height: innerHeight })`)))
    }
    await assertVehicleWorkspacePosition()
    assert.equal(await evaluate(`document.querySelector('[role="dialog"]').getBoundingClientRect().width > 1000`), true, 'vehicle form uses the available desktop content width')
    assert.equal(await evaluate(`document.querySelector('.vehicle-form-preview img').getBoundingClientRect().height <= 200`), true, 'vehicle preview stays compact')
    assert.equal(await evaluate(`(() => {
      const panel = document.querySelector('[role="dialog"]');
      const content = panel.querySelector('.vehicle-form-workspace').getBoundingClientRect();
      const footer = panel.querySelector('.MuiDialogActions-root').getBoundingClientRect();
      return panel.getBoundingClientRect().height < 500 && panel.scrollHeight <= panel.clientHeight
        && footer.top - content.bottom <= 21 && footer.height <= 85;
    })()`), true, 'desktop modal fits its content with a compact footer and no unnecessary scrolling')
    assert.equal(await evaluate(`Math.abs(document.querySelector('.vehicle-form-preview').getBoundingClientRect().top - document.querySelector('input[name="make"]').closest('.MuiFormControl-root').getBoundingClientRect().top) < 2`), true, 'preview aligns with the first form row')
    assert.equal(await evaluate(`Math.abs(document.querySelector('input[name="plateNumber"]').closest('.MuiFormControl-root').getBoundingClientRect().width - document.querySelector('input[name="currentMileage"]').closest('.MuiFormControl-root').getBoundingClientRect().width) < 2`), true, 'plate and mileage have balanced widths')
    await screenshot('vehicle-workspace-desktop')
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] })
    await waitFor(() => evaluate(`document.documentElement.dataset.colorMode === 'dark'`), 'dark vehicle workspace')
    await screenshot('vehicle-workspace-dark')
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] })
    for (const width of [820, 390]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width === 390 })
      await delay(150)
      await assertVehicleWorkspacePosition()
      assert.equal(await evaluate(`document.documentElement.scrollWidth <= window.innerWidth && document.querySelector('[role="dialog"]').scrollWidth <= document.querySelector('[role="dialog"]').clientWidth`), true, 'vehicle workspace fits tablet and mobile')
      assert.equal(await evaluate(`getComputedStyle(document.querySelector('.vehicle-form-workspace')).gridTemplateColumns.split(' ').length`), 1, 'vehicle preview stacks below fields')
      await screenshot(`vehicle-workspace-${width === 390 ? 'mobile' : 'tablet'}`)
    }
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 550, deviceScaleFactor: 1, mobile: false })
    await delay(150)
    await assertVehicleWorkspacePosition()
    assert.equal(await evaluate(`(() => {
      const panel = document.querySelector('[role="dialog"]');
      const footer = panel.querySelector('.MuiDialogActions-root').getBoundingClientRect();
      const content = panel.querySelector('.MuiDialogContent-root');
      return footer.bottom <= innerHeight - 24 && content.scrollHeight > content.clientHeight;
    })()`), true, 'short viewport keeps the footer visible and scrolls overflowing content')
    await screenshot('vehicle-workspace-short')
    await send('Emulation.clearDeviceMetricsOverride')
    await input('currentMileage', '')
    await click('Save'); await noDialog(); assert.equal(await text('Current mileage is required.'), true)
    await input('currentMileage', '25430')
    assert.equal(await evaluate(`document.querySelector('input[name="plateNumber"]').maxLength`), 8)
    for (const [raw, expected] of [['DSDSADADASDAD', 'DSD'], ['abcd1234', 'ABC 1234'], ['abc12345', 'ABC 1234'], ['1234567', '']]) {
      await input('plateNumber', raw)
      assert.equal(await evaluate(`document.querySelector('input[name="plateNumber"]').value`), expected, `${raw} is restricted immediately`)
    }
    for (const invalid of ['ABC@1234', 'ABC_1234', 'A12345678', 'ABC 12']) {
      await input('plateNumber', invalid)
      await click('Save'); await noDialog()
      assert.equal(await text('Enter a valid Philippine plate number.'), true, `${invalid} is rejected`)
    }
    await input('plateNumber', ' abc1234 ')
    assert.equal(await evaluate(`document.querySelector('input[name="plateNumber"]').value`), 'ABC 1234')
    assert.equal(await evaluate(`document.querySelector('input[name="currentMileage"]').value`), '25,430', 'mileage displays thousands separators')
    await evaluate(`{ const input = document.querySelector('input[name="currentMileage"]'); input.focus(); input.setSelectionRange(2, 2) }`)
    await send('Input.insertText', { text: '9' })
    assert.equal(await evaluate(`document.querySelector('input[name="currentMileage"]').value`), '259,430', 'insertion in the middle keeps its place')
    await input('currentMileage', '23a23-232')
    assert.equal(await evaluate(`document.querySelector('input[name="currentMileage"]').value`), '2,323,232', 'non-digits are removed')
    await input('currentMileage', '1200')
    assert.equal(await evaluate(`document.querySelector('input[name="currentMileage"]').value`), '1,200')
    await click('Save'); assert.equal(await text('Are you sure you want to add this vehicle?'), true)
    await click('No'); await noDialog(); assert.equal(await evaluate(`document.querySelector('input[name="model"]').value`), 'Vios')
    await click('Save'); await click('Yes', true); await noDialog()
    assert.equal(count('/api/vehicles'), 1); assert.equal(await text('This plate number is already registered.'), true)
    assert.equal(await evaluate(`document.querySelector('input[name="model"]').value`), 'Vios')
    await input('plateNumber', 'ABC1235'); assert.equal(await text('This plate number is already registered.'), false)
    await click('Save'); await click('Yes'); await noDialog(); await waitFor(() => text('Vehicle added successfully.'), 'vehicle saved')
    assert.equal(JSON.parse(calls.filter(call => call.path === '/api/vehicles' && call.method === 'POST').at(-1).body).currentMileage,
      1200, 'saved mileage is a number without commas')
    assert.equal(JSON.parse(calls.filter(call => call.path === '/api/vehicles' && call.method === 'POST').at(-1).body).plateNumber,
      'ABC 1235', 'saved plate is normalized')
    await waitFor(() => evaluate(`Boolean(document.querySelector('.record-entity-avatar img'))`), 'My Vehicles image')
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('.record-entity-avatar img')).some(img => img.src.includes('/images/toyota-placeholder.png'))`), true, 'My Vehicles uses the Toyota placeholder for an unpictured model')
    await click('Details')
    await click('Edit')
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('[role="dialog"] img')).some(img => img.src.includes('/images/toyota-placeholder.png'))`), true, 'Vehicle Details uses the same image lookup')
    assert.equal(await evaluate(`document.querySelector('input[name="currentMileage"]').value`), '1,200', 'Edit Vehicle formats stored mileage')
    await click('Cancel')

    await navigate('/client/dashboard'); await waitFor(() => text('My vehicles'), 'dashboard')
    await screenshot('dashboard-desktop')
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
    await screenshot('dashboard-mobile')
    assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true, 'mobile workspace must not overflow')
    assert.equal(await evaluate(`Boolean(document.querySelector('header [aria-label^="View notifications"]'))`), true, 'mobile header keeps the bell')
    await waitFor(() => evaluate(`Boolean(document.querySelector('[aria-label="Open navigation"]'))`), 'mobile navigation control')
    await evaluate(`document.querySelector('[aria-label="Open navigation"]').click()`)
    await waitFor(() => evaluate(`Boolean(document.querySelector('.MuiDrawer-paper.workspace-sidebar'))`), 'mobile drawer')
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('.MuiDrawer-paper.workspace-sidebar')).backgroundImage`), 'none')
    await evaluate(`document.querySelector('[aria-label="Close navigation"]').click()`)
    await send('Emulation.clearDeviceMetricsOverride')

    await navigate('/client/book-service')
    await waitFor(() => text('ABC1234'), 'booking vehicles')
    await evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('ABC1234')).click()`)
    await click('Continue'); await evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Oil change')).click()`)
    await click('Continue')
    await waitFor(() => Boolean(bookingAvailabilityDate) && text('Available times'), 'calendar availability')
    await waitFor(() => evaluate(`Array.from(document.querySelectorAll('button')).some(b => b.getAttribute('aria-label') === ${JSON.stringify(`${bookingAvailabilityDate}, available`)})`), 'booking date button')
    await evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.getAttribute('aria-label') === ${JSON.stringify(`${bookingAvailabilityDate}, available`)}).click()`)
    await evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('10:00')).click()`)
    await click('Continue'); await click('Submit booking')
    assert.equal(await text('Are you sure you want to confirm this service booking?'), true)
    await click('No'); await noDialog(); assert.equal(count('/api/bookings'), 0); assert.equal(await text('Review your booking'), true)
    await click('Submit booking'); await click('Yes', true); await noDialog(); await waitFor(() => text('Booking received'), 'booking completed'); assert.equal(count('/api/bookings'), 1)
    await evaluate(`document.querySelector('[aria-label="Juan Santos, Client. Open profile menu"]').click()`)
    await evaluate(`Array.from(document.querySelectorAll('[role="menuitem"]')).find(item => item.textContent.trim() === 'Sign out').click()`)
    assert.equal(await text('Are you sure you want to sign out of your account?'), true)
    await click('Cancel'); await noDialog(); assert.equal(await evaluate(`Boolean(document.querySelector('[aria-label="Juan Santos, Client. Open profile menu"]'))`), true)
    await evaluate(`document.querySelector('[aria-label="Juan Santos, Client. Open profile menu"]').click()`)
    await evaluate(`Array.from(document.querySelectorAll('[role="menuitem"]')).find(item => item.textContent.trim() === 'Sign out').click()`)
    await click('Sign out'); await noDialog(); await waitFor(() => text('Welcome back.'), 'logout redirect')

    user.role = 'admin'
    await input('email', user.email); await input('password', 'A secure passphrase 42!')
    await click('Sign in'); await noDialog(); await waitFor(() => evaluate(`Boolean(document.querySelector('[aria-label="Juan Santos, Administrator. Open profile menu"]'))`), 'admin redirect')
    await assertSharedScenery()
    assert.equal(await evaluate(`Boolean(document.querySelector('header [aria-label^="Switch to"]'))`), false)
    await evaluate(`document.querySelector('[aria-label="Juan Santos, Administrator. Open profile menu"]').click()`)
    await waitFor(() => evaluate(`Boolean(document.querySelector('[role="menu"]'))`), 'admin menu')
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('[role="menuitem"]')).some(item => item.textContent.includes('Help & Support'))`), false)
    await navigate('/admin/profile'); await waitFor(() => text('Profile Information'), 'admin profile')
    await navigate('/admin/account-settings'); await waitFor(() => text('Account Settings'), 'admin settings')
    await evaluate(`Array.from(document.querySelectorAll('[role="tab"]')).find(item => item.textContent === 'Security').click()`)
    assert.equal(await text('Current Password'), true)
    await evaluate(`Array.from(document.querySelectorAll('[role="tab"]')).find(item => item.textContent === 'Appearance').click()`)
    await evaluate(`document.querySelector('input[value="dark"]').click()`)
    assert.equal(await evaluate('document.documentElement.dataset.colorMode'), 'dark')
    await evaluate(`document.querySelector('input[value="light"]').click()`)
    assert.equal(await evaluate(`document.querySelector('input[value="light"]').checked`), true)
    await navigate('/client/help-support'); await waitFor(() => evaluate(`location.pathname === '/admin/dashboard'`), 'admin role guard')
    await waitFor(() => evaluate(`Boolean(document.querySelector('[aria-label="Juan Santos, Administrator. Open profile menu"]'))`), 'admin guard rendered')
    await evaluate(`document.querySelector('[aria-label="Juan Santos, Administrator. Open profile menu"]').click()`)
    await evaluate(`Array.from(document.querySelectorAll('[role="menuitem"]')).find(item => item.textContent.trim() === 'Sign out').click()`)
    assert.equal(await text('Are you sure you want to sign out of your account?'), true)
    await click('Cancel'); await noDialog(); assert.equal(await evaluate(`location.pathname === '/admin/dashboard'`), true)
    await navigate('/admin/schedules')
    await waitFor(() => evaluate(`Boolean(document.querySelector('.record-card'))`), 'schedule record loaded')
    assert.equal(await evaluate(`document.querySelector('.list-pagination') === null`), true, 'one page has no pagination footer')
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
    assert.equal(await evaluate(`document.documentElement.scrollWidth <= window.innerWidth`), true)
    await send('Emulation.clearDeviceMetricsOverride')
    await evaluate(`document.querySelector('.record-card .row-more-actions').click()`)
    await waitFor(() => evaluate(`Boolean(document.querySelector('[role="menuitem"]'))`), 'schedule overflow menu')
    await evaluate(`Array.from(document.querySelectorAll('[role="menuitem"]')).find(item => item.textContent === 'Edit').click()`)
    await input('date', ''); await input('maximumCapacity', '1'); await click('Save changes'); await noDialog()
    assert.equal(await text('Date is required.'), true)
    assert.equal(await text('Capacity cannot be lower than the current booked count.'), true)
    await input('date', slot.date); await input('maximumCapacity', '4')
    assert.equal(await text('Capacity cannot be lower than the current booked count.'), false)
    const scheduleWrites = () => calls.filter(call => call.method === 'PATCH' && call.path === `/api/schedules/${slot._id}`).length
    await click('Save changes'); await noDialog()
    await waitFor(() => text('Schedule updated.'), 'schedule saved'); assert.equal(scheduleWrites(), 1)
    await navigate('/admin/staff'); await click('Add staff')
    await waitFor(() => evaluate(`document.querySelector('input[name="staffId"]')?.value === 'STF-0001'`), 'Staff ID preview')
    assert.equal(await evaluate(`document.querySelector('input[name="staffId"]').readOnly`), true)
    for (const [name, value] of Object.entries({ firstName: 'Maria', lastName: 'Santos', email: 'maria.staff@example.com', phone: '09171234567' })) await input(name, value)
    await click('Create Staff'); await waitFor(() => text('STF-0001'), 'Staff appears in management')
    assert.equal(count('/api/people/staff'), 1)
    assert.equal('staffId' in JSON.parse(calls.find(call => call.path === '/api/people/staff' && call.method === 'POST').body), false)
    assert.equal(await text('Temporary Password'), false)
    await navigate('/admin/walk-in'); await waitFor(() => evaluate(`location.pathname === '/admin/dashboard'`), 'Admin walk-in guard')
    await evaluate(`document.querySelector('[aria-label="Juan Santos, Administrator. Open profile menu"]').click()`)
    await evaluate(`Array.from(document.querySelectorAll('[role="menuitem"]')).find(item => item.textContent.trim() === 'Sign out').click()`)
    await click('Sign out'); await noDialog(); await waitFor(() => text('Welcome back.'), 'admin logout before staff')
    user.role = 'staff'; user.mustChangePassword = true
    await input('email', user.email); await input('password', 'A secure passphrase 42!')
    await click('Sign in'); await noDialog(); await waitFor(() => evaluate(`location.pathname === '/change-password'`), 'staff forced setup')
    await navigate('/staff/dashboard'); await waitFor(() => evaluate(`location.pathname === '/change-password'`), 'staff dashboard blocked before setup')
    await navigate('/staff/walk-in'); await waitFor(() => evaluate(`location.pathname === '/change-password'`), 'staff operations blocked before setup')
    await input('newPassword', 'New Staff Journey 42!'); await input('confirmPassword', 'New Staff Journey 42!')
    await click('Set New Password'); await waitFor(() => evaluate(`location.pathname === '/staff/dashboard'`), 'staff setup complete')
    await evaluate(`document.querySelector('[aria-label="Juan Santos, Staff. Open profile menu"]').click()`)
    await evaluate(`Array.from(document.querySelectorAll('[role="menuitem"]')).find(item => item.textContent.trim() === 'Sign out').click()`)
    await click('Sign out'); await noDialog(); await waitFor(() => text('Welcome back.'), 'staff logout after setup')
    await input('email', user.email); await input('password', 'New Staff Journey 42!')
    await click('Sign in'); await noDialog(); await waitFor(() => evaluate(`location.pathname === '/staff/dashboard'`), 'staff direct login after setup')
    await navigate('/staff/walk-in'); await click('New Walk-In Customer'); await click('Continue')
    assert.equal(await text('First name is required.'), true)
    await input('firstName', 'Maria'); await input('lastName', 'Santos'); await input('email', ' Existing@Example.invalid ')
    await waitFor(() => text('Existing client account found.'), 'normalized email check finds existing client')
    assert.equal(await text('If this email is not yet registered, a Client account and temporary password will be created automatically.'), true)
    await input('email', 'maria@example.invalid')
    assert.equal(await text('Existing client account found.'), false, 'stale match disappears when email changes')
    await input('phone', '+63 917 123 4567letters999')
    assert.equal(await evaluate(`document.querySelector('input[name="phone"]').value`), '+639171234567')
    await click('Continue')
    await select('model', 'Vios'); await select('year', '2025'); await select('variant', '1.3 XLE CVT'); await input('plateNumber', 'ABC9999')
    await click('Continue')
    await evaluate(`document.querySelector('input[type="checkbox"]').click()`)
    await waitFor(() => Boolean(bookingAvailabilityDate) && text('Available times'), 'Walk-In calendar availability')
    await waitFor(() => evaluate(`Array.from(document.querySelectorAll('button')).some(b => b.getAttribute('aria-label') === ${JSON.stringify(`${bookingAvailabilityDate}, available`)})`), 'Walk-In date button')
    await evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.getAttribute('aria-label') === ${JSON.stringify(`${bookingAvailabilityDate}, available`)}).click()`)
    await evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('10:00')).click()`)
    await waitFor(() => evaluate(`Boolean(document.querySelector('svg[aria-label="Selected"]'))`), 'Walk-In slot selected')
    await click('Continue'); await click('Create Walk-In Booking')
    await click('No'); await noDialog(); assert.equal(count('/api/bookings/walk-in/new-client'), 0)
    await click('Create Walk-In Booking'); await click('Yes', true); await noDialog()
    await waitFor(() => text('This email could not be linked. Check Existing Customer before trying again.'), 'non-client email collision')
    assert.equal(await evaluate(`document.querySelector('input[name="firstName"]').value`), 'Maria')
    await input('email', 'maria2@example.invalid')
    assert.equal(await text('This email could not be linked. Check Existing Customer before trying again.'), false)
    await click('Continue'); await click('Continue'); await click('Continue'); await click('Create Walk-In Booking'); await click('Yes', true)
    await noDialog(); await waitFor(() => text('Walk-in booking created successfully.'), 'walk-in confirmation')
    assert.equal(count('/api/bookings/walk-in/new-client'), 2)
    await waitFor(() => text('Client account created'), 'credential email status')
    assert.equal(await text('Login credentials sent successfully'), true)
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('[aria-labelledby="client-credentials-title"] button')).some(button => ['Show', 'Hide', 'Copy'].includes(button.textContent))`), false, 'Staff has no password reveal or copy controls')
    await screenshot('walk-in-client-credentials-emailed')
    await click('Resend credentials', true)
    await waitFor(() => text('Client account created, but the temporary password email could not be delivered.'), 'resend failure is visible')
    assert.equal(await text('Login credentials sent successfully'), false, 'failure never retains a false success status')
    assert.equal(count('/api/bookings/walk-in/clients/111111111111111111111111/resend-credentials'), 1, 'rapid resend submits once')
    await screenshot('walk-in-client-credentials-email-failure')
    await click('Retry sending email')
    await waitFor(() => text('Login credentials sent successfully'), 'actual retry success updates modal')
    assert.equal(count('/api/bookings/walk-in/clients/111111111111111111111111/resend-credentials'), 2)
    await click('Close')
    await waitFor(() => evaluate(`document.querySelector('[aria-labelledby="client-credentials-title"]') === null`), 'credential modal removed')
    assert.equal(await evaluate(`JSON.stringify(localStorage).includes('bbbbbbbbbbbbbbbb') || JSON.stringify(sessionStorage).includes('bbbbbbbbbbbbbbbb')`), false, 'resend grant is never persisted in browser storage')

    await navigate('/staff/walk-in')
    await waitFor(() => evaluate(`Boolean(document.querySelector('input[name="customerSearch"]'))`), 'existing customer form')
    await input('customerSearch', 'Juan')
    await waitFor(() => text('1 vehicles'), 'existing customer search')
    await evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Juan Santos') && b.textContent.includes('1 vehicles')).click()`)
    await click('Continue')
    await click('+ Add Vehicle')
    await assertVehicleWorkspacePosition()
    assert.equal(await evaluate(`document.querySelector('[role="dialog"]').getBoundingClientRect().width > 1000`), true, 'Staff uses the shared vehicle workspace')
    await select('model', 'Fortuner'); await select('year', '2025')
    assert.equal(await evaluate(`Boolean(document.querySelector('img[src="/toyota/fortuner-cutout.png"]'))`), true, 'Staff image appears after model and year')
    await select('variant', '2.4 G 4x2 AT'); await input('plateNumber', 'DSK 1234')
    assert.equal(await evaluate(`Boolean(document.querySelector('img[src="/toyota/fortuner-cutout.png"]'))`), true, 'Staff sees the selected Toyota model image')
    await click('Add Vehicle')
    await waitFor(() => text('DSK 1234'), 'new existing-customer vehicle')
    await click('Continue')
    await evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Oil change')).click()`)
    await click('Continue')
    await waitFor(() => text('Available times'), 'existing customer availability')
    await evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.getAttribute('aria-label') === ${JSON.stringify(`${bookingAvailabilityDate}, available`)}).click()`)
    await evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('10:00')).click()`)
    await click('Continue')
    await click('Create Walk-In booking')
    await click('Yes', true); await noDialog()
    await waitFor(() => text('aaaaaaaaaaaaaaaaaaaaaaaa'), 'existing customer booking reference')
    assert.equal(count('/api/bookings/walk-in'), 1)
    await evaluate(`Array.from(document.querySelectorAll('a')).find(a => a.textContent.trim() === 'View Booking').click()`)
    await waitFor(() => evaluate(`Boolean(document.querySelector('[aria-labelledby="booking-details-title"]'))`), 'walk-in booking details')
    assert.equal(await text('Created by Staff'), true)

    user.role = 'client'; user.mustChangePassword = true
    await navigate('/client/dashboard'); await waitFor(() => text('Choose your new password'), 'forced password route')
    const bookingReads = calls.filter(call => call.path === '/api/bookings').length
    await navigate('/client/bookings'); await waitFor(() => text('Choose your new password'), 'manual URL blocked')
    assert.equal(calls.filter(call => call.path === '/api/bookings').length, bookingReads)
    await input('newPassword', 'short'); await input('confirmPassword', 'different')
    assert.equal(await text('Passwords do not match'), true)
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('button')).find(el => el.textContent === 'Save new password').disabled`), true)
    await input('newPassword', 'MyNewSecureJourney42!'); await input('confirmPassword', 'MyNewSecureJourney42!')
    assert.equal(await text('Passwords match'), true)
    await click('Save new password', true); await waitFor(() => text('My vehicles'), 'dashboard after password change')
    assert.equal(count('/api/auth/change-temporary-password'), 2)
    assert.equal(await evaluate(`sessionStorage.getItem('toyota-autocare.access')`), 'changed-test-token')
    await evaluate(`document.querySelector('[aria-label="Juan Santos, Client. Open profile menu"]').click()`)
    await evaluate(`Array.from(document.querySelectorAll('[role="menuitem"]')).find(item => item.textContent.trim() === 'Sign out').click()`)
    await click('Sign out'); await noDialog(); await waitFor(() => text('Welcome back.'), 'client logout before mechanic')
    user.role = 'mechanic'
    await input('email', user.email); await input('password', 'A secure passphrase 42!')
    await click('Sign in'); await noDialog(); await waitFor(() => evaluate(`Boolean(document.querySelector('[aria-label="Juan Santos, Mechanic. Open profile menu"]'))`), 'mechanic redirect')
    async function assertFullMechanicWidth(selector) {
      assert.equal(await evaluate(`(() => {
        const main = document.querySelector('#workspace-content');
        const style = getComputedStyle(main);
        const card = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
        const area = main.getBoundingClientRect();
        return Math.abs(card.left - area.left - parseFloat(style.paddingLeft)) < 2
          && Math.abs(card.right - area.right + parseFloat(style.paddingRight)) < 2
          && Math.abs(area.right - document.documentElement.clientWidth) < 2
          && document.documentElement.scrollWidth <= innerWidth;
      })()`), true, 'mechanic content fills the available workspace and matches page margins')
    }
    const assignedJob = { _id: 'abababababababababababab', updatedAt: '2026-01-01T00:00:00Z', status: 'pending',
      mechanic: { fullName: 'Juan Santos' }, serviceBay: { name: 'Bay 1' },
      booking: { status: 'mechanic_assigned', bookingDate: '2099-01-01', bookingTime: '10:00', vehicle,
        services: [service], client: { fullName: 'Client Example' } } }
    for (const width of [1920, 1440, 820, 390]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width === 390 })
      for (const item of [null, assignedJob]) {
        mechanicJob = item
        await navigate('/mechanic/active-job')
        await waitFor(() => text(item ? `Job Order ${assignedJob._id}` : 'No active job is assigned to you.'), 'active job content loaded')
        await assertFullMechanicWidth('.active-job-workspace')
        if (item) assert.equal(await evaluate(`Array.from(document.querySelectorAll('.active-job-workspace .detail-footer button')).some(button => button.textContent === 'Start Service' && !button.disabled)`), true, 'active job keeps its workflow action in the shared footer')
        if (!item) assert.equal(await evaluate(`(() => {
          const card = document.querySelector('.active-job-workspace').getBoundingClientRect();
          const message = document.querySelector('.active-job-workspace p').getBoundingClientRect();
          return card.height >= 150 && card.height <= 170 && Math.abs((card.top + card.bottom - message.top - message.bottom) / 2) < 2;
        })()`), true, 'empty active job is compact with a vertically centered message')
        if (width === 1920 || width === 390) await screenshot(`mechanic-active-job-${width}-${item ? 'assigned' : 'empty'}`)
      }
      await navigate('/mechanic/jobs'); await waitFor(() => text('My Jobs'), 'My Jobs loaded')
      await assertFullMechanicWidth('.job-orders-workspace')
      await navigate('/mechanic/dashboard'); await waitFor(() => evaluate(`Boolean(document.querySelector('.mechanic-dashboard-workspace'))`), 'mechanic dashboard loaded')
      await assertFullMechanicWidth('.mechanic-dashboard-workspace')
    }
    await send('Emulation.clearDeviceMetricsOverride')
    mechanicJob = { ...assignedJob, status: 'in_progress', booking: { ...assignedJob.booking, status: 'in_service' },
      checklistRequired: true, serviceChecklist: [{ description: 'Inspect service items', isCompleted: true }], mechanicNotes: '' }
    await navigate('/mechanic/jobs')
    await waitFor(() => evaluate(`Boolean(document.querySelector('.record-card'))`), 'mechanic work record')
    await click('Details')
    await waitFor(() => evaluate(`Boolean(document.querySelector('.record-detail-dialog .detail-footer .MuiButton-contained'))`), 'job workflow actions are portaled into dialog footer')
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('.record-detail-dialog .detail-footer button')).some(button => button.textContent === 'Mark for Final Inspection' && !button.disabled)`), true)
    await evaluate(`{ const el = document.querySelector('textarea[name="mechanicNotes"]'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, 'Inspection recorded.'); el.dispatchEvent(new Event('input', { bubbles: true })); }`)
    await waitFor(() => evaluate(`Array.from(document.querySelectorAll('.detail-footer button')).find(button => button.textContent === 'Mark for Final Inspection')?.disabled`), 'unsaved service notes block advancement')
    await click('Save notes & checklist'); await click('Yes'); await noDialog()
    await waitFor(() => text('Service notes and checklist saved.'), 'service work saves through original workflow')
    assert.equal(await evaluate(`document.querySelector('textarea[name="mechanicNotes"]').value`), 'Inspection recorded.')
    await waitFor(() => evaluate(`Array.from(document.querySelectorAll('.detail-footer button')).some(button => button.textContent === 'Mark for Final Inspection' && !button.disabled)`), 'saved progress allows advancement')
    await screenshot('detail-mechanic-job-work-desktop')
    await click('Close')
    mechanicJob = assignedJob
    await waitFor(() => evaluate(`Boolean(document.querySelector('.MuiDrawer-paper'))`), 'desktop mechanic navigation restored')
    await assertSharedScenery()
    assert.equal(await evaluate(`Boolean(document.querySelector('header [aria-label^="Switch to"]'))`), false)
    await evaluate(`document.querySelector('[aria-label="Juan Santos, Mechanic. Open profile menu"]').click()`)
    await waitFor(() => evaluate(`Boolean(document.querySelector('[role="menu"]'))`), 'mechanic menu')
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('[role="menuitem"]')).some(item => item.textContent.includes('Help & Support'))`), false)
    await navigate('/mechanic/profile'); await waitFor(() => text('Profile Information'), 'mechanic profile')
    await navigate('/mechanic/account-settings'); await waitFor(() => text('Account Settings'), 'mechanic settings')
    await evaluate(`Array.from(document.querySelectorAll('[role="tab"]')).find(item => item.textContent === 'Appearance').click()`)
    await evaluate(`document.querySelector('input[value="dark"]').click()`)
    assert.equal(await evaluate('document.documentElement.dataset.colorMode'), 'dark')
    await evaluate(`document.querySelector('input[value="light"]').click()`)
    assert.equal(await evaluate(`document.querySelector('input[value="light"]').checked`), true)
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
    assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true, 'mobile settings must not overflow')
    await send('Emulation.clearDeviceMetricsOverride')
    await navigate('/admin/account-settings'); await waitFor(() => evaluate(`location.pathname === '/mechanic/dashboard'`), 'mechanic role guard')
    await waitFor(() => evaluate(`Boolean(document.querySelector('[aria-label="Juan Santos, Mechanic. Open profile menu"]'))`), 'mechanic guard rendered')
    await evaluate(`document.querySelector('[aria-label="Juan Santos, Mechanic. Open profile menu"]').click()`)
    await evaluate(`Array.from(document.querySelectorAll('[role="menuitem"]')).find(item => item.textContent.trim() === 'Sign out').click()`)
    assert.equal(await text('Are you sure you want to sign out of your account?'), true)
    await click('Cancel'); await noDialog(); assert.equal(await evaluate(`location.pathname === '/mechanic/dashboard'`), true)
    const rolePages = {
      admin: ['dashboard', 'staff', 'customers', 'bookings', 'reports', 'mechanics', 'services', 'service-bays', 'schedules', 'job-orders', 'reminders', 'profile'],
      client: ['dashboard', 'vehicles', 'book-service', 'bookings', 'reminders', 'notifications', 'profile'],
      staff: ['dashboard', 'bookings', 'walk-in', 'customers', 'job-orders', 'transactions', 'profile'],
      mechanic: ['dashboard', 'jobs', 'active-job', 'profile'],
    }
    recordLayoutFixtures = true
    for (const [role, pages] of Object.entries(rolePages)) {
      user.role = role
      for (const total of [0, 1, 5, 6, 12, 162]) {
        recordFixtureCount = total
        await send('Page.navigate', { url: `${origin}/${role}/${pages[1]}` })
        await waitFor(() => evaluate(`Boolean(document.querySelector('#workspace-content h1')) && location.pathname === '/${role}/${pages[1]}'`), `${role} pagination page mounted`)
        await waitFor(() => evaluate(`document.querySelectorAll('.record-list-rows > .record-card').length === ${Math.min(5, total)} && !document.querySelector('[role="status"]')`), `${role} ${total} records loaded`)
        assert.equal(await evaluate(`Boolean(document.querySelector('.list-pagination-pages'))`), total > 5, `${role}: navigation depends on the total, not the visible rows`)
        assert.equal(await evaluate(`document.querySelector('.list-pagination-summary, .list-pagination-size, .list-pagination select') === null`), true, 'no visible record summary or page-size selector')
        assert.equal(await evaluate(`Boolean(document.querySelector('.list-pagination'))`), total > 5, 'single-page lists hide the entire footer')
        if (total > 5) {
          assert.equal(await evaluate(`document.querySelector('[aria-label="Go to previous page"]').disabled`), true, 'previous chevron is disabled on the first page')
          assert.equal(await evaluate(`Boolean(document.querySelector('.list-pagination-ellipsis'))`), total === 162, 'large lists retain compact ellipsis')
          assert.equal(await evaluate(`(() => {
            const nav = document.querySelector('.list-pagination').getBoundingClientRect();
            const pages = document.querySelector('.list-pagination-pages').getBoundingClientRect();
            return Math.abs((nav.left + nav.right) / 2 - (pages.left + pages.right) / 2) < 1;
          })()`), true, 'pagination is centered within the full footer')
          const lastPage = Math.ceil(total / 5)
          await evaluate(`document.querySelector('[aria-label="Go to page ${lastPage}"]').click()`)
          await waitFor(() => evaluate(`document.querySelector('.list-pagination [aria-current="page"]')?.getAttribute('aria-label') === 'Go to page ${lastPage}' && document.querySelectorAll('.record-list-rows > .record-card').length === ${total - (lastPage - 1) * 5}`), `${role} partial last page`)
          assert.equal(await evaluate(`document.querySelector('[aria-label="Go to previous page"]')?.disabled`), false, 'partial last page retains navigation')
          assert.equal(await evaluate(`getComputedStyle(document.querySelector('.list-pagination .MuiPaginationItem-page')).borderRadius`), '8px')
          assert.equal(await evaluate(`document.querySelector('[aria-label="Go to next page"]').disabled`), true, 'next chevron is disabled on the last page')
        }
      }
      recordFixtureCount = 6
      await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false })
      await send('Page.navigate', { url: `${origin}/${role}/account-settings` })
      await waitFor(() => evaluate(`Boolean(document.querySelector('[role="tab"]')) && location.pathname === '/${role}/account-settings'`), `${role} security settings`)
      await evaluate(`Array.from(document.querySelectorAll('[role="tab"]')).find(item => item.textContent === 'Appearance').click()`)
      await evaluate(`document.querySelector('input[value="${role === 'admin' || role === 'mechanic' ? 'dark' : 'light'}"]').click()`)
      for (const width of [1440, 820, 390]) {
        await send('Emulation.setDeviceMetricsOverride', { width, height: 1100, deviceScaleFactor: 1, mobile: width === 390 })
        let profilePanel
        for (const tab of ['Profile', 'Security', 'Notifications', 'Appearance']) {
          await evaluate(`Array.from(document.querySelectorAll('[role="tab"]')).find(item => item.textContent === '${tab}').click()`)
          const settingsPanel = await evaluate(`(() => {
            const panel = document.querySelector('.settings-panel');
            const rect = panel.getBoundingClientRect(), style = getComputedStyle(panel);
            const content = document.querySelector('[role="tabpanel"]').getBoundingClientRect();
            return { left: rect.left, right: rect.right, width: rect.width, padding: style.padding,
              border: style.border, radius: style.borderRadius, background: style.backgroundColor,
              contentLeft: content.left, contentRight: content.right };
          })()`)
          if (tab === 'Profile') profilePanel = settingsPanel
          else assert.deepEqual(settingsPanel, profilePanel, `${role}/${tab} matches Profile width, alignment and treatment at ${width}px`)
          assert.equal(await evaluate(`document.documentElement.scrollWidth <= innerWidth`), true, `${role}/${tab} has no horizontal overflow at ${width}px`)
        }
      }
      await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false })
      await evaluate(`Array.from(document.querySelectorAll('[role="tab"]')).find(item => item.textContent === 'Security').click()`)
      assert.equal(await evaluate(`document.querySelectorAll('.security-card input').length`), 1, 'only current password appears first')
      assert.equal(await evaluate(`document.querySelector('.security-card').getBoundingClientRect().width === document.querySelector('[role="tabpanel"]').getBoundingClientRect().width`), true, 'Security fills the shared Settings content width')
      assert.equal(await evaluate(`document.querySelector('.security-form').getBoundingClientRect().width`), 680, 'only the inner password form stays compact')
      assert.equal(await evaluate(`document.querySelector('.security-card').getBoundingClientRect().left === document.querySelector('[role="tabpanel"]').getBoundingClientRect().left`), true, 'left aligned in Settings')
      await screenshot(`security-${role}-password-desktop`)
      await input('currentPassword', 'wrong'); await click('Send verification code')
      await waitFor(() => text('Current password is incorrect.'), 'current password inline error')
      assert.equal(await evaluate(`Boolean(document.querySelector('.security-card .MuiFormHelperText-root.Mui-error'))`), true)
      await input('currentPassword', 'Current secure journey 42!'); await click('Send verification code', true)
      await waitFor(() => text('Verification code sent'), 'OTP step')
      assert.equal(await evaluate(`document.querySelector('input[name="newPassword"]') === null`), true, 'new password stays hidden before OTP verification')
      assert.equal(await evaluate(`document.querySelectorAll('.security-card .otp-inputs input').length`), 6)
      await click('Verify code'); assert.equal(await text('Enter the 6-digit verification code.'), true)
      await evaluate(`{ const el = document.querySelector('.security-card [aria-label="Digit 1"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '999999'); el.dispatchEvent(new Event('input', { bubbles: true })); }`)
      await click('Verify code'); await waitFor(() => text('Invalid verification code.'), 'invalid OTP inline error')
      await waitFor(() => evaluate(`Array.from(document.querySelectorAll('button')).some(button => button.textContent === 'Resend code')`), 'resend available after countdown')
      await click('Resend code')
      await waitFor(() => evaluate(`Array.from(document.querySelectorAll('.otp-inputs input')).every(input => input.value === '')`), 'resend clears previous digits after delivery')
      await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 1000, deviceScaleFactor: 1, mobile: true })
      assert.equal(await evaluate(`document.documentElement.scrollWidth <= innerWidth`), true, 'OTP fits mobile workspace')
      await screenshot(`security-${role}-otp-mobile`)
      await evaluate(`{ const el = document.querySelector('.security-card [aria-label="Digit 1"]'); const paste = new Event('paste', { bubbles: true, cancelable: true }); Object.defineProperty(paste, 'clipboardData', { value: { getData: () => '01 23x45' } }); el.dispatchEvent(paste); }`)
      assert.equal(await evaluate(`Array.from(document.querySelectorAll('.otp-inputs input')).map(input => input.value).join('')`), '012345', 'pasted OTP keeps leading zero and strips non-digits')
      await click('Verify code'); await waitFor(() => text('Email verified'), 'new password step')
      assert.equal(await evaluate(`document.querySelector('.otp-inputs') === null && document.querySelector('input[name="currentPassword"]') === null`), true, 'verified step removes old password and OTP inputs')
      await input('newPassword', 'short'); await input('confirmPassword', 'short'); await click('Change password')
      assert.equal(await text('Password does not meet the requirements.'), true)
      await input('newPassword', 'New secure journey 42!'); await input('confirmPassword', 'different')
      assert.equal(await evaluate(`document.querySelectorAll('.password-requirements [data-met="true"]').length`), 5, 'requirements update while typing')
      assert.equal(await text('Password strength: Strong'), true)
      await click('Change password'); assert.equal(await text('Passwords do not match.'), true)
      await input('confirmPassword', 'New secure journey 42!')
      assert.equal(await evaluate(`document.documentElement.scrollWidth <= innerWidth`), true, 'password step fits mobile workspace')
      await screenshot(`security-${role}-new-password-mobile`)
      await click('Change password', true); await waitFor(() => text('Password updated'), 'compact success state')
      assert.equal(await evaluate(`document.querySelectorAll('.security-card input').length`), 0, 'success clears sensitive inputs')
      if (role === 'client') {
        await waitFor(() => evaluate(`Boolean(document.querySelector('input[name="currentPassword"]'))`), 'success resets workflow')
        assert.equal(await evaluate(`document.querySelector('input[name="currentPassword"]').value`), '')
      }
      for (const width of [1920, 820, 390]) {
        await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width === 390 })
        for (const page of width === 1920 ? pages : ['dashboard', pages[1], 'profile']) {
          await send('Page.navigate', { url: `${origin}/${role}/${page}` })
          await waitFor(() => evaluate(`Boolean(document.querySelector('#workspace-content h1')) && location.pathname === '/${role}/${page}'`), `${role}/${page} workspace mounted`)
          await delay(100)
          assert.equal(await evaluate(`(() => {
            const main = document.querySelector('#workspace-content');
            const rect = main.getBoundingClientRect();
            const style = getComputedStyle(main);
            const padding = innerWidth >= 1200 ? 32 : innerWidth >= 600 ? 24 : 16;
            const sidebar = innerWidth >= 1200 ? 240 : 0;
            const title = main.querySelector('h1').getBoundingClientRect();
            const cards = Array.from(main.children).filter(el => el.classList.contains('MuiPaper-root'));
            return style.maxWidth === 'none' && parseFloat(style.paddingLeft) === padding
              && parseFloat(style.paddingRight) === padding && Math.abs(rect.left - sidebar) < 2
              && Math.abs(rect.right - document.documentElement.clientWidth) < 2
              && Math.abs(title.left - rect.left - padding) < 2
              && cards.every(card => Math.abs(card.getBoundingClientRect().left - rect.left - padding) < 2
                && Math.abs(card.getBoundingClientRect().right - rect.right + padding) < 2)
              && document.documentElement.scrollWidth <= innerWidth;
          })()`), true, `${role}/${page} uses the shared content grid at ${width}px`)
          const recordPages = ['staff', 'customers', 'bookings', 'mechanics', 'services', 'service-bays', 'schedules', 'job-orders', 'reminders', 'vehicles', 'transactions', 'jobs', 'reports']
          if (recordPages.includes(page)) {
            await waitFor(() => evaluate(`document.querySelectorAll('#workspace-content .record-card').length > 0`), `${role}/${page} records loaded`)
            assert.equal(await evaluate(`(() => {
              const rows = Array.from(document.querySelectorAll('#workspace-content .record-card'));
              return rows.every(row => {
                const rect = row.getBoundingClientRect();
                const style = getComputedStyle(row);
                const list = row.parentElement.getBoundingClientRect();
                const avatar = row.querySelector('.record-entity-avatar').getBoundingClientRect();
                const person = row.classList.contains('person-record-card');
                const horizontal = style.gridTemplateColumns.split(' ').length === 3;
                const metadata = row.querySelector('.person-record-metadata');
                return (person ? rect.height >= 108 && (!horizontal || rect.height <= 180) : horizontal ? Math.abs(rect.height - 108) < 2 : rect.height >= 108)
                  && Math.abs(rect.width - list.width) < 2 && style.borderRadius === '16px'
                  && style.paddingTop === '20px' && !row.querySelector('.list-pagination')
                  && avatar.width === (person ? 42 : 48) && avatar.height === (person ? 42 : 48) && avatar.left >= rect.left && avatar.right <= rect.right
                  && (!person || getComputedStyle(metadata).rowGap === '4px' && getComputedStyle(metadata).marginTop === '8px'
                    && row.querySelector('.person-record-email').getBoundingClientRect().bottom < row.querySelector('.person-record-phone').getBoundingClientRect().top
                    && row.querySelector('.record-card-copy').getBoundingClientRect().bottom <= rect.bottom - 20)
                  && !row.querySelector('.record-card-actions .MuiChip-root')
                  && Array.from(row.querySelectorAll('.record-card-statuses .status-badge')).every(badge => {
                    const badgeStyle = getComputedStyle(badge);
                    return badge.getBoundingClientRect().height === 28 && badgeStyle.borderRadius === '999px'
                      && !badge.matches('button, a, [role="button"]') && badgeStyle.cursor === 'default';
                  })
                  && Array.from(row.querySelectorAll('button')).every(button => {
                    const action = button.getBoundingClientRect();
                    return action.height === 36 && getComputedStyle(button).borderRadius === '8px'
                      && action.left >= rect.left && action.right <= rect.right && action.top >= rect.top && action.bottom <= rect.bottom;
                  });
              }) && document.documentElement.scrollWidth <= innerWidth;
            })()`), true, `${role}/${page} has consistent record sizing, truncation and visible actions at ${width}px`)
            if (['staff', 'mechanics', 'services', 'service-bays', 'schedules', 'vehicles'].includes(page)) {
              assert.equal(await evaluate(`Array.from(document.querySelectorAll('.record-card button')).some(button => ['Edit', 'Archive', 'Restore', 'Disable', 'Enable', 'Activate', 'Deactivate'].includes(button.textContent.trim()))`), false, 'secondary actions live only in overflow menus')
              await evaluate(`document.querySelector('.record-card .row-more-actions').click()`)
              await waitFor(() => evaluate(`Boolean(document.querySelector('[role="menu"]'))`), 'row overflow menu opens')
              assert.equal(await evaluate(`Boolean(document.querySelector('[role="menu"] [role="menuitem"]'))`), true)
              await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' })
              await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' })
              await waitFor(() => evaluate(`document.querySelector('[role="menu"]') === null`), 'Escape closes row overflow menu')
              if (width === 1920 && page === 'staff') {
                await evaluate(`document.querySelector('.record-card .row-more-actions').click()`)
                await waitFor(() => evaluate(`Boolean(document.querySelector('[role="menuitem"]'))`), 'Staff actions')
                await evaluate(`Array.from(document.querySelectorAll('[role="menuitem"]')).find(item => item.textContent === 'Disable').click()`)
                await waitFor(() => text('Are you sure you want to disable this staff account?'), 'Disable confirmation')
                const before = calls.filter(call => call.path.endsWith('/status') && call.method === 'PATCH').length
                await click('No'); await noDialog()
                assert.equal(calls.filter(call => call.path.endsWith('/status') && call.method === 'PATCH').length, before, 'cancelled Disable never mutates the account')
              }
              if (width === 1920 && page === 'vehicles') {
                await evaluate(`document.querySelector('.record-card .row-more-actions').click()`)
                await waitFor(() => evaluate(`Boolean(document.querySelector('[role="menuitem"]'))`), 'Vehicle actions')
                await evaluate(`Array.from(document.querySelectorAll('[role="menuitem"]')).find(item => item.textContent === 'Archive').click()`)
                await waitFor(() => text('Are you sure you want to remove this vehicle?'), 'existing Archive confirmation')
                await click('No'); await noDialog()
              }
            }
            if (page !== 'reports') {
              assert.equal(await evaluate(`document.querySelector('.record-list select') === null`), true, 'page size remains internal across roles')
              assert.equal(await evaluate(`document.querySelectorAll('.record-list-rows > .record-card').length`), 5)
              if (width === 1920) {
                const endpoints = { staff: '/api/people/staff', customers: '/api/people/customers', bookings: '/api/bookings',
                  vehicles: '/api/vehicles', jobs: '/api/job-orders', 'job-orders': '/api/job-orders', transactions: '/api/job-orders', reminders: '/api/maintenance-reminders' }
                const listRequests = () => calls.filter(call => call.method === 'GET' && call.path === endpoints[page]).length
                const pagerRequests = listRequests()
                const firstRecordHeight = await evaluate(`document.querySelector('.record-card').getBoundingClientRect().height`)
                await evaluate(`document.querySelector('.record-list [aria-label="Go to page 2"]').click()`)
                await waitFor(() => evaluate(`document.querySelectorAll('.record-list-rows > .record-card').length === 1 && document.querySelector('.record-list [aria-current="page"]')?.getAttribute('aria-label') === 'Go to page 2'`), `${role}/${page} partial last page`)
                assert.equal(await evaluate(`document.querySelector('.record-card').getBoundingClientRect().height`), firstRecordHeight, 'last record never stretches')
                if (role === 'client' || role === 'mechanic' || page === 'staff' || page === 'customers' || page === 'transactions') assert.equal(listRequests(), pagerRequests, 'local paging does not refetch the record endpoint')
                await evaluate(`document.querySelector('.record-list [aria-label="Go to page 1"]').click()`)
                await waitFor(() => evaluate(`document.querySelectorAll('.record-list-rows > .record-card').length === 5`), 'first page restored')
              }
              if (page === pages[1]) await screenshot(`record-list-${role}-${width}`)
              if (['staff', 'customers', 'bookings', 'mechanics', 'job-orders', 'reminders', 'vehicles', 'transactions', 'jobs'].includes(page)) {
                await evaluate(`Array.from(document.querySelector('.record-card').querySelectorAll('button')).find(button => ['Details', 'View / edit details'].includes(button.textContent.trim())).click()`)
                await waitFor(() => evaluate(`Boolean(document.querySelector('.record-detail-dialog .detail-section'))`), `${role}/${page} structured details`)
                assert.equal(await evaluate(`(() => {
                  const dialog = document.querySelector('.record-detail-dialog [role="dialog"]');
                  const rect = dialog.getBoundingClientRect();
                  const header = dialog.querySelector('.detail-header');
                  const footer = dialog.querySelector('.detail-footer');
                  const headerRect = header.getBoundingClientRect();
                  const statusRect = header.lastElementChild.getBoundingClientRect();
                  return rect.width <= 802 && rect.left >= 0 && rect.right <= innerWidth
                    && header && footer && dialog.scrollWidth <= dialog.clientWidth
                    && (innerWidth < 600 || Math.abs(headerRect.right - statusRect.right) < 2)
                    && Array.from(dialog.querySelectorAll('.detail-section')).every(section => section.scrollWidth <= section.clientWidth)
                    && Array.from(dialog.querySelectorAll('.detail-total')).every(total => Math.abs(total.getBoundingClientRect().right - total.lastElementChild.getBoundingClientRect().right) < 2)
                    && Array.from(footer.querySelectorAll('button')).some(button => button.textContent === 'Close')
                    && Array.from(dialog.querySelectorAll('img')).every(image => getComputedStyle(image).objectFit === 'contain' && image.getBoundingClientRect().height <= 64);
                })()`), true, `${role}/${page} compact sections, vehicle thumbnail, viewport-safe dialog and footer at ${width}px`)
                if (page === 'job-orders' || page === 'jobs') {
                  await evaluate(`document.querySelector('.record-detail-dialog .MuiDialogContent-root').scrollTop = 99999`)
                  assert.equal(await evaluate(`document.querySelector('.record-detail-dialog .detail-footer').getBoundingClientRect().bottom <= innerHeight`), true, 'detail footer remains visible when content scrolls')
                  await evaluate(`document.querySelector('.record-detail-dialog .MuiDialogContent-root').scrollTop = 0`)
                }
                if (page === pages[1] || ['customers', 'mechanics', 'reminders', 'vehicles', 'transactions'].includes(page)) await screenshot(`detail-${role}-${page}-${width}`)
                await click('Close')
                await waitFor(() => evaluate(`document.querySelector('.record-detail-dialog') === null`), 'detail dialog closes')
              }
            }
          }
          if (page === 'dashboard' && width === 1920) await screenshot(`workspace-${role}-desktop`)
          if (page === 'dashboard' && width !== 820) {
            notificationItems = Array.from({ length: 12 }, (_, index) => ({
              _id: String(index + 1).padStart(24, '0'), title: `${role} service update ${index}`,
              message: 'Your assigned service visit has an update.', type: 'job_order', isRead: false,
              createdAt: new Date(Date.now() - index * 60000).toISOString(),
            }))
            await evaluate(`window.dispatchEvent(new Event('toyota-autocare:notifications-updated'))`)
            await waitFor(() => evaluate(`Boolean(document.querySelector('[aria-label="View notifications, 12 unread"]'))`), `${role} unread bell`)
            const previous = await evaluate('location.pathname')
            await evaluate(`document.querySelector('[aria-label="View notifications, 12 unread"]').click()`)
            await waitFor(() => evaluate(`Boolean(document.querySelector('button[aria-label="${role} service update 0, unread"]'))`), `${role} notification popover loaded`)
            assert.equal(await evaluate('location.pathname'), previous)
            assert.equal(await evaluate(`(() => {
              const panel = document.querySelector('[role="dialog"]');
              const rect = panel.getBoundingClientRect();
              const list = panel.querySelector('[aria-busy]');
              return rect.left >= 16 && rect.right <= innerWidth - 16 && rect.height <= 540
                && panel.querySelectorAll('button[aria-label*="service update"]').length === 10
                && list.scrollHeight > list.clientHeight;
            })()`), true, `${role} panel stays in the viewport and scrolls its recent list`)
            if (width === 390) await screenshot(`notifications-${role}-mobile`)
            await evaluate(`document.querySelector('button[aria-label="${role} service update 0, unread"]').click()`)
            const destination = role === 'client' ? '/client/bookings' : role === 'mechanic' ? '/mechanic/jobs' : `/${role}/job-orders`
            await waitFor(() => evaluate(`location.pathname === '${destination}' && !document.querySelector('[role="dialog"]')`), `${role} notification destination`)
            await waitFor(() => evaluate(`Boolean(document.querySelector('[aria-label="View notifications, 11 unread"]'))`), `${role} read badge`)
            await evaluate(`document.querySelector('[aria-label="View notifications, 11 unread"]').click()`)
            await click('View all notifications')
            await waitFor(() => evaluate(`location.pathname === '/${role}/notifications' && Boolean(document.querySelector('#workspace-content h1'))`), `${role} full notification history`)
            await evaluate(`document.querySelector('[aria-label="View notifications, 11 unread"]').click()`)
            await waitFor(() => evaluate(`Boolean(document.querySelector('button[aria-label="${role} service update 1, unread"]'))`), `${role} history bell loaded`)
            await evaluate(`Array.from(document.querySelectorAll('[role="dialog"] button')).find(button => button.textContent === 'Mark all as read').click()`)
            await waitFor(() => evaluate(`Array.from(document.querySelectorAll('#workspace-content .MuiChip-label')).some(label => label.textContent === '0 unread')`), `${role} history updates after reading from bell`)
            await evaluate(`document.querySelector('[aria-label="View notifications"]').click()`)
            await waitFor(() => evaluate(`!document.querySelector('[role="dialog"]')`), 'history popover closed')
            notificationItems = []
            await evaluate(`window.dispatchEvent(new Event('toyota-autocare:notifications-updated'))`)
            await waitFor(() => evaluate(`Boolean(document.querySelector('[aria-label="View notifications"]'))`), `${role} empty bell`)
            await evaluate(`document.querySelector('[aria-label="View notifications"]').click()`)
            await waitFor(() => text("You're all caught up."), `${role} compact empty state`)
            if (role === 'mechanic' && width === 390) await screenshot('notifications-empty-mobile')
            await evaluate(`document.querySelector('[aria-label="View notifications"]').click()`)
            await waitFor(() => evaluate(`!document.querySelector('[role="dialog"]')`), 'empty popover closed')
          }
        }
      }
    }
    await send('Emulation.clearDeviceMetricsOverride')
    assert.deepEqual(failures, [])
  } catch (error) { console.error(error); throw error
  } finally {
    socket?.close(); chrome?.kill(); vite.httpServer?.closeAllConnections(); await vite.close()
    // The generated profile is the only directory this test removes.
    if (resolve(profileDir).startsWith(resolve(tmpdir()) + sep) && resolve(profileDir).includes('autocare-client-test-')) {
      await delay(300)
      try { rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }) } catch { /* Chrome may still hold a temporary profile file. */ }
    }
  }
})
