import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { createServer } from 'vite'

const executable = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync)
test('browser: required consent, direct login, themes and confirmed actions preserve existing flows', { skip: !executable, timeout: 90000 }, async () => {
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
    let bookingAvailabilityDate = ''
    let vehicles = [], plateConflict = true, walkInEmailConflict = true
    socket.onmessage = event => {
      const data = JSON.parse(event.data)
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
            if (url.pathname === '/api/auth/login') body = { accessToken: 'test-only-token', user }
            if (url.pathname === '/api/auth/change-temporary-password') { user.mustChangePassword = false; body = { accessToken: 'changed-test-token', user } }
            if (url.pathname === '/api/bookings/walk-in/options') body = { services: [service], schedules: [slot] }
            if (url.pathname === '/api/bookings/walk-in/new-client') {
              if (walkInEmailConflict) { status = 409; body = { errors: { email: 'This email already has an account. Choose Existing Client instead.' } }; walkInEmailConflict = false }
              else body = { item: { _id: '555555555555555555555555' }, emailSent: false, message: 'Booking created, but account email could not be sent. Do not create another booking.' }
            }
            if (url.pathname === '/api/auth/login' && JSON.parse(request.postData || '{}').password === 'wrong') { status = 401; body = { message: 'Invalid email or password.' } }
            if (url.pathname === '/api/vehicles' && request.method === 'GET') body = { items: vehicles }
            if (url.pathname === '/api/vehicles' && request.method === 'POST') {
              if (plateConflict) { status = 409; body = { message: 'Plate number already exists.', errors: { plateNumber: 'Plate number already exists.' } }; plateConflict = false }
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
            if (request.method === 'POST') await delay(150)
          }
          await send('Fetch.fulfillRequest', { requestId, responseCode: status, responseHeaders: headers, body: Buffer.from(JSON.stringify(body)).toString('base64') })
        })().catch(error => { if (!error.message.includes('Invalid InterceptionId')) failures.push(error.message) }) // Navigation can cancel an intercepted request.
      }
    }
    await send('Page.enable')
    await send('Fetch.enable', { patterns: [{ urlPattern: 'http://127.0.0.1:59998/*' }] })
    async function evaluate(expression) {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
      return result.result.value
    }
    const text = value => evaluate(`document.body.innerText.includes(${JSON.stringify(value)})`)
    const count = path => calls.filter(call => call.method === 'POST' && call.path === path).length
    async function navigate(path) { await send('Page.navigate', { url: origin + path }); await waitFor(() => text('AutoCare'), path) }
    async function click(label, twice = false) {
      await waitFor(() => evaluate(`Array.from(document.querySelectorAll('button')).some(b => b.textContent.trim() === ${JSON.stringify(label)} && !b.disabled)`), `button ${label}`)
      await evaluate(`{ const b = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === ${JSON.stringify(label)} && !b.disabled); b.click(); ${twice ? 'b.click();' : ''} }`)
      await delay(100)
    }
    async function input(name, value) {
      await evaluate(`{ const el = document.querySelector('input[name="${name}"]'); if (!el) throw new Error('Missing ${name}'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); }`)
      await delay(75)
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
    await waitFor(() => text('Dark'), 'theme control')
    await typeText('email', 'draft@example.com')
    await screenshot('login-light')
    await click('Dark')
    assert.equal(await evaluate('document.documentElement.dataset.colorMode'), 'dark')
    assert.equal(await evaluate(`document.querySelector('input[name="email"]').value`), 'draft@example.com')
    await screenshot('login-dark')
    await navigate('/login'); await waitFor(() => text('Light'), 'persisted dark mode')
    assert.equal(await evaluate('document.documentElement.dataset.colorMode'), 'dark')
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
    await screenshot('login-mobile-dark')
    assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true, 'mobile login must not overflow')
    await click('Light')
    await send('Emulation.clearDeviceMetricsOverride')

    await navigate('/register')
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
    await waitFor(() => text('Sign out'), 'role redirect'); await noDialog(); assert.equal(count('/api/auth/login'), 2)

    await navigate('/client/vehicles'); await click('Add vehicle'); await click('Save'); await noDialog()
    assert.equal(await text('Model is required.'), true)
    await input('model', 'Vios'); await input('year', '2025'); await input('plateNumber', 'ABC1234')
    await input('currentMileage', '')
    await click('Save'); await noDialog(); assert.equal(await text('Current mileage is required.'), true)
    await input('currentMileage', '1200')
    await click('Save'); assert.equal(await text('Are you sure you want to add this vehicle?'), true)
    await click('No'); await noDialog(); assert.equal(await evaluate(`document.querySelector('input[name="model"]').value`), 'Vios')
    await click('Save'); await click('Yes', true); await noDialog()
    assert.equal(count('/api/vehicles'), 1); assert.equal(await text('Plate number already exists.'), true)
    assert.equal(await evaluate(`document.querySelector('input[name="model"]').value`), 'Vios')
    await input('plateNumber', 'ABC1235'); assert.equal(await text('Plate number already exists.'), false)
    await click('Save'); await click('Yes'); await noDialog(); await waitFor(() => text('Vehicle added successfully.'), 'vehicle saved')

    await navigate('/client/dashboard'); await waitFor(() => text('My vehicles'), 'dashboard')
    await screenshot('dashboard-light'); await click('Dark'); await screenshot('dashboard-dark')
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
    await screenshot('dashboard-mobile-dark')
    assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true, 'mobile workspace must not overflow')
    await click('Light'); await send('Emulation.clearDeviceMetricsOverride')

    await navigate('/client/book-service')
    await waitFor(() => text('ABC1234'), 'booking vehicles')
    await evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('ABC1234')).click()`)
    await click('Continue'); await evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Oil change')).click()`)
    await click('Continue')
    await waitFor(() => Boolean(bookingAvailabilityDate) && text('Available times'), 'calendar availability')
    await evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.getAttribute('aria-label') === ${JSON.stringify(`${bookingAvailabilityDate}, available`)}).click()`)
    await evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('10:00')).click()`)
    await click('Continue'); await click('Submit booking')
    assert.equal(await text('Are you sure you want to confirm this service booking?'), true)
    await click('No'); await noDialog(); assert.equal(count('/api/bookings'), 0); assert.equal(await text('Review your booking'), true)
    await click('Submit booking'); await click('Yes', true); await noDialog(); await waitFor(() => text('Booking received'), 'booking completed'); assert.equal(count('/api/bookings'), 1)
    await click('Sign out'); assert.equal(await text('Are you sure you want to log out?'), true)
    await click('No'); await noDialog(); assert.equal(await text('Sign out'), true)
    await click('Sign out'); await click('Yes'); await noDialog(); await waitFor(() => text('Welcome back.'), 'logout redirect')

    user.role = 'admin'
    await input('email', user.email); await input('password', 'A secure passphrase 42!')
    await click('Sign in'); await noDialog(); await waitFor(() => text('Sign out'), 'admin redirect')
    await navigate('/admin/schedules'); await click('Edit')
    await input('date', ''); await input('maximumCapacity', '1'); await click('Save changes'); await noDialog()
    assert.equal(await text('Date is required.'), true)
    assert.equal(await text('Capacity cannot be lower than the current booked count.'), true)
    await input('date', slot.date); await input('maximumCapacity', '4')
    assert.equal(await text('Capacity cannot be lower than the current booked count.'), false)
    const scheduleWrites = () => calls.filter(call => call.method === 'PATCH' && call.path === `/api/schedules/${slot._id}`).length
    await click('Save changes'); await noDialog()
    await waitFor(() => text('Schedule updated.'), 'schedule saved'); assert.equal(scheduleWrites(), 1)
    await navigate('/admin/walk-in'); await click('New Walk-In Client'); await click('Continue')
    assert.equal(await text('First name is required.'), true)
    await input('firstName', 'Maria'); await input('lastName', 'Santos'); await input('email', 'maria@example.invalid')
    await input('phone', '+63 917 123 4567letters999')
    assert.equal(await evaluate(`document.querySelector('input[name="phone"]').value`), '+639171234567')
    await click('Continue')
    for (const [name, value] of Object.entries({ make: 'Toyota', model: 'Vios', year: '2024', plateNumber: 'ABC9999' })) await input(name, value)
    async function select(name, label) {
      await evaluate(`document.querySelector('input[name="${name}"]').parentElement.querySelector('[role="combobox"]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))`)
      await waitFor(() => evaluate(`Array.from(document.querySelectorAll('[role="option"]')).some(el => el.textContent.includes(${JSON.stringify(label)}))`), `select ${name}`)
      await evaluate(`Array.from(document.querySelectorAll('[role="option"]')).find(el => el.textContent.includes(${JSON.stringify(label)})).click()`)
      await delay(100)
    }
    await select('transmission', 'Automatic'); await click('Continue')
    await evaluate(`document.querySelector('input[type="checkbox"]').click()`)
    await waitFor(() => Boolean(bookingAvailabilityDate) && text('Available times'), 'Walk-In calendar availability')
    await evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.getAttribute('aria-label') === ${JSON.stringify(`${bookingAvailabilityDate}, available`)}).click()`)
    await evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('10:00')).click()`)
    await click('Continue'); await click('Create client and booking')
    await click('No'); await noDialog(); assert.equal(count('/api/bookings/walk-in/new-client'), 0)
    await click('Create client and booking'); await click('Yes', true); await noDialog()
    await waitFor(() => text('This email already has an account. Choose Existing Client instead.'), 'duplicate email')
    assert.equal(await evaluate(`document.querySelector('input[name="firstName"]').value`), 'Maria')
    await input('email', 'maria2@example.invalid')
    assert.equal(await text('This email already has an account. Choose Existing Client instead.'), false)
    await click('Continue'); await click('Continue'); await click('Continue'); await click('Create client and booking'); await click('Yes', true)
    await noDialog(); await waitFor(() => text('Do not create another booking.'), 'email warning after commit')
    assert.equal(count('/api/bookings/walk-in/new-client'), 2)

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
    assert.equal(count('/api/auth/change-temporary-password'), 1)
    assert.equal(await evaluate(`sessionStorage.getItem('toyota-autocare.access')`), 'changed-test-token')
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
