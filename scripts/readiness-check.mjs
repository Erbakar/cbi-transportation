// Local, read-only acceptance checks. Never creates shipments, documents or invoices.
import fs from 'node:fs';
const base = new URL(process.env.READINESS_URL || 'http://localhost:5174');
if (base.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(base.hostname) || base.username || base.password) throw Error('Only a local preview may be checked.');
const credentials = fs.readFileSync('.private/ilk-giris.txt', 'utf8');
const username = credentials.match(/Kullanıcı adı:\s*(.+)/)?.[1].trim();
const password = credentials.match(/Şifre:\s*(.+)/)?.[1].trim();
if (!username || !password) throw Error('Local login credentials are unavailable.');
let cookie = '', failures = 0;
const results = [];
function report(check, ok, detail) {results.push({check, ok, ...detail}); if (!ok) failures++;}
async function call(path, method = 'GET', body) {
    return fetch(new URL(path, base), {method, redirect: 'error', signal: AbortSignal.timeout(60000), headers: {Origin: base.origin, ...(cookie ? {Cookie: cookie} : {}), ...(body ? {'Content-Type': 'application/json'} : {})}, ...(body ? {body: JSON.stringify(body)} : {})});
}
async function read(path, check) {
    try {
        const response = await call(path);
        const data = await response.json();
        report(check, response.ok, {status: response.status});
        return response.ok ? data : null;
    } catch {report(check, false, {message: 'Connection or response could not be verified.'}); return null;}
}
try {
    report('Unauthenticated records are protected', (await call('/api/records')).status === 401);
    const login = await call('/api/session', 'POST', {username, password});
    if (!login.ok) throw Error('Login could not be verified.');
    cookie = login.headers.getSetCookie().map(v => v.split(';')[0]).join('; ');
    report('Local login', !!cookie, {status: login.status});
    for (const path of ['/api/records', '/api/home', '/api/dashboard', '/api/operations']) await read(path, path);
    const bookings = await read('/api/bookings', 'Booking list');
    const id = process.env.READINESS_BOOKING_ID || bookings?.bookings?.[0]?.id;
    if (id && /^[a-f0-9-]{36}$/i.test(id)) {
        for (const suffix of ['documents', 'phase2', 'schedule', 'field', 'vgm', 'control', 'lifecycle', 'prealert', 'finance', 'operation-archive']) {
            const data = await read('/api/bookings/' + id + '/' + suffix, 'Booking / ' + suffix);
            if (suffix === 'operation-archive' && data) report('Archive link readiness', !!data.link, {message: data.link ? 'Linked load exists; no upload performed.' : 'This booking has no T-MAXX link; real archive acceptance remains pending.'});
        }
        const access = await read('/api/bookings/' + id + '/vgm/inttra', 'INTTRA VGM account menu');
        if (access) report('INTTRA VGM submission readiness', access.submissionEnabled === true, {available: access.available, submissionEnabled: access.submissionEnabled});
    } else report('Booking scenario', false, {message: 'No existing booking available; no test booking created.'});
    // This endpoint only logs into configured platforms; it does not submit business records.
    const connections = await call('/api/connections', 'POST');
    if (connections.ok) for (const c of (await connections.json()).connections) report('Platform session / ' + c.id, c.connected === true, {connected: c.connected === true});
    else report('Platform sessions', false, {status: connections.status});
    await read('/api/tmaxx/cards?kind=port&q=ISTANBUL', 'T-MAXX native port lookup');
} catch {report('Readiness check', false, {message: 'Check could not finish; no business write performed.'});}
finally {
    if (cookie) {
        try {report('Logout', (await call('/api/session', 'DELETE')).ok); report('Logged-out session is revoked', (await call('/api/records')).status === 401);}
        catch {report('Logout verification', false);}
    }
}
console.log(JSON.stringify({checkedAt: new Date().toISOString(), scope: 'Local API reads and configured platform login; not UI or live-write acceptance.', failures, results}, null, 2));
process.exitCode = failures ? 1 : 0;
